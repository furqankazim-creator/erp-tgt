import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, Calculator, Clock, Equal, Plus, Users, Wallet } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useRow, useRows, useSaveRow } from "@/lib/db";
import { currency, number } from "@/lib/format";
import { monthlyEquivalent, useOrgCostPerHour } from "@/lib/costing";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog, type Field } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/costing")({
  head: () => ({
    meta: [
      { title: "Costing — Time Global Tech CRM" },
      {
        name: "description",
        content: "Organizational operating cost, payroll and cost-per-hour tracking.",
      },
      { property: "og:title", content: "Costing — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "Fixed costs, budgets and the live cost-per-hour used to price work.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CostingPage,
});

type Budget = { id: string; category: string; monthly_budget: number };

type CostSnapshot = {
  id: string;
  period: string;
  fixed_costs_total: number;
  payroll_total: number;
  total_monthly_cost: number;
  productive_hours: number;
  cost_per_hour: number;
};

const COST_CATEGORIES = [
  "Rent",
  "Utilities",
  "Internet",
  "Software Subscriptions",
  "Insurance",
  "Other",
];

const FREQUENCIES = ["Monthly", "Quarterly", "Yearly", "One-time"];
const COST_STATUSES = ["Active", "Paused", "Ended"];
const COST_STATUS_FILTERS = ["All", ...COST_STATUSES];
const DEPARTMENTS = [
  "Sales",
  "Marketing",
  "Engineering",
  "Design",
  "People",
  "After Sales",
  "Operations",
  "Delivery",
];

const COST_FIELDS: Field[] = [
  { name: "name", label: "Cost name", required: true, full: true },
  { name: "category", label: "Category", type: "select", options: COST_CATEGORIES },
  { name: "vendor", label: "Vendor" },
  { name: "amount", label: "Amount (USD)", type: "number" },
  { name: "frequency", label: "Frequency", type: "select", options: FREQUENCIES },
  { name: "department", label: "Department", type: "select", options: DEPARTMENTS },
  { name: "status", label: "Status", type: "select", options: COST_STATUSES },
  { name: "start_date", label: "Start date", type: "date" },
  { name: "end_date", label: "End date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
];

const BUDGET_FIELDS: Field[] = [
  { name: "category", label: "Category", type: "select", options: COST_CATEGORIES, required: true },
  { name: "monthly_budget", label: "Monthly budget (USD)", type: "number" },
];

const SETTINGS_FIELDS: Field[] = [
  { name: "working_days_per_month", label: "Working days / month", type: "number" },
  { name: "hours_per_day", label: "Hours / day per employee", type: "number" },
];

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function periodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
  });
}

