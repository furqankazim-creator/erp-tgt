import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  Flame,
  Gauge,
  Globe2,
  Layers,
  MapPin,
  Plus,
  Search,
  Users,
  Zap,
} from "lucide-react";

import { useRows } from "@/lib/db";
import { initials, number } from "@/lib/format";
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
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/teams")({
  head: () => ({
    meta: [
      { title: "Teams — Time Global Tech CRM" },
      { name: "description", content: "Departments, members, roles and workload indicators." },
      { property: "og:title", content: "Teams — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "Departments, members, roles and workload indicators.",
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
  role: string | null;
  department: string | null;
  location: string | null;
  status: string;
  workload: number;
  leave_balance: number;
  onboarding_progress: number;
  hired_at: string | null;
  created_at: string;
};

const DEPARTMENT_LIST = [
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

const LOCATIONS = [
  "All",
  "Dubai",
  "Lisbon",
  "Seoul",
  "Bangalore",
  "London",
  "Berlin",
  "Austin",
  "Tokyo",
  "Lagos",
  "Madrid",
  "Remote",
];

const FIELDS: Field[] = [
  { name: "name", label: "Full name", required: true },
  { name: "email", label: "Email", type: "email" },
  { name: "role", label: "Job title" },
  {
    name: "department",
    label: "Department",
    type: "select",
    options: DEPARTMENT_LIST.filter((d) => d !== "All"),
  },
  { name: "location", label: "Location" },
  {
    name: "status",
    label: "Status",
    type: "select",
    options: ["Active", "Onboarding", "On Leave"],
  },
  { name: "workload", label: "Workload %", type: "number" },
  { name: "leave_balance", label: "Leave balance (days)", type: "number" },
  { name: "onboarding_progress", label: "Onboarding progress %", type: "number" },
  { name: "hired_at", label: "Hire date", type: "date" },
];

function workloadTone(wl: number): { label: string; tone: string } {
  if (wl >= 85)
    return { label: "High", tone: "bg-destructive/12 text-destructive border-destructive/25" };
  if (wl >= 65) return { label: "Balanced", tone: "bg-warning/15 text-warning border-warning/30" };
  return { label: "Light", tone: "bg-success/12 text-success border-success/25" };
}

function workloadBarColor(wl: number): string {
  if (wl >= 85) return "bg-destructive";
  if (wl >= 65) return "bg-warning";
  return "bg-success";
}

function Page() {
  const { data, isLoading } = useRows<Employee>("employees");
  const [query, setQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [locFilter, setLocFilter] = useState("All");
  const [selected, setSelected] = useState<Employee | null>(null);

  const employees = useMemo(() => {
    const rows = data ?? [];
    return rows.filter((e) => {
      const matchesQuery = `${e.name} ${e.role ?? ""} ${e.department ?? ""} ${e.location ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesDept = deptFilter === "All" || e.department === deptFilter;
      const matchesLoc = locFilter === "All" || (e.location ?? "Remote") === locFilter;
      return matchesQuery && matchesDept && matchesLoc;
    });
  }, [data, query, deptFilter, locFilter]);

  const departments = useMemo(() => {
    const map = new Map<string, Employee[]>();
    for (const e of data ?? []) {
      const key = e.department ?? "Unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [data]);

  const locations = useMemo(() => {
    const set = new Set<string>();
    for (const e of data ?? []) set.add(e.location ?? "Remote");
    return Array.from(set).sort();
  }, [data]);

  const total = data?.length ?? 0;
  const deptCount = departments.length;
  const locationCount = locations.length;
  const avgWorkload = total
    ? Math.round((data ?? []).reduce((s, e) => s + Number(e.workload ?? 0), 0) / total)
    : 0;
  const overloaded = (data ?? []).filter((e) => (e.workload ?? 0) >= 85).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teams"
        description="Organize by department, track capacity, and balance workloads across the org."
        action={
          <RecordDialog
            table="employees"
            label="Team member"
            fields={FIELDS}
            defaults={{
              status: "Active",
              workload: "50",
              leave_balance: "20",
              onboarding_progress: "100",
            }}
            trigger={
              <Button>
                <Plus className="size-4" /> New team member
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
            label="Departments"
            value={number(deptCount)}
            hint={`${number(locationCount)} locations`}
            icon={Building2}
          />
          <KpiCard
            label="Team members"
            value={number(total)}
            delta={3}
            hint="joined this month"
            icon={Users}
          />
          <KpiCard
            label="Avg workload"
            value={`${avgWorkload}%`}
            hint={`${number(overloaded)} at high load`}
            icon={Gauge}
          />
          <KpiCard
            label="Locations"
            value={number(locationCount)}
            delta={2}
            hint="global offices + remote"
            icon={Globe2}
          />
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:max-w-sm">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Search by name, role, location…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DEPARTMENT_LIST.slice(0, 7).map((d) => (
              <button
                key={d}
                onClick={() => setDeptFilter(d)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  deptFilter === d
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["All", ...locations.slice(0, 5)].map((l) => (
            <button
              key={l}
              onClick={() => setLocFilter(l)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                locFilter === l
                  ? "border-primary bg-primary/12 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30"
              }`}
            >
              <MapPin className="size-3" /> {l}
            </button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="departments">
        <TabsList>
          <TabsTrigger value="departments">By Department</TabsTrigger>
          <TabsTrigger value="workload">Workload Heatmap</TabsTrigger>
          <TabsTrigger value="org">Org Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="departments" className="pt-4">
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {departments
                .filter(([dept]) => deptFilter === "All" || dept === deptFilter)
                .map(([dept, members]) => {
                  const filteredMembers = members.filter((m) =>
                    employees.some((e) => e.id === m.id),
                  );
                  if (filteredMembers.length === 0) return null;
                  const avg = Math.round(
                    filteredMembers.reduce((s, e) => s + Number(e.workload ?? 0), 0) /
                      filteredMembers.length,
                  );
                  const locationsInDept = Array.from(
                    new Set(filteredMembers.map((m) => m.location ?? "Remote")),
                  );
                  return (
                    <div key={dept} className="surface-card animate-rise overflow-hidden">
                      <div className="flex items-start justify-between gap-4 border-b p-5">
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="gradient-primary text-primary-foreground grid size-9 place-items-center rounded-xl">
                              <Layers className="size-4.5" />
                            </div>
                            <div>
                              <h3 className="font-bold tracking-tight">{dept}</h3>
                              <p className="text-xs text-muted-foreground">
                                {number(filteredMembers.length)} members · avg {avg}% load
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap justify-end gap-1">
                          {locationsInDept.slice(0, 3).map((loc) => (
                            <Badge key={loc} variant="outline" className="text-[10px] px-2 py-0.5">
                              <MapPin className="size-3 mr-1" /> {loc}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="p-4">
                        <ul className="space-y-2">
                          {filteredMembers.map((e) => (
                            <li
                              key={e.id}
                              onClick={() => setSelected(e)}
                              className="group hover:bg-muted/60 cursor-pointer rounded-xl p-3 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <Avatar className="size-9 shrink-0">
                                  <AvatarFallback className="bg-primary/15 text-primary text-[11px] font-bold">
                                    {initials(e.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="truncate text-sm font-semibold">{e.name}</p>
                                    <StatusBadge value={e.status} />
                                  </div>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {e.role ?? "—"}
                                  </p>
                                </div>
                                <div className="hidden flex-col items-end gap-1 sm:flex">
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${workloadTone(e.workload ?? 0).tone}`}
                                  >
                                    <Flame className="size-3" />{" "}
                                    {workloadTone(e.workload ?? 0).label}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <div className="h-1.5 w-24 rounded-full bg-muted">
                                      <div
                                        className={`h-full rounded-full ${workloadBarColor(e.workload ?? 0)}`}
                                        style={{ width: `${Math.min(100, e.workload ?? 0)}%` }}
                                      />
                                    </div>
                                    <span className="text-[10px] font-bold">
                                      {e.workload ?? 0}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  );
                })}
              {departments
                .filter(([dept]) => deptFilter === "All" || dept === deptFilter)
                .flatMap(([, m]) => m)
                .filter((m) => employees.some((e) => e.id === m.id)).length === 0 ? (
                <div className="surface-card col-span-full p-12 text-center">
                  <p className="text-sm font-medium">No teams match your filters</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Try adjusting department or location filters.
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="workload" className="pt-4">
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="surface-card p-5">
                  <div className="flex items-center gap-3">
                    <div className="bg-success/15 text-success grid size-10 place-items-center rounded-xl">
                      <Zap className="size-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">
                        Light load
                      </p>
                      <p className="text-2xl font-bold">
                        {number((data ?? []).filter((e) => (e.workload ?? 0) < 65).length)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Under 65% — room to take on more
                  </p>
                </div>
                <div className="surface-card p-5">
                  <div className="flex items-center gap-3">
                    <div className="bg-warning/15 text-warning grid size-10 place-items-center rounded-xl">
                      <Gauge className="size-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">
                        Balanced
                      </p>
                      <p className="text-2xl font-bold">
                        {number(
                          (data ?? []).filter(
                            (e) => (e.workload ?? 0) >= 65 && (e.workload ?? 0) < 85,
                          ).length,
                        )}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    65–85% — healthy sustainable pace
                  </p>
                </div>
                <div className="surface-card p-5">
                  <div className="flex items-center gap-3">
                    <div className="bg-destructive/15 text-destructive grid size-10 place-items-center rounded-xl">
                      <Flame className="size-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">
                        At risk
                      </p>
                      <p className="text-2xl font-bold">{number(overloaded)}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    85%+ — consider redistributing work
                  </p>
                </div>
              </div>

              <div className="surface-card overflow-hidden">
                <div className="border-b p-5">
                  <h3 className="font-semibold">Workload distribution</h3>
                  <p className="text-sm text-muted-foreground">
                    Ranked from highest to lowest — click a row to view profile
                  </p>
                </div>
                <div className="divide-border divide-y">
                  {[...employees]
                    .sort((a, b) => Number(b.workload ?? 0) - Number(a.workload ?? 0))
                    .map((e) => (
                      <button
                        key={e.id}
                        onClick={() => setSelected(e)}
                        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/40"
                      >
                        <Avatar className="size-10 shrink-0">
                          <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                            {initials(e.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <p className="font-semibold">{e.name}</p>
                            <Badge variant="outline" className="text-[10px]">
                              {e.department ?? "—"}
                            </Badge>
                            <StatusBadge value={e.status} />
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {e.role ?? "—"} · {e.location ?? "Remote"}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 sm:min-w-[320px]">
                          <div className="flex w-full items-center gap-3">
                            <Progress
                              value={e.workload ?? 0}
                              className="h-2.5 flex-1 bg-muted"
                              indicatorClassName={workloadBarColor(e.workload ?? 0)}
                            />
                            <span className="min-w-[44px] text-right text-sm font-bold">
                              {e.workload ?? 0}%
                            </span>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${workloadTone(e.workload ?? 0).tone}`}
                          >
                            <Flame className="size-3" /> {workloadTone(e.workload ?? 0).label}
                          </span>
                        </div>
                      </button>
                    ))}
                  {employees.length === 0 ? (
                    <div className="p-12 text-center">
                      <p className="text-sm text-muted-foreground">
                        No results — try clearing filters
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="org" className="pt-4">
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {departments
                .filter(([dept]) => deptFilter === "All" || dept === deptFilter)
                .map(([dept, members]) => {
                  const filtered = members.filter((m) => employees.some((e) => e.id === m.id));
                  if (filtered.length === 0) return null;
                  const avg = Math.round(
                    filtered.reduce((s, e) => s + Number(e.workload ?? 0), 0) / filtered.length,
                  );
                  const activeCount = filtered.filter((e) => e.status === "Active").length;
                  return (
                    <div key={dept} className="surface-card surface-card-hover animate-rise p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <h3 className="font-bold">{dept}</h3>
                          <p className="text-xs text-muted-foreground">
                            {number(filtered.length)} members
                          </p>
                        </div>
                        <div className="flex -space-x-2">
                          {filtered.slice(0, 4).map((e) => (
                            <Avatar key={e.id} className="size-7 ring-2 ring-card">
                              <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-bold">
                                {initials(e.name)}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                          {filtered.length > 4 ? (
                            <div className="bg-muted text-muted-foreground grid size-7 place-items-center rounded-full ring-2 ring-card text-[10px] font-bold">
                              +{filtered.length - 4}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="rounded-lg bg-success/10 p-2">
                            <p className="font-bold text-success">{activeCount}</p>
                            <p className="text-[10px] text-muted-foreground">Active</p>
                          </div>
                          <div className="rounded-lg bg-primary/10 p-2">
                            <p className="font-bold text-primary">{avg}%</p>
                            <p className="text-[10px] text-muted-foreground">Avg load</p>
                          </div>
                          <div className="rounded-lg bg-warning/10 p-2">
                            <p className="font-bold text-warning">
                              {filtered.filter((e) => e.status !== "Active").length}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Other</p>
                          </div>
                        </div>
                        <div>
                          <div className="mb-1.5 flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Dept workload</span>
                            <span className="font-bold">{avg}%</span>
                          </div>
                          <Progress
                            value={avg}
                            className="h-2"
                            indicatorClassName={workloadBarColor(avg)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
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
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StatusBadge value={selected.status} />
                      <Badge variant="outline" className="text-[11px]">
                        <MapPin className="size-3 mr-1" /> {selected.location ?? "Remote"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-4 rounded-2xl border p-4">
                <h4 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                  Capacity
                </h4>
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Current workload</span>
                    <span className="font-bold">{selected.workload ?? 0}%</span>
                  </div>
                  <Progress
                    value={selected.workload ?? 0}
                    className="h-2.5"
                    indicatorClassName={workloadBarColor(selected.workload ?? 0)}
                  />
                  <div className="mt-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${workloadTone(selected.workload ?? 0).tone}`}
                    >
                      <Flame className="size-3.5" /> {workloadTone(selected.workload ?? 0).label}{" "}
                      capacity
                    </span>
                  </div>
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
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <RecordDialog
                  table="employees"
                  label="Team member"
                  fields={FIELDS}
                  record={selected}
                  trigger={<Button className="w-full">Edit</Button>}
                />
                <DeleteButton
                  table="employees"
                  id={selected.id}
                  label="Team member"
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
