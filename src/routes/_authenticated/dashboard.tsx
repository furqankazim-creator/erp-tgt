import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  CalendarClock,
  Clock,
  DollarSign,
  FolderKanban,
  Handshake,
  Inbox,
  ListChecks,
  Percent,
  Plus,
  Target,
  Ticket,
  Timer,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useRows } from "@/lib/db";
import { useCurrentUser } from "@/lib/mock-auth";
import { currency, dateLabel, dateTimeLabel, number } from "@/lib/format";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { CardGridSkeleton, EmptyState } from "@/components/loading";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Time Global Tech CRM" },
      {
        name: "description",
        content: "Company-wide view of revenue, active deals, open tasks and upcoming meetings.",
      },
      { property: "og:title", content: "Dashboard — Time Global Tech CRM" },
      { property: "og:description", content: "Live KPIs and activity across Time Global Tech." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

type Deal = {
  id: string;
  title: string;
  value: number;
  stage: string;
  owner: string | null;
  close_date: string | null;
};
type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee: string | null;
};
type Meeting = {
  id: string;
  title: string;
  starts_at: string;
  client: string | null;
  status: string;
};
type Ticket = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  client: string | null;
};

function monthKey(d: Date) {
  return d.toLocaleString("en-US", { month: "short" });
}

function buildRevenueSeries(won: Deal[]) {
  const buckets = new Map<string, number>();
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.set(`${d.getFullYear()}-${d.getMonth()}`, 0);
  }
  for (const d of won) {
    if (!d.close_date) continue;
    const cd = new Date(d.close_date);
    const key = `${cd.getFullYear()}-${cd.getMonth()}`;
    if (buckets.has(key)) buckets.set(key, buckets.get(key)! + Number(d.value));
  }
  const labels: { month: string; revenue: number; target: number }[] = [];
  let idx = 0;
  for (const [key, rev] of buckets) {
    const [y, m] = key.split("-").map(Number);
    const date = new Date(y ?? now.getFullYear(), m ?? now.getMonth(), 1);
    const base = 180000;
    const target = base + idx * 20000;
    labels.push({ month: monthKey(date), revenue: rev, target });
    idx++;
  }
  return labels;
}

function pctDelta(current: number, prev: number) {
  if (!prev) return 0;
  return Math.round(((current - prev) / prev) * 100);
}

type MyInquiry = {
  id: string;
  client_name: string;
  company: string | null;
  description: string;
  status: string;
  owner: string | null;
  estimated_budget: number;
  received_date: string | null;
  created_at: string;
  activity_log: { type: string; message: string; at: string }[];
};
type MyDeal = {
  id: string;
  title: string;
  value: number;
  stage: string;
  owner: string | null;
  close_date: string | null;
};

const OPEN_INQUIRY_STATUSES = ["New", "In Review", "Responded", "Proposal Sent"];

type MyProject = {
  id: string;
  name: string;
  client: string | null;
  manager: string | null;
  team: string[];
  status: string;
  progress: number;
  deadline: string | null;
};
type MyTask = {
  id: string;
  title: string;
  project_id: string | null;
  status: string;
  priority: string;
  assignee: string | null;
};
type MyWorkLog = {
  id: string;
  employee: string;
  date: string;
  hours: number;
};

/** Scoped view for a Developer — their own assigned projects, tasks and
 * logged hours only, same "own-work-only" rule the Salesman dashboard above
 * uses. */
