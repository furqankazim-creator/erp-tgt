import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Briefcase,
  CalendarDays,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  TrendingUp,
  Users,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";

import { useRows } from "@/lib/db";
import { currency, dateLabel, initials, number } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog, type Field } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { KpiCard } from "@/components/kpi-card";
import { TableSkeleton, CardGridSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/hr")({
  head: () => ({
    meta: [
      { title: "HR — Time Global Tech CRM" },
      { name: "description", content: "Employee directory, attendance and onboarding progress." },
      { property: "og:title", content: "HR — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "Employee directory, attendance and onboarding progress.",
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
  git_email: string | null;
  role: string | null;
  department: string | null;
  location: string | null;
  status: string;
  workload: number;
  leave_balance: number;
  onboarding_progress: number;
  hired_at: string | null;
  salary: number;
  created_at: string;
};

const STATUSES = ["All", "Active", "Onboarding", "On Leave"];

const DEPARTMENTS = [
  "All",
  "Sales",
  "Marketing",
  "Engineering",
  "Design",
  "People",
  "After Sales",
  "Operations",
  "Delivery",
];

const FIELDS: Field[] = [
  { name: "name", label: "Full name", required: true },
  { name: "email", label: "Email", type: "email" },
  {
    name: "git_email",
    label: "Git email (for PM Connect)",
    type: "email",
    placeholder: "matches git config user.email",
  },
  { name: "role", label: "Job title" },
  {
    name: "department",
    label: "Department",
    type: "select",
    options: DEPARTMENTS.filter((d) => d !== "All"),
  },
  { name: "location", label: "Location" },
  { name: "status", label: "Status", type: "select", options: STATUSES.filter((s) => s !== "All") },
  { name: "salary", label: "Monthly salary (USD)", type: "number" },
  { name: "workload", label: "Workload %", type: "number" },
  { name: "leave_balance", label: "Leave balance (days)", type: "number" },
  { name: "onboarding_progress", label: "Onboarding progress %", type: "number" },
  { name: "hired_at", label: "Hire date", type: "date" },
];

function Page() {
  const { data, isLoading } = useRows<Employee>("employees");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [deptFilter, setDeptFilter] = useState("All");
  const [selected, setSelected] = useState<Employee | null>(null);

  const employees = useMemo(() => {
    const rows = data ?? [];
    return rows.filter((e) => {
      const matchesQuery =
        `${e.name} ${e.role ?? ""} ${e.department ?? ""} ${e.email ?? ""} ${e.location ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase());
      const matchesStatus = statusFilter === "All" || e.status === statusFilter;
      const matchesDept = deptFilter === "All" || e.department === deptFilter;
      return matchesQuery && matchesStatus && matchesDept;
    });
  }, [data, query, statusFilter, deptFilter]);

  const total = data?.length ?? 0;
  const active = (data ?? []).filter((e) => e.status === "Active").length;
  const onLeave = (data ?? []).filter((e) => e.status === "On Leave").length;
  const onboarding = (data ?? []).filter((e) => e.status === "Onboarding").length;
  const avgWorkload = total
    ? Math.round((data ?? []).reduce((s, e) => s + Number(e.workload ?? 0), 0) / total)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="HR"
        description="Employee directory, attendance, onboarding and people analytics."
        action={
          <RecordDialog
            table="employees"
            label="Employee"
            fields={FIELDS}
            defaults={{
              status: "Active",
              salary: "0",
              workload: "0",
              leave_balance: "20",
              onboarding_progress: "0",
            }}
            trigger={
              <Button>
                <Plus className="size-4" /> Add employee
              </Button>
            }
          />
        }
      />

      {isLoading ? (
        <CardGridSkeleton count={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Total employees"
            value={number(total)}
            delta={6}
            hint="hired this quarter"
            icon={Users}
          />
          <KpiCard
            label="Active"
            value={number(active)}
            hint={`${total ? Math.round((active / total) * 100) : 0}% of workforce`}
            icon={UserCheck}
          />
          <KpiCard
            label="On leave"
            value={number(onLeave)}
            delta={-1}
            hint="this week"
            icon={UserX}
          />
          <KpiCard
            label="Onboarding"
            value={number(onboarding)}
            hint={`avg ${avgWorkload}% team load`}
            icon={UserPlus}
          />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:max-w-sm">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Search people, roles, locations…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  statusFilter === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DEPARTMENTS.slice(0, 6).map((d) => (
            <button
              key={d}
              onClick={() => setDeptFilter(d)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                deptFilter === d
                  ? "border-primary bg-primary/12 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="directory">
        <TabsList>
          <TabsTrigger value="directory">Directory</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
        </TabsList>

        <TabsContent value="directory" className="pt-4">
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {employees.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setSelected(e)}
                  className="surface-card surface-card-hover animate-rise group p-5 text-left"
                >
                  <div className="flex items-start gap-4">
                    <Avatar className="size-12 ring-2 ring-transparent transition-all group-hover:ring-primary/30">
                      <AvatarFallback className="gradient-primary text-primary-foreground text-sm font-bold">
                        {initials(e.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold">{e.name}</h3>
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">
                            {e.role ?? "—"}
                          </p>
                        </div>
                        <StatusBadge value={e.status} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Briefcase className="size-3" /> {e.department ?? "—"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3" /> {e.location ?? "Remote"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3 border-t pt-4">
                    <div>
                      <div className="mb-1.5 flex justify-between text-xs">
                        <span className="text-muted-foreground">Workload</span>
                        <span className="font-semibold">{e.workload ?? 0}%</span>
                      </div>
                      <Progress
                        value={e.workload ?? 0}
                        className="h-1.5"
                        indicatorClassName={
                          (e.workload ?? 0) >= 85
                            ? "bg-destructive"
                            : (e.workload ?? 0) >= 65
                              ? "bg-warning"
                              : "bg-primary"
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-muted/50 p-2.5">
                        <p className="text-muted-foreground">Leave balance</p>
                        <p className="mt-0.5 font-semibold">{e.leave_balance ?? 0} days</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-2.5">
                        <p className="text-muted-foreground">Hire date</p>
                        <p className="mt-0.5 font-semibold">{dateLabel(e.hired_at)}</p>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
              {employees.length === 0 ? (
                <div className="surface-card col-span-full p-12 text-center">
                  <p className="text-sm font-medium">No employees match your filters</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Try a different search or clear filters.
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="attendance" className="pt-4">
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <div className="surface-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Employee</th>
                    <th className="px-4 py-3 text-left font-semibold">Department</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-left font-semibold">Workload</th>
                    <th className="px-4 py-3 text-left font-semibold">Leave balance</th>
                    <th className="px-4 py-3 text-left font-semibold">Hired</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {employees.map((e) => (
                    <tr
                      key={e.id}
                      onClick={() => setSelected(e)}
                      className="hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="size-8">
                            <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                              {initials(e.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{e.name}</p>
                            <p className="text-xs text-muted-foreground">{e.role ?? "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{e.department ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge value={e.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${
                                (e.workload ?? 0) >= 85
                                  ? "bg-destructive"
                                  : (e.workload ?? 0) >= 65
                                    ? "bg-warning"
                                    : "bg-success"
                              }`}
                              style={{ width: `${Math.min(100, e.workload ?? 0)}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold">{e.workload ?? 0}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs">
                          <CalendarDays className="size-3 text-muted-foreground" />
                          <span className="font-semibold">{e.leave_balance ?? 0}d</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{dateLabel(e.hired_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <RecordDialog
                            table="employees"
                            label="Employee"
                            fields={FIELDS}
                            record={e}
                            trigger={
                              <Button variant="ghost" size="sm">
                                Edit
                              </Button>
                            }
                          />
                          <DeleteButton
                            table="employees"
                            id={e.id}
                            label="Employee"
                            name={e.name}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="onboarding" className="pt-4">
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <div className="space-y-4">
              <div className="surface-card p-5">
                <div className="flex items-center gap-3">
                  <div className="gradient-primary text-primary-foreground grid size-10 place-items-center rounded-xl">
                    <TrendingUp className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Onboarding progress</h3>
                    <p className="text-sm text-muted-foreground">
                      {onboarding} new hires currently going through onboarding
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {employees
                  .filter((e) => (e.onboarding_progress ?? 0) < 100)
                  .map((e) => (
                    <div
                      key={e.id}
                      onClick={() => setSelected(e)}
                      className="surface-card surface-card-hover animate-rise cursor-pointer p-5"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="size-10">
                          <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                            {initials(e.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="truncate font-semibold">{e.name}</h4>
                            <StatusBadge value={e.status} />
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {e.role ?? "—"} · {e.department ?? "—"}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <UserPlus className="size-3.5" /> Onboarding progress
                          </div>
                          <span className="text-sm font-bold">{e.onboarding_progress ?? 0}%</span>
                        </div>
                        <Progress
                          value={e.onboarding_progress ?? 0}
                          className="h-2"
                          indicatorClassName={
                            (e.onboarding_progress ?? 0) >= 80
                              ? "bg-success"
                              : (e.onboarding_progress ?? 0) >= 40
                                ? "bg-primary"
                                : "bg-warning"
                          }
                        />
                        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                          <div className="rounded-md bg-primary/10 p-2 text-center">
                            <p className="text-muted-foreground">Paperwork</p>
                            <p className="mt-0.5 font-bold text-primary">
                              {Math.min(100, (e.onboarding_progress ?? 0) + 10) >= 100
                                ? "Done"
                                : "Pending"}
                            </p>
                          </div>
                          <div className="rounded-md bg-primary/10 p-2 text-center">
                            <p className="text-muted-foreground">Training</p>
                            <p className="mt-0.5 font-bold text-primary">
                              {(e.onboarding_progress ?? 0) >= 60 ? "Active" : "Scheduled"}
                            </p>
                          </div>
                          <div className="rounded-md bg-primary/10 p-2 text-center">
                            <p className="text-muted-foreground">Setup</p>
                            <p className="mt-0.5 font-bold text-primary">
                              {(e.onboarding_progress ?? 0) >= 30 ? "Complete" : "Pending"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                {employees.filter((e) => (e.onboarding_progress ?? 0) < 100).length === 0 ? (
                  <div className="surface-card col-span-full p-12 text-center">
                    <p className="text-sm font-medium">Everyone is onboarded 🎉</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      All team members have completed their onboarding.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected ? (
            <div className="space-y-6 px-1 pb-6">
              <SheetHeader>
                <div className="flex items-start gap-4">
                  <Avatar className="size-16 ring-4 ring-primary/10">
                    <AvatarFallback className="gradient-primary text-primary-foreground text-lg font-bold">
                      {initials(selected.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 pt-1">
                    <SheetTitle className="text-xl">{selected.name}</SheetTitle>
                    <SheetDescription className="mt-1">
                      {selected.role ?? "Team member"} · {selected.department ?? "—"}
                    </SheetDescription>
                    <div className="mt-2">
                      <StatusBadge value={selected.status} />
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-3 rounded-2xl border p-4">
                <h4 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                  Contact
                </h4>
                <div className="space-y-2 text-sm">
                  <p className="flex items-center gap-2.5">
                    <span className="bg-muted grid size-8 shrink-0 place-items-center rounded-lg">
                      <Mail className="text-muted-foreground size-4" />
                    </span>
                    <span className="truncate">{selected.email ?? "—"}</span>
                  </p>
                  <p className="flex items-center gap-2.5">
                    <span className="bg-muted grid size-8 shrink-0 place-items-center rounded-lg">
                      <MapPin className="text-muted-foreground size-4" />
                    </span>
                    <span>{selected.location ?? "Remote"}</span>
                  </p>
                  <p className="flex items-center gap-2.5">
                    <span className="bg-muted grid size-8 shrink-0 place-items-center rounded-lg">
                      <CalendarDays className="text-muted-foreground size-4" />
                    </span>
                    <span>Hired {dateLabel(selected.hired_at)}</span>
                  </p>
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border p-4">
                <h4 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                  Workload &amp; time off
                </h4>
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Current workload</span>
                    <span className="font-bold">{selected.workload ?? 0}%</span>
                  </div>
                  <Progress
                    value={selected.workload ?? 0}
                    className="h-2"
                    indicatorClassName={
                      (selected.workload ?? 0) >= 85
                        ? "bg-destructive"
                        : (selected.workload ?? 0) >= 65
                          ? "bg-warning"
                          : "bg-success"
                    }
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {(selected.workload ?? 0) >= 85
                      ? "High load — consider redistributing tasks"
                      : (selected.workload ?? 0) >= 65
                        ? "Healthy balance"
                        : "Has capacity for more"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Leave balance</p>
                    <p className="mt-1 text-lg font-bold">{selected.leave_balance ?? 0}d</p>
                  </div>
                  <div className="rounded-xl bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Onboarding</p>
                    <p className="mt-1 text-lg font-bold">{selected.onboarding_progress ?? 0}%</p>
                  </div>
                  <div className="col-span-2 rounded-xl bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Monthly salary</p>
                    <p className="mt-1 text-lg font-bold">{currency(selected.salary)}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <RecordDialog
                  table="employees"
                  label="Employee"
                  fields={FIELDS}
                  record={selected}
                  trigger={<Button className="w-full">Edit profile</Button>}
                />
                <DeleteButton
                  table="employees"
                  id={selected.id}
                  label="Employee"
                  name={selected.name}
                />
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
