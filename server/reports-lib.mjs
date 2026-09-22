import { listRows, getRow } from "./db.mjs";
import { jsPDF } from "jspdf/dist/jspdf.node.js";
import autoTable from "jspdf-autotable";

// Mirrors src/lib/costing.ts's monthlyEquivalent()/useOrgCostPerHour() so the
// server-side automation math matches what the UI shows exactly.
export function monthlyEquivalent(cost) {
  const status = cost.status ?? "Active";
  if (status !== "Active") return 0;
  const amount = Number(cost.amount ?? 0);
  const frequency = cost.frequency ?? "Monthly";
  switch (frequency) {
    case "Yearly":
      return amount / 12;
    case "Quarterly":
      return amount / 3;
    case "One-time":
      return 0;
    default:
      return amount;
  }
}

export async function computeOrgCostPerHour() {
  const employees = await listRows("employees");
  const costs = await listRows("costs");
  const settings = await getRow("org_settings", "default");
  const workingDays = Number(settings?.working_days_per_month ?? 22);
  const hoursPerDay = Number(settings?.hours_per_day ?? 8);

  const monthlyPayroll = employees.reduce((s, e) => s + Number(e.salary ?? 0), 0);
  const monthlyFixedCosts = costs.reduce((s, c) => s + monthlyEquivalent(c), 0);
  const totalMonthlyCost = monthlyPayroll + monthlyFixedCosts;
  const activeEmployees = employees.filter((e) => e.status === "Active").length;
  const productiveHours = activeEmployees * workingDays * hoursPerDay;
  const costPerHour = productiveHours > 0 ? totalMonthlyCost / productiveHours : 0;

  return {
    employees,
    costs,
    workingDays,
    hoursPerDay,
    monthlyPayroll,
    monthlyFixedCosts,
    totalMonthlyCost,
    activeEmployees,
    productiveHours,
    costPerHour,
  };
}

// --- Mirrors the date + report-building logic in src/routes/_authenticated/reports.tsx ---

export function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isoDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function lastWeekAnchor() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return isoDate(d);
}