function CostingPage() {
  const totals = useOrgCostPerHour();
  const { data: budgetRows, isLoading: budgetsLoading } = useRows<Budget>("budgets");
  const { data: snapshotRows, isLoading: snapshotsLoading } =
    useRows<CostSnapshot>("cost_snapshots");
  const settings = useRow("org_settings", "default");
  const saveSnapshot = useSaveRow("cost_snapshots", "Snapshot");

  const budgets = budgetRows ?? [];
  const snapshots = [...(snapshotRows ?? [])].sort((a, b) => a.period.localeCompare(b.period));

  const [costStatusFilter, setCostStatusFilter] = useState("All");
  const visibleCosts = totals.costs.filter(
    (c) => costStatusFilter === "All" || (c.status ?? "Active") === costStatusFilter,
  );

  const payrollByDept = new Map<string, { count: number; total: number }>();
  for (const e of totals.employees) {
    const dept = e.department ?? "Unassigned";
    const entry = payrollByDept.get(dept) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += Number(e.salary ?? 0);
    payrollByDept.set(dept, entry);
  }

  const costsByDept = new Map<string, number>();
  for (const c of totals.costs) {
    if (!c.department || (c.status ?? "Active") !== "Active") continue;
    costsByDept.set(c.department, (costsByDept.get(c.department) ?? 0) + monthlyEquivalent(c));
  }

  const period = currentPeriod();
  const existingSnapshot = snapshots.find((s) => s.period === period);
  const lastTwo = snapshots.slice(-2);
  const rateDelta =
    lastTwo.length === 2 && lastTwo[0]!.cost_per_hour > 0
      ? Math.round(
          ((lastTwo[1]!.cost_per_hour - lastTwo[0]!.cost_per_hour) / lastTwo[0]!.cost_per_hour) *
            1000,
        ) / 10
      : undefined;

  function recordSnapshot() {
    const payload = {
      period,
      fixed_costs_total: Math.round(totals.monthlyFixedCosts * 100) / 100,
      payroll_total: Math.round(totals.monthlyPayroll * 100) / 100,
      total_monthly_cost: Math.round(totals.totalMonthlyCost * 100) / 100,
      productive_hours: totals.productiveHours,
      cost_per_hour: Math.round(totals.costPerHour * 100) / 100,
    };
    saveSnapshot.mutate(existingSnapshot ? { ...payload, id: existingSnapshot.id } : payload);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Costing"
        description="Fixed operating costs plus HR payroll, divided by productive working hours — used to price estimates, quotations and project work at a real cost basis."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Monthly fixed costs"
          value={currency(totals.monthlyFixedCosts, true)}
          icon={Building2}
        />
        <KpiCard
          label="Monthly payroll"
          value={currency(totals.monthlyPayroll, true)}
          icon={Users}
        />
        <KpiCard
          label="Total monthly cost"
          value={currency(totals.totalMonthlyCost, true)}
          icon={Wallet}
        />
        <KpiCard
          label="Productive hours / mo"
          value={number(totals.productiveHours)}
          hint={`${totals.activeEmployees} active × ${totals.workingDays}d × ${totals.hoursPerDay}h`}
          icon={Clock}
        />
        <KpiCard
          label="Cost per hour"
          value={currency(totals.costPerHour)}
          hint={rateDelta === undefined ? "use as a pricing floor" : "vs prior recorded month"}
          icon={Calculator}
          className="ring-1 ring-primary/30"
          {...(rateDelta === undefined ? {} : { delta: rateDelta })}
        />
      </div>

      <div className="surface-card p-5">
        <h2 className="mb-4 font-semibold">How your rate is calculated</h2>
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-3">
          <div className="surface-card flex-1 border-border/60 p-3.5 text-center sm:max-w-48">
            <Building2 className="text-muted-foreground mx-auto mb-1.5 size-4" />
            <p className="text-xs font-semibold text-muted-foreground">
              Monthly organizational cost
            </p>
            <p className="mt-1 text-lg font-bold">{currency(totals.monthlyFixedCosts, true)}</p>
          </div>
          <Plus className="text-muted-foreground/60 size-5 shrink-0" />
          <div className="surface-card flex-1 border-border/60 p-3.5 text-center sm:max-w-48">
            <Users className="text-muted-foreground mx-auto mb-1.5 size-4" />
            <p className="text-xs font-semibold text-muted-foreground">Monthly payroll cost</p>
            <p className="mt-1 text-lg font-bold">{currency(totals.monthlyPayroll, true)}</p>
          </div>
          <Equal className="text-muted-foreground/60 size-5 shrink-0" />
          <div className="bg-primary/8 border-primary/25 flex-1 rounded-lg border p-3.5 text-center sm:max-w-48">
            <Calculator className="text-primary mx-auto mb-1.5 size-4" />
            <p className="text-primary text-xs font-semibold">Cost per hour</p>
            <p className="text-primary mt-1 text-lg font-bold">{currency(totals.costPerHour)}</p>
            <p className="text-primary/70 mt-0.5 text-[10px]">
              ÷ {number(totals.productiveHours)} productive hrs/mo
            </p>
          </div>
        </div>
      </div>

      <div className="surface-card p-5">
        <div className="mb-1 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Cost per hour — trend</h2>
            <p className="text-sm text-muted-foreground">
              Recorded month-end snapshots of the organization's rate.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={recordSnapshot}
            disabled={saveSnapshot.isPending}
          >
            {saveSnapshot.isPending
              ? "Saving…"
              : existingSnapshot
                ? `Update ${periodLabel(period)}`
                : `Record ${periodLabel(period)}`}
          </Button>
        </div>
        {snapshotsLoading ? (
          <TableSkeleton rows={3} />
        ) : snapshots.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No snapshots recorded yet.
          </p>
        ) : (
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={snapshots}>
                <defs>
                  <linearGradient id="rate" x1="0" y1="0" x2="0" y2="1">
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
                  dataKey="period"
                  tickFormatter={periodLabel}
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  tickFormatter={(v: number) => `$${Math.round(v)}`}
                />
                <Tooltip
                  labelFormatter={(l: string) => periodLabel(l)}
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    color: "var(--color-popover-foreground)",
                  }}
                  formatter={(v: number) => currency(v)}
                />
                <Area
                  type="monotone"
                  dataKey="cost_per_hour"
                  stroke="var(--color-primary)"
                  strokeWidth={2.5}
                  fill="url(#rate)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Fixed costs</h2>
              <RecordDialog
                table="costs"
                label="Fixed cost"
                fields={COST_FIELDS}
                defaults={{ category: "Other", frequency: "Monthly", status: "Active" }}
                trigger={
                  <Button size="sm">
                    <Plus className="size-4" /> Add fixed cost
                  </Button>
                }
              />
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {COST_STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => setCostStatusFilter(s)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    costStatusFilter === s
                      ? "border-primary bg-primary/12 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            {totals.isLoading ? (
              <TableSkeleton />
            ) : (
              <div className="surface-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Cost</th>
                      <th className="px-4 py-3 text-left font-semibold">Category</th>
                      <th className="px-4 py-3 text-left font-semibold">Frequency</th>
                      <th className="px-4 py-3 text-left font-semibold">Monthly equiv.</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {visibleCosts.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-medium">{c.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {c.vendor ?? "—"}
                            {c.department ? ` · ${c.department}` : ""}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={c.category} tone="neutral" />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {c.frequency ?? "Monthly"}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {currency(monthlyEquivalent(c))}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={c.status ?? "Active"} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <RecordDialog
                              table="costs"
                              label="Fixed cost"
                              fields={COST_FIELDS}
                              record={c}
                              trigger={
                                <Button variant="ghost" size="sm">
                                  Edit
                                </Button>
                              }
                            />
                            <DeleteButton
                              table="costs"
                              id={c.id}
                              label="Fixed cost"
                              name={c.name}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                    {visibleCosts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          No fixed costs in this filter.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h2 className="mb-3 font-semibold">Budget vs actual</h2>
            {budgetsLoading ? (
              <TableSkeleton rows={3} />
            ) : (
              <div className="surface-card space-y-4 p-5">
                {COST_CATEGORIES.map((cat) => {
                  const budget = budgets.find((b) => b.category === cat);
                  const actual = totals.costs
                    .filter((c) => c.category === cat)
                    .reduce((s, c) => s + monthlyEquivalent(c), 0);
                  const budgetAmount = Number(budget?.monthly_budget ?? 0);
                  const pct = budgetAmount > 0 ? Math.round((actual / budgetAmount) * 100) : 0;
                  const over = budgetAmount > 0 && actual > budgetAmount;
                  return (
                    <div key={cat}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="font-medium">{cat}</span>
                        <span className="flex items-center gap-2">
                          <span
                            className={
                              over ? "text-destructive font-semibold" : "text-muted-foreground"
                            }
                          >
                            {currency(actual, true)} / {currency(budgetAmount, true)}
                          </span>
                          {budget ? (
                            <RecordDialog
                              table="budgets"
                              label="Budget"
                              fields={BUDGET_FIELDS}
                              record={budget}
                              trigger={
                                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs">
                                  Edit
                                </Button>
                              }
                            />
                          ) : null}
                        </span>
                      </div>
                      <Progress
                        value={Math.min(100, pct)}
                        {...(over ? { indicatorClassName: "bg-destructive" } : {})}
                      />
                    </div>
                  );
                })}
                {budgets.length < COST_CATEGORIES.length ? (
                  <RecordDialog
                    table="budgets"
                    label="Budget"
                    fields={BUDGET_FIELDS}
                    trigger={
                      <Button variant="outline" size="sm">
                        <Plus className="size-4" /> Add budget
                      </Button>
                    }
                  />
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="surface-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Payroll from HR</h2>
              <Button asChild variant="ghost" size="sm">
                <Link to="/hr">Manage in HR</Link>
              </Button>
            </div>
            <div className="space-y-2">
              {[...payrollByDept.entries()]
                .sort((a, b) => b[1].total - a[1].total)
                .map(([dept, { count, total }]) => (
                  <div key={dept} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {dept} <span className="text-xs">({count})</span>
                    </span>
                    <span className="font-semibold">{currency(total, true)}</span>
                  </div>
                ))}
              <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
                <span>Total payroll</span>
                <span>{currency(totals.monthlyPayroll, true)}</span>
              </div>
            </div>
          </div>

          {costsByDept.size > 0 ? (
            <div className="surface-card p-5">
              <h2 className="mb-3 font-semibold">Fixed costs by department</h2>
              <div className="space-y-2">
                {[...costsByDept.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([dept, amount]) => (
                    <div key={dept} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{dept}</span>
                      <span className="font-semibold">{currency(amount, true)}</span>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}

          <div className="surface-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Working hours</h2>
              {settings.data ? (
                <RecordDialog
                  table="org_settings"
                  label="Working hours"
                  fields={SETTINGS_FIELDS}
                  record={settings.data}
                  trigger={
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                  }
                />
              ) : null}
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Active employees</dt>
                <dd className="font-semibold">{totals.activeEmployees}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Working days / month</dt>
                <dd className="font-semibold">{totals.workingDays}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Hours / day</dt>
                <dd className="font-semibold">{totals.hoursPerDay}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <dt className="text-muted-foreground">Productive hours / month</dt>
                <dd className="font-semibold">{number(totals.productiveHours)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
