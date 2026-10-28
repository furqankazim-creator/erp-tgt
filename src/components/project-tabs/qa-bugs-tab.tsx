import { useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { AlertTriangle, Bug, CheckCircle2, Download, HelpCircle, Play, RotateCcw } from "lucide-react";

import { useRows, useSaveRow } from "@/lib/db";
import { countdown, dateLabel } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/loading";
import { KpiCard } from "@/components/kpi-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Project } from "@/routes/_authenticated/project";

type TicketType = "Bug" | "Question";

type Ticket = {
  id: string;
  subject: string;
  type?: TicketType | null;
  description?: string | null;
  steps?: string | null;
  client: string | null;
  priority: string;
  status: string;
  satisfaction: number | null;
  assignee: string | null;
  sla_due_at: string | null;
  project_id: string | null;
  response?: string | null;
  reported_by?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  created_at?: string;
};

const SEVERITY_ORDER = ["Critical", "High", "Medium", "Low"];
const UNASSIGNED = "__unassigned__";

function severityRank(p: string) {
  const i = SEVERITY_ORDER.indexOf(p);
  return i === -1 ? SEVERITY_ORDER.length : i;
}

function isOpen(t: Ticket) {
  return t.status !== "Resolved" && t.status !== "Closed";
}

// Tickets raised from this tab (or given a type in After Sales) carry an
// explicit `type`. Older tickets have none, so for those a subject that
// reads as a question (ends with "?" or opens with a question word) is
// treated as Q&A and everything else as a bug — the previous behavior.
function kindOf(t: Ticket): TicketType {
  if (t.type === "Bug" || t.type === "Question") return t.type;
  const s = t.subject.trim().toLowerCase();
  return s.endsWith("?") || /^(how|why|what|when|can|should|is|does)\b/.test(s)
    ? "Question"
    : "Bug";
}

// Unresolved first, then by severity, newest first within that.
function sortTickets(rows: Ticket[]) {
  return [...rows].sort(
    (a, b) =>
      Number(isOpen(b)) - Number(isOpen(a)) ||
      severityRank(a.priority) - severityRank(b.priority) ||
      (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  );
}

const labelClass =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85";

function NewTicketDialog({
  kind,
  project,
  people,
  open,
  onOpenChange,
  onCreated,
}: {
  kind: TicketType;
  project: Project;
  people: string[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const isBug = kind === "Bug";
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [assignee, setAssignee] = useState(UNASSIGNED);
  const save = useSaveRow("tickets", isBug ? "Bug" : "Question");

  function reset() {
    setSubject("");
    setDescription("");
    setSteps("");
    setPriority("Medium");
    setAssignee(UNASSIGNED);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate(
      {
        project_id: project.id,
        client: project.client,
        type: kind,
        subject: subject.trim(),
        description: description.trim() || null,
        steps: isBug ? steps.trim() || null : null,
        priority,
        status: "Open",
        assignee: assignee === UNASSIGNED ? null : assignee,
        satisfaction: null,
        sla_due_at: null,
        response: null,
      },
      {
        onSuccess: () => {
          onCreated();
          onOpenChange(false);
          reset();
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isBug ? "Report a bug" : "Ask a question"}</DialogTitle>
          <DialogDescription>
            {isBug
              ? `Logged against ${project.name}. Be specific enough that someone else can reproduce it.`
              : `Logged against ${project.name}. Whoever you assign it to can answer it here.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 pt-1">
          <div>
            <Label htmlFor="ticket-subject" className={labelClass}>
              {isBug ? "What's broken" : "Question"} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ticket-subject"
              required
              maxLength={200}
              placeholder={
                isBug ? "e.g. Checkout button does nothing on Safari" : "e.g. Which payment gateway do we use?"
              }
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="ticket-description" className={labelClass}>
              {isBug ? "What happens vs. what should happen" : "Details"}
            </Label>
            <Textarea
              id="ticket-description"
              rows={3}
              maxLength={4000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {isBug && (
            <div>
              <Label htmlFor="ticket-steps" className={labelClass}>
                Steps to reproduce
              </Label>
              <Textarea
                id="ticket-steps"
                rows={3}
                maxLength={4000}
                placeholder={"1. Open the cart\n2. Click Checkout\n3. Nothing happens"}
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className={labelClass}>{isBug ? "Severity" : "Priority"}</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_ORDER.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className={labelClass}>Assign to</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {people.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending} className="min-w-[120px]">
              {save.isPending ? "Saving…" : isBug ? "Report bug" : "Ask question"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TicketDrawer({
  ticket,
  people,
  onClose,
}: {
  ticket: Ticket;
  people: string[];
  onClose: () => void;
}) {
  const kind = kindOf(ticket);
  const [response, setResponse] = useState(ticket.response ?? "");
  const save = useSaveRow("tickets", kind === "Bug" ? "Bug" : "Question");

  function setStatus(status: string) {
    save.mutate({ id: ticket.id, status });
  }

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sidebar-scroll overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{ticket.subject}</SheetTitle>
          <SheetDescription>
            {kind} · {ticket.client ?? "Internal"}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={ticket.status} />
            <StatusBadge value={ticket.priority} />
          </div>

          <dl className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Assignee</dt>
              <dd>
                <Select
                  value={ticket.assignee ?? UNASSIGNED}
                  onValueChange={(v) =>
                    save.mutate({ id: ticket.id, assignee: v === UNASSIGNED ? null : v })
                  }
                >
                  <SelectTrigger className="h-8 w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                    {[...new Set([...people, ...(ticket.assignee ? [ticket.assignee] : [])])].map(
                      (p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Reported by</dt>
              <dd>
                {ticket.reported_by ?? "—"}
                {ticket.created_at ? ` · ${dateLabel(ticket.created_at)}` : ""}
              </dd>
            </div>
            {ticket.sla_due_at && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">SLA</dt>
                <dd>{countdown(ticket.sla_due_at)}</dd>
              </div>
            )}
            {ticket.resolved_by && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Resolved by</dt>
                <dd>
                  {ticket.resolved_by} · {dateLabel(ticket.resolved_at)}
                </dd>
              </div>
            )}
          </dl>

          {ticket.description && (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">
                {kind === "Bug" ? "What happens" : "Details"}
              </p>
              <p className="whitespace-pre-line text-sm">{ticket.description}</p>
            </div>
          )}
          {ticket.steps && (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Steps to reproduce</p>
              <p className="whitespace-pre-line text-sm">{ticket.steps}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {isOpen(ticket) && ticket.status !== "In Progress" && (
              <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => setStatus("In Progress")}>
                <Play className="size-3.5" /> Start working
              </Button>
            )}
            {isOpen(ticket) && (
              <Button size="sm" disabled={save.isPending} onClick={() => setStatus("Resolved")}>
                <CheckCircle2 className="size-3.5" /> {kind === "Bug" ? "Mark fixed" : "Mark answered"}
              </Button>
            )}
            {!isOpen(ticket) && (
              <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => setStatus("Open")}>
                <RotateCcw className="size-3.5" /> Reopen
              </Button>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
              {kind === "Bug" ? "Fix notes" : "Answer"}
            </p>
            <Textarea rows={5} value={response} onChange={(e) => setResponse(e.target.value)} />
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={save.isPending}
              onClick={() => save.mutate({ id: ticket.id, response })}
            >
              Save {kind === "Bug" ? "notes" : "answer"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TicketTable({ rows, onOpen }: { rows: Ticket[]; onOpen: (t: Ticket) => void }) {
  if (rows.length === 0) {
    return <EmptyState title="Nothing here" description="No tickets match this view." />;
  }
  return (
    <div className="surface-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left font-semibold">Subject</th>
            <th className="px-4 py-3 text-left font-semibold">Severity</th>
            <th className="px-4 py-3 text-left font-semibold">Assignee</th>
            <th className="px-4 py-3 text-left font-semibold">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((t) => (
            <tr
              key={t.id}
              className="cursor-pointer transition-colors hover:bg-muted/40"
              onClick={() => onOpen(t)}
            >
              <td className="px-4 py-3">
                <span className="block font-medium">{t.subject}</span>
                <span className="block text-xs text-muted-foreground">
                  {t.reported_by ? `by ${t.reported_by}` : "—"}
                  {t.created_at ? ` · ${dateLabel(t.created_at)}` : ""}
                  {t.sla_due_at && isOpen(t) ? ` · SLA ${countdown(t.sla_due_at)}` : ""}
                </span>
              </td>
              <td className="px-4 py-3">
                <StatusBadge value={t.priority} />
              </td>
              <td className="px-4 py-3 text-muted-foreground">{t.assignee ?? "Unassigned"}</td>
              <td className="px-4 py-3">
                <StatusBadge value={t.status} />
              </td>
              <td className="px-4 py-3 text-right text-xs text-primary">View</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function buildQaBugsPdf(project: Project, bugs: Ticket[], questions: Ticket[]) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`Bugs & Q&A Report — ${project.name}`, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(110);
  const openBugs = bugs.filter(isOpen).length;
  doc.text(
    `${project.client ?? "Internal"} · Generated ${dateLabel(new Date().toISOString())} · ` +
      `Bugs: ${openBugs} open / ${bugs.length - openBugs} resolved · ` +
      `Questions: ${questions.filter(isOpen).length} open / ${questions.filter((q) => !isOpen(q)).length} answered`,
    14,
    25,
  );

  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text("Bugs", 14, 36);
  autoTable(doc, {
    startY: 39,
    head: [["Bug", "Severity", "Status", "Assignee", "Reported", "Resolved"]],
    body: bugs.length
      ? bugs.map((b) => [
          b.subject,
          b.priority,
          b.status,
          b.assignee ?? "Unassigned",
          `${b.reported_by ?? "—"}${b.created_at ? `, ${dateLabel(b.created_at)}` : ""}`,
          b.resolved_at ? `${b.resolved_by ?? "—"}, ${dateLabel(b.resolved_at)}` : "—",
        ])
      : [["No bugs logged", "", "", "", "", ""]],
    headStyles: { fillColor: [20, 140, 130] },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 60 } },
  });

  const afterBugs =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 50;
  doc.setFontSize(12);
  doc.text("Questions & answers", 14, afterBugs + 10);
  autoTable(doc, {
    startY: afterBugs + 13,
    head: [["Question", "Status", "Answer"]],
    body: questions.length
      ? questions.map((q) => [q.subject, q.status, q.response?.trim() || "—"])
      : [["No questions logged", "", ""]],
    headStyles: { fillColor: [20, 140, 130] },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 65 }, 1: { cellWidth: 22 } },
  });
  return doc;
}

export function QaBugsTab({ project }: { projectId: string; project: Project }) {
  const { data: ticketRows } = useRows<Ticket>("tickets");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState<TicketType | null>(null);
  const [tab, setTab] = useState<"bugs" | "qa">("bugs");

  const tickets = (ticketRows ?? []).filter((t) => t.project_id === project.id);
  const bugs = sortTickets(tickets.filter((t) => kindOf(t) === "Bug"));
  const questions = sortTickets(tickets.filter((t) => kindOf(t) === "Question"));
  // Read the live row, not a snapshot, so status/assignee changes made in
  // the drawer show up there immediately after the refetch.
  const active = tickets.find((t) => t.id === activeId) ?? null;

  const people = [
    ...new Set([...(project.manager ? [project.manager] : []), ...(project.team ?? [])]),
  ];

  const openBugs = bugs.filter(isOpen);
  const criticalOpen = openBugs.filter((b) => b.priority === "Critical" || b.priority === "High");

  function exportPdf() {
    buildQaBugsPdf(project, bugs, questions).save(
      `bugs-qa-report-${project.name.replace(/\s+/g, "-").toLowerCase()}.pdf`,
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" onClick={exportPdf}>
          <Download className="size-4" /> Export PDF
        </Button>
        <Button variant="outline" size="sm" onClick={() => setCreating("Question")}>
          <HelpCircle className="size-4" /> Ask question
        </Button>
        <Button size="sm" onClick={() => setCreating("Bug")}>
          <Bug className="size-4" /> Report bug
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Open bugs" value={String(openBugs.length)} icon={Bug} />
        <KpiCard
          label="High / critical open"
          value={String(criticalOpen.length)}
          hint={criticalOpen.length ? "needs attention" : "none"}
          icon={AlertTriangle}
        />
        <KpiCard
          label="Bugs fixed"
          value={String(bugs.length - openBugs.length)}
          icon={CheckCircle2}
        />
        <KpiCard
          label="Unanswered questions"
          value={String(questions.filter(isOpen).length)}
          icon={HelpCircle}
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "bugs" | "qa")}>
        <TabsList>
          <TabsTrigger value="bugs">
            <Bug className="mr-1.5 size-3.5" /> Bugs ({bugs.length})
          </TabsTrigger>
          <TabsTrigger value="qa">
            <HelpCircle className="mr-1.5 size-3.5" /> Q&amp;A ({questions.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="bugs" className="pt-4">
          <TicketTable rows={bugs} onOpen={(t) => setActiveId(t.id)} />
        </TabsContent>
        <TabsContent value="qa" className="pt-4">
          <TicketTable rows={questions} onOpen={(t) => setActiveId(t.id)} />
        </TabsContent>
      </Tabs>

      {creating && (
        <NewTicketDialog
          kind={creating}
          project={project}
          people={people}
          open
          onOpenChange={(v) => !v && setCreating(null)}
          onCreated={() => setTab(creating === "Bug" ? "bugs" : "qa")}
        />
      )}

      {active && (
        <TicketDrawer
          key={active.id}
          ticket={active}
          people={people}
          onClose={() => setActiveId(null)}
        />
      )}
    </div>
  );
}
