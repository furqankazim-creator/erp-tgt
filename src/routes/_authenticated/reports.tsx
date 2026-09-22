import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Clock,
  Download,
  FolderKanban,
  GitCommit,
  ListChecks,
  Mail,
  Plus,
  Sparkles,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

import { useRows, useSaveRow } from "@/lib/db";
import { getAuthToken, API_URL } from "@/lib/mock-auth";
import { currency, dateLabel, formatDuration, number } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog, type Field } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton, EmptyState } from "@/components/loading";
import { useOrgCostPerHour } from "@/lib/costing";
import { computeProjectProgress } from "@/lib/project-progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { WorkLog } from "./log-work";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Time Global Tech CRM" },
      {
        name: "description",
        content: "Team performance reports built from logged hours — daily, weekly, monthly.",
      },
      { property: "og:title", content: "Reports — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "Team performance reports built from logged hours — daily, weekly, monthly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Employee = {
  id: string;
  name: string;
  email: string | null;
  department: string | null;
  role: string | null;
  status: string;
};
type ProjectRow = {
  id: string;
  name: string;
  status: string;
  progress: number;
  budget: number;
  start_date: string | null;
  deadline: string | null;
};

type ProjectHealth = "On Track" | "Behind" | "At Risk" | "Completed";

const HEALTH_TONE: Record<ProjectHealth, "success" | "warning" | "danger" | "info"> = {
  "On Track": "success",
  Behind: "warning",
  "At Risk": "danger",
  Completed: "info",
};

function computeProjectHealth(p: ProjectRow, today: string, progress: number): ProjectHealth {
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
type Task = {
  id: string;
  project_id: string | null;
  title: string;
  assignee: string | null;
  status: string;
  due_date: string | null;
  updated_at: string;
};
type Subscription = { id: string; report_type: string; recipients: string; status: string };
type PmCommit = { employee: string | null; created_at: string };
type PmDailyLog = { employee: string | null; date: string; active_seconds: number };
type Inquiry = {
  client_name: string;
  company: string | null;
  next_follow_up: string | null;
  status: string;
  owner: string | null;
};

const SUBSCRIPTION_TYPES = [
  "Daily",
  "Weekly",
  "Monthly",
  "MissingLogDigest",
  "BudgetAlert",
  "TaskAlert",
  "InquiryAlert",
];

const SUBSCRIPTION_FIELDS: Field[] = [
  {
    name: "report_type",
    label: "Report type",
    type: "select",
    options: SUBSCRIPTION_TYPES,
    required: true,
  },
  { name: "recipients", label: "Recipients (comma separated)", full: true, required: true },
  { name: "status", label: "Status", type: "select", options: ["Active", "Paused"] },
];

type ReportHistoryRow = {
  id: string;
  report_type: string;
  period_label: string;
  period_start: string;
  period_end: string;
  recipients: string;
  status: string;
  sent_at: string;
  error_message: string | null;
};

function todayStr() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isoDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function mondayOf(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function rangeForGranularity(granularity: "Daily" | "Weekly" | "Monthly", anchor: string) {
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
  const lastDay = new Date(y!, m!, 0).getDate();
  const end = `${anchor}-${String(lastDay).padStart(2, "0")}`;
  const label = new Date(y!, m! - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
  return { start, end, label };
}

type EmployeeReport = {
  employee: Employee;
  hours: number;
  projects: { id: string; name: string; hours: number; pct: number }[];
  tasksCompleted: Task[];
  blockers: number;
  commits: number;
  activeMinutes: number;
};

type PeriodReport = {
  start: string;
  end: string;
  totalHours: number;
  tasksDone: Task[];
  activeProjectCount: number;
  blockerCount: number;
  perEmployee: EmployeeReport[];
  recommendations: string[];
  logsInRange: WorkLog[];
  followUpsDue: Inquiry[];
};

function buildPeriodReport(
  start: string,
  end: string,
  label: string,
  employees: Employee[],
  projects: ProjectRow[],
  tasks: Task[],
  logs: WorkLog[],
  pmCommits: PmCommit[] = [],
  pmDailyLogs: PmDailyLog[] = [],
  inquiries: Inquiry[] = [],
): PeriodReport {
  const inRange = logs.filter((l) => l.date >= start && l.date <= end);
  const totalHours = inRange.reduce((s, l) => s + Number(l.hours || 0), 0);
  const activeProjectIds = new Set(inRange.map((l) => l.project_id).filter(Boolean) as string[]);
  const blockerLogs = inRange.filter((l) => l.blocker);
  const tasksDone = tasks.filter(
    (t) =>
      t.status === "Done" && t.updated_at.slice(0, 10) >= start && t.updated_at.slice(0, 10) <= end,
  );

  const perEmployee: EmployeeReport[] = employees.map((emp) => {
    const empLogs = inRange.filter((l) => l.employee === emp.name);
    const hours = empLogs.reduce((s, l) => s + Number(l.hours || 0), 0);
    const byProject = new Map<string, number>();
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

  const recommendations: string[] = [];
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
    .sort((a, b) => a.next_follow_up!.slice(0, 10).localeCompare(b.next_follow_up!.slice(0, 10)));
  for (const i of followUpsDue.slice(0, 2)) {
    recommendations.push(
      `Follow up with ${i.client_name}${i.company ? ` (${i.company})` : ""} — was due ${i.next_follow_up!.slice(0, 10)}.`,
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

function downloadCSV(filename: string, rows: Record<string, string | number>[]) {
  if (!rows.length) {
    toast.info("Nothing to export for this period.");
    return;
  }
  const headers = Object.keys(rows[0]!);
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function periodReportRows(report: PeriodReport) {
  return report.perEmployee.map((e) => ({
    Employee: e.employee.name,
    Hours: e.hours,
    Projects: e.projects.map((p) => p.name).join("; ") || "—",
    "Tasks completed": e.tasksCompleted.length,
    Blockers: e.blockers,
    Commits: e.commits,
    "Active min (PM Connect)": e.activeMinutes,
  }));
}

function buildPeriodPdf(reportType: string, label: string, report: PeriodReport) {
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
  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
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

function buildProjectStatusRows(
  projects: ProjectRow[],
  costPerHour: number,
  tasks: { project_id: string | null; status: string }[],
) {
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

const HEALTH_COLOR: Record<ProjectHealth, string> = {
  "On Track": "#0f766e",
  Behind: "#b45309",
  "At Risk": "#b91c1c",
  Completed: "#1d4ed8",
};

function esc(value: unknown) {
  return String(value ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

function tile(label: string, value: string | number, bg: string, fg: string) {
  return `<tr><td style="padding:0 0 8px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:${bg};border-radius:8px;">
      <tr><td style="padding:14px 16px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${fg};opacity:.8;">${label}</div>
        <div style="font-size:22px;font-weight:800;color:${fg};margin-top:4px;">${value}</div>
      </td></tr>
    </table>
  </td></tr>`;
}

function buildReportHtml(
  reportType: string,
  label: string,
  report: PeriodReport,
  employees: Employee[],
  projects: ProjectRow[],
  costPerHour: number,
  tasks: Task[],
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
      const color = HEALTH_COLOR[p.health as ProjectHealth] ?? "#374151";
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
  const hoursByProjectMap = new Map<string, number>();
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

async function postReportSend(payload: {
  to: string;
  subject: string;
  html: string;
  attachmentBase64: string;
  attachmentFilename: string;
}) {
  const token = getAuthToken();
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_URL}/reports/send`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function SendReportDialog({
  reportType,
  periodLabel,
  periodStart,
  periodEnd,
  buildPdf,
  buildHtml,
  employees,
  trigger,
  defaultRecipients,
}: {
  reportType: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  buildPdf: () => jsPDF;
  buildHtml: () => string;
  employees: Employee[];
  trigger: React.ReactNode;
  defaultRecipients?: string;
}) {
  const [open, setOpen] = useState(false);
  const [recipients, setRecipients] = useState(defaultRecipients ?? "");
  const [sending, setSending] = useState(false);
  const saveHistory = useSaveRow("report_history", "Report");

  async function send() {
    if (!recipients.trim()) {
      toast.error("Add at least one recipient email.");
      return;
    }
    setSending(true);
    const doc = buildPdf();
    const attachmentBase64 = doc.output("datauristring").split(",")[1] ?? "";
    try {
      await postReportSend({
        to: recipients,
        subject: `${reportType} report — ${periodLabel}`,
        html: buildHtml(),
        attachmentBase64,
        attachmentFilename: `${reportType.toLowerCase()}-report.pdf`,
      });
      saveHistory.mutate({
        report_type: reportType,
        period_label: periodLabel,
        period_start: periodStart,
        period_end: periodEnd,
        recipients,
        status: "Sent",
        sent_at: new Date().toISOString(),
        error_message: null,
      });
      toast.success("Report sent");
      setOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send email";
      saveHistory.mutate({
        report_type: reportType,
        period_label: periodLabel,
        period_start: periodStart,
        period_end: periodEnd,
        recipients,
        status: "Failed",
        sent_at: new Date().toISOString(),
        error_message: message,
      });
      toast.error(message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send {reportType.toLowerCase()} report</DialogTitle>
          <DialogDescription>{periodLabel} — sent as a PDF attachment via email.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label className="mb-1.5 block text-xs font-semibold">
              Recipients (comma separated)
            </Label>
            <Input
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="boss@company.com, manager@company.com"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {employees
              .filter((e) => e.email)
              .slice(0, 6)
              .map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setRecipients((r) => (r ? `${r}, ${e.email}` : String(e.email)))}
                  className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-primary/40"
                >
                  + {e.name}
                </button>
              ))}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={send} disabled={sending}>
            {sending ? "Sending…" : "Send Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecommendationsCard({ recommendations }: { recommendations: string[] }) {
  return (
    <div className="surface-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h2 className="font-semibold">Recommendations</h2>
      </div>
      {recommendations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing needs attention for this period.</p>
      ) : (
        <ul className="space-y-2">
          {recommendations.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PeriodReportView({
  granularity,
  employees,
  projects,
  tasks,
  logs,
  pmCommits,
  pmDailyLogs,
  inquiries,
}: {
  granularity: "Daily" | "Weekly" | "Monthly";
  employees: Employee[];
  projects: ProjectRow[];
  tasks: Task[];
  logs: WorkLog[];
  pmCommits: PmCommit[];
  pmDailyLogs: PmDailyLog[];
  inquiries: Inquiry[];
}) {
  const today = todayStr();
  const [anchor, setAnchor] = useState(granularity === "Monthly" ? today.slice(0, 7) : today);
  const { start, end, label } = rangeForGranularity(granularity, anchor);
  const { costPerHour } = useOrgCostPerHour();
  const report = useMemo(
    () =>
      buildPeriodReport(
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
      ),
    [start, end, label, employees, projects, tasks, logs, pmCommits, pmDailyLogs, inquiries],
  );

  return (
    <div className="space-y-5">
      <div className="surface-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h2 className="font-semibold">{granularity} Report Preview</h2>
              <StatusBadge value="Ready to send" tone="success" />
            </div>
            <p className="text-sm text-muted-foreground">Period: {label}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type={granularity === "Monthly" ? "month" : "date"}
              value={anchor}
              onChange={(e) => setAnchor(e.target.value)}
              className="w-auto"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCSV(
                  `${granularity.toLowerCase()}-report-${start}.csv`,
                  periodReportRows(report),
                )
              }
            >
              <Download className="size-4" /> Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                buildPeriodPdf(granularity, label, report).save(
                  `${granularity.toLowerCase()}-report-${start}.pdf`,
                )
              }
            >
              <Download className="size-4" /> Export PDF
            </Button>
            <SendReportDialog
              reportType={granularity}
              periodLabel={label}
              periodStart={start}
              periodEnd={end}
              buildPdf={() => buildPeriodPdf(granularity, label, report)}
              buildHtml={() =>
                buildReportHtml(granularity, label, report, employees, projects, costPerHour, tasks)
              }
              employees={employees}
              trigger={
                <Button size="sm">
                  <Mail className="size-4" /> Send Report
                </Button>
              }
            />
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard label="Total hours" value={number(report.totalHours)} icon={Clock} />
          <KpiCard label="Tasks done" value={String(report.tasksDone.length)} icon={ListChecks} />
          <KpiCard
            label="Active projects"
            value={String(report.activeProjectCount)}
            icon={FolderKanban}
          />
          <KpiCard
            label="Blockers"
            value={String(report.blockerCount)}
            hint={report.blockerCount ? "needs attention" : "all clear"}
            icon={AlertTriangle}
          />
          <KpiCard
            label="Commits"
            value={String(report.perEmployee.reduce((s, e) => s + e.commits, 0))}
            hint="PM Connect"
            icon={GitCommit}
          />
          <KpiCard
            label="Active time"
            value={formatDuration(report.perEmployee.reduce((s, e) => s + e.activeMinutes, 0))}
            hint="PM Connect"
            icon={Clock}
          />
        </div>

        <p className="mt-5 mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Per-employee breakdown
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {report.perEmployee.map((e) => (
            <div key={e.employee.id} className="rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{e.employee.name}</p>
                  <p className="text-xs text-muted-foreground">{e.employee.role ?? "—"}</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">
                    {number(e.hours)}h logged
                  </span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    {e.projects.length} project{e.projects.length === 1 ? "" : "s"}
                  </span>
                  {e.commits > 0 || e.activeMinutes > 0 ? (
                    <span className="rounded-full border border-info/30 bg-info/10 px-2 py-0.5 text-[11px] font-semibold text-info">
                      {e.commits} commit{e.commits === 1 ? "" : "s"} ·{" "}
                      {formatDuration(e.activeMinutes)} active
                    </span>
                  ) : null}
                </div>
              </div>
              {e.tasksCompleted.length > 0 ? (
                <div className="mt-3">
                  <p className="mb-1 text-[11px] font-semibold text-muted-foreground uppercase">
                    Tasks completed
                  </p>
                  <ul className="space-y-1">
                    {e.tasksCompleted.slice(0, 3).map((t) => (
                      <li key={t.id} className="text-xs">
                        ✓ {t.title}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {e.projects.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  {e.projects.slice(0, 3).map((p) => (
                    <div key={p.id} className="text-xs">
                      <div className="mb-0.5 flex justify-between text-muted-foreground">
                        <span className="truncate">{p.name}</span>
                        <span>{p.pct}%</span>
                      </div>
                      <Progress value={p.pct} className="h-1" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">No hours logged this period.</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <RecommendationsCard recommendations={report.recommendations} />
    </div>
  );
}

function EmployeeTab({ employees, logs }: { employees: Employee[]; logs: WorkLog[] }) {
  const today = todayStr();
  const [days, setDays] = useState("7");
  const daysNum = Number(days);
  const start = isoDate(new Date(new Date().setDate(new Date().getDate() - (daysNum - 1))));
  const end = today;

  const rows = useMemo(
    () =>
      employees.map((e) => {
        const empLogs = logs.filter(
          (l) => l.employee === e.name && l.date >= start && l.date <= end,
        );
        const totalHours = empLogs.reduce((s, l) => s + Number(l.hours || 0), 0);
        const daysLogged = new Set(empLogs.map((l) => l.date)).size;
        const daysMissing = Math.max(0, daysNum - daysLogged);
        const avgPerDay = daysNum > 0 ? totalHours / daysNum : 0;
        return { employee: e, totalHours, daysLogged, daysMissing, avgPerDay };
      }),
    [employees, logs, start, end, daysNum],
  );

  const chartData = rows.map((r) => ({ name: r.employee.name.split(" ")[0], hours: r.totalHours }));

  return (
    <div className="space-y-5">
      <Select value={days} onValueChange={setDays}>
        <SelectTrigger className="w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="7">Last 7 days</SelectItem>
          <SelectItem value="14">Last 14 days</SelectItem>
          <SelectItem value="30">Last 30 days</SelectItem>
          <SelectItem value="90">Last 90 days</SelectItem>
        </SelectContent>
      </Select>

      <div className="surface-card p-5">
        <h2 className="mb-3 font-semibold">Hours by Employee (last {days} days)</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  color: "var(--color-popover-foreground)",
                }}
                formatter={(v: number) => `${v}h`}
              />
              <Bar
                dataKey="hours"
                name={`Hours (${days}d)`}
                fill="var(--color-primary)"
                radius={[8, 8, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="surface-card overflow-x-auto">
        <div className="px-5 pt-5 pb-1">
          <h2 className="font-semibold">Employee Breakdown</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Employee</th>
              <th className="px-4 py-3 text-left font-semibold">Team</th>
              <th className="px-4 py-3 text-left font-semibold">Total Hours</th>
              <th className="px-4 py-3 text-left font-semibold">Days Logged</th>
              <th className="px-4 py-3 text-left font-semibold">Days Missing</th>
              <th className="px-4 py-3 text-left font-semibold">Avg / Day</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {rows.map((r) => (
              <tr key={r.employee.id} className="hover:bg-muted/40 transition-colors">
                <td className="px-4 py-3 font-medium">{r.employee.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.employee.department ?? "—"}</td>
                <td className="px-4 py-3 font-semibold">{number(r.totalHours)}h</td>
                <td className="px-4 py-3">{r.daysLogged}</td>
                <td className="px-4 py-3">
                  {r.daysMissing > 0 ? (
                    <span className="inline-flex items-center justify-center rounded-full bg-destructive/12 px-2 py-0.5 text-xs font-semibold text-destructive">
                      {r.daysMissing}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">0</span>
                  )}
                </td>
                <td className="px-4 py-3">{r.avgPerDay.toFixed(1)}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProjectsOverview({
  projects,
  logs,
  tasks,
}: {
  projects: ProjectRow[];
  logs: WorkLog[];
  tasks: Task[];
}) {
  const { costPerHour } = useOrgCostPerHour();
  const today = todayStr();
  const sevenDaysAgo = isoDate(new Date(new Date().setDate(new Date().getDate() - 6)));

  const rows = useMemo(
    () =>
      projects.map((p) => {
        const budgetHours = costPerHour > 0 ? p.budget / costPerHour : 0;
        const logged7d = logs
          .filter((l) => l.project_id === p.id && l.date >= sevenDaysAgo && l.date <= today)
          .reduce((s, l) => s + Number(l.hours || 0), 0);
        const progress = computeProjectProgress(p.id, tasks);
        return {
          project: p,
          budgetHours,
          logged7d,
          progress,
          health: computeProjectHealth(p, today, progress),
        };
      }),
    [projects, logs, tasks, costPerHour, sevenDaysAgo, today],
  );

  const chartData = rows.map((r) => ({
    name: r.project.name,
    budget: Math.round(r.budgetHours),
    progress: r.progress,
  }));

  const statusCounts = new Map<ProjectHealth, number>();
  for (const r of rows) statusCounts.set(r.health, (statusCounts.get(r.health) ?? 0) + 1);
  const pieData = (["On Track", "Behind", "At Risk", "Completed"] as ProjectHealth[])
    .map((s) => ({ name: s, value: statusCounts.get(s) ?? 0 }))
    .filter((d) => d.value > 0);
  const PIE_COLORS: Record<ProjectHealth, string> = {
    "On Track": "var(--color-success)",
    Behind: "var(--color-warning)",
    "At Risk": "var(--color-destructive)",
    Completed: "var(--color-info)",
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="surface-card p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold">Budget Hours vs Progress</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  interval={0}
                  angle={-12}
                  textAnchor="end"
                  height={55}
                />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    color: "var(--color-popover-foreground)",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="budget"
                  name="Budget Hours"
                  fill="var(--color-muted-foreground)"
                  radius={[6, 6, 0, 0]}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="progress"
                  name="Progress %"
                  fill="var(--color-primary)"
                  radius={[6, 6, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="surface-card p-5">
          <h2 className="mb-3 font-semibold">Status Breakdown</h2>
          {pieData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects yet.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {pieData.map((d) => (
                      <Cell key={d.name} fill={PIE_COLORS[d.name]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      color: "var(--color-popover-foreground)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="surface-card overflow-x-auto">
        <div className="px-5 pt-5 pb-1">
          <h2 className="font-semibold">Project Progress</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Project</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
              <th className="px-4 py-3 text-left font-semibold">Budget</th>
              <th className="px-4 py-3 text-left font-semibold">Logged (7d)</th>
              <th className="px-4 py-3 text-left font-semibold">Progress</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {rows.map((r) => (
              <tr key={r.project.id} className="hover:bg-muted/40 transition-colors">
                <td className="px-4 py-3 font-medium">{r.project.name}</td>
                <td className="px-4 py-3">
                  <StatusBadge value={r.health} tone={HEALTH_TONE[r.health]} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {number(Math.round(r.budgetHours))}h
                </td>
                <td className="px-4 py-3 text-muted-foreground">{number(r.logged7d)}h</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Progress value={r.progress} className="h-1.5 w-24" />
                    <span className="text-xs font-semibold">{r.progress}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProjectTab({
  projects,
  tasks,
  logs,
}: {
  projects: ProjectRow[];
  tasks: Task[];
  logs: WorkLog[];
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const today = todayStr();
  const [start, setStart] = useState(
    isoDate(new Date(new Date().setDate(new Date().getDate() - 30))),
  );
  const [end, setEnd] = useState(today);
  const { costPerHour } = useOrgCostPerHour();

  const projLogs = useMemo(
    () => logs.filter((l) => l.project_id === projectId && l.date >= start && l.date <= end),
    [logs, projectId, start, end],
  );
  const hours = projLogs.reduce((s, l) => s + Number(l.hours || 0), 0);
  const byEmployee = new Map<string, number>();
  for (const l of projLogs)
    byEmployee.set(l.employee, (byEmployee.get(l.employee) ?? 0) + Number(l.hours || 0));
  const projectTasks = tasks.filter((t) => t.project_id === projectId);
  const done = projectTasks.filter((t) => t.status === "Done").length;
  const blockers = projLogs.filter((l) => l.blocker);

  return (
    <div className="space-y-5">
      <h2 className="font-semibold">Project deep-dive</h2>
      <div className="flex flex-wrap items-center gap-3">
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-[240px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="w-auto"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="w-auto"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Hours logged" value={number(hours)} icon={Clock} />
        <KpiCard
          label="Tasks done / total"
          value={`${done} / ${projectTasks.length}`}
          icon={ListChecks}
        />
        <KpiCard
          label="Loaded cost"
          value={currency(hours * costPerHour)}
          icon={FolderKanban}
          hint={`${currency(costPerHour)}/hr org rate`}
        />
        <KpiCard
          label="Blockers"
          value={String(blockers.length)}
          hint={blockers.length ? "needs attention" : "all clear"}
          icon={AlertTriangle}
        />
      </div>

      <div className="surface-card p-5">
        <h2 className="mb-3 font-semibold">Hours by team member</h2>
        {byEmployee.size === 0 ? (
          <p className="text-sm text-muted-foreground">No hours logged in this range.</p>
        ) : (
          <div className="space-y-2">
            {[...byEmployee.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([name, h]) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span>{name}</span>
                  <span className="font-semibold">{number(h)}h</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HoursTab({
  employees,
  projects,
  logs,
}: {
  employees: Employee[];
  projects: ProjectRow[];
  logs: WorkLog[];
}) {
  const today = todayStr();
  const [start, setStart] = useState(
    isoDate(new Date(new Date().setDate(new Date().getDate() - 14))),
  );
  const [end, setEnd] = useState(today);
  const inRange = logs.filter((l) => l.date >= start && l.date <= end);

  const byEmployee = employees
    .map((e) => ({
      name: e.name.split(" ")[0],
      hours: inRange
        .filter((l) => l.employee === e.name)
        .reduce((s, l) => s + Number(l.hours || 0), 0),
    }))
    .filter((r) => r.hours > 0)
    .sort((a, b) => b.hours - a.hours);

  const byProject = projects
    .map((p) => ({
      name: p.name,
      hours: inRange
        .filter((l) => l.project_id === p.id)
        .reduce((s, l) => s + Number(l.hours || 0), 0),
    }))
    .filter((r) => r.hours > 0)
    .sort((a, b) => b.hours - a.hours);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="w-auto"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="w-auto"
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="surface-card p-5">
          <h2 className="mb-3 font-semibold">Hours by employee</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byEmployee}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    color: "var(--color-popover-foreground)",
                  }}
                  formatter={(v: number) => `${v}h`}
                />
                <Bar
                  dataKey="hours"
                  fill="var(--color-primary)"
                  radius={[8, 8, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="surface-card p-5">
          <h2 className="mb-3 font-semibold">Hours by project</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byProject}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  tickFormatter={(v: string) => v.split(" ")[0] ?? v}
                />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    color: "var(--color-popover-foreground)",
                  }}
                  formatter={(v: number) => `${v}h`}
                />
                <Bar
                  dataKey="hours"
                  fill="var(--color-info)"
                  radius={[8, 8, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityTab({ projects, logs }: { projects: ProjectRow[]; logs: WorkLog[] }) {
  const recent = [...logs]
    .sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id))
    .slice(0, 40);

  return (
    <div className="surface-card divide-border divide-y">
      {recent.length === 0 ? (
        <EmptyState title="No activity yet" description="Log work to see it appear here." />
      ) : (
        recent.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <span className="font-medium">{l.employee}</span>{" "}
              <span className="text-muted-foreground">
                logged {number(l.hours)}h on{" "}
                {projects.find((p) => p.id === l.project_id)?.name ?? "a project"}
              </span>
              {l.blocker ? (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-destructive/12 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                  <AlertTriangle className="size-3" /> Blocked
                </span>
              ) : null}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{dateLabel(l.date)}</span>
          </div>
        ))
      )}
    </div>
  );
}

function SubscriptionsSection({
  subscriptions,
  isLoading,
}: {
  subscriptions: Subscription[];
  isLoading: boolean;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Report Subscriptions</h2>
          <p className="text-sm text-muted-foreground">
            Who gets Daily/Weekly/Monthly reports, the missing-log digest, and budget alerts — sent
            automatically on a schedule.
          </p>
        </div>
        <RecordDialog
          table="report_subscriptions"
          label="Subscription"
          fields={SUBSCRIPTION_FIELDS}
          defaults={{ status: "Active" }}
          trigger={
            <Button size="sm">
              <Plus className="size-4" /> Add subscription
            </Button>
          }
        />
      </div>
      {isLoading ? (
        <TableSkeleton rows={3} />
      ) : subscriptions.length === 0 ? (
        <EmptyState
          title="No subscriptions configured"
          description="Nothing will be auto-sent until at least one is added."
        />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Report</th>
                <th className="px-4 py-3 text-left font-semibold">Recipients</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {subscriptions.map((s) => (
                <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 font-medium">{s.report_type}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.recipients}</td>
                  <td className="px-4 py-3">
                    <StatusBadge value={s.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <RecordDialog
                        table="report_subscriptions"
                        label="Subscription"
                        fields={SUBSCRIPTION_FIELDS}
                        record={s}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        }
                      />
                      <DeleteButton
                        table="report_subscriptions"
                        id={s.id}
                        label="Subscription"
                        name={s.report_type}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReportHistorySection({
  history,
  isLoading,
  employees,
  projects,
  tasks,
  logs,
  pmCommits,
  pmDailyLogs,
  inquiries,
}: {
  history: ReportHistoryRow[];
  isLoading: boolean;
  employees: Employee[];
  projects: ProjectRow[];
  tasks: Task[];
  logs: WorkLog[];
  pmCommits: PmCommit[];
  pmDailyLogs: PmDailyLog[];
  inquiries: Inquiry[];
}) {
  const rows = [...history].sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  const { costPerHour } = useOrgCostPerHour();

  function regenerate(row: ReportHistoryRow) {
    const report = buildPeriodReport(
      row.period_start,
      row.period_end,
      row.period_label,
      employees,
      projects,
      tasks,
      logs,
      pmCommits,
      pmDailyLogs,
      inquiries,
    );
    buildPeriodPdf(row.report_type, row.period_label, report).save(
      `${row.report_type.toLowerCase()}-report-${row.period_start}.pdf`,
    );
  }

  return (
    <div>
      <h2 className="mb-3 font-semibold">Report History</h2>
      {isLoading ? (
        <TableSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No reports sent yet"
          description="Send a report to see it logged here."
        />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Date</th>
                <th className="px-4 py-3 text-left font-semibold">Type</th>
                <th className="px-4 py-3 text-left font-semibold">Recipients</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground">{dateLabel(r.sent_at)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge value={r.report_type} tone="neutral" />
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate">{r.recipients}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      value={r.status}
                      {...(r.status === "Sent" ? { tone: "success" } : {})}
                    />
                    {r.status === "Failed" && r.error_message ? (
                      <span className="ml-2 text-xs text-muted-foreground">{r.error_message}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => regenerate(r)}>
                        <Download className="size-4" /> Download
                      </Button>
                      <SendReportDialog
                        reportType={r.report_type}
                        periodLabel={r.period_label}
                        periodStart={r.period_start}
                        periodEnd={r.period_end}
                        buildPdf={() =>
                          buildPeriodPdf(
                            r.report_type,
                            r.period_label,
                            buildPeriodReport(
                              r.period_start,
                              r.period_end,
                              r.period_label,
                              employees,
                              projects,
                              tasks,
                              logs,
                              pmCommits,
                              pmDailyLogs,
                              inquiries,
                            ),
                          )
                        }
                        buildHtml={() =>
                          buildReportHtml(
                            r.report_type,
                            r.period_label,
                            buildPeriodReport(
                              r.period_start,
                              r.period_end,
                              r.period_label,
                              employees,
                              projects,
                              tasks,
                              logs,
                              pmCommits,
                              pmDailyLogs,
                              inquiries,
                            ),
                            employees,
                            projects,
                            costPerHour,
                            tasks,
                          )
                        }
                        employees={employees}
                        defaultRecipients={r.recipients}
                        trigger={
                          <Button variant="ghost" size="sm">
                            <Mail className="size-4" /> Resend
                          </Button>
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Page() {
  const { data: employeeRows, isLoading: employeesLoading } = useRows<Employee>("employees");
  const { data: projectRows, isLoading: projectsLoading } = useRows<ProjectRow>("projects");
  const { data: taskRows, isLoading: tasksLoading } = useRows<Task>("tasks");
  const { data: logRows, isLoading: logsLoading } = useRows<WorkLog>("work_logs");
  const { data: historyRows, isLoading: historyLoading } =
    useRows<ReportHistoryRow>("report_history");
  const { data: subscriptionRows, isLoading: subscriptionsLoading } =
    useRows<Subscription>("report_subscriptions");
  const { data: pmCommitRows } = useRows<PmCommit>("pm_commits");
  const { data: pmDailyLogRows } = useRows<PmDailyLog>("pm_daily_log");
  const { data: inquiryRows } = useRows<Inquiry>("inquiries");

  const employees = employeeRows ?? [];
  const projects = projectRows ?? [];
  const tasks = taskRows ?? [];
  const logs = logRows ?? [];
  const history = historyRows ?? [];
  const subscriptions = subscriptionRows ?? [];
  const pmCommits = pmCommitRows ?? [];
  const pmDailyLogs = pmDailyLogRows ?? [];
  const inquiries = inquiryRows ?? [];

  const loading = employeesLoading || projectsLoading || tasksLoading || logsLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Log Reports"
        description="Generate, send, and export performance reports for your team."
      />

      {loading ? (
        <TableSkeleton />
      ) : (
        <Tabs defaultValue="daily">
          <TabsList className="flex-wrap">
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="employee">Employee</TabsTrigger>
            <TabsTrigger value="project">Project</TabsTrigger>
            <TabsTrigger value="hours">Hours</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="daily" className="pt-4">
            <PeriodReportView
              granularity="Daily"
              employees={employees}
              projects={projects}
              tasks={tasks}
              logs={logs}
              pmCommits={pmCommits}
              pmDailyLogs={pmDailyLogs}
              inquiries={inquiries}
            />
          </TabsContent>
          <TabsContent value="weekly" className="pt-4">
            <PeriodReportView
              granularity="Weekly"
              employees={employees}
              projects={projects}
              tasks={tasks}
              logs={logs}
              pmCommits={pmCommits}
              pmDailyLogs={pmDailyLogs}
              inquiries={inquiries}
            />
          </TabsContent>
          <TabsContent value="monthly" className="pt-4">
            <PeriodReportView
              granularity="Monthly"
              employees={employees}
              projects={projects}
              tasks={tasks}
              logs={logs}
              pmCommits={pmCommits}
              pmDailyLogs={pmDailyLogs}
              inquiries={inquiries}
            />
          </TabsContent>
          <TabsContent value="employee" className="pt-4">
            <EmployeeTab employees={employees} logs={logs} />
          </TabsContent>
          <TabsContent value="project" className="space-y-6 pt-4">
            <ProjectsOverview projects={projects} logs={logs} tasks={tasks} />
            <ProjectTab projects={projects} tasks={tasks} logs={logs} />
          </TabsContent>
          <TabsContent value="hours" className="pt-4">
            <HoursTab employees={employees} projects={projects} logs={logs} />
          </TabsContent>
          <TabsContent value="activity" className="pt-4">
            <ActivityTab projects={projects} logs={logs} />
          </TabsContent>
        </Tabs>
      )}

      <SubscriptionsSection subscriptions={subscriptions} isLoading={subscriptionsLoading} />

      <ReportHistorySection
        history={history}
        isLoading={historyLoading}
        employees={employees}
        projects={projects}
        tasks={tasks}
        logs={logs}
        pmCommits={pmCommits}
        pmDailyLogs={pmDailyLogs}
        inquiries={inquiries}
      />
    </div>
  );
}
