import { createFileRoute } from "@tanstack/react-router";
import { Activity, AlertTriangle, Gauge, ListChecks, LifeBuoy, Plus, Users } from "lucide-react";

import { useRows } from "@/lib/db";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog, type Field } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton, EmptyState } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/operations")({
  head: () => ({
    meta: [
      { title: "Operations — Time Global Tech CRM" },
      { name: "description", content: "Workflow tracker, resource status and operations health." },
      { property: "og:title", content: "Operations — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "Workflow tracker, resource status and operations health.",
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
  department: string | null;
  workload: number;
  status: string;
};
type Project = { id: string; status: string };
type Task = { id: string; status: string; due_date: string | null };
type Ticket = { id: string; status: string; sla_due_at: string | null };
type Process = {
  id: string;
  title: string;
  owner: string | null;
  category: string;
  status: string;
  progress: number;
  notes: string | null;
};

const STATUSES = ["On Track", "At Risk", "Delayed"];
const CATEGORIES = [
  "Delivery",
  "Finance",
  "Engineering",
  "Operations",
  "Sales",
  "People",
  "Marketing",
];

function workloadTone(workload: number) {
  if (workload >= 85) return "text-destructive";
  if (workload >= 70) return "text-warning";
  return "text-success";
}

function Page() {
  const employees = useRows<Employee>("employees");
  const projects = useRows<Project>("projects");
  const tasks = useRows<Task>("tasks");
  const tickets = useRows<Ticket>("tickets");
  const processes = useRows<Process>("processes");
  const employeeRows = employees.data ?? [];

  const FIELDS: Field[] = [
    { name: "title", label: "Process name", required: true, full: true },
    { name: "owner", label: "Owner", type: "select", options: employeeRows.map((e) => e.name) },
    { name: "category", label: "Category", type: "select", options: CATEGORIES },
    { name: "status", label: "Status", type: "select", options: STATUSES },
    { name: "progress", label: "Progress (%)", type: "number" },
    { name: "notes", label: "Notes", type: "textarea", full: true },
  ];

  const loading =
    employees.isLoading ||
    projects.isLoading ||
    tasks.isLoading ||
    tickets.isLoading ||
    processes.isLoading;

  const emps = employeeRows;
  const activeProjects = (projects.data ?? []).filter((p) => p.status === "In Progress").length;
  const openTickets = (tickets.data ?? []).filter((t) => t.status !== "Resolved").length;
  const overdueTasks = (tasks.data ?? []).filter(
    (t) => t.status !== "Done" && t.due_date && new Date(t.due_date).getTime() < Date.now(),
  ).length;
  const avgWorkload = emps.length
    ? Math.round(emps.reduce((s, e) => s + Number(e.workload), 0) / emps.length)
    : 0;
  const overloaded = emps.filter((e) => Number(e.workload) >= 85).length;

  const departments = new Map<string, { count: number; total: number }>();
  for (const e of emps) {
    const dept = e.department ?? "Unassigned";
    const entry = departments.get(dept) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += Number(e.workload);
    departments.set(dept, entry);
  }
  const deptRows = [...departments.entries()]
    .map(([dept, v]) => ({ dept, avg: Math.round(v.total / v.count), count: v.count }))
    .sort((a, b) => b.avg - a.avg);

  const workflows = processes.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations"
        description="Workflow health, resource status and team capacity in one view."
        action={
          <RecordDialog
            table="processes"
            label="Process"
            fields={FIELDS}
            defaults={{ status: "On Track", progress: "0", category: "Operations" }}
            trigger={
              <Button>
                <Plus className="size-4" /> New process
              </Button>
            }
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active projects" value={String(activeProjects)} icon={Activity} />
        <KpiCard label="Open tickets" value={String(openTickets)} icon={LifeBuoy} />
        <KpiCard
          label="Overdue tasks"
          value={String(overdueTasks)}
          hint={overdueTasks ? "across all projects" : "on schedule"}
          icon={AlertTriangle}
        />
        <KpiCard
          label="Team workload"
          value={`${avgWorkload}%`}
          hint={overloaded ? `${overloaded} overloaded` : "healthy capacity"}
          icon={Gauge}
        />
      </div>

      {loading ? (
        <TableSkeleton />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="surface-card p-6 lg:col-span-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <ListChecks className="size-4" /> Workflow tracker
            </h2>
            {workflows.length === 0 ? (
              <EmptyState
                title="No processes yet"
                description="Add your first workflow to start tracking it."
              />
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {workflows.map((w) => (
                  <div key={w.id} className="border-border rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{w.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {w.category} · {w.owner ?? "Unassigned"}
                        </p>
                      </div>
                      <StatusBadge value={w.status} />
                    </div>
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span className="font-semibold">{w.progress}%</span>
                      </div>
                      <Progress value={w.progress} />
                    </div>
                    {w.notes ? (
                      <p className="mt-2 text-[11px] text-muted-foreground">{w.notes}</p>
                    ) : null}
                    <div className="mt-3 flex items-center gap-1 border-t border-border pt-2">
                      <RecordDialog
                        table="processes"
                        label="Process"
                        fields={FIELDS}
                        record={w}
                        trigger={
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                            Edit
                          </Button>
                        }
                      />
                      <DeleteButton table="processes" id={w.id} label="Process" name={w.title} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="surface-card p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <Users className="size-4" /> Team capacity by department
            </h2>
            <ul className="mt-4 space-y-4">
              {deptRows.map((d) => (
                <li key={d.dept}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium">{d.dept}</span>
                    <span className={cn("font-semibold", workloadTone(d.avg))}>{d.avg}%</span>
                  </div>
                  <Progress value={d.avg} />
                  <p className="mt-1 text-[11px] text-muted-foreground">{d.count} people</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
