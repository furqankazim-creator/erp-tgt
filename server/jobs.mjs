import cron from "node-cron";

import { listRows, createRow, updateRow, appendActivityLog, getRow, purgeOldTrash } from "./db.mjs";
import { sendMail } from "./mail.mjs";
import { notify } from "./notifications.mjs";
import { buildBasicQuotationEmail, buildMeetingRequestEmail } from "./inquiry-mail.mjs";
import { runEmailInquiryWatcher } from "./email-inquiry-watcher.mjs";
import { autoEstimateFromInquiry } from "./auto-estimate.mjs";
import {
  computeOrgCostPerHour,
  monthlyEquivalent,
  todayStr,
  rangeForGranularity,
  lastWeekAnchor,
  lastMonthAnchor,
  buildPeriodReport,
  buildPeriodPdf,
  buildReportHtml,
  computeProjectHealth,
  computeProjectProgress,
} from "./reports-lib.mjs";

function daysBetween(fromIso, toIso) {
  const from = new Date(`${fromIso}T00:00:00`);
  const to = new Date(`${toIso}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

async function sendPeriodReport(granularity, anchor) {
  const { start, end, label } = rangeForGranularity(granularity, anchor);
  const [employees, projects, tasks, logs, subs, pmCommits, pmDailyLogs, inquiries] =
    await Promise.all([
      listRows("employees"),
      listRows("projects"),
      listRows("tasks"),
      listRows("work_logs"),
      listRows("report_subscriptions"),
      listRows("pm_commits"),
      listRows("pm_daily_log"),
      listRows("inquiries"),
    ]);
  const recipients = subs
    .filter((s) => s.report_type === granularity && s.status === "Active")
    .map((s) => s.recipients)
    .filter(Boolean);
  if (recipients.length === 0) {
    console.log(`[jobs] ${granularity} report: no active subscriptions, skipping send.`);
    return;
  }
  const report = buildPeriodReport(
    start,
    end,
    label,
    employees,
    projects,
    tasks,
    logs,
    pmCommits,
    pmDailyLogs,
    inquiries,
  );
  const { costPerHour } = await computeOrgCostPerHour();
  const html = buildReportHtml(granularity, label, report, employees, projects, costPerHour, tasks);
  const pdfBase64 = buildPeriodPdf(granularity, label, report)
    .output("datauristring")
    .split(",")[1];
  const to = recipients.join(", ");
  const base = {
    report_type: granularity,
    period_label: label,
    period_start: start,
    period_end: end,
    recipients: to,
    sent_at: new Date().toISOString(),
  };
  try {
    await sendMail({
      to,
      subject: `${granularity} report — ${label}`,
      html,
      attachmentBase64: pdfBase64,
      attachmentFilename: `${granularity.toLowerCase()}-report-${start}.pdf`,
    });
    await createRow("report_history", { ...base, status: "Sent", error_message: null });
    console.log(`[jobs] ${granularity} report sent to ${to}`);
  } catch (err) {
    await createRow("report_history", { ...base, status: "Failed", error_message: err.message });
    console.error(`[jobs] ${granularity} report failed:`, err.message);
  }
}

export async function runDailyReport() {
  await sendPeriodReport("Daily", todayStr());
}

export async function runWeeklyReport() {
  await sendPeriodReport("Weekly", lastWeekAnchor());
}

export async function runMonthlyReport() {
  await sendPeriodReport("Monthly", lastMonthAnchor());
}

export async function runCostSnapshot() {
  const totals = await computeOrgCostPerHour();
  const period = lastMonthAnchor();
  const snapshots = await listRows("cost_snapshots");
  const existing = snapshots.find((s) => s.period === period);
  const payload = {
    period,
    fixed_costs_total: Math.round(totals.monthlyFixedCosts * 100) / 100,
    payroll_total: Math.round(totals.monthlyPayroll * 100) / 100,
    total_monthly_cost: Math.round(totals.totalMonthlyCost * 100) / 100,
    productive_hours: totals.productiveHours,
    cost_per_hour: Math.round(totals.costPerHour * 100) / 100,
  };
  if (existing) await updateRow("cost_snapshots", existing.id, payload);
  else await createRow("cost_snapshots", payload);
  console.log(`[jobs] cost snapshot recorded for ${period}`);
}

export async function runMissingLogDigest() {
  const [employees, logs, subs] = await Promise.all([
    listRows("employees"),
    listRows("work_logs"),
    listRows("report_subscriptions"),
  ]);
  const today = todayStr();
  const missing = employees.filter(
    (e) => e.status === "Active" && !logs.some((l) => l.employee === e.name && l.date === today),
  );
  if (missing.length === 0) {
    console.log("[jobs] missing-log digest: everyone logged today, skipping.");
    return;
  }
  const recipients = subs
    .filter((s) => s.report_type === "MissingLogDigest" && s.status === "Active")
    .map((s) => s.recipients)
    .filter(Boolean);
  if (recipients.length === 0) {
    console.log("[jobs] missing-log digest: no active subscriptions, skipping send.");
    return;
  }
  const html = `<h2>Missing work logs — ${today}</h2><ul>${missing
    .map((e) => `<li>${e.name} (${e.department ?? "—"})</li>`)
    .join("")}</ul>`;
  const to = recipients.join(", ");
  try {
    await sendMail({ to, subject: `Missing work logs — ${today}`, html });
    console.log(`[jobs] missing-log digest sent to ${to} (${missing.length} people)`);
  } catch (err) {
    console.error("[jobs] missing-log digest failed:", err.message);
  }
}

export async function runBudgetAlerts() {
  const [costs, budgets, subs] = await Promise.all([
    listRows("costs"),
    listRows("budgets"),
    listRows("report_subscriptions"),
  ]);
  const recipients = subs
    .filter((s) => s.report_type === "BudgetAlert" && s.status === "Active")
    .map((s) => s.recipients)
    .filter(Boolean);
  for (const budget of budgets) {
    const actual = costs
      .filter((c) => c.category === budget.category)
      .reduce((s, c) => s + monthlyEquivalent(c), 0);
    const isOver = actual > Number(budget.monthly_budget ?? 0);
    const wasOver = budget.over_budget === true;
    if (isOver && !wasOver) {
      if (recipients.length > 0) {
        try {
          await sendMail({
            to: recipients.join(", "),
            subject: `Budget alert: ${budget.category} is over budget`,
            html: `<p><strong>${budget.category}</strong> is now at ${actual.toFixed(2)} against a budget of ${Number(budget.monthly_budget ?? 0).toFixed(2)}.</p>`,
          });
          console.log(`[jobs] budget alert sent for ${budget.category}`);
        } catch (err) {
          console.error(`[jobs] budget alert failed for ${budget.category}:`, err.message);
        }
      }
      await updateRow("budgets", budget.id, { over_budget: true });
    } else if (!isOver && wasOver) {
      await updateRow("budgets", budget.id, { over_budget: false });
    }
  }
}

export async function runTaskDeadlineAlerts() {
  const [tasks, projects, subs] = await Promise.all([
    listRows("tasks"),
    listRows("projects"),
    listRows("report_subscriptions"),
  ]);
  const today = todayStr();
  const DUE_SOON_DAYS = 2;

  const openTasks = tasks.filter((t) => t.status !== "Done" && t.due_date);
  const overdue = openTasks
    .filter((t) => t.due_date < today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const dueSoon = openTasks
    .filter((t) => t.due_date >= today && daysBetween(today, t.due_date) <= DUE_SOON_DAYS)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const activeProjects = projects.filter((p) => p.status !== "Done" && p.status !== "Cancelled");
  const atRisk = activeProjects.filter(
    (p) => computeProjectHealth(p, today, computeProjectProgress(p.id, tasks)) === "At Risk",
  );

  if (overdue.length === 0 && dueSoon.length === 0 && atRisk.length === 0) {
    console.log("[jobs] task/deadline alerts: nothing overdue, due soon, or at risk, skipping.");
    return;
  }

  const recipients = subs
    .filter((s) => s.report_type === "TaskAlert" && s.status === "Active")
    .map((s) => s.recipients)
    .filter(Boolean);
  if (recipients.length === 0) {
    console.log("[jobs] task/deadline alerts: no active subscriptions, skipping send.");
    return;
  }

  const projectName = (id) => projects.find((p) => p.id === id)?.name ?? "—";
  const taskRow = (t, dueLabel) =>
    `<tr>
      <td style="padding:8px 12px;border-top:1px solid #e5e7eb;">${t.title}</td>
      <td style="padding:8px 12px;border-top:1px solid #e5e7eb;">${projectName(t.project_id)}</td>
      <td style="padding:8px 12px;border-top:1px solid #e5e7eb;">${t.assignee ?? "Unassigned"}</td>
      <td style="padding:8px 12px;border-top:1px solid #e5e7eb;">${dueLabel}</td>
    </tr>`;

  const overdueRows = overdue
    .map((t) => taskRow(t, `${Math.abs(daysBetween(today, t.due_date))}d overdue`))
    .join("");
  const dueSoonRows = dueSoon
    .map((t) => taskRow(t, t.due_date === today ? "Due today" : `Due ${t.due_date}`))
    .join("");
  const atRiskRows = atRisk
    .map(
      (p) =>
        `<tr>
      <td style="padding:8px 12px;border-top:1px solid #e5e7eb;">${p.name}</td>
      <td style="padding:8px 12px;border-top:1px solid #e5e7eb;">${computeProjectProgress(p.id, tasks)}%</td>
      <td style="padding:8px 12px;border-top:1px solid #e5e7eb;">${p.deadline ?? "—"}</td>
    </tr>`,
    )
    .join("");

  const section = (title, color, headCols, rows) =>
    rows
      ? `<div style="margin-top:18px;">
      <div style="color:${color};font-size:14px;font-weight:700;">${title}</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;background:#fff;border-radius:8px;overflow:hidden;font-size:13px;border:1px solid #e5e7eb;">
        <tr style="background:#f3f4f6;text-align:left;">${headCols
          .map(
            (h) =>
              `<td style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#374151;">${h}</td>`,
          )
          .join("")}</tr>
        ${rows}
      </table>
    </div>`
      : "";

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
    <h2 style="margin-bottom:4px;">Task &amp; deadline alerts — ${today}</h2>
    <p style="color:#6b7280;font-size:13px;margin-top:0;">
      ${overdue.length} overdue task(s), ${dueSoon.length} due within ${DUE_SOON_DAYS} day(s), ${atRisk.length} project(s) at risk.
    </p>
    ${section("⚠ Overdue tasks", "#991b1b", ["Task", "Project", "Assignee", "Status"], overdueRows)}
    ${section("⏰ Due soon", "#b45309", ["Task", "Project", "Assignee", "Status"], dueSoonRows)}
    ${section("🚩 Projects at risk", "#991b1b", ["Project", "Progress", "Deadline"], atRiskRows)}
  </div>`;

  const to = recipients.join(", ");
  try {
    await sendMail({ to, subject: `Task & deadline alerts — ${today}`, html });
    console.log(
      `[jobs] task/deadline alerts sent to ${to} (${overdue.length} overdue, ${dueSoon.length} due soon, ${atRisk.length} at risk)`,
    );
  } catch (err) {
    console.error("[jobs] task/deadline alerts failed:", err.message);
  }
}

export async function runCostLifecycle() {
  const costs = await listRows("costs");
  const today = todayStr();
  const expired = costs.filter(
    (c) => c.end_date && c.end_date < today && (c.status ?? "Active") === "Active",
  );
  for (const c of expired) {
    await updateRow("costs", c.id, { status: "Ended" });
  }
  if (expired.length) console.log(`[jobs] ended ${expired.length} expired recurring cost(s)`);
}

const CLOSED_INQUIRY_STATUSES = ["Deal Done", "Lost"];

// Admin's "reminders" feed — overdue follow-ups and inquiries that have sat
// untouched too long. Runs on a schedule, not on every request, so each
// inquiry gets flagged in its own `activity_log` the moment it's notified —
// that's the de-dupe: same rule as runStaleQuotes' `!q.stale` check, just
// keyed by day instead of a boolean, since these should nudge again if they
// stay overdue tomorrow.
export async function runFollowUpReminders() {
  const inquiries = await listRows("inquiries");
  const today = todayStr();

  const overdueFollowUps = inquiries.filter(
    (i) =>
      i.next_follow_up &&
      !CLOSED_INQUIRY_STATUSES.includes(i.status) &&
      i.next_follow_up.slice(0, 10) <= today,
  );
  const stalePending = inquiries.filter(
    (i) => i.status === "New" && i.received_date && i.received_date.slice(0, 10) < today,
  );

  let followUpCount = 0;
  for (const i of overdueFollowUps) {
    const alreadySent = (i.activity_log ?? []).some(
      (e) => e.type === "followup_reminder" && e.at.slice(0, 10) === today,
    );
    if (alreadySent) continue;
    await notify({
      type: "followup_due",
      message: `Follow-up due: ${i.client_name}${i.company ? ` (${i.company})` : ""}`,
      link: "/inquiries",
      owner: i.owner ?? null,
    });
    await appendActivityLog("inquiries", i.id, {
      type: "followup_reminder",
      message: "Follow-up reminder sent.",
      at: new Date().toISOString(),
    });
    followUpCount += 1;
  }

  let pendingCount = 0;
  for (const i of stalePending) {
    const alreadySent = (i.activity_log ?? []).some(
      (e) => e.type === "pending_reminder" && e.at.slice(0, 10) === today,
    );
    if (alreadySent) continue;
    await notify({
      type: "inquiry_pending",
      message: `Inquiry still pending: ${i.client_name} — no response since it came in`,
      link: "/inquiries",
      owner: i.owner ?? null,
    });
    await appendActivityLog("inquiries", i.id, {
      type: "pending_reminder",
      message: "Pending-inquiry reminder sent.",
      at: new Date().toISOString(),
    });
    pendingCount += 1;
  }

  if (followUpCount || pendingCount) {
    console.log(
      `[jobs] follow-up reminders: ${followUpCount} overdue follow-up(s), ${pendingCount} stale-pending inquiry alert(s)`,
    );
  }
}

// The automated "drip" from the pipeline diagram: the instant Thank You
// already fires synchronously the moment an inquiry is created
// (onInquiryCreated, in index.mjs). These two steps are timed off that same
// moment — a Basic Quotation 30 minutes later, then a Meeting Request a day
// later — and this job is what actually fires them once due. Runs every 5
// minutes so the 30-minute step lands within a few minutes of on-time.
//
// Both due-times are set once, at creation (index.mjs), and both steps stop
// firing the moment the inquiry closes (Deal Done / Lost) or if a human
// already sent that same template manually via "Send Response" — the
// send-confirmation endpoint sets the same `auto_*_sent` flag this job
// checks, so there's never a double-send either way.
export async function runAutoResponseSequence() {
  const now = new Date();
  const inquiries = await listRows("inquiries");
  const due = inquiries.filter(
    (i) =>
      i.email &&
      !CLOSED_INQUIRY_STATUSES.includes(i.status) &&
      ((i.auto_quotation_send_at &&
        !i.auto_quotation_sent &&
        new Date(i.auto_quotation_send_at) <= now) ||
        (i.auto_meeting_send_at &&
          !i.auto_meeting_sent &&
          new Date(i.auto_meeting_send_at) <= now)),
  );
  if (!due.length) return;

  const company = await getRow("company_profile", "default");
  let quotationCount = 0;
  let meetingCount = 0;

  for (const inq of due) {
    // Appended atomically at the end via appendActivityLog — not built as a
    // full array copy — because this loop can run for a while (multiple
    // real emails sent one after another) and inq.activity_log is a
    // snapshot taken when the job started. A user acting on this same
    // inquiry mid-run would have their own activity_log entry silently
    // overwritten if this job wrote the whole array back based on a stale
    // read.
    const newEntries = [];
    const patch = {};

    if (
      inq.auto_quotation_send_at &&
      !inq.auto_quotation_sent &&
      new Date(inq.auto_quotation_send_at) <= now
    ) {
      try {
        const { subject, html } = buildBasicQuotationEmail(inq, company);
        await sendMail({ to: inq.email, subject, html });
        newEntries.push({
          type: "email",
          message: `Basic quotation email sent to ${inq.email} (automated)`,
          at: new Date().toISOString(),
        });
        quotationCount += 1;
        // See auto-estimate.mjs — no-ops silently if there's no Estimated
        // Hours on the inquiry, or a Quote already exists for it.
        void autoEstimateFromInquiry(inq, company).catch((err) =>
          console.error(`[jobs] auto-estimate failed for ${inq.id}:`, err),
        );
      } catch (err) {
        newEntries.push({
          type: "email_failed",
          message: `Automated basic quotation failed: ${err.message}`,
          at: new Date().toISOString(),
        });
      }
      patch.auto_quotation_sent = true;
    }

    if (
      inq.auto_meeting_send_at &&
      !inq.auto_meeting_sent &&
      new Date(inq.auto_meeting_send_at) <= now
    ) {
      try {
        const { subject, html } = buildMeetingRequestEmail(inq, company);
        await sendMail({ to: inq.email, subject, html });
        newEntries.push({
          type: "email",
          message: `Meeting request email sent to ${inq.email} (automated)`,
          at: new Date().toISOString(),
        });
        meetingCount += 1;
      } catch (err) {
        newEntries.push({
          type: "email_failed",
          message: `Automated meeting request failed: ${err.message}`,
          at: new Date().toISOString(),
        });
      }
      patch.auto_meeting_sent = true;
    }

    if (Object.keys(patch).length) await updateRow("inquiries", inq.id, patch);
    if (newEntries.length) await appendActivityLog("inquiries", inq.id, newEntries);
  }

  if (quotationCount || meetingCount) {
    console.log(
      `[jobs] auto response sequence: ${quotationCount} basic quotation(s), ${meetingCount} meeting request(s) sent`,
    );
  }
}

export async function runStaleQuotes() {
  const quotes = await listRows("quotes");
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffIso = cutoff.toISOString();
  const stale = quotes.filter((q) => q.status === "Sent" && q.updated_at < cutoffIso && !q.stale);
  for (const q of stale) {
    await updateRow("quotes", q.id, { stale: true });
  }
  if (stale.length) console.log(`[jobs] flagged ${stale.length} stale quote(s)`);
}

async function checkUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal });
    }
    return res.ok ? "Up" : "Down";
  } catch {
    return "Down";
  } finally {
    clearTimeout(timeout);
  }
}

