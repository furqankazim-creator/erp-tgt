import { useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Download, History, Mail, Search } from "lucide-react";
import { toast } from "sonner";

import { callApi, useRows } from "@/lib/db";
import { dateLabel, dateTimeLabel } from "@/lib/format";
import { TableSkeleton, EmptyState } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Project } from "@/routes/_authenticated/project";

type Change = { field: string; from: string | null; to: string | null };

type ActivityEntry = {
  id: string;
  project_id: string;
  table: string;
  record_id: string;
  record_label: string;
  action: "created" | "updated" | "deleted";
  changes: Change[];
  actor: string | null;
  created_at: string;
};

type Contact = { id: string; account: string | null; name: string; email: string | null };

const MODULE_LABELS: Record<string, string> = {
  projects: "Project",
  tasks: "Task",
  milestones: "Milestone",
  deliverables: "Deliverable",
  tickets: "Bug / Q&A",
  scope_change_requests: "Scope change",
  scope_items: "Scope item",
  sprints: "Sprint",
  meetings: "Meeting",
  documents: "Document",
  client_feedback: "Client feedback",
  invoices: "Invoice",
  quotes: "Estimate",
  work_logs: "Work log",
};

// What a client shouldn't see in a report sent to them: internal time
// tracking and money modules entirely, and internal-only fields (budgets,
// margins, hours, private notes) on anything else.
const INTERNAL_MODULES = new Set(["work_logs", "quotes", "invoices"]);
const INTERNAL_FIELDS = new Set([
  "budget",
  "cost",
  "revenue",
  "hours",
  "rate",
  "satisfaction",
  "notes",
  "employee",
  "drive_link",
  "repo_url",
]);

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

function moduleLabel(table: string) {
  return MODULE_LABELS[table] ?? table.replace(/_/g, " ");
}

function fieldLabel(field: string) {
  const s = field.replace(/_id$/, "").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function valueLabel(v: string | null) {
  if (v === null) return "—";
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(v)) return dateLabel(v);
  return v.length > 80 ? `${v.slice(0, 77)}…` : v;
}

function actionLabel(e: ActivityEntry) {
  const verb = e.action === "created" ? "Created" : e.action === "deleted" ? "Deleted" : "Updated";
  return `${verb} ${moduleLabel(e.table).toLowerCase()}`;
}

function changeLines(e: ActivityEntry, clientSafe: boolean) {
  return (e.changes ?? [])
    .filter((c) => !clientSafe || !INTERNAL_FIELDS.has(c.field))
    .map((c) => `${fieldLabel(c.field)}: ${valueLabel(c.from)} → ${valueLabel(c.to)}`);
}

// Applies the client-safe rules to a list: drops internal modules, and drops
// updates whose only changes were to internal fields (nothing left to show).
function visibleEntries(entries: ActivityEntry[], clientSafe: boolean) {
  if (!clientSafe) return entries;
  return entries.filter(
    (e) =>
      !INTERNAL_MODULES.has(e.table) &&
      (e.action !== "updated" || changeLines(e, true).length > 0),
  );
}

function rangeStart(range: string) {
  if (range === "all") return null;
  return new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000).toISOString();
}

function periodText(range: string) {
  return RANGES.find((r) => r.value === range)?.label ?? "All time";
}

function buildAuditPdf(project: Project, entries: ActivityEntry[], range: string, clientSafe: boolean) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`Project Audit Report — ${project.name}`, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(
    `${project.client ?? "Internal"} · ${periodText(range)} · Generated ${dateLabel(new Date().toISOString())}`,
    14,
    25,
  );

  const byModule = new Map<string, number>();
  for (const e of entries) byModule.set(e.table, (byModule.get(e.table) ?? 0) + 1);
  autoTable(doc, {
    startY: 32,
    head: [["Area", "Changes recorded"]],
    body: byModule.size
      ? [...byModule.entries()].map(([t, n]) => [moduleLabel(t), String(n)])
      : [["No activity in this period", ""]],
    headStyles: { fillColor: [20, 140, 130] },
    styles: { fontSize: 9 },
    tableWidth: 90,
  });

  const afterSummary =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 50;
  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text("Activity", 14, afterSummary + 10);
  autoTable(doc, {
    startY: afterSummary + 13,
    head: [["When", "By", "What", "Item", "Details"]],
    body: entries.length
      ? entries.map((e) => [
          dateTimeLabel(e.created_at),
          e.actor ?? "—",
          actionLabel(e),
          e.record_label || "—",
          // jsPDF's built-in font has no "→" glyph.
          changeLines(e, clientSafe).join("\n").replace(/→/g, "->") || "—",
        ])
      : [["—", "", "", "", ""]],
    headStyles: { fillColor: [20, 140, 130] },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 26 }, 2: { cellWidth: 30 }, 3: { cellWidth: 36 } },
  });
  return doc;
}

