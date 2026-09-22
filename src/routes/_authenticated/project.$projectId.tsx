import { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Download,
  GitCommit,
  Plus,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { updateRow, useRow, useRows, useSaveRow } from "@/lib/db";
import { useCurrentUser } from "@/lib/mock-auth";
import { computeProjectProgress } from "@/lib/project-progress";
import { currency, dateLabel, dateTimeLabel, formatDuration, initials } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog, type Field } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton, EmptyState } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { fileIcon, sizeLabel } from "./documents";
import type { Document as ProjectDocumentRow } from "./documents";
import { buildProjectFields, type Project } from "./project";
import { useOrgCostPerHour } from "@/lib/costing";
import { QuoteCalculatorDialog } from "@/components/quote-calculator-dialog";
import { ScopeTab } from "@/components/project-tabs/scope-tab";
import { SprintPlanningTab } from "@/components/project-tabs/sprint-planning-tab";
import { SprintsBoardTab } from "@/components/project-tabs/sprints-board-tab";
import { QaBugsTab } from "@/components/project-tabs/qa-bugs-tab";
import { AuditReportTab } from "@/components/project-tabs/audit-report-tab";
import { ClientFeedbackTab } from "@/components/project-tabs/client-feedback-tab";
import { RepositoriesTab } from "@/components/project-tabs/repositories-tab";
import { ProgressReportTab } from "@/components/project-tabs/progress-report-tab";
import { FeedbackStatementTab } from "@/components/project-tabs/feedback-statement-tab";
import { SendInvoiceTab } from "@/components/project-tabs/send-invoice-tab";
import { MeetingMinutesTab } from "@/components/project-tabs/meeting-minutes-tab";