export function lastMonthAnchor() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function dateLabel(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

export function rangeForGranularity(granularity, anchor) {
  if (granularity === "Daily") {
    return { start: anchor, end: anchor, label: dateLabel(anchor) };
  }
  if (granularity === "Weekly") {
    const mon = mondayOf(anchor);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { start: isoDate(mon), end: isoDate(sun), label: `Week of ${dateLabel(isoDate(mon))}` };
  }
  const [y, m] = anchor.split("-").map(Number);
  const start = `${anchor}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${anchor}-${String(lastDay).padStart(2, "0")}`;
  const label = new Date(y, m - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
  return { start, end, label };
}

export function buildPeriodReport(
  start,
  end,
  label,
  employees,
  projects,
  tasks,
  logs,
  pmCommits = [],
  pmDailyLogs = [],
  inquiries = [],
) {
  const inRange = logs.filter((l) => l.date >= start && l.date <= end);
  const totalHours = inRange.reduce((s, l) => s + Number(l.hours || 0), 0);
  const activeProjectIds = new Set(inRange.map((l) => l.project_id).filter(Boolean));
  const blockerLogs = inRange.filter((l) => l.blocker);
  const tasksDone = tasks.filter(
    (t) =>
      t.status === "Done" && t.updated_at.slice(0, 10) >= start && t.updated_at.slice(0, 10) <= end,
  );

  const perEmployee = employees.map((emp) => {
    const empLogs = inRange.filter((l) => l.employee === emp.name);
    const hours = empLogs.reduce((s, l) => s + Number(l.hours || 0), 0);
    const byProject = new Map();
    for (const l of empLogs) {
      if (!l.project_id) continue;
      byProject.set(l.project_id, (byProject.get(l.project_id) ?? 0) + Number(l.hours || 0));
    }
    const projectBreak = [...byProject.entries()]
      .map(([id, h]) => ({
        id,
        name: projects.find((p) => p.id === id)?.name ?? "Unknown project",
        hours: h,
        pct: hours > 0 ? Math.round((h / hours) * 100) : 0,
      }))
      .sort((a, b) => b.hours - a.hours);
    const tasksCompleted = tasksDone.filter((t) => t.assignee === emp.name);
    const blockers = empLogs.filter((l) => l.blocker).length;
    const commits = pmCommits.filter(
      (c) =>
        c.employee === emp.name &&
        c.created_at.slice(0, 10) >= start &&
        c.created_at.slice(0, 10) <= end,
    ).length;
    const activeMinutes = pmDailyLogs
      .filter((d) => d.employee === emp.name && d.date >= start && d.date <= end)
      .reduce((s, d) => s + Math.round(Number(d.active_seconds ?? 0) / 60), 0);
    return {
      employee: emp,
      hours,
      projects: projectBreak,
      tasksCompleted,
      blockers,
      commits,
      activeMinutes,
    };
  });

  const recommendations = [];
  const today = todayStr();
  const overdue = tasks.filter(
    (t) => t.status === "In Progress" && t.due_date && t.due_date < today,
  );
  for (const t of overdue.slice(0, 2)) {
    const proj = projects.find((p) => p.id === t.project_id)?.name ?? "a project";
    recommendations.push(`Monitor ${proj} — "${t.title}" is overdue and still In Progress.`);
  }
  for (const b of blockerLogs.slice(0, 2)) {
    const proj = projects.find((p) => p.id === b.project_id)?.name ?? "a project";
    recommendations.push(
      `Unblock ${b.employee} on ${proj}: ${b.blocker_note ?? "no details given"}.`,
    );
  }
  const noLog = perEmployee.filter((e) => e.employee.status === "Active" && e.hours === 0);
  for (const e of noLog.slice(0, 2)) {
    recommendations.push(`${e.employee.name} has no log for ${label} — reminder sent.`);
  }
  const topPerformer = [...perEmployee]
    .filter((e) => e.hours > 0 && e.blockers === 0)
    .sort((a, b) => b.hours - a.hours)[0];
  if (topPerformer) {
    const projectNote = topPerformer.projects[0] ? ` on ${topPerformer.projects[0].name}` : "";
    recommendations.push(
      `${topPerformer.employee.name} is ramping well${projectNote} — no action needed.`,
    );
  }

  // Inquiries whose next_follow_up date has arrived (or passed) and haven't
  // been closed out yet — surfaced as its own section in the report, not
  // just a buried recommendation, since a missed follow-up is a lost deal.
  const followUpsDue = inquiries
    .filter(
      (i) =>
        i.next_follow_up &&
        i.next_follow_up.slice(0, 10) <= today &&
        !["Deal Done", "Lost"].includes(i.status),
    )
    .sort((a, b) => a.next_follow_up.slice(0, 10).localeCompare(b.next_follow_up.slice(0, 10)));
  for (const i of followUpsDue.slice(0, 2)) {
    recommendations.push(
      `Follow up with ${i.client_name}${i.company ? ` (${i.company})` : ""} — was due ${i.next_follow_up.slice(0, 10)}.`,
    );
  }

  return {
    start,
    end,
    totalHours,
    tasksDone,
    activeProjectCount: activeProjectIds.size,
    blockerCount: blockerLogs.length,
    perEmployee,
    recommendations: recommendations.slice(0, 6),
    logsInRange: inRange,
    followUpsDue,
  };
}

// Progress is derived from task completion (done tasks / total tasks for the
// project), not read from a manually-typed field — mirrors src/lib/project-progress.ts.
export function computeProjectProgress(projectId, tasks) {
  const projectTasks = tasks.filter((t) => t.project_id === projectId);
  if (projectTasks.length === 0) return 0;
  const done = projectTasks.filter((t) => t.status === "Done").length;
  return Math.round((done / projectTasks.length) * 100);
}

// Mirrors reports.tsx's computeProjectHealth() so the emailed Project Status
// table matches the Reports > Project tab exactly.
export function computeProjectHealth(p, today, progress) {
  if (p.status === "Done" || progress >= 100) return "Completed";
  if (!p.start_date || !p.deadline) return "On Track";
  const start = new Date(p.start_date).getTime();
  const end = new Date(p.deadline).getTime();
  const now = new Date(today).getTime();
  if (!(end > start)) return "On Track";
  if (now > end) return "At Risk";
  const elapsedPct = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  const gap = elapsedPct - progress;
  if (gap > 25) return "At Risk";
  if (gap > 10) return "Behind";
  return "On Track";
}

export function buildProjectStatusRows(projects, costPerHour, tasks) {
  const today = todayStr();
  return projects.map((p) => {
    const progress = computeProjectProgress(p.id, tasks);
    return {
      name: p.name,
      health: computeProjectHealth(p, today, progress),
      progress,
      budgetHours: costPerHour > 0 ? Math.round(Number(p.budget ?? 0) / costPerHour) : 0,
    };
  });
}

const HEALTH_COLOR = {
  "On Track": "#0f766e",
  Behind: "#b45309",
  "At Risk": "#b91c1c",
  Completed: "#1d4ed8",
};

// Mirrors src/lib/format.ts's formatDuration() so the emailed report matches
// the UI exactly — a rounded single decimal of hours hides anything under
// ~6 minutes, so short durations show as "Xm" and longer ones as "Xh Ym".
function formatDuration(totalMinutes) {
  const mins = Math.round(Number(totalMinutes ?? 0));
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

function tile(label, value, bg, fg) {
  return `<tr><td style="padding:0 0 8px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:${bg};border-radius:8px;">
      <tr><td style="padding:14px 16px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${fg};opacity:.8;">${label}</div>
        <div style="font-size:22px;font-weight:800;color:${fg};margin-top:4px;">${value}</div>
      </td></tr>
    </table>
  </td></tr>`;
}

// Mirrors reports.tsx's buildPeriodPdf() so the automated email carries the
// same PDF attachment the manual "Export PDF" / "Send Report" buttons produce.
export function buildPeriodPdf(reportType, label, report) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`${reportType} Report`, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(label, 14, 25);
  doc.text(
    `Total hours ${report.totalHours} | Tasks done ${report.tasksDone.length} | Active projects ${report.activeProjectCount} | Blockers ${report.blockerCount}`,
    14,
    31,
  );
  autoTable(doc, {
    startY: 38,
    head: [
      ["Employee", "Hours", "Projects", "Tasks completed", "Blockers", "Commits", "Active min"],
    ],
    body: report.perEmployee.map((e) => [
      e.employee.name,
      String(e.hours),
      e.projects.map((p) => p.name).join(", ") || "—",
      String(e.tasksCompleted.length),
      String(e.blockers),
      String(e.commits),
      String(e.activeMinutes),
    ]),
    headStyles: { fillColor: [20, 140, 130] },
    styles: { fontSize: 9 },
  });
  const finalY = doc.lastAutoTable?.finalY ?? 40;
  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text("Recommendations", 14, finalY + 10);
  doc.setFontSize(9);
  doc.setTextColor(80);
  report.recommendations.forEach((r, i) => {
    doc.text(`- ${r}`, 14, finalY + 16 + i * 6, { maxWidth: 180 });
  });
  return doc;
}

export function buildReportHtml(
  reportType,
  label,
  report,
  employees,
  projects,
  costPerHour,
  tasks,
) {
  const submitted = new Set(report.logsInRange.map((l) => l.employee));
  const submittedCount = submitted.size;
  const missingEmployees = employees.filter((e) => !submitted.has(e.name));
  const avgHours =
    submittedCount > 0 ? Math.round((report.totalHours / submittedCount) * 10) / 10 : 0;
  const totalCommits = report.perEmployee.reduce((s, e) => s + e.commits, 0);
  const totalActiveTime = formatDuration(
    report.perEmployee.reduce((s, e) => s + e.activeMinutes, 0),
  );

  const headline =
    missingEmployees.length === 0
      ? `Full coverage — everyone logged for ${label}.`
      : `${report.totalHours}h logged for ${label}; ${missingEmployees.length} of ${employees.length} employees missing a log.`;

  const recs = report.recommendations.length
    ? report.recommendations.map((r) => `<li style="margin:4px 0;">${esc(r)}</li>`).join("")
    : `<li style="margin:4px 0;">Nothing needs attention for this period.</li>`;

  const missingRows = missingEmployees.length
    ? missingEmployees
        .map(
          (e) => `<tr>
        <td style="padding:8px 12px;border-top:1px solid #fecaca;">${esc(e.name)}</td>
        <td style="padding:8px 12px;border-top:1px solid #fecaca;">${esc(e.department ?? "—")}</td>
        <td style="padding:8px 12px;border-top:1px solid #fecaca;"><a href="mailto:${esc(e.email)}" style="color:#b91c1c;">${esc(e.email ?? "—")}</a></td>
      </tr>`,
        )
        .join("")
    : "";

  const followUpsDue = report.followUpsDue ?? [];
  const followUpRows = followUpsDue
    .map(
      (i) => `<tr>
        <td style="padding:8px 12px;border-top:1px solid #fde68a;">${esc(i.client_name)}</td>
        <td style="padding:8px 12px;border-top:1px solid #fde68a;">${esc(i.company ?? "—")}</td>
        <td style="padding:8px 12px;border-top:1px solid #fde68a;">${esc(i.next_follow_up?.slice(0, 10))}</td>
        <td style="padding:8px 12px;border-top:1px solid #fde68a;">${esc(i.owner ?? "Unassigned")}</td>
      </tr>`,
    )
    .join("");

  const submissionRows = report.logsInRange.length
    ? report.logsInRange
        .map((l) => {
          const proj = projects.find((p) => p.id === l.project_id)?.name ?? "—";
          return `<tr>
        <td style="padding:8px 12px;border-top:1px solid #e5e7eb;">${esc(l.employee)}</td>
        <td style="padding:8px 12px;border-top:1px solid #e5e7eb;">${esc(proj)}</td>
        <td style="padding:8px 12px;border-top:1px solid #e5e7eb;">${esc(l.hours)}h</td>
        <td style="padding:8px 12px;border-top:1px solid #e5e7eb;">${esc(l.notes ?? "—")}</td>
      </tr>`;
        })
        .join("")
    : `<tr><td colspan="4" style="padding:16px;text-align:center;color:#6b7280;">No submissions for this period.</td></tr>`;

  const projectRows = buildProjectStatusRows(projects, costPerHour, tasks)
    .map((p) => {
      const color = HEALTH_COLOR[p.health] ?? "#374151";
      const pct = Math.max(0, Math.min(100, p.progress));
      return `<tr>
        <td style="padding:8px 12px;border-top:1px solid #e5e7eb;">${esc(p.name)}</td>
        <td style="padding:8px 12px;border-top:1px solid #e5e7eb;">
          <span style="background:${color}1a;color:${color};border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;">${p.health}</span>
        </td>
        <td style="padding:8px 12px;border-top:1px solid #e5e7eb;width:140px;">
          <table cellpadding="0" cellspacing="0" width="100"><tr>
            <td style="background:${color};height:6px;border-radius:4px;" width="${pct}"></td>
            <td style="background:#e5e7eb;height:6px;border-radius:4px;" width="${100 - pct}"></td>
          </tr></table>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;">${pct}%</div>
        </td>
        <td style="padding:8px 12px;border-top:1px solid #e5e7eb;">${p.budgetHours}h</td>
      </tr>`;
    })
    .join("");

  // Hours worked per project this period — surfaced first, since "how many
  // hours went into which project" is the headline question for this report.
  const hoursByProjectMap = new Map();
  for (const l of report.logsInRange) {
    if (!l.project_id) continue;
    hoursByProjectMap.set(
      l.project_id,
      (hoursByProjectMap.get(l.project_id) ?? 0) + Number(l.hours || 0),
    );
  }
  const hoursByProjectRows = [...hoursByProjectMap.entries()]
    .map(([id, hours]) => ({
      name: projects.find((p) => p.id === id)?.name ?? "Unknown project",
      hours: Math.round(hours * 100) / 100,
    }))
    .sort((a, b) => b.hours - a.hours);
  const hoursByProjectHtml = hoursByProjectRows.length
    ? `<div style="margin-top:0;">
          <div style="color:#1e3a8a;font-size:14px;font-weight:700;">Work Hours by Project — ${esc(label)}</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;background:#fff;border-radius:8px;overflow:hidden;font-size:13px;border:1px solid #e5e7eb;">
            <tr style="background:#f3f4f6;text-align:left;">
              <td style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#374151;">Project</td>
              <td style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#374151;">Hours</td>
            </tr>
            ${hoursByProjectRows
              .map(
                (r) => `<tr>
              <td style="padding:8px 12px;border-top:1px solid #e5e7eb;">${esc(r.name)}</td>
              <td style="padding:8px 12px;border-top:1px solid #e5e7eb;font-weight:700;">${r.hours}h</td>
            </tr>`,
              )
              .join("")}
          </table>
        </div>`
    : "";

  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr><td style="padding:20px 24px;background:#0f172a;border-radius:12px 12px 0 0;">
        <span style="color:#fff;font-size:18px;font-weight:800;">Time Global Tech CRM</span>
        <div style="color:#94a3b8;font-size:13px;margin-top:2px;">${esc(reportType)} Work Report — ${esc(label)}</div>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f8fafc;">
      <tr><td style="padding:20px 24px;">
        ${hoursByProjectHtml}

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:10px;margin-top:${hoursByProjectRows.length ? "16px" : "0"};">
          <tr><td style="padding:18px 20px;">
            <table width="100%"><tr>
              <td style="color:#fff;font-size:14px;font-weight:700;">Summary</td>
              <td align="right"><span style="background:#1f2937;color:#93c5fd;font-size:10px;font-weight:700;letter-spacing:.05em;padding:2px 8px;border-radius:999px;">HEURISTIC</span></td>
            </tr></table>
            <p style="color:#e5e7eb;font-size:13px;margin:10px 0 0;">${esc(headline)}</p>
            <div style="color:#9ca3af;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-top:12px;">Recommendations</div>
            <ul style="color:#e5e7eb;font-size:13px;margin:6px 0 0;padding-left:18px;">${recs}</ul>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
          ${tile("Employees", employees.length, "#eff6ff", "#1e3a8a")}
          ${tile("Submitted", submittedCount, "#ecfdf5", "#065f46")}
          ${tile("Missing", missingEmployees.length, "#fef2f2", "#991b1b")}
          ${tile("Hours Logged", `${report.totalHours}h`, "#fefce8", "#854d0e")}
          ${tile("Avg Hours / Submitter", `${avgHours}h`, "#fefce8", "#854d0e")}
          ${tile("Blockers Reported", report.blockerCount, "#fef2f2", "#991b1b")}
          ${tile("Commits (PM Connect)", totalCommits, "#eef2ff", "#3730a3")}
          ${tile("Active Time (PM Connect)", totalActiveTime, "#eef2ff", "#3730a3")}
        </table>

        ${
          missingEmployees.length
            ? `<div style="margin-top:20px;">
          <div style="color:#991b1b;font-size:14px;font-weight:700;">⚠ Missing Submissions</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;background:#fff5f5;border-radius:8px;overflow:hidden;font-size:13px;">
            <tr style="background:#fee2e2;color:#7f1d1d;text-align:left;">
              <td style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;">Employee</td>
              <td style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;">Team</td>
              <td style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;">Email</td>
            </tr>
            ${missingRows}
          </table>
        </div>`
            : ""
        }

        ${
          followUpsDue.length
            ? `<div style="margin-top:20px;">
          <div style="color:#92400e;font-size:14px;font-weight:700;">⏰ Follow-ups Due</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;background:#fffbeb;border-radius:8px;overflow:hidden;font-size:13px;">
            <tr style="background:#fef3c7;color:#78350f;text-align:left;">
              <td style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;">Client</td>
              <td style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;">Company</td>
              <td style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;">Was due</td>
              <td style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;">Owner</td>
            </tr>
            ${followUpRows}
          </table>
        </div>`
            : ""
        }

        <div style="margin-top:20px;">
          <div style="color:#1e3a8a;font-size:14px;font-weight:700;">${esc(reportType)} Submissions</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;background:#fff;border-radius:8px;overflow:hidden;font-size:13px;border:1px solid #e5e7eb;">
            <tr style="background:#f3f4f6;text-align:left;">
              <td style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#374151;">Employee</td>
              <td style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#374151;">Project</td>
              <td style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#374151;">Hours</td>
              <td style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#374151;">Notes</td>
            </tr>
            ${submissionRows}
          </table>
        </div>

        <div style="margin-top:20px;">
          <div style="color:#1e3a8a;font-size:14px;font-weight:700;">Project Status</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;background:#fff;border-radius:8px;overflow:hidden;font-size:13px;border:1px solid #e5e7eb;">
            <tr style="background:#f3f4f6;text-align:left;">
              <td style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#374151;">Project</td>
              <td style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#374151;">Status</td>
              <td style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#374151;">Progress</td>
              <td style="padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#374151;">Budget</td>
            </tr>
            ${projectRows}
          </table>
        </div>

        <p style="text-align:center;color:#9ca3af;font-size:11px;margin-top:24px;">
          This is an automated email from Time Global Tech CRM · ${esc(reportType)} report for ${esc(label)}.
          <br />Generated ${esc(
            new Date().toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
          )}
        </p>
      </td></tr>
    </table>
  </div>`;
}
