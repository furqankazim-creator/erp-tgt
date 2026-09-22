import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlarmClock, CheckCircle2, ListChecks, Plus, TrendingUp } from "lucide-react";

import { useRows } from "@/lib/db";
import { dateLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog, type Field } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton, EmptyState } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/execution")({
  head: () => ({
    meta: [
      { title: "Execution — Time Global Tech CRM" },
      {
        name: "description",
        content: "Task tracker across every project — assignee, priority, due date and status.",
      },
      { property: "og:title", content: "Execution — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "Task tracker across every project — assignee, priority, due date and status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Task = {
  id: string;
  project_id: string | null;
  title: string;
  assignee: string | null;
  priority: string;
  status: string;
  due_date: string | null;
};
type Project = { id: string; name: string };
type Employee = { id: string; name: string };

const TASK_STATUSES = ["To Do", "In Progress", "Review", "Done"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];

function isOverdue(task: Task): boolean {
  if (!task.due_date || task.status === "Done") return false;
  return new Date(task.due_date).getTime() < Date.now();
}

function Page() {
  const { data, isLoading } = useRows<Task>("tasks");
  const { data: projectRows } = useRows<Project>("projects");
  const { data: employeeRows } = useRows<Employee>("employees");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const projects = projectRows ?? [];
  const projectName = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? (map.get(id) ?? "Unassigned") : "Unassigned");
  }, [projects]);

  const FIELDS: Field[] = [
    { name: "title", label: "Task title", required: true, full: true },
    {
      name: "project_id",
      label: "Project",
      type: "select",
      options: projects.map((p) => ({ value: p.id, label: p.name })),
    },
    {
      name: "assignee",
      label: "Assignee",
      type: "select",
      options: (employeeRows ?? []).map((e) => e.name),
    },
    { name: "priority", label: "Priority", type: "select", options: PRIORITIES },
    { name: "status", label: "Status", type: "select", options: TASK_STATUSES },
    { name: "due_date", label: "Due date", type: "date" },
  ];

  const tasks = data ?? [];
  const filtered = tasks
    .filter((t) => !statusFilter || t.status === statusFilter)
    .filter((t) =>
      `${t.title} ${t.assignee ?? ""} ${projectName(t.project_id)}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );

  const overdue = tasks.filter(isOverdue).length;
  const inProgress = tasks.filter((t) => t.status === "In Progress").length;
  const done = tasks.filter((t) => t.status === "Done").length;
  const completionRate = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Execution"
        description="Every task across every project, in one tracker."
        action={
          <RecordDialog
            table="tasks"
            label="Task"
            fields={FIELDS}
            defaults={{ status: "To Do", priority: "Medium" }}
            trigger={
              <Button>
                <Plus className="size-4" /> New task
              </Button>
            }
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total tasks" value={String(tasks.length)} icon={ListChecks} />
        <KpiCard label="In progress" value={String(inProgress)} icon={TrendingUp} />
        <KpiCard
          label="Overdue"
          value={String(overdue)}
          hint={overdue ? "past due date" : "nothing overdue"}
          icon={AlarmClock}
        />
        <KpiCard label="Completion rate" value={`${completionRate}%`} icon={CheckCircle2} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Search tasks, assignees, projects…"
          className="sm:max-w-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={statusFilter === null ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(null)}
          >
            All
          </Button>
          {TASK_STATUSES.map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState title="No tasks found" description="Try a different filter or search." />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Task</th>
                <th className="px-4 py-3 text-left font-semibold">Project</th>
                <th className="px-4 py-3 text-left font-semibold">Assignee</th>
                <th className="px-4 py-3 text-left font-semibold">Priority</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Due</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 font-medium">{t.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {t.project_id ? (
                      <Link
                        to="/project/$projectId"
                        params={{ projectId: t.project_id }}
                        className="hover:text-primary hover:underline"
                      >
                        {projectName(t.project_id)}
                      </Link>
                    ) : (
                      "Unassigned"
                    )}
                  </td>
                  <td className="px-4 py-3">{t.assignee ?? "Unassigned"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge value={t.priority} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={t.status} />
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3",
                      isOverdue(t) ? "text-destructive font-semibold" : "text-muted-foreground",
                    )}
                  >
                    {dateLabel(t.due_date)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <RecordDialog
                        table="tasks"
                        label="Task"
                        fields={FIELDS}
                        record={t}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        }
                      />
                      <DeleteButton table="tasks" id={t.id} label="Task" name={t.title} />
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
