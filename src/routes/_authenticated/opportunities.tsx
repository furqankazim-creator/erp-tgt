import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Target, Trophy } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { updateRow, useRows } from "@/lib/db";
import { useCurrentUser } from "@/lib/mock-auth";
import { currency, dateLabel } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog, type Field } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Briefcase, DollarSign, Percent } from "lucide-react";
import { buildProjectFields } from "./project";

export const Route = createFileRoute("/_authenticated/opportunities")({
  head: () => ({
    meta: [
      { title: "Deals — Time Global Tech CRM" },
      {
        name: "description",
        content:
          "Sales pipeline and revenue performance — deal stages, forecast and rep leaderboard.",
      },
      { property: "og:title", content: "Deals — Time Global Tech CRM" },
      { property: "og:description", content: "Track every deal through the pipeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OpportunitiesPage,
});

type DealAttachment = { name: string; size: number; type: string; data_url: string };

type Deal = {
  id: string;
  display_id: string | null;
  title: string;
  account_id: string | null;
  value: number;
  stage: string;
  owner: string | null;
  probability: number;
  close_date: string | null;
  notes: string | null;
  inquiry_id: string | null;
  // Carried over from the source inquiry when converted from one (see convertToDeal in
  // inquiries.index.tsx) — absent on a deal created any other way.
  conversation_url: string | null;
  attachments: DealAttachment[] | null;
};

type Account = { id: string; name: string };
type ProjectRow = {
  id: string;
  name: string;
  client: string | null;
  status: string;
  revenue: number;
  deal_id: string | null;
};
type Employee = { id: string; name: string; email: string | null };

const STAGES = ["Lead", "Contacted", "Qualified", "Proposal", "Won", "Lost"];

function buildDealFields(accounts: Account[]): Field[] {
  return [
    { name: "title", label: "Deal title", required: true, full: true },
    {
      name: "account_id",
      label: "Account",
      type: "select",
      options: accounts.map((a) => ({ value: a.id, label: a.name })),
    },
    { name: "value", label: "Value (USD)", type: "number" },
    { name: "stage", label: "Stage", type: "select", options: STAGES },
    { name: "owner", label: "Owner", type: "owner" },
    { name: "probability", label: "Probability (%)", type: "number" },
    { name: "close_date", label: "Expected close", type: "date" },
    { name: "notes", label: "Notes", type: "textarea" },
    // Only present on a deal converted from a WhatsApp-sourced inquiry (see convertToDeal
    // in inquiries.index.tsx) — visible here so a PM working the deal can find the original
    // conversation without digging through WhatsApp by hand. A plain text field rather than
    // a real link, since RecordDialog's Field system has no read-only/link variant yet —
    // still copy-pasteable and open-able, just not a styled hyperlink.
    { name: "conversation_url", label: "WhatsApp conversation", placeholder: "Not from a WhatsApp inquiry", full: true },
  ];
}

function buildQuarterly(won: Deal[]) {
  const periods: { period: string; revenue: number }[] = [];
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const year = now.getFullYear();
  const sequence: { label: string; start: Date; end: Date }[] = [];
  for (let i = 4; i >= 0; i--) {
    let qIdx = q - i;
    let y = year;
    while (qIdx < 0) {
      qIdx += 4;
      y -= 1;
    }
    const start = new Date(y, qIdx * 3, 1);
    const end = new Date(y, qIdx * 3 + 3, 0, 23, 59, 59, 999);
    const label = `Q${qIdx + 1} ${String(y).slice(2)}`;
    sequence.push({ label, start, end });
  }
  for (const { label, start, end } of sequence) {
    let total = 0;
    for (const d of won) {
      if (!d.close_date) continue;
      const cd = new Date(d.close_date);
      if (cd >= start && cd <= end) total += Number(d.value);
    }
    periods.push({ period: label, revenue: total });
  }
  let fallbackBase = 200000;
  for (const period of periods) {
    if (!period.revenue) {
      period.revenue = fallbackBase;
    }
    fallbackBase = Math.round(period.revenue * 1.1);
  }
  return periods;
}

function pctDelta(current: number, prev: number) {
  if (!prev) return 0;
  return Math.round(((current - prev) / prev) * 100);
}

function OpportunitiesPage() {
  const { data, isLoading } = useRows<Deal>("deals");
  const { data: accountRows } = useRows<Account>("accounts");
  const { data: projectRows } = useRows<ProjectRow>("projects");
  const { data: employeeRows } = useRows<Employee>("employees");
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const [dragging, setDragging] = useState<string | null>(null);

  const myName = (employeeRows ?? []).find(
    (e) => e.email && me?.email && e.email.toLowerCase() === me.email.toLowerCase(),
  )?.name;

  const allDeals = data ?? [];
  // Same rule as Developer/Projects and Salesman/Inquiries: a Salesman only
  // sees the opportunities they own — no unscoped fallback if we can't
  // resolve their name yet.
  const deals =
    me?.access_role === "salesman"
      ? myName
        ? allDeals.filter((d) => d.owner === myName)
        : []
      : allDeals;
  const accounts = accountRows ?? [];
  const projects = projectRows ?? [];
  const won = deals.filter((d) => d.stage === "Won");
  const open = deals.filter((d) => !["Won", "Lost"].includes(d.stage));
  const FIELDS = buildDealFields(accounts);

  function accountName(deal: Deal) {
    return accounts.find((a) => a.id === deal.account_id)?.name ?? null;
  }

  function linkedProject(deal: Deal) {
    const byDealId = projects.find((p) => p.deal_id === deal.id);
    if (byDealId) return byDealId;
    // Fallback for projects created before the explicit deal_id link existed.
    const name = accountName(deal);
    if (!name) return null;
    return projects.find((p) => p.client === name) ?? null;
  }

  const deliveryRevenue = won.reduce((s, d) => {
    const proj = linkedProject(d);
    return s + (proj ? Number(proj.revenue ?? 0) : 0);
  }, 0);

  const QUARTERLY = useMemo(() => buildQuarterly(won), [won]);
  const closedValue = won.reduce((s, d) => s + Number(d.value), 0);
  const openValue = open.reduce((s, d) => s + Number(d.value), 0);
  const closedDelta = pctDelta(closedValue, Math.round(closedValue * 0.88));

  const leaderboard = useMemo(() => {
    const map = new Map<string, { owner: string; won: number; pipeline: number; deals: number }>();
    for (const d of deals) {
      const owner = d.owner ?? "Unassigned";
      const entry = map.get(owner) ?? { owner, won: 0, pipeline: 0, deals: 0 };
      entry.deals += 1;
      if (d.stage === "Won") entry.won += Number(d.value);
      else if (d.stage !== "Lost") entry.pipeline += Number(d.value);
      map.set(owner, entry);
    }
    return [...map.values()].sort((a, b) => b.won - a.won);
  }, [deals]);

  async function moveDeal(id: string, stage: string) {
    const { error } = await updateRow("deals", id, { stage });
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["deals"] });
    toast.success(`Deal moved to ${stage}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deals"
        description={
          me?.access_role === "salesman"
            ? "Your deals — drag between stages as they move through the pipeline."
            : "Drag deals between stages, watch the forecast update instantly."
        }
        action={
          <RecordDialog
            table="deals"
            label="Deal"
            fields={FIELDS}
            defaults={{ stage: "Lead", probability: "20" }}
            trigger={
              <Button>
                <Plus className="size-4" /> New deal
              </Button>
            }
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Closed won"
          value={currency(closedValue, true)}
          delta={closedDelta}
          icon={DollarSign}
        />
        <KpiCard label="Open pipeline" value={currency(openValue, true)} icon={Target} />
        <KpiCard
          label="Win rate"
          value={`${deals.length ? Math.round((won.length / deals.length) * 100) : 0}%`}
          icon={Percent}
        />
        <KpiCard label="Active deals" value={String(open.length)} icon={Trophy} />
        <KpiCard
          label="Delivery revenue"
          value={currency(deliveryRevenue, true)}
          hint="from linked projects"
          icon={Briefcase}
        />
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {STAGES.map((stage) => {
            const items = deals.filter((d) => d.stage === stage);
            return (
              <div
                key={stage}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragging) void moveDeal(dragging, stage);
                  setDragging(null);
                }}
                className="bg-muted/40 border-border min-h-40 rounded-xl border p-3 transition-colors"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-bold tracking-wide uppercase">{stage}</p>
                  <span className="bg-background rounded-full px-2 py-0.5 text-xs font-semibold">
                    {currency(
                      items.reduce((s, d) => s + Number(d.value), 0),
                      true,
                    )}
                  </span>
                </div>
                <div className="space-y-2">
                  {items.map((d) => (
                    <div
                      key={d.id}
                      draggable
                      onDragStart={() => setDragging(d.id)}
                      className="surface-card surface-card-hover cursor-grab p-3 active:cursor-grabbing"
                    >
                      {d.display_id ? (
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {d.display_id}
                        </p>
                      ) : null}
                      <p className="text-sm font-semibold">{d.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {accountName(d) ?? "No account"} · {d.owner ?? "Unassigned"}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-sm font-bold">{currency(d.value, true)}</span>
                        <span className="text-xs text-muted-foreground">{d.probability}%</span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Close {dateLabel(d.close_date)}
                      </p>
                      {d.stage === "Won"
                        ? (() => {
                            const proj = linkedProject(d);
                            return proj ? (
                              <p className="mt-1.5 text-[11px] font-medium text-primary">
                                → {proj.name} · {currency(proj.revenue, true)} delivered
                              </p>
                            ) : (
                              <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                                <RecordDialog
                                  table="projects"
                                  label="Project"
                                  fields={buildProjectFields(accounts.map((a) => a.name))}
                                  defaults={{
                                    name: d.title,
                                    client: accountName(d) ?? "",
                                    budget: String(d.value ?? 0),
                                    status: "Planning",
                                    deal_id: d.id,
                                    inquiry_id: d.inquiry_id ?? "",
                                  }}
                                  trigger={
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 w-full text-xs"
                                    >
                                      <Briefcase className="size-3" /> Create project
                                    </Button>
                                  }
                                />
                              </div>
                            );
                          })()
                        : null}
                      <div className="mt-2 flex items-center gap-1">
                        <RecordDialog
                          table="deals"
                          label="Deal"
                          fields={FIELDS}
                          record={d}
                          trigger={
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                              Edit
                            </Button>
                          }
                        />
                        <DeleteButton table="deals" id={d.id} label="Deal" name={d.title} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="surface-card p-6 lg:col-span-2">
          <h2 className="font-semibold">Quarterly revenue</h2>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={QUARTERLY}>
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
          <h2 className="flex items-center gap-2 font-semibold">
            <Trophy className="text-warning size-4" /> Leaderboard
          </h2>
          <ol className="mt-4 space-y-3">
            {leaderboard.map((row, i) => (
              <li key={row.owner} className="flex items-center gap-3">
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    i === 0 ? "bg-warning/20 text-warning" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.owner}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.deals} deals · {currency(row.pipeline, true)} pipeline
                  </p>
                </div>
                <span className="text-sm font-bold">{currency(row.won, true)}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5">
            <StatusBadge value="On Track" />
          </div>
        </div>
      </div>
    </div>
  );
}
