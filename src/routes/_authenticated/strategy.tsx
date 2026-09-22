import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  CircleDot,
  Compass,
  Flag,
  Gauge,
  Layers,
  Milestone,
  Plus,
  Search,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  User,
  XCircle,
} from "lucide-react";

import { useRow, useRows } from "@/lib/db";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/strategy")({
  head: () => ({
    meta: [
      { title: "Strategy — Time Global Tech CRM" },
      { name: "description", content: "Company OKRs, roadmap timeline and delivery risk status." },
      { property: "og:title", content: "Strategy — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "Company OKRs, roadmap timeline and delivery risk status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Objective = {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  quarter: string;
  status: string;
  owner: string;
  key_result: string;
  progress: number;
  confidence: number;
  risk: "Low" | "Medium" | "High";
  start_date: string;
  end_date: string;
  milestones: { title: string; status: "Done" | "In Progress" | "Blocked" | "Planned" }[];
  notes: string;
  company_goal_id: string | null;
  review_frequency: string | null;
  next_review_date: string | null;
};

type CompanyStrategy = { id: string; vision: string; mission: string };

type CompanyGoal = {
  id: string;
  title: string;
  description: string | null;
  metric_type: "Revenue" | "Custom";
  target_value: number;
  current_value: number;
  unit: string;
  target_date: string | null;
  status: string;
  review_frequency: string;
  next_review_date: string | null;
  owner: string;
};

type Deal = { id: string; value: number; stage: string };

const METRIC_TYPES = ["Revenue", "Custom"];
const GOAL_STATUSES = ["On Track", "At Risk", "Delayed", "Achieved"];
const CADENCES = ["Annually", "Quarterly", "Monthly", "Weekly"];

const STRATEGY_FIELDS: Field[] = [
  { name: "vision", label: "Vision", type: "textarea", full: true, rows: 3 },
  { name: "mission", label: "Mission", type: "textarea", full: true, rows: 3 },
];

const COMPANY_GOAL_FIELDS: Field[] = [
  { name: "title", label: "Goal title", required: true, full: true, section: "Overview" },
  { name: "description", label: "Description", type: "textarea", full: true },
  {
    name: "metric_type",
    label: "Metric type",
    type: "select",
    options: METRIC_TYPES,
    section: "Target",
  },
  { name: "target_value", label: "Target value", type: "number" },
  { name: "current_value", label: "Current value (Custom goals only)", type: "number" },
  { name: "unit", label: "Unit / currency label", placeholder: "USD, customers, NPS…" },
  { name: "target_date", label: "Target date", type: "date" },
  { name: "status", label: "Status", type: "select", options: GOAL_STATUSES, section: "Tracking" },
  { name: "owner", label: "Owner" },
  { name: "review_frequency", label: "Review cadence", type: "select", options: CADENCES },
  { name: "next_review_date", label: "Next review date", type: "date" },
];

function wonDealsTotal(deals: Deal[]) {
  return deals.filter((d) => d.stage === "Won").reduce((s, d) => s + Number(d.value ?? 0), 0);
}

function formatMetric(value: number, unit: string) {
  return unit === "USD" ? currency(value) : `${number(value)} ${unit}`;
}

function isOverdue(dateStr: string | null, today: string) {
  return Boolean(dateStr && dateStr < today);
}

const STATUSES = ["All", "On Track", "At Risk", "Delayed", "Completed"];
const CATEGORIES = [
  "All",
  "Revenue",
  "Product",
  "Customer",
  "Engineering",
  "Operations",
  "Compliance",
  "People",
];
const QUARTERS = ["All", "Q1 2026", "Q2 2026", "Q3 2026", "Q4 2026", "Q1 2027"];
const RISKS = ["Low", "Medium", "High"] as const;

function buildObjectiveFields(companyGoals: CompanyGoal[]): Field[] {
  return [
    { name: "title", label: "Objective title", required: true, full: true, section: "Overview" },
    {
      name: "category",
      label: "Category",
      type: "select",
      options: CATEGORIES.filter((c) => c !== "All"),
    },
    {
      name: "quarter",
      label: "Quarter / Period",
      type: "select",
      options: QUARTERS.filter((q) => q !== "All"),
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: STATUSES.filter((s) => s !== "All"),
    },
    { name: "owner", label: "Owner" },
    {
      name: "company_goal_id",
      label: "Ladders up to (Company Goal)",
      type: "select",
      options: companyGoals.map((g) => ({ value: g.id, label: g.title })),
    },
    {
      name: "key_result",
      label: "Key result",
      type: "textarea",
      full: true,
      rows: 4,
      section: "Key Results & Metrics",
    },
    { name: "progress", label: "Progress %", type: "number" },
    { name: "confidence", label: "Confidence %", type: "number" },
    {
      name: "risk",
      label: "Risk level",
      type: "select",
      options: RISKS.map((r) => r),
    },
    { name: "start_date", label: "Start date", type: "date", section: "Timeline" },
    { name: "end_date", label: "Target date", type: "date" },
    {
      name: "notes",
      label: "Notes / context",
      type: "textarea",
      full: true,
      rows: 5,
      section: "Context",
    },
    {
      name: "review_frequency",
      label: "Review cadence",
      type: "select",
      options: CADENCES,
      section: "Review cadence",
    },
    { name: "next_review_date", label: "Next review date", type: "date" },
  ];
}

const PROGRESS_COLOR = (p: number) => {
  if (p >= 80) return "bg-success";
  if (p >= 50) return "bg-primary";
  if (p >= 25) return "bg-warning";
  return "bg-destructive";
};

const RISK_COLOR: Record<string, string> = {
  Low: "bg-success/15 text-success border-success/30",
  Medium: "bg-warning/15 text-warning border-warning/30",
  High: "bg-destructive/15 text-destructive border-destructive/30",
};

type CatColor = { from: string; to: string };

const CATEGORY_COLORS: Record<string, CatColor> = {
  Revenue: { from: "145 60% 50%", to: "180 55% 45%" },
  Product: { from: "205 65% 55%", to: "240 55% 48%" },
  Customer: { from: "280 60% 55%", to: "320 55% 48%" },
  Engineering: { from: "250 60% 58%", to: "280 55% 48%" },
  Operations: { from: "40 70% 55%", to: "25 65% 48%" },
  Compliance: { from: "10 55% 52%", to: "350 60% 45%" },
  People: { from: "330 60% 55%", to: "360 55% 48%" },
};

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const DEFAULT_CAT_COLOR: CatColor = { from: "210 55% 55%", to: "240 50% 45%" };

function catColor(category: string): CatColor {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS["Product"] ?? DEFAULT_CAT_COLOR;
}

function ObjBanner({ obj }: { obj: Objective }) {
  const c = catColor(obj.category);
  return (
    <div
      className="relative h-24 w-full overflow-hidden"
      style={{
        background: `linear-gradient(135deg, hsl(${c.from} / 0.9), hsl(${c.to} / 0.9))`,
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-card/85 to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,white/20,transparent_50%)]" />
      <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="bg-background/90 backdrop-blur-sm grid size-10 place-items-center rounded-xl shadow-sm">
            <Compass className="size-5" style={{ color: `hsl(${c.from})` }} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-background/90">
              {obj.quarter}
            </p>
            <p className="text-sm font-bold text-background">{obj.category}</p>
          </div>
        </div>
        <Badge className={`border-0 ${RISK_COLOR[obj.risk]}`}>{obj.risk} Risk</Badge>
      </div>
    </div>
  );
}

function Page() {
  const { data, isLoading } = useRows<Objective>("goals");
  const strategy = useRow<CompanyStrategy>("company_strategy", "default");
  const { data: companyGoalRows, isLoading: companyGoalsLoading } =
    useRows<CompanyGoal>("company_goals");
  const { data: dealRows } = useRows<Deal>("deals");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [quarterFilter, setQuarterFilter] = useState("All");
  const [selected, setSelected] = useState<Objective | null>(null);

  const OBJECTIVES = data ?? [];
  const companyGoals = companyGoalRows ?? [];
  const deals = dealRows ?? [];
  const wonTotal = wonDealsTotal(deals);
  const today = new Date().toISOString().slice(0, 10);
  const OBJECTIVE_FIELDS = buildObjectiveFields(companyGoals);

  const objectives = useMemo(() => {
    return OBJECTIVES.filter((o) => {
      const matchesQuery = `${o.title} ${o.owner} ${o.key_result} ${o.category}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesStatus = statusFilter === "All" || o.status === statusFilter;
      const matchesCat = categoryFilter === "All" || o.category === categoryFilter;
      const matchesQ = quarterFilter === "All" || o.quarter === quarterFilter;
      return matchesQuery && matchesStatus && matchesCat && matchesQ;
    });
  }, [OBJECTIVES, query, statusFilter, categoryFilter, quarterFilter]);

  if (isLoading) return <CardGridSkeleton />;

  const total = OBJECTIVES.length;
  const onTrack = OBJECTIVES.filter((o) => o.status === "On Track").length;
  const atRisk = OBJECTIVES.filter((o) => o.status === "At Risk").length;
  const delayed = OBJECTIVES.filter((o) => o.status === "Delayed").length;
  const highRisk = OBJECTIVES.filter((o) => o.risk === "High").length;
  const avgProgress = Math.round(
    OBJECTIVES.reduce((s, o) => s + o.progress, 0) / OBJECTIVES.length,
  );
  const avgConfidence = Math.round(
    OBJECTIVES.reduce((s, o) => s + o.confidence, 0) / OBJECTIVES.length,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Strategy & OKRs"
        description="Company objectives, key results, roadmap milestones and delivery risk tracking."
        action={
          <RecordDialog
            table="goals"
            label="Objective"
            fields={OBJECTIVE_FIELDS}
            dialogClassName="sm:max-w-4xl"
            defaults={{
              status: "On Track",
              risk: "Medium",
              progress: "0",
              confidence: "50",
            }}
            trigger={
              <Button>
                <Plus className="size-4" /> New objective
              </Button>
            }
          />
        }
      />

      <div className="surface-card animate-rise p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Compass className="text-primary size-5" />
            <h2 className="text-lg font-bold">Vision &amp; Mission</h2>
          </div>
          {strategy.data ? (
            <RecordDialog
              table="company_strategy"
              label="Vision & mission"
              fields={STRATEGY_FIELDS}
              record={strategy.data}
              trigger={
                <Button variant="ghost" size="sm">
                  Edit
                </Button>
              }
            />
          ) : null}
        </div>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Vision
            </p>
            <p className="mt-1.5 text-sm leading-relaxed">
              {strategy.data?.vision || "Not set yet — click Edit to add one."}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Mission
            </p>
            <p className="mt-1.5 text-sm leading-relaxed">
              {strategy.data?.mission || "Not set yet — click Edit to add one."}
            </p>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Company Goals</h2>
            <p className="text-sm text-muted-foreground">
              What Objectives ladder up to — revenue goals track live from Won deals.
            </p>
          </div>
          <RecordDialog
            table="company_goals"
            label="Company goal"
            fields={COMPANY_GOAL_FIELDS}
            defaults={{ metric_type: "Custom", status: "On Track", review_frequency: "Quarterly" }}
            trigger={
              <Button size="sm">
                <Plus className="size-4" /> New goal
              </Button>
            }
          />
        </div>
        {companyGoalsLoading ? (
          <CardGridSkeleton count={3} />
        ) : companyGoals.length === 0 ? (
          <div className="surface-card p-8 text-center text-sm text-muted-foreground">
            No company goals yet — add one to give Objectives something to ladder up to.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {companyGoals.map((g) => {
              const current = g.metric_type === "Revenue" ? wonTotal : Number(g.current_value ?? 0);
              const pct =
                g.target_value > 0
                  ? Math.min(100, Math.round((current / g.target_value) * 100))
                  : 0;
              const overdue = isOverdue(g.next_review_date, today);
              const linked = OBJECTIVES.filter((o) => o.company_goal_id === g.id).length;
              return (
                <div key={g.id} className="surface-card animate-rise p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold leading-snug">{g.title}</h3>
                    <StatusBadge value={g.status} />
                  </div>
                  {g.description ? (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {g.description}
                    </p>
                  ) : null}
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {g.metric_type === "Revenue" ? "Tracked from Won deals" : "Progress"}
                      </span>
                      <span className="font-bold">{pct}%</span>
                    </div>
                    <Progress
                      value={pct}
                      className="h-2"
                      indicatorClassName={PROGRESS_COLOR(pct)}
                    />
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{formatMetric(current, g.unit)}</span>
                      <span>of {formatMetric(g.target_value, g.unit)}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{g.owner}</span>
                    <span
                      className={
                        overdue ? "font-semibold text-destructive" : "text-muted-foreground"
                      }
                    >
                      {overdue ? "Review overdue" : `Next review ${dateLabel(g.next_review_date)}`}
                    </span>
                  </div>
                  {linked > 0 ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {linked} objective{linked === 1 ? "" : "s"} linked
                    </p>
                  ) : null}
                  <div className="mt-3 flex items-center gap-1 border-t border-border pt-3">
                    <RecordDialog
                      table="company_goals"
                      label="Company goal"
                      fields={COMPANY_GOAL_FIELDS}
                      record={g}
                      trigger={
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                          Edit
                        </Button>
                      }
                    />
                    <DeleteButton
                      table="company_goals"
                      id={g.id}
                      label="Company goal"
                      name={g.title}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Avg progress"
          value={`${avgProgress}%`}
          delta={avgProgress - 50}
          hint={`${number(onTrack)} on track`}
          icon={Gauge}
        />
        <KpiCard
          label="Avg confidence"
          value={`${avgConfidence}%`}
          hint="across all OKRs"
          icon={TrendingUp}
        />
        <KpiCard
          label="At risk"
          value={number(atRisk + delayed)}
          delta={-(atRisk + delayed)}
          hint={`${number(highRisk)} high severity`}
          icon={AlertTriangle}
        />
        <KpiCard
          label="Active objectives"
          value={number(total)}
          hint={`${number(OBJECTIVES.filter((o) => o.status === "Completed").length)} complete`}
          icon={Target}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface-card animate-rise p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Portfolio overview
              </p>
              <p className="mt-1 text-lg font-semibold">
                {number(onTrack)} on track · {number(atRisk)} at risk · {number(delayed)} delayed
              </p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-4 gap-3 text-center">
            {(["On Track", "At Risk", "Delayed", "Completed"] as const).map((s) => {
              const count = OBJECTIVES.filter((o) => o.status === s).length;
              const pct = Math.round((count / total) * 100);
              const colors = {
                "On Track": "bg-success/20 text-success border-success/30",
                "At Risk": "bg-warning/20 text-warning border-warning/30",
                Delayed: "bg-destructive/20 text-destructive border-destructive/30",
                Completed: "bg-info/20 text-info border-info/30",
              };
              return (
                <div key={s} className={`rounded-2xl border p-4 ${colors[s]}`}>
                  <p className="text-3xl font-bold">{pct}%</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider opacity-80">
                    {s}
                  </p>
                  <p className="text-[10px] mt-0.5 opacity-70">{count} objectives</p>
                </div>
              );
            })}
          </div>
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Portfolio completion — {avgProgress}%</span>
              <span className="font-bold">Q3 2026</span>
            </div>
            <Progress
              value={avgProgress}
              className="h-3.5"
              indicatorClassName={PROGRESS_COLOR(avgProgress)}
            />
          </div>
        </div>

        <div className="surface-card animate-rise p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Risk heatmap
            </p>
            <Shield className="size-4 text-destructive" />
          </div>
          <ul className="mt-4 space-y-2.5 text-xs">
            {OBJECTIVES.filter((o) => o.risk === "High").map((o) => (
              <li key={o.id} className="flex items-start gap-2.5 rounded-xl bg-destructive/8 p-3">
                <XCircle className="mt-0.5 size-4 text-destructive shrink-0" />
                <div className="min-w-0">
                  <button
                    onClick={() => setSelected(o)}
                    className="font-semibold truncate w-full text-left hover:underline"
                  >
                    {o.title}
                  </button>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {o.owner} · {o.progress}% complete
                  </p>
                </div>
              </li>
            ))}
            {OBJECTIVES.filter((o) => o.risk === "Medium")
              .slice(0, 2)
              .map((o) => (
                <li key={o.id} className="flex items-start gap-2.5 rounded-xl bg-warning/8 p-3">
                  <AlertTriangle className="mt-0.5 size-4 text-warning shrink-0" />
                  <div className="min-w-0">
                    <button
                      onClick={() => setSelected(o)}
                      className="font-semibold truncate w-full text-left hover:underline text-xs"
                    >
                      {o.title}
                    </button>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {o.owner} · conf {o.confidence}%
                    </p>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:max-w-sm">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Search objectives, owners, KRs…"
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
          {CATEGORIES.slice(0, 7).map((c) => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                categoryFilter === c
                  ? "border-primary bg-primary/12 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="objectives">
        <TabsList>
          <TabsTrigger value="objectives">
            <Target className="size-4 mr-2" /> Objectives
          </TabsTrigger>
          <TabsTrigger value="roadmap">
            <Milestone className="size-4 mr-2" /> Roadmap Timeline
          </TabsTrigger>
          <TabsTrigger value="risk">
            <AlertTriangle className="size-4 mr-2" /> Risk Register
          </TabsTrigger>
        </TabsList>

        <TabsContent value="objectives" className="pt-4">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {objectives.map((o, idx) => (
              <button
                key={o.id}
                onClick={() => setSelected(o)}
                className="surface-card surface-card-hover animate-rise group relative overflow-hidden p-0 text-left"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <ObjBanner obj={o} />

                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-bold leading-snug">{o.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                        {o.subtitle}
                      </p>
                    </div>
                    <StatusBadge value={o.status} />
                  </div>

                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-bold">{o.progress}%</span>
                    </div>
                    <Progress
                      value={o.progress}
                      className="h-2 bg-muted"
                      indicatorClassName={PROGRESS_COLOR(o.progress)}
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="bg-primary/10 text-primary grid size-6 place-items-center rounded-lg">
                        <User className="size-3" />
                      </div>
                      <span>{o.owner}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                      conf {o.confidence}%
                    </Badge>
                  </div>

                  {o.company_goal_id || isOverdue(o.next_review_date, today) ? (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
                      {o.company_goal_id ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-primary/30 px-2 py-0.5 text-[10px] text-primary"
                        >
                          <Target className="size-3" />
                          {companyGoals.find((g) => g.id === o.company_goal_id)?.title ??
                            "Company goal"}
                        </Badge>
                      ) : null}
                      {isOverdue(o.next_review_date, today) ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-destructive/30 px-2 py-0.5 text-[10px] text-destructive"
                        >
                          <AlertTriangle className="size-3" /> Review overdue
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-4 text-xs">
                    <div className="rounded-lg bg-primary/5 p-2.5">
                      <p className="text-muted-foreground">Quarter</p>
                      <p className="mt-0.5 font-bold text-sm">{o.quarter}</p>
                    </div>
                    <div className="rounded-lg bg-muted/60 p-2.5">
                      <p className="text-muted-foreground">Milestones</p>
                      <p className="mt-0.5 font-bold text-sm">
                        {(o.milestones ?? []).filter((m) => m.status === "Done").length}/
                        {(o.milestones ?? []).length} done
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 border-t pt-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                      Key Result
                    </p>
                    <p className="text-xs line-clamp-2">{o.key_result}</p>
                  </div>
                </div>
              </button>
            ))}
            {objectives.length === 0 ? (
              <div className="surface-card col-span-full p-12 text-center">
                <Compass className="mx-auto size-10 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">No objectives match your filters</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try a different search or create a new objective.
                </p>
              </div>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="roadmap" className="pt-4">
          <div className="surface-card overflow-hidden">
            <div className="border-b p-5">
              <h3 className="font-semibold">Roadmap timeline</h3>
              <p className="text-sm text-muted-foreground">
                Objectives mapped against target quarters — click any for detail
              </p>
            </div>
            <div className="divide-border divide-y">
              {QUARTERS.filter((q) => q !== "All").map((q) => {
                const items = OBJECTIVES.filter((o) => o.quarter === q);
                if (items.length === 0) return null;
                return (
                  <div key={q} className="px-5 py-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="gradient-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-xl">
                        <Calendar className="size-4" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm">{q}</h4>
                        <p className="text-[11px] text-muted-foreground">
                          {number(items.length)} objective{items.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="ml-12 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((o) => {
                        const c = catColor(o.category);
                        return (
                          <button
                            key={o.id}
                            onClick={() => setSelected(o)}
                            className="rounded-xl border p-3 text-left transition-all hover:border-primary/50 hover:bg-muted/40"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div
                                className="grid size-8 place-items-center rounded-lg text-white shrink-0"
                                style={{
                                  background: `linear-gradient(135deg, hsl(${c.from}), hsl(${c.to}))`,
                                }}
                              >
                                <CircleDot className="size-4" />
                              </div>
                              <StatusBadge value={o.status} />
                            </div>
                            <p className="mt-2.5 text-xs font-semibold line-clamp-2">{o.title}</p>
                            <div className="mt-2">
                              <Progress
                                value={o.progress}
                                className="h-1.5"
                                indicatorClassName={PROGRESS_COLOR(o.progress)}
                              />
                            </div>
                            <div className="mt-2 flex items-center justify-between text-[10px]">
                              <span className="text-muted-foreground">{o.owner}</span>
                              <span className="font-bold">{o.progress}%</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="risk" className="pt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            {(RISKS as readonly (typeof RISKS)[number][]).map((r) => {
              const items = OBJECTIVES.filter((o) => o.risk === r);
              const colors = {
                Low: "border-success/30 bg-success/5",
                Medium: "border-warning/30 bg-warning/5",
                High: "border-destructive/30 bg-destructive/5",
              };
              const icons = { Low: CheckCircle2, Medium: AlertTriangle, High: XCircle };
              const Icon = icons[r];
              const textColors = {
                Low: "text-success",
                Medium: "text-warning",
                High: "text-destructive",
              };
              return (
                <div key={r} className={`surface-card animate-rise border-2 ${colors[r]}`}>
                  <div className="border-b p-5 border-current/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`grid size-10 place-items-center rounded-xl ${textColors[r]}`}
                          style={{ background: "var(--card)" }}
                        >
                          <Icon className="size-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{r} Risk</h3>
                          <p className="text-xs text-muted-foreground">
                            {number(items.length)} objectives
                          </p>
                        </div>
                      </div>
                      <Flag className={`size-5 ${textColors[r]}`} />
                    </div>
                  </div>
                  <div className="divide-border/30 divide-y">
                    {items.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => setSelected(o)}
                        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold truncate">{o.title}</p>
                          <p className="truncate text-[11px] text-muted-foreground mt-0.5">
                            {o.owner} · {o.category}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold">{o.progress}%</p>
                          <p className="text-[10px] text-muted-foreground">progress</p>
                        </div>
                      </button>
                    ))}
                    {items.length === 0 ? (
                      <p className="px-4 py-6 text-center text-[11px] text-muted-foreground">
                        No {r.toLowerCase()} risk objectives 👏
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
                const c = catColor(selected.category);
                return (
                  <div className="space-y-6 px-1 pb-6">
                    <div
                      className="-mx-5 -mt-5 mb-2"
                      style={{
                        background: `linear-gradient(135deg, hsl(${c.from} / 0.92), hsl(${c.to} / 0.92))`,
                      }}
                    >
                      <SheetHeader className="p-6 text-white">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge className="bg-white/90 text-black border-0">
                                {selected.category}
                              </Badge>
                              <Badge className={`border-0 ${RISK_COLOR[selected.risk]}`}>
                                {selected.risk} Risk
                              </Badge>
                            </div>
                            <SheetTitle className="mt-3 text-2xl text-white leading-tight">
                              {selected.title}
                            </SheetTitle>
                            <SheetDescription className="mt-1 text-white/80">
                              {selected.subtitle}
                            </SheetDescription>
                          </div>
                          <div className="bg-white/90 backdrop-blur-sm grid size-12 shrink-0 place-items-center rounded-2xl">
                            <Target className="size-6" style={{ color: `hsl(${c.from})` }} />
                          </div>
                        </div>
                      </SheetHeader>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge value={selected.status} />
                      <Badge variant="outline">
                        <Calendar className="size-3 mr-1" /> {selected.quarter}
                      </Badge>
                      <Badge variant="outline">conf {selected.confidence}%</Badge>
                      {selected.company_goal_id ? (
                        <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
                          <Target className="size-3" />
                          Ladders up to:{" "}
                          {companyGoals.find((g) => g.id === selected.company_goal_id)?.title ??
                            "Company goal"}
                        </Badge>
                      ) : null}
                      {isOverdue(selected.next_review_date, today) ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-destructive/30 text-destructive"
                        >
                          <AlertTriangle className="size-3" /> Review overdue
                        </Badge>
                      ) : selected.next_review_date ? (
                        <Badge variant="outline" className="gap-1">
                          <Calendar className="size-3" /> Next review{" "}
                          {dateLabel(selected.next_review_date)}
                        </Badge>
                      ) : null}
                    </div>

                    <div className="space-y-4 rounded-2xl border p-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                            Overall progress
                          </h4>
                          <span className="font-bold text-lg">{selected.progress}%</span>
                        </div>
                        <Progress
                          value={selected.progress}
                          className="h-3"
                          indicatorClassName={PROGRESS_COLOR(selected.progress)}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="rounded-xl bg-success/10 p-3">
                          <div className="flex items-center gap-1.5 text-success">
                            <Milestone className="size-4" /> Owner
                          </div>
                          <p className="mt-1 text-sm font-bold">{selected.owner}</p>
                        </div>
                        <div className="rounded-xl bg-primary/10 p-3">
                          <div className="flex items-center gap-1.5 text-primary">
                            <Layers className="size-4" /> Category
                          </div>
                          <p className="mt-1 text-sm font-bold">{selected.category}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 rounded-2xl border p-4">
                      <h4 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                        Key Result
                      </h4>
                      <div className="rounded-xl bg-primary/5 p-4 border border-primary/20">
                        <Sparkles className="size-4 text-primary mb-2" />
                        <p className="text-sm font-medium leading-relaxed">{selected.key_result}</p>
                      </div>
                    </div>

                    <div className="space-y-3 rounded-2xl border p-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                          Milestones
                        </h4>
                        <span className="text-[11px] font-semibold">
                          {(selected.milestones ?? []).filter((m) => m.status === "Done").length} of{" "}
                          {(selected.milestones ?? []).length} complete
                        </span>
                      </div>
                      {(selected.milestones ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No milestones added yet.</p>
                      ) : null}
                      <ol className="space-y-2.5">
                        {(selected.milestones ?? []).map((m, i) => {
                          const statusStyles = {
                            Done: "border-success/30 bg-success/5",
                            "In Progress": "border-primary/30 bg-primary/5",
                            Blocked: "border-destructive/30 bg-destructive/5",
                            Planned: "border-muted bg-muted/40",
                          };
                          const statusIcons = {
                            Done: CheckCircle2,
                            "In Progress": CircleDot,
                            Blocked: XCircle,
                            Planned: Layers,
                          };
                          const statusText = {
                            Done: "text-success",
                            "In Progress": "text-primary",
                            Blocked: "text-destructive",
                            Planned: "text-muted-foreground",
                          };
                          const Icon = statusIcons[m.status];
                          return (
                            <li
                              key={i}
                              className={`flex items-start gap-3 rounded-xl border p-3 ${statusStyles[m.status]}`}
                            >
                              <Icon className={`mt-0.5 size-4 shrink-0 ${statusText[m.status]}`} />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold">{m.title}</p>
                                <p
                                  className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${statusText[m.status]}`}
                                >
                                  {m.status}
                                </p>
                              </div>
                              <span className="text-[10px] font-bold text-muted-foreground/60">
                                {i + 1}/{(selected.milestones ?? []).length}
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>

                    <div className="grid grid-cols-2 gap-3 rounded-2xl border p-4 text-xs">
                      <div>
                        <p className="text-muted-foreground">Start date</p>
                        <p className="mt-1 font-semibold text-sm">{selected.start_date}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Target date</p>
                        <p className="mt-1 font-semibold text-sm">{selected.end_date}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-muted-foreground">Owner</p>
                        <div className="mt-1.5 flex items-center gap-2.5">
                          <Avatar className="size-8">
                            <AvatarFallback className="gradient-primary text-primary-foreground text-xs font-bold">
                              {initials(selected.owner)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-semibold text-sm">{selected.owner}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-2xl border p-4">
                      <h4 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                        Context & Notes
                      </h4>
                      <p className="text-sm leading-relaxed">{selected.notes}</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <RecordDialog
                        table="goals"
                        label="Objective"
                        fields={OBJECTIVE_FIELDS}
                        dialogClassName="sm:max-w-4xl"
                        record={selected}
                        trigger={
                          <Button variant="outline" className="w-full">
                            Edit
                          </Button>
                        }
                      />
                      <Button variant="outline" className="w-full">
                        Share
                      </Button>
                      <DeleteButton table="goals" id={selected.id} label="Objective" />
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
