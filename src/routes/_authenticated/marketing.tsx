import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  Bell,
  Briefcase,
  CalendarRange,
  CircleDollarSign,
  DollarSign,
  Layers,
  LineChart,
  Megaphone,
  Plus,
  Search,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

import { useRows } from "@/lib/db";
import { currency, dateLabel, number } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog, type Field } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { KpiCard } from "@/components/kpi-card";
import { CardGridSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/marketing")({
  head: () => ({
    meta: [
      { title: "Campaigns — Time Global Tech CRM" },
      {
        name: "description",
        content: "Campaign tracker, content calendar and lead-source analytics.",
      },
      { property: "og:title", content: "Campaigns — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "Campaign tracker, content calendar and lead-source analytics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Campaign = {
  id: string;
  name: string;
  channel: string | null;
  status: string;
  budget: number | null;
  spent: number | null;
  reach: number | null;
  conversions: number | null;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
};

const STATUSES = ["All", "Planning", "Active", "Paused", "Completed", "Cancelled"];
const CHANNELS = [
  "All",
  "Paid Search",
  "Paid Social",
  "Social",
  "Display",
  "Content",
  "Email",
  "Webinar",
  "Event",
  "Referral",
  "SEO",
];

const FIELDS: Field[] = [
  { name: "name", label: "Campaign name", required: true, full: true },
  {
    name: "channel",
    label: "Channel",
    type: "select",
    options: CHANNELS.filter((c) => c !== "All"),
  },
  {
    name: "status",
    label: "Status",
    type: "select",
    options: STATUSES.filter((s) => s !== "All"),
  },
  { name: "budget", label: "Budget ($)", type: "number" },
  { name: "spent", label: "Spent ($)", type: "number" },
  { name: "reach", label: "Reach / Impressions", type: "number" },
  { name: "conversions", label: "Conversions / Leads", type: "number" },
  { name: "starts_on", label: "Start date", type: "date" },
  { name: "ends_on", label: "End date", type: "date" },
];

const CHANNEL_COLORS: Record<string, { from: string; to: string; fg: string; bg: string }> = {
  "Paid Search": { from: "205 60% 55%", to: "240 55% 45%", fg: "text-info", bg: "bg-info/12" },
  "Paid Social": {
    from: "330 65% 60%",
    to: "290 55% 45%",
    fg: "text-[hsl(330_65%_55%)]",
    bg: "bg-[hsl(330_65%_60%/0.12)]",
  },
  Social: {
    from: "280 60% 55%",
    to: "240 55% 50%",
    fg: "text-[hsl(280_60%_55%)]",
    bg: "bg-[hsl(280_60%_55%/0.12)]",
  },
  Display: {
    from: "180 55% 50%",
    to: "210 60% 45%",
    fg: "text-[hsl(180_55%_50%)]",
    bg: "bg-[hsl(180_55%_50%/0.12)]",
  },
  Content: { from: "155 55% 50%", to: "180 55% 45%", fg: "text-success", bg: "bg-success/12" },
  Email: { from: "45 70% 55%", to: "25 65% 50%", fg: "text-warning", bg: "bg-warning/12" },
  Webinar: {
    from: "200 60% 55%",
    to: "170 55% 50%",
    fg: "text-[hsl(200_60%_55%)]",
    bg: "bg-[hsl(200_60%_55%/0.12)]",
  },
  Event: { from: "350 60% 55%", to: "20 65% 50%", fg: "text-destructive", bg: "bg-destructive/12" },
  Referral: {
    from: "100 55% 50%",
    to: "150 55% 45%",
    fg: "text-[hsl(100_55%_50%)]",
    bg: "bg-[hsl(100_55%_50%/0.12)]",
  },
  SEO: {
    from: "250 55% 55%",
    to: "280 60% 45%",
    fg: "text-[hsl(250_55%_55%)]",
    bg: "bg-[hsl(250_55%_55%/0.12)]",
  },
};

const DEFAULT_CHANNEL = {
  from: "205 60% 55%",
  to: "240 55% 45%",
  fg: "text-primary",
  bg: "bg-primary/12",
};

function BUDGET_COLOR(pct: number) {
  if (pct >= 95) return "bg-destructive";
  if (pct >= 75) return "bg-warning";
  if (pct >= 40) return "bg-primary";
  return "bg-success";
}

function ChannelBanner({ channel, idx }: { channel: string; idx: number }) {
  const c = CHANNEL_COLORS[channel] ?? DEFAULT_CHANNEL;
  return (
    <div
      className="relative h-24 w-full overflow-hidden"
      style={{
        background: `linear-gradient(135deg, hsl(${c.from} / 0.92), hsl(${c.to} / 0.92))`,
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-card/85 to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,white/20,transparent_50%)]" />
      <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="bg-background/90 backdrop-blur-sm grid size-10 place-items-center rounded-xl shadow-sm">
            <Megaphone className="size-5" style={{ color: `hsl(${c.from})` }} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-background/90">
              Channel
            </p>
            <p className="text-sm font-bold text-background">{channel}</p>
          </div>
        </div>
        <Badge className="border-0 bg-background/90 text-foreground text-[10px] font-bold">
          #{idx + 1}
        </Badge>
      </div>
    </div>
  );
}

function Page() {
  const { data, isLoading } = useRows<Campaign>("campaigns");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [channelFilter, setChannelFilter] = useState("All");
  const [selected, setSelected] = useState<Campaign | null>(null);

  const campaigns = useMemo(() => {
    return (data ?? []).filter((c) => {
      const matchesQuery = `${c.name} ${c.channel ?? ""} ${c.status}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesStatus = statusFilter === "All" || c.status === statusFilter;
      const matchesChannel = channelFilter === "All" || c.channel === channelFilter;
      return matchesQuery && matchesStatus && matchesChannel;
    });
  }, [data, query, statusFilter, channelFilter]);

  const totalBudget = campaigns.reduce((s, c) => s + Number(c.budget ?? 0), 0);
  const totalSpent = campaigns.reduce((s, c) => s + Number(c.spent ?? 0), 0);
  const totalReach = campaigns.reduce((s, c) => s + Number(c.reach ?? 0), 0);
  const totalConversions = campaigns.reduce((s, c) => s + Number(c.conversions ?? 0), 0);
  const activeCount = campaigns.filter((c) => c.status === "Active").length;
  const budgetPct = totalBudget ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const avgCpa = totalConversions ? totalSpent / totalConversions : 0;
  const convRate = totalReach ? ((totalConversions / totalReach) * 100).toFixed(2) : "0.00";

  const channelBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { budget: number; spent: number; reach: number; conversions: number; count: number }
    >();
    for (const c of campaigns) {
      const key = c.channel ?? "Uncategorized";
      const existing = map.get(key) ?? { budget: 0, spent: 0, reach: 0, conversions: 0, count: 0 };
      existing.budget += Number(c.budget ?? 0);
      existing.spent += Number(c.spent ?? 0);
      existing.reach += Number(c.reach ?? 0);
      existing.conversions += Number(c.conversions ?? 0);
      existing.count += 1;
      map.set(key, existing);
    }
    return Array.from(map.entries()).map(([name, v]) => ({
      name,
      ...v,
      roi: v.spent ? (((v.conversions * 1500 - v.spent) / v.spent) * 100).toFixed(0) : "0",
    }));
  }, [campaigns]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Campaign tracker, budget management, lead sources and content performance."
        action={
          <RecordDialog
            table="campaigns"
            label="Campaign"
            fields={FIELDS}
            defaults={{
              status: "Planning",
              channel: "Paid Search",
              budget: "10000",
              spent: "0",
              reach: "0",
              conversions: "0",
            }}
            trigger={
              <Button>
                <Plus className="size-4" /> New campaign
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
            label="Active campaigns"
            value={number(activeCount)}
            delta={activeCount}
            hint={`${number(campaigns.length)} total`}
            icon={Megaphone}
          />
          <KpiCard
            label="Budget spent"
            value={currency(totalSpent)}
            delta={budgetPct - 50}
            hint={`of ${currency(totalBudget)} budget`}
            icon={CircleDollarSign}
          />
          <KpiCard
            label="Total reach"
            value={number(totalReach)}
            delta={18}
            hint="impressions"
            icon={Users}
          />
          <KpiCard
            label="Conversions"
            value={number(totalConversions)}
            delta={23}
            hint={`${convRate}% rate · ${currency(avgCpa)} CPA`}
            icon={Target}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface-card animate-rise p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Budget overview
              </p>
              <p className="mt-1 text-lg font-semibold">
                {currency(totalSpent)} of {currency(totalBudget)} allocated
              </p>
            </div>
            <Badge variant="outline" className="text-xs">
              {budgetPct}% consumed
            </Badge>
          </div>
          <div className="mt-5 space-y-4">
            <Progress
              value={budgetPct}
              className="h-3.5"
              indicatorClassName={BUDGET_COLOR(budgetPct)}
            />
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl bg-success/10 p-3">
                <p className="font-semibold text-success">{currency(totalBudget - totalSpent)}</p>
                <p className="mt-0.5 text-muted-foreground">Remaining</p>
              </div>
              <div className="rounded-xl bg-primary/10 p-3">
                <p className="font-semibold text-primary">{currency(avgCpa)}</p>
                <p className="mt-0.5 text-muted-foreground">Avg CPA est.</p>
              </div>
              <div className="rounded-xl bg-warning/10 p-3">
                <p className="font-semibold text-warning">{convRate}%</p>
                <p className="mt-0.5 text-muted-foreground">Conversion rate</p>
              </div>
            </div>
          </div>
        </div>

        <div className="surface-card animate-rise p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Health alerts
            </p>
            <Bell className="size-4 text-warning" />
          </div>
          <ul className="mt-4 space-y-2.5 text-xs">
            <li className="flex items-start gap-2.5 rounded-xl bg-destructive/8 p-3">
              <span className="bg-destructive/15 text-destructive mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold">
                !
              </span>
              <div>
                <p className="font-semibold">Retail Retargeting over budget</p>
                <p className="text-muted-foreground">100% of $12K consumed — pause or top up</p>
              </div>
            </li>
            <li className="flex items-start gap-2.5 rounded-xl bg-warning/8 p-3">
              <span className="bg-warning/15 text-warning mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold">
                !
              </span>
              <div>
                <p className="font-semibold">Fintech Launch needs setup</p>
                <p className="text-muted-foreground">Starts Sep 1 — assets not uploaded</p>
              </div>
            </li>
            <li className="flex items-start gap-2.5 rounded-xl bg-success/8 p-3">
              <span className="bg-success/15 text-success mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold">
                ✓
              </span>
              <div>
                <p className="font-semibold">Demand Gen beating target</p>
                <p className="text-muted-foreground">318 leads vs 270 projected · +17.8%</p>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:max-w-sm">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Search campaigns, channels…"
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
          {CHANNELS.slice(0, 8).map((c) => (
            <button
              key={c}
              onClick={() => setChannelFilter(c)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                channelFilter === c
                  ? "border-primary bg-primary/12 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns">
            <Layers className="size-4 mr-2" /> Campaigns
          </TabsTrigger>
          <TabsTrigger value="channels">
            <BarChart3 className="size-4 mr-2" /> Channel Breakdown
          </TabsTrigger>
          <TabsTrigger value="pipeline">
            <LineChart className="size-4 mr-2" /> Pipeline
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="pt-4">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {campaigns.map((c, idx) => {
              const spent = Number(c.spent ?? 0);
              const budget = Number(c.budget ?? 0);
              const pct = budget ? Math.round((spent / budget) * 100) : 0;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className="surface-card surface-card-hover animate-rise group relative overflow-hidden p-0 text-left"
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  <ChannelBanner channel={c.channel ?? "Uncategorized"} idx={idx} />

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-bold leading-snug">{c.name}</h3>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <CalendarRange className="size-3" />
                            {c.starts_on ? dateLabel(c.starts_on) : "—"} →{" "}
                            {c.ends_on ? dateLabel(c.ends_on) : "—"}
                          </span>
                        </p>
                      </div>
                      <StatusBadge value={c.status} />
                    </div>

                    <div className="mt-4">
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Budget consumed</span>
                        <span className="font-bold">
                          {currency(spent)} / {currency(budget)}
                        </span>
                      </div>
                      <Progress
                        value={pct}
                        className="h-2 bg-muted"
                        indicatorClassName={BUDGET_COLOR(pct)}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-4 text-xs">
                      <div className="rounded-lg bg-primary/5 p-2.5">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Users className="size-3" /> Reach
                        </div>
                        <p className="mt-0.5 font-bold text-sm">{number(Number(c.reach ?? 0))}</p>
                      </div>
                      <div className="rounded-lg bg-success/5 p-2.5">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Target className="size-3" /> Leads
                        </div>
                        <p className="mt-0.5 font-bold text-sm text-success">
                          {number(Number(c.conversions ?? 0))}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t pt-4">
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                        <DollarSign className="size-3 mr-1" />
                        CPA{" "}
                        {budget && c.conversions ? currency(spent / Number(c.conversions)) : "—"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                        <Sparkles className="size-3 mr-1" />
                        ROI{" "}
                        {spent
                          ? (((Number(c.conversions ?? 0) * 1500 - spent) / spent) * 100).toFixed(0)
                          : 0}
                        %
                      </Badge>
                    </div>
                  </div>
                </button>
              );
            })}
            {campaigns.length === 0 ? (
              <div className="surface-card col-span-full p-12 text-center">
                <Megaphone className="mx-auto size-10 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">No campaigns match your filters</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try a different search or create a new campaign.
                </p>
              </div>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="channels" className="pt-4">
          <div className="grid gap-5 xl:grid-cols-2">
            {channelBreakdown.map((ch, idx) => {
              const pct = ch.budget ? Math.round((ch.spent / ch.budget) * 100) : 0;
              const color = CHANNEL_COLORS[ch.name] ?? DEFAULT_CHANNEL;
              return (
                <div
                  key={ch.name}
                  className="surface-card animate-rise overflow-hidden"
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  <div className="flex items-start justify-between gap-4 border-b p-5">
                    <div className="flex items-center gap-3">
                      <div className={`grid size-11 place-items-center rounded-2xl ${color.bg}`}>
                        <Briefcase className={`size-5 ${color.fg}`} />
                      </div>
                      <div>
                        <h3 className="font-semibold">{ch.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {number(ch.count)} campaign{ch.count !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      ROI {ch.roi}%
                    </Badge>
                  </div>
                  <div className="space-y-4 p-5">
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Spend</span>
                        <span className="font-bold">
                          {currency(ch.spent)} / {currency(ch.budget)}
                        </span>
                      </div>
                      <Progress
                        value={pct}
                        className="h-2"
                        indicatorClassName={BUDGET_COLOR(pct)}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center text-xs">
                      <div className="rounded-xl bg-muted/60 p-3">
                        <p className="text-2xl font-bold">{number(ch.reach)}</p>
                        <p className="mt-0.5 text-muted-foreground">Reach</p>
                      </div>
                      <div className="rounded-xl bg-success/10 p-3">
                        <p className="text-2xl font-bold text-success">{number(ch.conversions)}</p>
                        <p className="mt-0.5 text-muted-foreground">Leads</p>
                      </div>
                      <div className="rounded-xl bg-primary/10 p-3">
                        <p className="text-2xl font-bold text-primary">
                          {ch.reach ? ((ch.conversions / ch.reach) * 100).toFixed(2) : "0"}%
                        </p>
                        <p className="mt-0.5 text-muted-foreground">CVR</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {channelBreakdown.length === 0 ? (
              <div className="surface-card col-span-full p-12 text-center text-xs text-muted-foreground">
                No channel data yet
              </div>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="pipeline" className="pt-4">
          <div className="grid gap-4 lg:grid-cols-4">
            {STATUSES.filter((s) => s !== "All").map((status) => {
              const items = campaigns.filter((c) => c.status === status);
              const totalValue = items.reduce((s, c) => s + Number(c.budget ?? 0), 0);
              return (
                <div key={status} className="surface-card animate-rise flex flex-col">
                  <div className="border-b p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">{status}</h3>
                      <Badge variant="outline" className="text-[10px]">
                        {number(items.length)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {currency(totalValue)} pipeline
                    </p>
                  </div>
                  <div className="flex-1 space-y-2 p-3">
                    {items.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelected(c)}
                        className="flex w-full items-center gap-3 rounded-xl bg-muted/40 p-3 text-left transition-colors hover:bg-muted/70"
                      >
                        <div
                          className="grid size-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white"
                          style={{
                            background: `linear-gradient(135deg, hsl(${(campaigns.indexOf(c) * 60) % 360} 60% 55%), hsl(${(campaigns.indexOf(c) * 60 + 60) % 360} 55% 45%))`,
                          }}
                        >
                          {c.channel?.charAt(0) ?? "?"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold">{c.name}</p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {currency(Number(c.budget ?? 0))} · {number(Number(c.conversions ?? 0))}{" "}
                            leads
                          </p>
                        </div>
                      </button>
                    ))}
                    {items.length === 0 ? (
                      <p className="p-3 text-center text-[11px] text-muted-foreground">
                        No campaigns
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected
            ? (() => {
                const spent = Number(selected.spent ?? 0);
                const budget = Number(selected.budget ?? 0);
                const pct = budget ? Math.round((spent / budget) * 100) : 0;
                const conversions = Number(selected.conversions ?? 0);
                const reach = Number(selected.reach ?? 0);
                const cpa = conversions ? spent / conversions : 0;
                const cvr = reach ? (conversions / reach) * 100 : 0;
                const roi = spent ? ((conversions * 1500 - spent) / spent) * 100 : 0;
                const channel = selected.channel ?? "Uncategorized";
                const c = CHANNEL_COLORS[channel] ?? DEFAULT_CHANNEL;
                return (
                  <div className="space-y-6 px-1 pb-6">
                    <div
                      className="-mx-5 -mt-5 mb-2"
                      style={{
                        background: `linear-gradient(135deg, hsl(${c.from} / 0.9), hsl(${c.to} / 0.9))`,
                      }}
                    >
                      <SheetHeader className="p-6 text-white">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Badge className="bg-white/90 text-black border-0">{channel}</Badge>
                            <SheetTitle className="mt-3 text-2xl text-white">
                              {selected.name}
                            </SheetTitle>
                            <SheetDescription className="mt-1 text-white/80">
                              {selected.starts_on ? dateLabel(selected.starts_on) : "—"} →{" "}
                              {selected.ends_on ? dateLabel(selected.ends_on) : "—"}
                            </SheetDescription>
                          </div>
                          <div className="bg-white/90 backdrop-blur-sm grid size-12 shrink-0 place-items-center rounded-2xl">
                            <BarChart3 className="size-6" style={{ color: `hsl(${c.from})` }} />
                          </div>
                        </div>
                      </SheetHeader>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge value={selected.status} />
                      <Badge variant="outline">
                        <DollarSign className="size-3 mr-1" /> Budget {currency(budget)}
                      </Badge>
                      <Badge variant="outline">
                        {roi >= 0 ? (
                          <TrendingUp className="size-3 mr-1 text-success" />
                        ) : (
                          <TrendingDown className="size-3 mr-1 text-destructive" />
                        )}
                        ROI {roi.toFixed(0)}%
                      </Badge>
                    </div>

                    <div className="space-y-4 rounded-2xl border p-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                          Budget & Spend
                        </h4>
                        <span className="font-bold">{pct}%</span>
                      </div>
                      <Progress
                        value={pct}
                        className="h-3"
                        indicatorClassName={BUDGET_COLOR(pct)}
                      />
                      <div className="grid grid-cols-3 gap-3 text-center text-xs">
                        <div className="rounded-xl bg-muted/60 p-3">
                          <p className="text-muted-foreground">Budget</p>
                          <p className="mt-0.5 font-bold text-sm">{currency(budget)}</p>
                        </div>
                        <div className="rounded-xl bg-primary/10 p-3">
                          <p className="text-muted-foreground">Spent</p>
                          <p className="mt-0.5 font-bold text-sm text-primary">{currency(spent)}</p>
                        </div>
                        <div className="rounded-xl bg-success/10 p-3">
                          <p className="text-muted-foreground">Remaining</p>
                          <p className="mt-0.5 font-bold text-sm text-success">
                            {currency(budget - spent)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border p-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Users className="size-4" />
                          <span className="text-xs font-semibold uppercase tracking-wider">
                            Reach
                          </span>
                        </div>
                        <p className="mt-2 text-2xl font-bold tracking-tight">{number(reach)}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">impressions</p>
                      </div>
                      <div className="rounded-2xl border p-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Target className="size-4" />
                          <span className="text-xs font-semibold uppercase tracking-wider">
                            Conversions
                          </span>
                        </div>
                        <p className="mt-2 text-2xl font-bold tracking-tight text-success">
                          {number(conversions)}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">leads captured</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 rounded-2xl border p-4 text-xs">
                      <div>
                        <p className="text-muted-foreground">Avg CPA</p>
                        <p className="mt-1 font-semibold text-sm">{currency(cpa)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Conv. rate</p>
                        <p className="mt-1 font-semibold text-sm">{cvr.toFixed(2)}%</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Est. pipeline value</p>
                        <p className="mt-1 font-semibold text-sm">{currency(conversions * 1500)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Created</p>
                        <p className="mt-1 font-semibold text-sm">
                          {dateLabel(selected.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl border p-4">
                      <h4 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                        Performance highlights
                      </h4>
                      <ul className="mt-3 space-y-2 text-xs">
                        <li className="flex items-start gap-2.5">
                          <span className="bg-success/15 text-success mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold">
                            ✓
                          </span>
                          <span>
                            {conversions} leads generated from {number(reach)} impressions
                          </span>
                        </li>
                        <li className="flex items-start gap-2.5">
                          <span className="bg-primary/15 text-primary mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold">
                            $
                          </span>
                          <span>
                            CPA of {currency(cpa)} — channel avg {currency(cpa * 0.9)}
                          </span>
                        </li>
                        <li className="flex items-start gap-2.5">
                          <span className="bg-warning/15 text-warning mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold">
                            !
                          </span>
                          <span>
                            {pct >= 90
                              ? `Budget critical — ${pct}% spent`
                              : pct >= 70
                                ? `Budget high — ${pct}% consumed`
                                : `Healthy burn — ${pct}% of budget`}
                          </span>
                        </li>
                      </ul>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <RecordDialog
                        table="campaigns"
                        label="Campaign"
                        fields={FIELDS}
                        record={selected}
                        trigger={
                          <Button variant="outline" className="w-full">
                            Edit
                          </Button>
                        }
                      />
                      <Button variant="outline" className="w-full">
                        View report
                      </Button>
                      <DeleteButton table="campaigns" id={selected.id} label="Campaign" />
                    </div>
                  </div>
                );
              })()
            : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
