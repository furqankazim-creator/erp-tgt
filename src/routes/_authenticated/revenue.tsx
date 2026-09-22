import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Briefcase, DollarSign, Repeat, TrendingUp } from "lucide-react";

import { useRows } from "@/lib/db";
import { currency } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { TableSkeleton } from "@/components/loading";

export const Route = createFileRoute("/_authenticated/revenue")({
  head: () => ({
    meta: [
      { title: "Revenue — Time Global Tech CRM" },
      {
        name: "description",
        content: "Recognized revenue pulled together from Deals, Projects and Accounts.",
      },
      { property: "og:title", content: "Revenue — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "Closed-won value, delivery revenue and recurring revenue.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RevenuePage,
});

type Deal = {
  id: string;
  account_id: string | null;
  value: number;
  stage: string;
  close_date: string | null;
};
type Account = { id: string; name: string; status: string; annual_value: number };
type ProjectRow = { id: string; client: string | null; status: string; revenue: number };

function monthLabel(d: Date) {
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

function buildMonthly(won: Deal[]) {
  const now = new Date();
  const buckets: { key: string; period: string; revenue: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, period: monthLabel(d), revenue: 0 });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const deal of won) {
    if (!deal.close_date) continue;
    const cd = new Date(deal.close_date);
    const key = `${cd.getFullYear()}-${cd.getMonth()}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.revenue += Number(deal.value);
  }
  return buckets;
}

function RevenuePage() {
  const { data: dealRows, isLoading: dealsLoading } = useRows<Deal>("deals");
  const { data: accountRows, isLoading: accountsLoading } = useRows<Account>("accounts");
  const { data: projectRows, isLoading: projectsLoading } = useRows<ProjectRow>("projects");

  const deals = dealRows ?? [];
  const accounts = accountRows ?? [];
  const projects = projectRows ?? [];
  const won = deals.filter((d) => d.stage === "Won");

  const closedWonValue = won.reduce((s, d) => s + Number(d.value), 0);
  const deliveryRevenue = projects.reduce((s, p) => s + Number(p.revenue ?? 0), 0);
  const recurringRevenue = accounts
    .filter((a) => a.status === "Active")
    .reduce((s, a) => s + Number(a.annual_value ?? 0), 0);

  const monthly = useMemo(() => buildMonthly(won), [won]);

  const byClient = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of projects) {
      const name = p.client ?? "Unassigned";
      map.set(name, (map.get(name) ?? 0) + Number(p.revenue ?? 0));
    }
    const rows = [...map.entries()]
      .filter(([, revenue]) => revenue > 0)
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue);
    const max = rows.length ? rows[0]!.revenue : 1;
    return rows.map((r) => ({ ...r, pct: Math.round((r.revenue / max) * 100) }));
  }, [projects]);

  const isLoading = dealsLoading || accountsLoading || projectsLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revenue"
        description="Recognized revenue pulled together from Deals, Projects and Accounts — no manual entry."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Closed-won value"
          value={currency(closedWonValue, true)}
          hint="Deals"
          icon={DollarSign}
        />
        <KpiCard
          label="Delivery revenue"
          value={currency(deliveryRevenue, true)}
          hint="from Projects"
          icon={Briefcase}
        />
        <KpiCard
          label="Recurring revenue"
          value={currency(recurringRevenue, true)}
          hint="active account contracts, annualized"
          icon={Repeat}
        />
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : (
        <>
          <div className="surface-card p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <TrendingUp className="text-success size-4" /> Closed-won revenue — last 12 months
            </h2>
            <p className="text-sm text-muted-foreground">
              Won opportunity value grouped by expected close month.
            </p>
            <div className="mt-6 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    vertical={false}
                  />
                  <XAxis dataKey="period" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis
                    stroke="var(--color-muted-foreground)"
                    fontSize={12}
                    tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                    }}
                    formatter={(v: number) => currency(v)}
                  />
                  <Bar dataKey="revenue" fill="var(--color-primary)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="surface-card p-6">
            <h2 className="font-semibold">Delivery revenue by client</h2>
            <p className="text-sm text-muted-foreground">
              Top clients by recognized project revenue.
            </p>
            <div className="mt-5 space-y-2.5">
              {byClient.map((row) => (
                <div key={row.name} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 truncate text-muted-foreground">{row.name}</span>
                  <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                    <div
                      className="gradient-primary h-full rounded-full"
                      style={{ width: `${Math.max(4, row.pct)}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right font-semibold">
                    {currency(row.revenue, true)}
                  </span>
                </div>
              ))}
              {byClient.length === 0 ? (
                <p className="text-sm text-muted-foreground">No delivery revenue recorded yet.</p>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