export const Route = createFileRoute("/_authenticated/project/$projectId")({
  head: () => ({
    meta: [
      { title: "Project — Time Global Tech CRM" },
      {
        name: "description",
        content: "Full delivery board: tasks, milestones, finance and documents for one project.",
      },
      { property: "og:title", content: "Project — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "Full delivery board: tasks, milestones, finance and documents for one project.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectDetail,
});

type Task = {
  id: string;
  project_id: string | null;
  title: string;
  assignee: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  updated_at: string;
};

type Milestone = {
  id: string;
  project_id: string | null;
  title: string;
  due_date: string | null;
  status: string;
  notes: string | null;
};

type Deliverable = {
  id: string;
  project_id: string | null;
  title: string;
  due_date: string | null;
  status: string;
  notes: string | null;
};

type Account = { id: string; name: string };
type Employee = {
  id: string;
  name: string;
  git_email?: string | null;
  email?: string | null;
};

type PmCommit = {
  id: string;
  project_id: string | null;
  commit_sha: string;
  commit_message: string | null;
  files_changed: string[];
  employee: string | null;
  created_at: string;
};

type PmDailyLog = {
  id: string;
  project_id: string | null;
  employee: string | null;
  date: string;
  commits_count: number;
  active_seconds: number;
  updated_at: string;
};

const TASK_STATUSES = ["To Do", "In Progress", "Review", "Done"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const MILESTONE_STATUSES = ["Upcoming", "In Progress", "Completed", "Missed"];
const DELIVERABLE_STATUSES = ["Pending", "In Progress", "Delivered", "Approved"];
const DOC_FILE_TYPES = ["pdf", "xlsx", "docx", "png", "csv", "zip"];

const TASK_FIELDS: Field[] = [
  { name: "title", label: "Task title", required: true, full: true },
  { name: "priority", label: "Priority", type: "select", options: PRIORITIES },
  { name: "status", label: "Status", type: "select", options: TASK_STATUSES },
  { name: "due_date", label: "Due date", type: "date" },
];

const MILESTONE_FIELDS: Field[] = [
  { name: "title", label: "Milestone title", required: true, full: true },
  { name: "status", label: "Status", type: "select", options: MILESTONE_STATUSES },
  { name: "due_date", label: "Due date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
];

const DELIVERABLE_FIELDS: Field[] = [
  { name: "title", label: "Deliverable title", required: true, full: true },
  { name: "status", label: "Status", type: "select", options: DELIVERABLE_STATUSES },
  { name: "due_date", label: "Due date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
];

function documentEditFields(employees: Employee[]): Field[] {
  return [
    { name: "name", label: "File name", required: true, full: true },
    { name: "file_type", label: "File type", type: "select", options: DOC_FILE_TYPES },
    { name: "size_kb", label: "Size (KB)", type: "number" },
    { name: "owner", label: "Owner", type: "select", options: employees.map((e) => e.name) },
  ];
}

function sortByDueDate<T extends { due_date: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });
}

function AddTaskDialog({ projectId, employees }: { projectId: string; employees: Employee[] }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState("Medium");
  const save = useSaveRow("tasks", "Task");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate(
      { project_id: projectId, title, assignee: assignee || null, priority, status: "To Do" },
      {
        onSuccess: () => {
          setOpen(false);
          setTitle("");
          setAssignee("");
          setPriority("Medium");
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Add task
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>Added to this project&rsquo;s To Do column.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div>
            <Label htmlFor="task-title" className="mb-1.5 block text-xs font-semibold">
              Title
            </Label>
            <Input
              id="task-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">Assignee</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.name}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Adding…" : "Add task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddMilestoneDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("Upcoming");
  const save = useSaveRow("milestones", "Milestone");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate(
      {
        project_id: projectId,
        title,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        status,
        notes: null,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setTitle("");
          setDueDate("");
          setStatus("Upcoming");
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Add milestone
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New milestone</DialogTitle>
          <DialogDescription>Track a key delivery checkpoint for this project.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div>
            <Label htmlFor="milestone-title" className="mb-1.5 block text-xs font-semibold">
              Title
            </Label>
            <Input
              id="milestone-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MILESTONE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Adding…" : "Add milestone"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddDeliverableDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("Pending");
  const save = useSaveRow("deliverables", "Deliverable");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate(
      {
        project_id: projectId,
        title,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        status,
        notes: null,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setTitle("");
          setDueDate("");
          setStatus("Pending");
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Add deliverable
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New deliverable</DialogTitle>
          <DialogDescription>Something concrete this project owes the client.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div>
            <Label htmlFor="deliverable-title" className="mb-1.5 block text-xs font-semibold">
              Title
            </Label>
            <Input
              id="deliverable-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DELIVERABLE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Adding…" : "Add deliverable"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddProjectDocumentDialog({
  projectId,
  projectName,
  employees,
}: {
  projectId: string;
  projectName: string;
  employees: Employee[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [fileType, setFileType] = useState("pdf");
  const [sizeKb, setSizeKb] = useState("100");
  const [owner, setOwner] = useState("");
  const save = useSaveRow("documents", "Document");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate(
      {
        project_id: projectId,
        name,
        folder: projectName,
        file_type: fileType,
        size_kb: sizeKb === "" ? 0 : Number(sizeKb),
        owner: owner || null,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setName("");
          setSizeKb("100");
          setOwner("");
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Upload document
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New document</DialogTitle>
          <DialogDescription>Filed under &ldquo;{projectName}&rdquo;.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div>
            <Label htmlFor="doc-name" className="mb-1.5 block text-xs font-semibold">
              File name
            </Label>
            <Input id="doc-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">File type</Label>
              <Select value={fileType} onValueChange={setFileType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_FILE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">Size (KB)</Label>
              <Input type="number" value={sizeKb} onChange={(e) => setSizeKb(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-semibold">Owner</Label>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.name}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProjectDetail() {
  const { projectId } = useParams({ from: "/_authenticated/project/$projectId" });
  const project = useRow<Project>("projects", projectId);
  const tasks = useRows<Task>("tasks");
  const milestones = useRows<Milestone>("milestones");
  const deliverables = useRows<Deliverable>("deliverables");
  const documents = useRows<ProjectDocumentRow>("documents");
  const employees = useRows<Employee>("employees");
  const accounts = useRows<Account>("accounts");
  const pmCommits = useRows<PmCommit>("pm_commits");
  const pmDailyLogs = useRows<PmDailyLog>("pm_daily_log");
  const orgRate = useOrgCostPerHour();
  const qc = useQueryClient();
  const [dragging, setDragging] = useState<string | null>(null);
  const { data: me } = useCurrentUser();

  if (project.isLoading) return <TableSkeleton />;
  if (!project.data) return <p className="text-muted-foreground">Project not found.</p>;

  const p = project.data;

  if (me?.access_role === "developer") {
    const myName = (employees.data ?? []).find(
      (e) => e.email && e.email.toLowerCase() === me.email.toLowerCase(),
    )?.name;
    // No match (or still loading) must never grant access — an `undefined`
    // name could otherwise accidentally satisfy a project whose `manager`
    // field happens to be missing too.
    const onProject = myName ? p.manager === myName || (p.team ?? []).includes(myName) : false;
    if (!onProject) {
      return (
        <p className="text-muted-foreground">
          You don't have access to this project — it's not one you're assigned to.
        </p>
      );
    }
  }

  // Salesman's job ends at "Create project" — no ongoing Delivery access,
  // even via a direct link (e.g. a project doc on the Documents page). This
  // must be a hard block, not just a hidden nav item.
  if (me?.access_role === "salesman") {
    return (
      <EmptyState
        title="No access"
        description="Projects are managed by Delivery — once a deal becomes a project, it's out of Sales' hands."
      />
    );
  }
  const projectTasks = (tasks.data ?? []).filter((t) => t.project_id === p.id);
  const progress = computeProjectProgress(p.id, tasks.data ?? []);
  const projectMilestones = sortByDueDate(
    (milestones.data ?? []).filter((m) => m.project_id === p.id),
  );
  const projectDeliverables = sortByDueDate(
    (deliverables.data ?? []).filter((d) => d.project_id === p.id),
  );
  const projectDocuments = (documents.data ?? []).filter((d) => d.project_id === p.id);
  const allEmployees = employees.data ?? [];
  const teamEmployees = allEmployees.filter((e) => p.team?.includes(e.name));
  const assigneeOptions = teamEmployees.length ? teamEmployees : allEmployees;
  const PROJECT_FIELDS = buildProjectFields((accounts.data ?? []).map((a) => a.name));

  const projectCommits = (pmCommits.data ?? [])
    .filter((c) => c.project_id === p.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const projectDailyLogs = (pmDailyLogs.data ?? []).filter((d) => d.project_id === p.id);

  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
  const commitsThisWeek = projectCommits.filter(
    (c) => new Date(c.created_at).getTime() >= weekAgo,
  ).length;
  const commitsThisMonth = projectCommits.filter(
    (c) => new Date(c.created_at).getTime() >= monthAgo,
  ).length;
  const activeSecondsThisWeek = projectDailyLogs
    .filter((d) => new Date(d.date).getTime() >= weekAgo)
    .reduce((s, d) => s + Number(d.active_seconds ?? 0), 0);
  const daysSinceStart = p.started_at
    ? Math.max(0, Math.ceil((now - new Date(p.started_at).getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  const dailyActivity = (() => {
    const buckets: { date: string; label: string; minutes: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      buckets.push({
        date: dateStr,
        label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        minutes: 0,
      });
    }
    const byDate = new Map(buckets.map((b) => [b.date, b]));
    for (const log of projectDailyLogs) {
      const bucket = byDate.get(log.date);
      if (bucket) bucket.minutes += Math.round(Number(log.active_seconds ?? 0) / 60);
    }
    return buckets;
  })();

  const teamNames = [...new Set([...(p.team ?? []), ...(p.manager ? [p.manager] : [])])];
  const connectionStatus = teamNames.map((name) => {
    const emp = allEmployees.find((e) => e.name === name);
    const memberLogs = projectDailyLogs.filter((d) => d.employee === name);
    const memberCommits = projectCommits.filter((c) => c.employee === name);
    const hasActivity = memberLogs.length > 0 || memberCommits.length > 0;
    const lastLogAt = memberLogs.length
      ? Math.max(...memberLogs.map((l) => new Date(l.updated_at).getTime()))
      : 0;
    const lastCommitAt = memberCommits.length
      ? new Date(memberCommits[0]!.created_at).getTime()
      : 0;
    const lastActiveAt = Math.max(lastLogAt, lastCommitAt) || null;
    return {
      name,
      // Matches the backend's auto-match fallback: git_email first, then plain email.
      hasGitEmail: Boolean(emp?.git_email || emp?.email),
      hasActivity,
      lastActiveAt,
    };
  });

  const progressTrend = (() => {
    const points: { date: string; label: string; progress: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      const doneByThen = projectTasks.filter(
        (t) => t.status === "Done" && t.updated_at.slice(0, 10) <= dateStr,
      ).length;
      points.push({
        date: dateStr,
        label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        progress: projectTasks.length ? Math.round((doneByThen / projectTasks.length) * 100) : 0,
      });
    }
    return points;
  })();

  const budget = Number(p.budget ?? 0);
  const cost = Number(p.cost ?? 0);
  const revenue = Number(p.revenue ?? 0);
  const margin = revenue - cost;
  const utilization = budget > 0 ? Math.min(100, Math.round((cost / budget) * 100)) : 0;

  async function moveTask(id: string, status: string) {
    const { error } = await updateRow("tasks", id, { status });
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["tasks"] });
    toast.success(`Task moved to ${status}`);
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/project">
          <ArrowLeft className="size-4" /> All projects
        </Link>
      </Button>

      <PageHeader
        title={p.name}
        description={`${p.display_id ? `${p.display_id} · ` : ""}${p.client ?? "Internal"} · PM ${p.manager ?? "TBD"}`}
        action={
          <>
            <StatusBadge value={p.status} />
            <RecordDialog
              table="projects"
              label="Project"
              fields={PROJECT_FIELDS}
              record={p}
              trigger={
                <Button variant="outline" size="sm">
                  Edit project
                </Button>
              }
            />
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-4">
        <div className="surface-card sticky top-6 h-fit space-y-5 p-6 lg:col-span-1">
          <div>
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span className="font-semibold">{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>

          <div className="flex items-center gap-2.5">
            <Avatar className="size-9">
              <AvatarFallback className="gradient-primary text-primary-foreground text-xs font-bold">
                {initials(p.manager)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Project manager</p>
              <p className="truncate text-sm font-semibold">{p.manager ?? "TBD"}</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Team
            </p>
            {p.team?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {p.team.map((name) => (
                  <div
                    key={name}
                    className="bg-muted flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1"
                  >
                    <Avatar className="size-5">
                      <AvatarFallback className="bg-primary/15 text-primary text-[9px] font-bold">
                        {initials(name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-medium">{name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No team assigned</p>
            )}
          </div>

          {p.description ? (
            <div>
              <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Scope
              </p>
              <p className="text-sm">{p.description}</p>
            </div>
          ) : null}

          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Client</dt>
              <dd className="font-medium">{p.client ?? "Internal"}</dd>
            </div>
            {p.live_url ? (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Live app</dt>
                <dd>
                  <a
                    href={p.live_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                  >
                    <span
                      className={`size-1.5 rounded-full ${
                        p.live_status === "Up"
                          ? "bg-success"
                          : p.live_status === "Down"
                            ? "bg-destructive"
                            : "bg-muted-foreground"
                      }`}
                    />
                    Visit site
                  </a>
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Start date</dt>
              <dd>{dateLabel(p.start_date)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Deadline</dt>
              <dd>{dateLabel(p.deadline)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tasks</dt>
              <dd>{projectTasks.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Milestones</dt>
              <dd>{projectMilestones.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Deliverables</dt>
              <dd>{projectDeliverables.length}</dd>
            </div>
          </dl>

          {p.tags?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {p.tags.map((t) => (
                <span
                  key={t}
                  className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="lg:col-span-3">
          <Tabs defaultValue="tasks">
            <TabsList className="h-auto flex-wrap justify-start gap-1 mb-2">
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="milestones">Milestones</TabsTrigger>
              <TabsTrigger value="deliverables">Deliverables</TabsTrigger>
              {me?.access_role !== "developer" ? (
                <TabsTrigger value="finance">Finance</TabsTrigger>
              ) : null}
              {me?.access_role !== "developer" ? (
                <TabsTrigger value="documents">Documents</TabsTrigger>
              ) : null}
              <TabsTrigger value="dev">VS Dev Activity</TabsTrigger>
              <TabsTrigger value="scope">Scope</TabsTrigger>
              <TabsTrigger value="sprint-planning">Sprint Planning</TabsTrigger>
              <TabsTrigger value="sprints">Sprints</TabsTrigger>
              <TabsTrigger value="qa-bugs">Q&amp;A/Bugs</TabsTrigger>
              <TabsTrigger value="audit-report">Audit Report</TabsTrigger>
              <TabsTrigger value="client-feedback">Client Feedback</TabsTrigger>
              <TabsTrigger value="repositories">Repositories</TabsTrigger>
              <TabsTrigger value="progress-report">Progress Report</TabsTrigger>
              <TabsTrigger value="feedback-statement">Feedback Statement</TabsTrigger>
              <TabsTrigger value="send-invoice">Send Invoice</TabsTrigger>
              <TabsTrigger value="meeting-minutes">Meeting Minutes</TabsTrigger>
            </TabsList>

            <TabsContent value="tasks">
              <div className="mb-4 flex justify-end">
                <AddTaskDialog projectId={p.id} employees={assigneeOptions} />
              </div>
              {tasks.isLoading ? (
                <TableSkeleton />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {TASK_STATUSES.map((status) => {
                    const items = projectTasks.filter((t) => t.status === status);
                    return (
                      <div
                        key={status}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (dragging) void moveTask(dragging, status);
                          setDragging(null);
                        }}
                        className="bg-muted/40 border-border min-h-40 rounded-xl border p-3 transition-colors"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-xs font-bold tracking-wide uppercase">{status}</p>
                          <span className="bg-background rounded-full px-2 py-0.5 text-xs font-semibold">
                            {items.length}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {items.map((t) => (
                            <div
                              key={t.id}
                              draggable
                              onDragStart={() => setDragging(t.id)}
                              className="surface-card surface-card-hover cursor-grab p-3 active:cursor-grabbing"
                            >
                              <p className="text-sm font-semibold">{t.title}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {t.assignee ?? "Unassigned"}
                              </p>
                              <div className="mt-2 flex items-center justify-between">
                                <StatusBadge value={t.priority} />
                                <span className="text-[11px] text-muted-foreground">
                                  {dateLabel(t.due_date)}
                                </span>
                              </div>
                              <div className="mt-2 flex items-center gap-1 border-t border-border pt-2">
                                <RecordDialog
                                  table="tasks"
                                  label="Task"
                                  fields={TASK_FIELDS}
                                  record={t}
                                  trigger={
                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                                      Edit
                                    </Button>
                                  }
                                />
                                <DeleteButton table="tasks" id={t.id} label="Task" name={t.title} />
                              </div>
                            </div>
                          ))}
                          {items.length === 0 ? (
                            <p className="py-4 text-center text-xs text-muted-foreground">
                              No tasks
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="milestones">
              <div className="mb-4 flex justify-end">
                <AddMilestoneDialog projectId={p.id} />
              </div>
              {milestones.isLoading ? (
                <TableSkeleton />
              ) : projectMilestones.length === 0 ? (
                <EmptyState
                  title="No milestones yet"
                  description="Add the key checkpoints this project needs to hit."
                />
              ) : (
                <div className="space-y-2">
                  {projectMilestones.map((m) => (
                    <div
                      key={m.id}
                      className="surface-card flex items-center justify-between gap-3 p-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{m.title}</p>
                        {m.notes ? (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{m.notes}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {dateLabel(m.due_date)}
                        </span>
                        <StatusBadge value={m.status} />
                        <RecordDialog
                          table="milestones"
                          label="Milestone"
                          fields={MILESTONE_FIELDS}
                          record={m}
                          trigger={
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                              Edit
                            </Button>
                          }
                        />
                        <DeleteButton
                          table="milestones"
                          id={m.id}
                          label="Milestone"
                          name={m.title}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="deliverables">
              <div className="mb-4 flex justify-end">
                <AddDeliverableDialog projectId={p.id} />
              </div>
              {deliverables.isLoading ? (
                <TableSkeleton />
              ) : projectDeliverables.length === 0 ? (
                <EmptyState
                  title="No deliverables yet"
                  description="Add what this project owes the client."
                />
              ) : (
                <div className="space-y-2">
                  {projectDeliverables.map((d) => (
                    <div
                      key={d.id}
                      className="surface-card flex items-center justify-between gap-3 p-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{d.title}</p>
                        {d.notes ? (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{d.notes}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {dateLabel(d.due_date)}
                        </span>
                        <StatusBadge value={d.status} />
                        <RecordDialog
                          table="deliverables"
                          label="Deliverable"
                          fields={DELIVERABLE_FIELDS}
                          record={d}
                          trigger={
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                              Edit
                            </Button>
                          }
                        />
                        <DeleteButton
                          table="deliverables"
                          id={d.id}
                          label="Deliverable"
                          name={d.title}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="finance">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  Org cost per hour today:{" "}
                  <span className="font-semibold text-foreground">
                    {currency(orgRate.costPerHour)}/hr
                  </span>
                </p>
                <div className="flex gap-2">
                  <QuoteCalculatorDialog
                    defaultProjectId={p.id}
                    defaultTitle={`${p.name} — Quote`}
                    trigger={<Button size="sm">New quote</Button>}
                  />
                  <RecordDialog
                    table="projects"
                    label="Project"
                    fields={PROJECT_FIELDS}
                    record={p}
                    title="Edit financials"
                    trigger={
                      <Button size="sm" variant="outline">
                        Edit financials
                      </Button>
                    }
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <KpiCard label="Budget" value={currency(budget)} icon={Wallet} />
                <KpiCard label="Cost to date" value={currency(cost)} icon={TrendingDown} />
                <KpiCard label="Revenue recognized" value={currency(revenue)} icon={TrendingUp} />
              </div>
              <div className="surface-card mt-4 space-y-5 p-6">
                <div>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="text-muted-foreground">Budget utilization</span>
                    <span className="font-semibold">{utilization}%</span>
                  </div>
                  <Progress value={utilization} />
                </div>
                <div className="flex items-center justify-between border-t border-border pt-4">
                  <div className="flex items-center gap-2">
                    <CircleDollarSign className="size-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Margin (revenue − cost)</span>
                  </div>
                  <span
                    className={
                      "text-lg font-bold " + (margin >= 0 ? "text-success" : "text-destructive")
                    }
                  >
                    {currency(margin)}
                  </span>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="documents">
              <div className="mb-4 flex justify-end">
                <AddProjectDocumentDialog
                  projectId={p.id}
                  projectName={p.name}
                  employees={allEmployees}
                />
              </div>
              {documents.isLoading ? (
                <TableSkeleton />
              ) : projectDocuments.length === 0 ? (
                <EmptyState
                  title="No documents yet"
                  description="Upload contracts, specs or other project files."
                />
              ) : (
                <div className="surface-card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Name</th>
                        <th className="px-4 py-3 text-left font-semibold">Size</th>
                        <th className="px-4 py-3 text-left font-semibold">Owner</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-border divide-y">
                      {projectDocuments.map((d) => {
                        const Icon = fileIcon(d.file_type);
                        return (
                          <tr key={d.id} className="hover:bg-muted/40 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <Icon className="text-muted-foreground size-4 shrink-0" />
                                <span className="font-medium">{d.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {sizeLabel(Number(d.size_kb))}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{d.owner ?? "—"}</td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1">
                                <RecordDialog
                                  table="documents"
                                  label="Document"
                                  fields={documentEditFields(allEmployees)}
                                  record={d}
                                  trigger={
                                    <Button variant="ghost" size="sm">
                                      Edit
                                    </Button>
                                  }
                                />
                                <DeleteButton
                                  table="documents"
                                  id={d.id}
                                  label="Document"
                                  name={d.name}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="dev" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label="Commits this week"
                  value={String(commitsThisWeek)}
                  icon={GitCommit}
                />
                <KpiCard
                  label="Commits this month"
                  value={String(commitsThisMonth)}
                  icon={GitCommit}
                />
                <KpiCard
                  label="Active time this week"
                  value={formatDuration(activeSecondsThisWeek / 60)}
                  icon={Clock}
                />
                <KpiCard
                  label="Days since start"
                  value={daysSinceStart === null ? "Not started" : String(daysSinceStart)}
                  icon={Clock}
                />
              </div>

              <div className="surface-card p-5">
                <h3 className="font-semibold">Team connection status</h3>
                <p className="text-sm text-muted-foreground">
                  Whether each team member's PM Connect extension has reported activity on this
                  project.
                </p>
                <ul className="mt-4 divide-border divide-y">
                  {connectionStatus.map((c) => (
                    <li key={c.name} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="size-7">
                          <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                            {initials(c.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{c.name}</span>
                      </div>
                      {c.hasActivity ? (
                        <span className="text-success flex items-center gap-1.5 text-xs font-semibold">
                          <CheckCircle2 className="size-3.5" />
                          Connected · last active{" "}
                          {dateTimeLabel(new Date(c.lastActiveAt!).toISOString())}
                        </span>
                      ) : c.hasGitEmail ? (
                        <span className="text-warning flex items-center gap-1.5 text-xs font-semibold">
                          <XCircle className="size-3.5" />
                          Awaiting first activity
                        </span>
                      ) : (
                        <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold">
                          <XCircle className="size-3.5" />
                          Not set up — missing git email
                        </span>
                      )}
                    </li>
                  ))}
                  {connectionStatus.length === 0 ? (
                    <li className="py-4 text-sm text-muted-foreground">
                      No team members assigned.
                    </li>
                  ) : null}
                </ul>
              </div>

              <div className="surface-card p-6">
                <h3 className="font-semibold">Active time — last 30 days</h3>
                <p className="text-sm text-muted-foreground">
                  Daily active coding minutes across the whole team, from PM Connect.
                </p>
                <div className="mt-4 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyActivity}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--color-border)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        stroke="var(--color-muted-foreground)"
                        fontSize={11}
                        interval={4}
                      />
                      <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-popover)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 12,
                        }}
                        formatter={(v: number) => `${v} min`}
                      />
                      <Bar dataKey="minutes" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="surface-card p-6">
                <h3 className="font-semibold">Progress — last 30 days</h3>
                <p className="text-sm text-muted-foreground">
                  Task-completion percentage as of each day (done tasks ÷ total tasks).
                </p>
                <div className="mt-4 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={progressTrend}>
                      <defs>
                        <linearGradient id="progressTrend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--color-border)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        stroke="var(--color-muted-foreground)"
                        fontSize={11}
                        interval={4}
                      />
                      <YAxis
                        stroke="var(--color-muted-foreground)"
                        fontSize={12}
                        domain={[0, 100]}
                        tickFormatter={(v: number) => `${v}%`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-popover)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 12,
                        }}
                        formatter={(v: number) => `${v}%`}
                      />
                      <Area
                        type="monotone"
                        dataKey="progress"
                        stroke="var(--color-primary)"
                        strokeWidth={2.5}
                        fill="url(#progressTrend)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="surface-card p-5">
                <h3 className="font-semibold">Recent commits</h3>
                {pmCommits.isLoading ? (
                  <TableSkeleton rows={3} />
                ) : projectCommits.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No commits tracked yet for this project.
                  </p>
                ) : (
                  <ul className="divide-border mt-3 divide-y">
                    {projectCommits.slice(0, 20).map((c) => (
                      <li key={c.id} className="flex items-start gap-3 py-2.5">
                        <GitCommit className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {c.commit_message || "(no message)"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {c.employee ?? "Unknown"} · {c.commit_sha.slice(0, 8)} ·{" "}
                            {c.files_changed?.length ?? 0} files · {dateTimeLabel(c.created_at)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <h3 className="font-semibold">Onboard a new developer</h3>
                  <p className="text-sm text-muted-foreground">
                    Give them the download link and make sure their git email + this project's team
                    match in HR / Project settings.
                  </p>
                </div>
                <Button asChild variant="outline">
                  <Link to="/pm-connect">
                    <Download className="size-4" /> PM Connect download page
                  </Link>
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="scope">
              <ScopeTab projectId={p.id} project={p} />
            </TabsContent>

            <TabsContent value="sprint-planning">
              <SprintPlanningTab projectId={p.id} />
            </TabsContent>

            <TabsContent value="sprints">
              <SprintsBoardTab projectId={p.id} />
            </TabsContent>

            <TabsContent value="qa-bugs">
              <QaBugsTab projectId={p.id} />
            </TabsContent>

            <TabsContent value="audit-report">
              <AuditReportTab projectId={p.id} />
            </TabsContent>

            <TabsContent value="client-feedback">
              <ClientFeedbackTab projectId={p.id} />
            </TabsContent>

            <TabsContent value="repositories">
              <RepositoriesTab projectId={p.id} project={p} />
            </TabsContent>

            <TabsContent value="progress-report">
              <ProgressReportTab projectId={p.id} project={p} />
            </TabsContent>

            <TabsContent value="feedback-statement">
              <FeedbackStatementTab projectId={p.id} project={p} />
            </TabsContent>

            <TabsContent value="send-invoice">
              <SendInvoiceTab projectId={p.id} />
            </TabsContent>

            <TabsContent value="meeting-minutes">
              <MeetingMinutesTab projectId={p.id} project={p} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