function pdfFilename(project: Project) {
  return `audit-report-${project.name.replace(/\s+/g, "-").toLowerCase()}.pdf`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function EmailReportDialog({
  project,
  entries,
  range,
}: {
  project: Project;
  entries: ActivityEntry[];
  range: string;
}) {
  const { data: contactRows } = useRows<Contact>("contacts");
  const clientEmails = (contactRows ?? [])
    .filter((c) => c.email && project.client && c.account === project.client)
    .map((c) => c.email as string);

  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [clientSafe, setClientSafe] = useState(true);
  const [sending, setSending] = useState(false);

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v) {
      setTo(clientEmails.join(", "));
      setSubject(`Project audit report — ${project.name} (${periodText(range)})`);
      setMessage(
        `Hi,\n\nPlease find attached the audit report for ${project.name}, covering ${periodText(range).toLowerCase()}.\n\nLet us know if you have any questions.`,
      );
      setClientSafe(true);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const shown = visibleEntries(entries, clientSafe);
    const doc = buildAuditPdf(project, shown, range, clientSafe);
    const attachmentBase64 = doc.output("datauristring").split(",")[1] ?? "";
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.5">${escapeHtml(
      message,
    ).replace(/\n/g, "<br>")}<p style="color:#6b7280;font-size:12px;margin-top:24px">${shown.length} recorded change${
      shown.length === 1 ? "" : "s"
    } · ${escapeHtml(periodText(range))}</p></div>`;
    setSending(true);
    try {
      await callApi("/reports/send", {
        method: "POST",
        body: JSON.stringify({
          to,
          subject,
          html,
          attachmentBase64,
          attachmentFilename: pdfFilename(project),
        }),
      });
      toast.success(`Audit report sent to ${to}`);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Mail className="size-4" /> Email to client
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Email audit report</DialogTitle>
          <DialogDescription>
            The report ({periodText(range).toLowerCase()}) is attached as a PDF.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={send} className="grid gap-4 pt-1">
          <div>
            <Label htmlFor="audit-to" className="mb-1.5 block text-xs font-semibold">
              To
            </Label>
            <Input
              id="audit-to"
              required
              placeholder="client@example.com, other@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            {clientEmails.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                No contact with an email is saved for {project.client ?? "this client"} — type the
                address in.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="audit-subject" className="mb-1.5 block text-xs font-semibold">
              Subject
            </Label>
            <Input
              id="audit-subject"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="audit-message" className="mb-1.5 block text-xs font-semibold">
              Message
            </Label>
            <Textarea
              id="audit-message"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={clientSafe}
              onCheckedChange={(v) => setClientSafe(v === true)}
              className="mt-0.5"
            />
            <span>
              Client version
              <span className="block text-xs text-muted-foreground">
                Leaves out work logs, estimates, invoices, budgets and internal notes.
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={sending}>
              {sending ? "Sending…" : "Send report"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AuditReportTab({ project }: { projectId: string; project: Project }) {
  const { data: activityRows, isLoading } = useRows<ActivityEntry>("project_activity");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState("30");
  const [area, setArea] = useState("all");
  const [clientSafe, setClientSafe] = useState(false);

  // Server already restricts a Developer to their own projects; this narrows
  // to the one being viewed (for Admins, who can read every project's log).
  const projectEntries = useMemo(
    () => (activityRows ?? []).filter((e) => e.project_id === project.id),
    [activityRows, project.id],
  );

  const inRange = useMemo(() => {
    const start = rangeStart(range);
    return projectEntries.filter(
      (e) => (!start || e.created_at >= start) && (area === "all" || e.table === area),
    );
  }, [projectEntries, range, area]);

  const shown = visibleEntries(inRange, clientSafe).filter((e) =>
    `${e.actor ?? ""} ${actionLabel(e)} ${e.record_label} ${changeLines(e, clientSafe).join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  const modules = [...new Set(projectEntries.map((e) => e.table))].sort();
  const firstEntry = projectEntries[projectEntries.length - 1];

  function exportPdf() {
    buildAuditPdf(project, shown, range, clientSafe).save(pdfFilename(project));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search activity…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={area} onValueChange={setArea}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All areas</SelectItem>
              {modules.map((m) => (
                <SelectItem key={m} value={m}>
                  {moduleLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={clientSafe} onCheckedChange={(v) => setClientSafe(v === true)} />
            Client version
          </label>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportPdf}>
            <Download className="size-4" /> Export PDF
          </Button>
          <EmailReportDialog project={project} entries={inRange} range={range} />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : shown.length === 0 ? (
        <EmptyState
          title="No activity recorded"
          description={
            projectEntries.length === 0
              ? "History is recorded from now on — every task, bug, milestone, scope change and other edit on this project will appear here with who made it."
              : "Nothing matches these filters. Try a longer period or clear the search."
          }
        />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">When</th>
                <th className="px-4 py-3 text-left font-semibold">By</th>
                <th className="px-4 py-3 text-left font-semibold">What</th>
                <th className="px-4 py-3 text-left font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.slice(0, 300).map((e) => {
                const lines = changeLines(e, clientSafe);
                return (
                  <tr key={e.id} className="align-top hover:bg-muted/40">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {dateTimeLabel(e.created_at)}
                    </td>
                    <td className="px-4 py-3">{e.actor ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="block font-medium">{actionLabel(e)}</span>
                      <span className="block text-xs text-muted-foreground">{e.record_label || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {lines.length ? (
                        <ul className="space-y-0.5 text-xs">
                          {lines.map((l, i) => (
                            <li key={i}>{l}</li>
                          ))}
                        </ul>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {firstEntry && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <History className="size-3.5" /> History for this project starts{" "}
          {dateLabel(firstEntry.created_at)}. Earlier changes weren&apos;t recorded.
        </p>
      )}
    </div>
  );
}