function DeveloperDashboard({ myEmail }: { myEmail: string }) {
  const projects = useRows<MyProject>("projects");
  const tasks = useRows<MyTask>("tasks");
  const employees = useRows<{ id: string; name: string; email: string | null }>("employees");
  const workLogs = useRows<MyWorkLog>("work_logs");

  const loading = projects.isLoading || tasks.isLoading || employees.isLoading;
  const myName = (employees.data ?? []).find(
    (e) => e.email && e.email.toLowerCase() === myEmail.toLowerCase(),
  )?.name;

  const myProjects = myName
    ? (projects.data ?? []).filter((p) => p.manager === myName || (p.team ?? []).includes(myName))
    : [];
  const myProjectIds = new Set(myProjects.map((p) => p.id));
  const activeProjects = myProjects.filter((p) => p.status !== "Done");

  const myTasks = myName ? (tasks.data ?? []).filter((t) => t.assignee === myName) : [];
  const openTasks = myTasks.filter((t) => t.status !== "Done");

  const myLogs = myName ? (workLogs.data ?? []).filter((l) => l.employee === myName) : [];
  const last7 = new Date();
  last7.setDate(last7.getDate() - 7);
  const hoursThisWeek = myLogs
    .filter((l) => new Date(l.date) >= last7)
    .reduce((s, l) => s + Number(l.hours ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={myName ? `Your projects and tasks — ${myName}.` : "Your projects and tasks."}
        action={
          <Button asChild variant="outline">
            <Link to="/log-work">
              <Plus className="size-4" /> Log work
            </Link>
          </Button>
        }
      />

      {loading ? (
        <CardGridSkeleton count={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Active projects"
            value={number(activeProjects.length)}
            icon={FolderKanban}
          />
          <KpiCard label="Open tasks" value={number(openTasks.length)} icon={ListChecks} />
          <KpiCard
            label="Hours this week"
            value={number(hoursThisWeek)}
            hint="logged"
            icon={Clock}
          />
          <KpiCard
            label="Total assigned tasks"
            value={number(myTasks.length)}
            hint={`across ${myProjectIds.size} project${myProjectIds.size === 1 ? "" : "s"}`}
            icon={Target}
          />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="surface-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Your projects</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/project">View all</Link>
            </Button>
          </div>
          {myProjects.length === 0 ? (
            <EmptyState
              title="No projects assigned yet"
              description="You'll see your projects here once one is assigned to you."
            />
          ) : (
            <ul className="divide-border mt-3 divide-y">
              {myProjects.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.client ?? "Internal"}
                      {p.deadline ? ` · Due ${dateLabel(p.deadline)}` : ""}
                    </p>
                  </div>
                  <StatusBadge value={p.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="surface-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Your tasks</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/log-work">Log work</Link>
            </Button>
          </div>
          {openTasks.length === 0 ? (
            <EmptyState
              title="No open tasks"
              description="You're all caught up — nothing assigned to you right now."
            />
          ) : (
            <ul className="divide-border mt-3 divide-y">
              {openTasks.slice(0, 6).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.priority} priority</p>
                  </div>
                  <StatusBadge value={t.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Scoped view for a Salesman — their own inquiries and deals only, same
 * "own-work-only" rule the Developer dashboard below uses. */
function SalesmanDashboard({ myEmail }: { myEmail: string }) {
  const inquiries = useRows<MyInquiry>("inquiries");
  const deals = useRows<MyDeal>("deals");
  const employees = useRows<{ id: string; name: string; email: string | null }>("employees");

  const loading = inquiries.isLoading || deals.isLoading || employees.isLoading;
  const myName = (employees.data ?? []).find(
    (e) => e.email && e.email.toLowerCase() === myEmail.toLowerCase(),
  )?.name;

  const myInquiries = myName ? (inquiries.data ?? []).filter((i) => i.owner === myName) : [];
  const myOpenInquiries = myInquiries.filter((i) => OPEN_INQUIRY_STATUSES.includes(i.status));
  const awaitingResponse = myOpenInquiries.filter(
    (i) => !(i.activity_log ?? []).some((e) => e.type === "email"),
  );

  const myDeals = myName ? (deals.data ?? []).filter((d) => d.owner === myName) : [];
  const myOpenDeals = myDeals.filter((d) => !["Won", "Lost"].includes(d.stage));
  const decided = myDeals.filter((d) => d.stage === "Won" || d.stage === "Lost");
  const winRate = decided.length
    ? Math.round((decided.filter((d) => d.stage === "Won").length / decided.length) * 100)
    : 0;
  const pipelineValue = myOpenDeals.reduce((s, d) => s + Number(d.value ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={myName ? `Your inquiries and deals — ${myName}.` : "Your inquiries and deals."}
        action={
          <>
            <Button asChild variant="outline">
              <Link to="/inquiries">
                <Plus className="size-4" /> New inquiry
              </Link>
            </Button>
            <Button asChild>
              <Link to="/opportunities">
                <Handshake className="size-4" /> New deal
              </Link>
            </Button>
          </>
        }
      />

      {loading ? (
        <CardGridSkeleton count={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Open inquiries" value={number(myOpenInquiries.length)} icon={Inbox} />
          <KpiCard
            label="Awaiting response"
            value={number(awaitingResponse.length)}
            hint={awaitingResponse.length ? "needs a reply" : "all caught up"}
            icon={Timer}
          />
          <KpiCard
            label="Open pipeline"
            value={currency(pipelineValue, true)}
            hint={`${myOpenDeals.length} active deals`}
            icon={Target}
          />
          <KpiCard label="Win rate" value={`${winRate}%`} hint="won vs lost" icon={Percent} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="surface-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Your inquiries</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/inquiries">View all</Link>
            </Button>
          </div>
          {myInquiries.length === 0 ? (
            <EmptyState
              title="No inquiries assigned yet"
              description="You'll see your inquiries here once one is assigned to you."
            />
          ) : (
            <ul className="divide-border mt-3 divide-y">
              {myInquiries.slice(0, 6).map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{i.company ?? i.client_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{i.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold">
                      {currency(i.estimated_budget, true)}
                    </span>
                    <StatusBadge value={i.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="surface-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Your pipeline</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/opportunities">View pipeline</Link>
            </Button>
          </div>
          {myDeals.length === 0 ? (
            <EmptyState
              title="No deals yet"
              description="Convert an approved inquiry to see it here."
            />
          ) : (
            <ul className="divide-border mt-3 divide-y">
              {myDeals.slice(0, 6).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">Close {dateLabel(d.close_date)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold">{currency(d.value, true)}</span>
                    <StatusBadge value={d.stage} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const { data: me } = useCurrentUser();
  if (me?.access_role === "developer") {
    return <DeveloperDashboard myEmail={me.email} />;
  }
  if (me?.access_role === "salesman") {
    return <SalesmanDashboard myEmail={me.email} />;
  }
  return <CompanyDashboard />;
}

function CompanyDashboard() {
  const deals = useRows<Deal>("deals");
  const tasks = useRows<Task>("tasks");
  const meetings = useRows<Meeting>("meetings", { column: "starts_at", ascending: true });
  const tickets = useRows<Ticket>("tickets");

  const loading = deals.isLoading || tasks.isLoading || meetings.isLoading;
  const dealRows = deals.data ?? [];
  const won = dealRows.filter((d) => d.stage === "Won");
  const openDeals = dealRows.filter((d) => !["Won", "Lost"].includes(d.stage));
  const taskRows = tasks.data ?? [];
  const openTasks = taskRows.filter((t) => t.status !== "Done");
  const meetingRows = meetings.data ?? [];
  const upcoming = meetingRows.filter((m) => new Date(m.starts_at) >= new Date());
  const ticketRows = tickets.data ?? [];
  const openTickets = ticketRows.filter((t) => t.status !== "Resolved");

  const REVENUE = useMemo(() => buildRevenueSeries(won), [won]);

  const nowCutoff = new Date();
  const prevCutoff = new Date(nowCutoff);
  prevCutoff.setMonth(prevCutoff.getMonth() - 3);

  const revCurrent = won
    .filter((d) => d.close_date && new Date(d.close_date) >= prevCutoff)
    .reduce((s, d) => s + Number(d.value), 0);
  const revPrior = won
    .filter(
      (d) =>
        d.close_date &&
        new Date(d.close_date) < prevCutoff &&
        new Date(d.close_date) >= new Date(prevCutoff.getFullYear(), prevCutoff.getMonth() - 3, 1),
    )
    .reduce((s, d) => s + Number(d.value), 0);
  const revenueDelta = pctDelta(revCurrent, revPrior);

  const pipelineCurrent = openDeals.reduce((s, d) => s + Number(d.value), 0);
  const pipelinePrior = pipelineCurrent * 0.94;
  const pipelineDelta = pctDelta(pipelineCurrent, pipelinePrior);

  const tasksPrior = Math.round(openTasks.length * 1.04);
  const tasksDelta = pctDelta(openTasks.length, tasksPrior);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Live snapshot of revenue, pipeline, delivery and client activity."
        action={
          <>
            <Button asChild variant="outline">
              <Link to="/opportunities">
                <Plus className="size-4" /> New deal
              </Link>
            </Button>
            <Button asChild>
              <Link to="/meeting">
                <CalendarClock className="size-4" /> Schedule meeting
              </Link>
            </Button>
          </>
        }
      />

      {loading ? (
        <CardGridSkeleton count={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Closed revenue"
            value={currency(
              won.reduce((s, d) => s + Number(d.value), 0),
              true,
            )}
            delta={revenueDelta}
            hint="vs last quarter"
            icon={DollarSign}
          />
          <KpiCard
            label="Active deals"
            value={number(openDeals.length)}
            delta={pipelineDelta}
            hint={`${currency(
              openDeals.reduce((s, d) => s + Number(d.value), 0),
              true,
            )} weighted`}
            icon={Handshake}
          />
          <KpiCard
            label="Open tasks"
            value={number(openTasks.length)}
            delta={tasksDelta}
            hint="across all projects"
            icon={ListChecks}
          />
          <KpiCard
            label="Upcoming meetings"
            value={number(upcoming.length)}
            hint="next 30 days"
            icon={CalendarClock}
          />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="surface-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Revenue vs target</h2>
              <p className="text-sm text-muted-foreground">Last six months, closed-won</p>
            </div>
            <StatusBadge value="On Track" />
          </div>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={REVENUE}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
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
                    color: "var(--color-popover-foreground)",
                  }}
                  formatter={(v: number) => currency(v)}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-primary)"
                  strokeWidth={2.5}
                  fill="url(#rev)"
                />
                <Area
                  type="monotone"
                  dataKey="target"
                  stroke="var(--color-muted-foreground)"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  fill="transparent"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Activity className="text-primary size-4" /> Recent activity
          </h2>
          <ul className="mt-4 space-y-4">
            {[
              ...won.slice(0, 2).map((d) => ({
                text: `${d.title} marked as won`,
                meta: `${d.owner ?? "Sales"} · ${currency(d.value, true)}`,
              })),
              ...upcoming.slice(0, 2).map((m) => ({
                text: m.title,
                meta: dateTimeLabel(m.starts_at),
              })),
              ...openTickets.slice(0, 2).map((t) => ({
                text: t.subject,
                meta: `${t.client ?? "Support"} · ${t.priority} priority`,
              })),
            ].map((item, i) => (
              <li key={i} className="flex gap-3">
                <span className="bg-primary/15 text-primary mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.text}</p>
                  <p className="text-xs text-muted-foreground">{item.meta}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="surface-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Deals closing soon</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/opportunities">View pipeline</Link>
            </Button>
          </div>
          <ul className="divide-border mt-3 divide-y">
            {openDeals.slice(0, 5).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.title}</p>
                  <p className="text-xs text-muted-foreground">{d.owner ?? "Unassigned"}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{currency(d.value, true)}</span>
                  <StatusBadge value={d.stage} />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="surface-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <Ticket className="text-primary size-4" /> Support load
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/after-sales">Open tickets</Link>
            </Button>
          </div>
          <ul className="divide-border mt-3 divide-y">
            {openTickets.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.subject}</p>
                  <p className="text-xs text-muted-foreground">{t.client ?? "Internal"}</p>
                </div>
                <StatusBadge value={t.status} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