export async function runLiveLinkCheck() {
  const projects = await listRows("projects");
  const withUrl = projects.filter((p) => p.live_url);
  let up = 0;
  let down = 0;
  for (const p of withUrl) {
    const status = await checkUrl(p.live_url);
    if (status === "Up") up += 1;
    else down += 1;
    await updateRow("projects", p.id, {
      live_status: status,
      live_checked_at: new Date().toISOString(),
    });
  }
  console.log(`[jobs] checked ${withUrl.length} live link(s): ${up} up, ${down} down`);
}

export async function runTrashPurge() {
  const count = await purgeOldTrash(30);
  if (count > 0) console.log(`[jobs] purged ${count} item(s) from trash older than 30 days`);
}

function safe(name, fn) {
  return () => {
    void fn().catch((err) => console.error(`[jobs] ${name} crashed:`, err));
  };
}

// Every schedule below is meant in the business's own local time, not
// whatever timezone the host process happens to default to (a server can
// easily come up as UTC) — pin them all explicitly so "5:30 PM" always means
// 5:30 PM Pakistan time, regardless of where this process runs.
const TZ = "Asia/Karachi";

export function startJobs() {
  cron.schedule("30 17 * * 1-5", safe("daily report", runDailyReport), { timezone: TZ });
  cron.schedule("0 9 * * 1", safe("weekly report", runWeeklyReport), { timezone: TZ });
  cron.schedule("0 9 1 * *", safe("monthly report", runMonthlyReport), { timezone: TZ });
  cron.schedule("0 1 1 * *", safe("cost snapshot", runCostSnapshot), { timezone: TZ });
  cron.schedule("0 17 * * 1-5", safe("missing-log digest", runMissingLogDigest), { timezone: TZ });
  cron.schedule("0 8 * * *", safe("budget alerts", runBudgetAlerts), { timezone: TZ });
  cron.schedule("0 7 * * 1-5", safe("task/deadline alerts", runTaskDeadlineAlerts), {
    timezone: TZ,
  });
  cron.schedule("0 2 * * *", safe("cost lifecycle", runCostLifecycle), { timezone: TZ });
  cron.schedule("0 3 * * *", safe("stale quotes", runStaleQuotes), { timezone: TZ });
  cron.schedule("0 8-18/2 * * 1-6", safe("follow-up reminders", runFollowUpReminders), {
    timezone: TZ,
  });
  cron.schedule("0 4,16 * * *", safe("live link check", runLiveLinkCheck), { timezone: TZ });
  // Every 5 minutes, all day — this one drives a timed drip (30 min / 1 day
  // after an inquiry is created), not a daily business-hours nudge, so it
  // isn't restricted to weekdays/office hours like the others above.
  cron.schedule("*/5 * * * *", safe("auto response sequence", runAutoResponseSequence), {
    timezone: TZ,
  });
  // Email -> ERP intake: checks the inbox for new mail every 3 minutes and
  // turns each into an Inquiry automatically. No-ops quietly if IMAP creds
  // aren't configured (see email-inquiry-watcher.mjs).
  cron.schedule("*/3 * * * *", safe("email inquiry watcher", runEmailInquiryWatcher), {
    timezone: TZ,
  });
  // Daily auto-purge of trash items older than 30 days (1 month)
  cron.schedule("30 3 * * *", safe("trash purge", runTrashPurge), { timezone: TZ });
  void runTrashPurge().catch((err) => console.error("[jobs] initial trash purge failed:", err));
  console.log(
    "[jobs] 14 scheduled jobs registered (Asia/Karachi): daily/weekly/monthly reports, cost snapshot, " +
      "missing-log digest, budget alerts, task/deadline alerts, cost lifecycle, stale quotes, " +
      "follow-up reminders, live link check, auto response sequence, email inquiry watcher, trash purge",
  );
}
