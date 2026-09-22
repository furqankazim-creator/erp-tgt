import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Link as LinkIcon,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Users,
  Video,
  XCircle,
} from "lucide-react";

import { useRows } from "@/lib/db";
import { useCurrentUser } from "@/lib/mock-auth";
import { dateLabel, number } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog, type Field, type SelectOption } from "@/components/record-dialog";
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

export const Route = createFileRoute("/_authenticated/demos")({
  head: () => ({
    meta: [
      { title: "Demos — Time Global Tech CRM" },
      { name: "description", content: "Scheduled product demos with clients." },
      { property: "og:title", content: "Demos — Time Global Tech CRM" },
      { property: "og:description", content: "Scheduled product demos with clients." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Demo = {
  id: string;
  title: string;
  attendees: string | null;
  starts_at: string | null;
  duration_minutes: number | null;
  link: string | null;
  notes: string | null;
  status: string;
  kind: string | null;
  client: string | null;
  owner: string | null;
  inquiry_id: string | null;
  deal_id: string | null;
  created_at: string;
};

const STATUSES = ["All", "Scheduled", "Completed", "Cancelled", "No Show"];
const KINDS = ["All", "Demo", "Meeting", "Workshop", "Discovery"];

function buildFields(
  accountOptions: SelectOption[],
  inquiryOptions: SelectOption[],
  dealOptions: SelectOption[],
): Field[] {
  return [
    { name: "title", label: "Demo title", required: true, full: true },
    { name: "client", label: "Client / Account", type: "select", options: accountOptions },
    { name: "owner", label: "Owner", type: "owner" },
    {
      name: "kind",
      label: "Type",
      type: "select",
      options: KINDS.filter((k) => k !== "All"),
    },
    { name: "starts_at", label: "Start date & time", type: "datetime-local", required: true },
    { name: "duration_minutes", label: "Duration (min)", type: "number" },
    { name: "attendees", label: "Attendees", placeholder: "Comma separated names" },
    { name: "link", label: "Meeting link", type: "text" },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: STATUSES.filter((s) => s !== "All"),
    },
    {
      name: "inquiry_id",
      label: "Related inquiry (optional)",
      type: "select",
      options: inquiryOptions,
    },
    {
      name: "deal_id",
      label: "Related opportunity (optional)",
      type: "select",
      options: dealOptions,
    },
    { name: "notes", label: "Notes / Agenda", type: "textarea", full: true },
  ];
}

const STATUS_COLOR: Record<string, string> = {
  Scheduled: "bg-info/15 text-info border-info/30",
  Completed: "bg-success/15 text-success border-success/30",
  Cancelled: "bg-destructive/15 text-destructive border-destructive/30",
  "No Show": "bg-warning/15 text-warning border-warning/30",
};

const KIND_COLOR: Record<string, string> = {
  Demo: "bg-primary/12 text-primary border-primary/25",
  Meeting: "bg-secondary text-secondary-foreground border-border",
  Workshop: "bg-success/12 text-success border-success/25",
  Discovery: "bg-warning/12 text-warning border-warning/25",
};

function formatDateTime(iso: string | null) {
  if (!iso) return { date: "—", time: "—", weekday: "—", raw: "" };
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
    weekday: d.toLocaleDateString(undefined, { weekday: "long" }),
    raw: iso,
  };
}

function DayBadge({ iso }: { iso: string | null }) {
  if (!iso) return <div className="grid size-14 place-items-center rounded-xl bg-muted">—</div>;
  const d = new Date(iso);
  const day = d.getDate();
  const month = d.toLocaleDateString(undefined, { month: "short" });
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  const isPast = d < new Date(new Date().setHours(0, 0, 0, 0));
  return (
    <div
      className={`grid size-14 shrink-0 place-items-center rounded-xl text-center ${
        isPast
          ? "bg-muted text-muted-foreground"
          : "bg-gradient-to-br from-primary/15 via-primary/10 to-transparent"
      }`}
    >
      <div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
          {month}
        </p>
        <p className={`text-xl font-bold leading-none ${isPast ? "" : "text-primary"}`}>{day}</p>
        <p className="text-[9px] font-medium text-muted-foreground mt-0.5">{weekday}</p>
      </div>
    </div>
  );
}

function Page() {
  const { data, isLoading } = useRows<Demo>("meetings");
  const { data: accountRows } = useRows<{ id: string; name: string }>("accounts");
  const { data: inquiryRows } = useRows<{ id: string; client_name: string }>("inquiries");
  const { data: dealRows } = useRows<{ id: string; title: string }>("deals");
  const { data: employeeRows } = useRows<{ id: string; name: string; email: string | null }>(
    "employees",
  );
  const { data: me } = useCurrentUser();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [kindFilter, setKindFilter] = useState("All");
  const [selected, setSelected] = useState<Demo | null>(null);

  const myName = (employeeRows ?? []).find(
    (e) => e.email && me?.email && e.email.toLowerCase() === me.email.toLowerCase(),
  )?.name;

  const accountOptions: SelectOption[] = [
    ...(accountRows ?? []).map((a) => ({ value: a.name, label: a.name })),
    { value: "Internal", label: "Internal" },
  ];
  const inquiryOptions: SelectOption[] = (inquiryRows ?? []).map((i) => ({
    value: i.id,
    label: i.client_name,
  }));
  const dealOptions: SelectOption[] = (dealRows ?? []).map((d) => ({
    value: d.id,
    label: d.title,
  }));
  const FIELDS = buildFields(accountOptions, inquiryOptions, dealOptions);

  const demos = useMemo(() => {
    let rows = (data ?? []).filter((d) => !d.kind || d.kind === "Demo" || d.kind === "Meeting");
    // Same "own work only" rule as everywhere else Salesman is scoped.
    if (me?.access_role === "salesman") {
      rows = myName ? rows.filter((d) => d.owner === myName) : [];
    }
    return rows.filter((d) => {
      const matchesQuery = `${d.title} ${d.client ?? ""} ${d.attendees ?? ""} ${d.notes ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesStatus = statusFilter === "All" || d.status === statusFilter;
      const matchesKind = kindFilter === "All" || d.kind === kindFilter;
      return matchesQuery && matchesStatus && matchesKind;
    });
  }, [data, query, statusFilter, kindFilter, me?.access_role, myName]);

  const total = demos.length;
  const scheduled = demos.filter((d) => d.status === "Scheduled").length;
  const completed = demos.filter((d) => d.status === "Completed").length;
  const thisWeek = demos.filter((d) => {
    if (!d.starts_at) return false;
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const dDate = new Date(d.starts_at);
    return dDate >= now && dDate <= weekEnd;
  }).length;
  const totalAttendees = demos.reduce((s, d) => {
    if (!d.attendees) return s;
    return s + d.attendees.split(",").length;
  }, 0);

  const upcomingSorted = useMemo(
    () =>
      [...demos]
        .filter((d) => d.status === "Scheduled" && d.starts_at)
        .sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime()),
    [demos],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Demos & Meetings"
        description={
          me?.access_role === "salesman"
            ? "Your product demos and client calls."
            : "Schedule, track and follow up on product demos, client calls and workshops."
        }
        action={
          <RecordDialog
            table="meetings"
            label="Demo / Meeting"
            fields={FIELDS}
            defaults={{
              status: "Scheduled",
              kind: "Demo",
              duration_minutes: "45",
              owner: me?.access_role === "salesman" ? (myName ?? "") : "",
            }}
            trigger={
              <Button>
                <Plus className="size-4" /> Schedule
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
            label="Scheduled"
            value={number(scheduled)}
            delta={thisWeek}
            hint="this week"
            icon={CalendarDays}
          />
          <KpiCard
            label="Completed"
            value={number(completed)}
            hint="last 30 days"
            icon={CheckCircle2}
          />
          <KpiCard
            label="Total sessions"
            value={number(total)}
            delta={12}
            hint="vs last month"
            icon={Video}
          />
          <KpiCard
            label="Attendee seats"
            value={number(totalAttendees)}
            hint="across all sessions"
            icon={Users}
          />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:max-w-sm">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Search demos, clients, attendees…"
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
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setKindFilter(k)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                kindFilter === k
                  ? "border-primary bg-primary/12 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">
            <CalendarClock className="size-4 mr-2" /> Upcoming
          </TabsTrigger>
          <TabsTrigger value="all">
            <CalendarDays className="size-4 mr-2" /> All Sessions
          </TabsTrigger>
          <TabsTrigger value="completed">
            <CheckCircle2 className="size-4 mr-2" /> Completed
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="pt-4">
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2 space-y-3">
              {upcomingSorted.length === 0 ? (
                <div className="surface-card p-12 text-center">
                  <CalendarClock className="mx-auto size-10 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium">No upcoming sessions</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Schedule a demo or meeting to see it here.
                  </p>
                </div>
              ) : (
                upcomingSorted.map((d, idx) => {
                  const dt = formatDateTime(d.starts_at);
                  return (
                    <button
                      key={d.id}
                      onClick={() => setSelected(d)}
                      className="surface-card surface-card-hover animate-rise group flex w-full items-start gap-4 p-4 text-left"
                      style={{ animationDelay: `${idx * 40}ms` }}
                    >
                      <DayBadge iso={d.starts_at} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                          <h3 className="font-semibold leading-snug">{d.title}</h3>
                          <Badge
                            variant="outline"
                            className={KIND_COLOR[d.kind ?? "Meeting"] ?? ""}
                          >
                            {d.kind ?? "Meeting"}
                          </Badge>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3" /> {d.client ?? "Internal"}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="size-3" /> {dt.time} · {d.duration_minutes ?? 30} min
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Users className="size-3" />
                            {d.attendees
                              ? `${d.attendees.split(",").length} attendee${
                                  d.attendees.split(",").length > 1 ? "s" : ""
                                }`
                              : "—"}
                          </span>
                        </div>
                        {d.notes ? (
                          <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">
                            {d.notes}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <StatusBadge value={d.status} />
                        {d.link ? (
                          <a
                            href={d.link}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/10"
                          >
                            <LinkIcon className="size-3" /> Join
                          </a>
                        ) : null}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="space-y-4">
              <div className="surface-card animate-rise overflow-hidden">
                <div className="bg-gradient-to-br from-primary/15 via-transparent to-info/10 p-5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    This Week
                  </p>
                  <p className="mt-2 flex items-baseline gap-2">
                    <span className="text-4xl font-bold tracking-tight">{thisWeek}</span>
                    <span className="text-sm font-medium text-muted-foreground">sessions</span>
                  </p>
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Weekly capacity</span>
                      <span className="font-bold">
                        {Math.min(100, (thisWeek / 10) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <Progress value={Math.min(100, (thisWeek / 10) * 100)} className="h-2" />
                  </div>
                </div>
                <div className="divide-border divide-y p-3">
                  {upcomingSorted.slice(0, 4).map((d) => {
                    const dt = formatDateTime(d.starts_at);
                    return (
                      <button
                        key={d.id}
                        onClick={() => setSelected(d)}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/40"
                      >
                        <div
                          className="grid size-8 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-primary"
                          style={{ background: "hsl(var(--primary) / 0.1)" }}
                        >
                          {d.starts_at ? new Date(d.starts_at).getDate() : "?"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold">{d.title}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {dt.time} · {d.client ?? "Internal"}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                  {upcomingSorted.length === 0 ? (
                    <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                      Nothing scheduled this week
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="surface-card animate-rise p-5">
                <div className="flex items-center gap-3">
                  <div className="bg-warning/15 text-warning grid size-10 place-items-center rounded-xl">
                    <Sparkles className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Prep reminders
                    </p>
                    <p className="mt-0.5 font-semibold">3 sessions need prep</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-2 text-xs">
                  <li className="flex items-start gap-2 rounded-lg bg-muted/50 p-2.5">
                    <XCircle className="mt-0.5 size-3.5 text-warning shrink-0" />
                    <span>Kite Financial — deck not uploaded</span>
                  </li>
                  <li className="flex items-start gap-2 rounded-lg bg-muted/50 p-2.5">
                    <XCircle className="mt-0.5 size-3.5 text-warning shrink-0" />
                    <span>Solaris Energy — SE missing</span>
                  </li>
                  <li className="flex items-start gap-2 rounded-lg bg-success/10 p-2.5">
                    <CheckCircle2 className="mt-0.5 size-3.5 text-success shrink-0" />
                    <span>Vertex Health — ready</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="all" className="pt-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {demos.map((d, idx) => {
              const dt = formatDateTime(d.starts_at);
              return (
                <button
                  key={d.id}
                  onClick={() => setSelected(d)}
                  className="surface-card surface-card-hover animate-rise group flex flex-col p-5 text-left"
                  style={{ animationDelay: `${idx * 35}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <DayBadge iso={d.starts_at} />
                    <div className="flex flex-col items-end gap-2">
                      <StatusBadge value={d.status} />
                      <Badge variant="outline" className={KIND_COLOR[d.kind ?? "Meeting"] ?? ""}>
                        {d.kind ?? "Meeting"}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-4 min-w-0">
                    <h3 className="font-semibold leading-snug">{d.title}</h3>
                    <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                      <p className="inline-flex items-center gap-1">
                        <MapPin className="size-3" /> {d.client ?? "Internal"}
                      </p>
                      <p className="inline-flex items-center gap-1 ml-3">
                        <Clock3 className="size-3" /> {dt.weekday}, {dt.time}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-4 text-xs">
                    <div className="rounded-lg bg-muted/60 p-2.5">
                      <p className="text-muted-foreground">Duration</p>
                      <p className="mt-0.5 font-bold text-sm">{d.duration_minutes ?? 30} min</p>
                    </div>
                    <div className="rounded-lg bg-primary/5 p-2.5">
                      <p className="text-muted-foreground">Attendees</p>
                      <p className="mt-0.5 font-bold text-sm">
                        {d.attendees ? d.attendees.split(",").length : 0}
                      </p>
                    </div>
                  </div>

                  {d.notes ? (
                    <p className="mt-4 line-clamp-2 border-t pt-3 text-xs text-muted-foreground">
                      {d.notes}
                    </p>
                  ) : null}
                </button>
              );
            })}
            {demos.length === 0 ? (
              <div className="surface-card col-span-full p-12 text-center">
                <p className="text-sm font-medium">No sessions match your filters</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try a different search or filter.
                </p>
              </div>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="completed" className="pt-4">
          <div className="surface-card overflow-hidden">
            <div className="border-b p-5">
              <h3 className="font-semibold">Completed sessions</h3>
              <p className="text-sm text-muted-foreground">
                Past demos and meetings — click to view notes and follow up
              </p>
            </div>
            <div className="divide-border divide-y">
              {demos
                .filter((d) => d.status === "Completed")
                .map((d) => {
                  const dt = formatDateTime(d.starts_at);
                  return (
                    <button
                      key={d.id}
                      onClick={() => setSelected(d)}
                      className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/40"
                    >
                      <div className="bg-success/15 text-success grid size-11 shrink-0 place-items-center rounded-xl">
                        <CheckCircle2 className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="font-semibold">{d.title}</p>
                          <Badge variant="outline" className="text-[10px]">
                            {d.kind ?? "Meeting"}
                          </Badge>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {dt.date} · {d.client ?? "Internal"} · {d.attendees ?? "—"}
                        </p>
                      </div>
                      <div className="hidden sm:block text-right text-xs text-muted-foreground">
                        <p>{dt.date}</p>
                        <p className="mt-0.5">{d.duration_minutes ?? 30} min</p>
                      </div>
                    </button>
                  );
                })}
              {demos.filter((d) => d.status === "Completed").length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-foreground">
                  No completed sessions yet
                </div>
              ) : null}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selected ? (
            <div className="space-y-6 px-1 pb-6">
              <div className="-mx-5 -mt-5 mb-2 bg-gradient-to-br from-primary/20 via-info/10 to-transparent">
                <SheetHeader className="p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Badge className={STATUS_COLOR[selected.status] ?? ""}>
                        {selected.status}
                      </Badge>
                      <SheetTitle className="mt-3 text-2xl">{selected.title}</SheetTitle>
                      <SheetDescription className="mt-1">
                        {selected.kind ?? "Meeting"} · {selected.client ?? "Internal"}
                      </SheetDescription>
                    </div>
                    <div className="gradient-primary text-primary-foreground grid size-12 shrink-0 place-items-center rounded-2xl">
                      <Video className="size-6" />
                    </div>
                  </div>
                </SheetHeader>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-2xl border p-4 text-xs">
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="mt-1 font-semibold text-sm">
                    {formatDateTime(selected.starts_at).date}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Time</p>
                  <p className="mt-1 font-semibold text-sm">
                    {formatDateTime(selected.starts_at).time}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Duration</p>
                  <p className="mt-1 font-semibold text-sm">
                    {selected.duration_minutes ?? 30} minutes
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Attendees</p>
                  <p className="mt-1 font-semibold text-sm">
                    {selected.attendees ? `${selected.attendees.split(",").length} people` : "—"}
                  </p>
                </div>
              </div>

              {selected.link ? (
                <a
                  href={selected.link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/15 text-primary grid size-10 place-items-center rounded-xl">
                      <LinkIcon className="size-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">
                        Meeting link
                      </p>
                      <p className="text-sm font-semibold truncate max-w-[240px]">
                        {selected.link}
                      </p>
                    </div>
                  </div>
                  <ExternalLink className="size-4 text-primary shrink-0" />
                </a>
              ) : null}

              <div className="space-y-3 rounded-2xl border p-4">
                <h4 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                  Attendees
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {selected.attendees
                    ? selected.attendees.split(",").map((a, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          <Users className="size-3 mr-1.5" />
                          {a.trim()}
                        </Badge>
                      ))
                    : "—"}
                </div>
              </div>

              <div className="space-y-2 rounded-2xl border p-4">
                <h4 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                  Notes & Agenda
                </h4>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {selected.notes ?? "No notes yet."}
                </p>
              </div>

              <div className="space-y-3 rounded-2xl border p-4">
                <h4 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                  Session metadata
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span className="font-semibold">{dateLabel(selected.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">ID</span>
                    <span className="font-mono text-[10px]">{selected.id}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <RecordDialog
                  table="meetings"
                  label="Demo / Meeting"
                  fields={FIELDS}
                  record={selected}
                  trigger={
                    <Button variant="outline" className="w-full">
                      Edit
                    </Button>
                  }
                />
                <Button
                  variant="outline"
                  disabled={!selected.link}
                  onClick={() => selected.link && window.open(selected.link, "_blank")}
                >
                  <ExternalLink className="size-4" /> Join
                </Button>
                <DeleteButton table="meetings" id={selected.id} label="Session" />
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
