import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Clock, ListChecks, Plus, Users } from "lucide-react";

import { useRows, useSaveRow } from "@/lib/db";
import { useCurrentUser } from "@/lib/mock-auth";
import { dateLabel, number } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton, EmptyState } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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

export const Route = createFileRoute("/_authenticated/log-work")({
  head: () => ({
    meta: [
      { title: "Log Work — Time Global Tech CRM" },
      { name: "description", content: "Daily time logging against projects and tasks." },
      { property: "og:title", content: "Log Work — Time Global Tech CRM" },
      { property: "og:description", content: "Daily time logging against projects and tasks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

export type WorkLog = {
  id: string;
  employee: string;
  project_id: string | null;
  task_id: string | null;
  date: string;
  hours: number;
  notes: string | null;
  blocker: boolean;
  blocker_note: string | null;
};

type Employee = { id: string; name: string };
type ProjectRow = { id: string; name: string };
type Task = { id: string; project_id: string | null; title: string };

function todayStr() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function LogWorkDialog({
  log,
  employees,
  projects,
  tasks,
  trigger,
  lockedEmployeeName,
}: {
  log?: WorkLog;
  employees: Employee[];
  projects: ProjectRow[];
  tasks: Task[];
  trigger: React.ReactNode;
  /** When set (a Developer logging their own work), the Employee field is
   * fixed to this name instead of offering the full company directory —
   * the server force-overrides `employee` to the caller's own name for a
   * developer anyway, so showing everyone else here was just noise/exposure. */
  lockedEmployeeName?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [employee, setEmployee] = useState("");
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [hours, setHours] = useState("4");
  const [notes, setNotes] = useState("");
  const [blocker, setBlocker] = useState(false);
  const [blockerNote, setBlockerNote] = useState("");
  const save = useSaveRow("work_logs", "Work log");

  useEffect(() => {
    if (!open) return;
    if (log) {
      setEmployee(log.employee);
      setProjectId(log.project_id ?? "");
      setTaskId(log.task_id ?? "");
      setDate(log.date);
      setHours(String(log.hours));
      setNotes(log.notes ?? "");
      setBlocker(log.blocker);
      setBlockerNote(log.blocker_note ?? "");
    } else {
      setEmployee(lockedEmployeeName ?? "");
      setProjectId("");
      setTaskId("");
      setDate(todayStr());
      setHours("4");
      setNotes("");
      setBlocker(false);
      setBlockerNote("");
    }
  }, [open, log]);

  const projectTasks = tasks.filter((t) => t.project_id === projectId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      employee,
      project_id: projectId || null,
      task_id: taskId || null,
      date,
      hours: Number(hours) || 0,
      notes: notes || null,
      blocker,
      blocker_note: blocker ? blockerNote || null : null,
    };
    save.mutate(
      { ...payload, ...(log?.id ? { id: log.id } : {}) },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{log ? "Edit work log" : "Log work"}</DialogTitle>
          <DialogDescription>Record hours against a project for a given day.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">Employee</Label>
              {lockedEmployeeName ? (
                <Input value={lockedEmployeeName} disabled />
              ) : (
                <Select value={employee} onValueChange={setEmployee} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.name}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">Date</Label>
              <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">Project</Label>
              <Select
                value={projectId}
                onValueChange={(v) => {
                  setProjectId(v);
                  setTaskId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">Task (optional)</Label>
              <Select value={taskId} onValueChange={setTaskId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={projectId ? "No specific task" : "Pick a project first"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {projectTasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-semibold">Hours</Label>
            <Input
              type="number"
              min="0"
              step="0.5"
              required
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-semibold">Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={blocker} onCheckedChange={(v) => setBlocker(v === true)} />
            This work is blocked
          </label>
          {blocker ? (
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">Blocker details</Label>
              <Textarea
                rows={2}
                value={blockerNote}
                onChange={(e) => setBlockerNote(e.target.value)}
                placeholder="What's blocking progress, and who can unblock it?"
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : log ? "Save changes" : "Log work"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Page() {
  const { data: logRows, isLoading } = useRows<WorkLog>("work_logs");
  const { data: employeeRows } = useRows<Employee & { email?: string | null }>("employees");
  const { data: projectRows } = useRows<ProjectRow>("projects");
  const { data: taskRows } = useRows<Task>("tasks");
  const { data: me } = useCurrentUser();

  const [employeeFilter, setEmployeeFilter] = useState("All");
  const [projectFilter, setProjectFilter] = useState("All");

  const logs = logRows ?? [];
  const allEmployees = employeeRows ?? [];
  const projects = projectRows ?? [];
  const tasks = taskRows ?? [];
  const today = todayStr();

  // A Developer only ever logs (and sees, per server-side scoping) their own
  // hours — the full company directory in the employee filter/picker was
  // pointless (the server force-sets `employee` to their own name anyway)
  // and needlessly exposed everyone else's name here.
  const isDeveloper = me?.access_role === "developer";
  const myName = isDeveloper
    ? allEmployees.find((e) => e.email && me?.email && e.email.toLowerCase() === me.email.toLowerCase())
        ?.name
    : undefined;
  const employees = isDeveloper ? allEmployees.filter((e) => e.name === myName) : allEmployees;

  const filtered = useMemo(
    () =>
      [...logs]
        .filter((l) => employeeFilter === "All" || l.employee === employeeFilter)
        .filter((l) => projectFilter === "All" || l.project_id === projectFilter)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [logs, employeeFilter, projectFilter],
  );

  const totalHours = logs.reduce((s, l) => s + Number(l.hours ?? 0), 0);
  const loggedToday = logs
    .filter((l) => l.date === today)
    .reduce((s, l) => s + Number(l.hours ?? 0), 0);
  const uniqueLoggersToday = new Set(logs.filter((l) => l.date === today).map((l) => l.employee))
    .size;
  const openBlockers = logs.filter((l) => l.blocker).length;

  function projectName(id: string | null) {
    return projects.find((p) => p.id === id)?.name ?? "—";
  }
  function taskTitle(id: string | null) {
    return tasks.find((t) => t.id === id)?.title ?? null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Log Work"
        description="Daily time entries against projects — the data behind Reports."
        action={
          <LogWorkDialog
            employees={employees}
            projects={projects}
            tasks={tasks}
            lockedEmployeeName={isDeveloper ? myName : undefined}
            trigger={
              <Button>
                <Plus className="size-4" /> Log work
              </Button>
            }
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total hours logged" value={number(totalHours)} icon={Clock} />
        <KpiCard label="Hours today" value={number(loggedToday)} icon={ListChecks} />
        <KpiCard label="People logged today" value={String(uniqueLoggersToday)} icon={Users} />
        <KpiCard
          label="Open blockers"
          value={String(openBlockers)}
          hint={openBlockers ? "needs attention" : "all clear"}
          icon={AlertTriangle}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        {isDeveloper ? null : (
        <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All employees</SelectItem>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.name}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        )}
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState title="No work logs found" description="Try a different filter, or log time." />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Date</th>
                <th className="px-4 py-3 text-left font-semibold">Employee</th>
                <th className="px-4 py-3 text-left font-semibold">Project / Task</th>
                <th className="px-4 py-3 text-left font-semibold">Hours</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {filtered.map((l) => (
                <tr key={l.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3">{dateLabel(l.date)}</td>
                  <td className="px-4 py-3 font-medium">{l.employee}</td>
                  <td className="px-4 py-3">
                    <span>{projectName(l.project_id)}</span>
                    {taskTitle(l.task_id) ? (
                      <span className="block text-xs text-muted-foreground">
                        {taskTitle(l.task_id)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-semibold">{number(l.hours)}h</td>
                  <td className="px-4 py-3">
                    {l.blocker ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/12 px-2 py-0.5 text-xs font-semibold text-destructive">
                        <AlertTriangle className="size-3" /> Blocked
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">On track</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <LogWorkDialog
                        log={l}
                        employees={employees}
                        projects={projects}
                        tasks={tasks}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        }
                      />
                      <DeleteButton
                        table="work_logs"
                        id={l.id}
                        label="Work log"
                        name={l.employee}
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
