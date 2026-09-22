import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, ListChecks, Users } from "lucide-react";

import { useRows } from "@/lib/db";
import { dateLabel } from "@/lib/format";
import { computeProjectProgress } from "@/lib/project-progress";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { TableSkeleton } from "@/components/loading";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/planning")({
  head: () => ({
    meta: [
      { title: "Planning — Time Global Tech CRM" },
      {
        name: "description",
        content: "Resource and capacity planning across employees and active projects.",
      },
      { property: "og:title", content: "Planning — Time Global Tech CRM" },
      { property: "og:description", content: "Who is overloaded, what's due, who's free." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlanningPage,
});

type Employee = {
  id: string;
  name: string;
  role: string | null;
  department: string | null;
  status: string;
  workload: number;
};
type ProjectRow = {
  id: string;
  name: string;
  client: string | null;
  status: string;
  progress: number;
  team: string[];
  start_date: string | null;
  deadline: string | null;
};
type TaskRow = {
  id: string;
  project_id: string | null;
  title: string;
  assignee: string | null;
  status: string;
};

function workloadTone(workload: number) {
  if (workload >= 90) return "text-destructive";
  if (workload >= 75) return "text-warning";
  return "text-success";
}

function PlanningPage() {
  const { data: employeeRows, isLoading: employeesLoading } = useRows<Employee>("employees");
  const { data: projectRows, isLoading: projectsLoading } = useRows<ProjectRow>("projects");
  const { data: taskRows } = useRows<TaskRow>("tasks");

  const employees = (employeeRows ?? []).filter((e) => e.status === "Active");
  const projects = projectRows ?? [];
  const tasks = taskRows ?? [];
  const activeProjects = projects.filter((p) => !["Done", "Cancelled"].includes(p.status));

  const avgWorkload = employees.length
    ? Math.round(employees.reduce((s, e) => s + Number(e.workload ?? 0), 0) / employees.length)
    : 0;
  const overloaded = employees.filter((e) => Number(e.workload ?? 0) >= 90).length;

  const capacity = useMemo(() => {
    return employees
      .map((e) => {
        const empProjects = activeProjects.filter((p) => p.team?.includes(e.name));
        const openTasks = tasks.filter((t) => t.assignee === e.name && t.status !== "Done").length;
        return { ...e, projectCount: empProjects.length, openTasks };
      })
      .sort((a, b) => Number(b.workload ?? 0) - Number(a.workload ?? 0));
  }, [employees, activeProjects, tasks]);

  const upcomingDeadlines = useMemo(() => {
    const now = Date.now();
    const in30 = now + 30 * 24 * 60 * 60 * 1000;
    return activeProjects
      .filter((p) => p.deadline && new Date(p.deadline).getTime() <= in30)
      .sort((a, b) => new Date(a.deadline ?? 0).getTime() - new Date(b.deadline ?? 0).getTime());
  }, [activeProjects]);

  const isLoading = employeesLoading || projectsLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planning"
        description="Resource and capacity view across active employees and delivery work."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active employees" value={String(employees.length)} icon={Users} />
        <KpiCard label="Avg. workload" value={`${avgWorkload}%`} icon={ListChecks} />
        <KpiCard
          label="Overloaded (90%+)"
          value={String(overloaded)}
          icon={AlertTriangle}
          className={overloaded ? "border-destructive/30" : ""}
        />
        <KpiCard
          label="Active projects"
          value={String(activeProjects.length)}
          icon={CalendarClock}
        />
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="surface-card overflow-x-auto lg:col-span-2">
            <div className="p-5 pb-0">
              <h2 className="font-semibold">Team capacity</h2>
              <p className="text-sm text-muted-foreground">
                Current workload, active project assignments and open tasks per employee.
              </p>
            </div>
            <table className="mt-4 w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Employee</th>
                  <th className="px-4 py-3 text-left font-semibold">Workload</th>
                  <th className="px-4 py-3 text-left font-semibold">Projects</th>
                  <th className="px-4 py-3 text-left font-semibold">Open tasks</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {capacity.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium">{e.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {e.role ?? "—"} · {e.department ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Progress value={Math.min(100, Number(e.workload ?? 0))} className="w-24" />
                        <span
                          className={`text-xs font-semibold ${workloadTone(Number(e.workload ?? 0))}`}
                        >
                          {e.workload}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{e.projectCount}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.openTasks}</td>
                  </tr>
                ))}
                {capacity.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      No active employees.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="surface-card p-5">
            <h2 className="font-semibold">Upcoming deadlines</h2>
            <p className="text-sm text-muted-foreground">Active projects due within 30 days.</p>
            <ul className="mt-4 space-y-3">
              {upcomingDeadlines.map((p) => (
                <li key={p.id}>
                  <Link
                    to="/project/$projectId"
                    params={{ projectId: p.id }}
                    className="block rounded-lg border border-border p-3 hover:border-primary/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <StatusBadge value={p.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Due {dateLabel(p.deadline)} · {p.team?.length ?? 0} on team
                    </p>
                    <Progress value={computeProjectProgress(p.id, tasks)} className="mt-2" />
                  </Link>
                </li>
              ))}
              {upcomingDeadlines.length === 0 ? (
                <li className="text-sm text-muted-foreground">Nothing due in the next 30 days.</li>
              ) : null}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
