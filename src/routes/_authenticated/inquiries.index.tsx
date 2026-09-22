import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Briefcase,
  Clock,
  Download,
  Globe,
  Inbox,
  Mail,
  MapPin,
  Megaphone,
  MessageSquare,
  Paperclip,
  Pencil,
  Phone,
  PhoneCall,
  Plus,
  Search,
  Sparkles,
  Timer,
  Users as UsersIcon,
  Wallet,
} from "lucide-react";

import { updateRow, useRows, useSaveRow } from "@/lib/db";
import { useCurrentUser } from "@/lib/mock-auth";
import {
  currency,
  dateLabel,
  dateTimeLabel,
  formatDuration,
  initials,
  timeAgo,
} from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { INQUIRY_STAGES_WITH_LOST, type Inquiry } from "@/components/inquiry-form";

export const Route = createFileRoute("/_authenticated/inquiries/")({
  head: () => ({
    meta: [
      { title: "Inquiries — Time Global Tech CRM" },
      {
        name: "description",
        content: "Manage inbound requests, chatbot conversations, and lead conversions.",
      },
      { property: "og:title", content: "Inquiries — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "Every inquiry is tracked through a defined workflow until it converts or closes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InquiriesPage,
});

type Account = { id: string; name: string };
type ServiceRow = { id: string; name: string };
type LinkedQuote = {
  id: string;
  status: string;
  suggested_price: number;
  inquiry_id: string | null;
};
type Employee = { id: string; name: string; email: string | null };

const CLOSED_STATUSES = ["Deal Done", "Lost"];

/** The timestamp of the first auto/manual email sent for this inquiry — this
 * is "when it was responded to with the generic response." Null means the
 * clock is still running. */
function firstResponseAt(inq: Inquiry): string | null {
  const first = (inq.activity_log ?? []).find((e) => e.type === "email");
  return first?.at ?? null;
}

/** Minutes between when the inquiry came in and either its first response,
 * or now (if it hasn't been responded to yet). */
function responseMinutes(inq: Inquiry): number {
  const start = new Date(inq.received_date ?? inq.created_at).getTime();
  const end = new Date(firstResponseAt(inq) ?? Date.now()).getTime();
  return Math.max(0, Math.round((end - start) / 60000));
}

function formatAttachmentSize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function InquiriesPage() {
  const { data, isLoading } = useRows<Inquiry>("inquiries");
  const { data: accountRows } = useRows<Account>("accounts");
  const { data: serviceRows } = useRows<ServiceRow>("products_services");
  const { data: quoteRows } = useRows<LinkedQuote>("quotes");
  const { data: employeeRows } = useRows<Employee>("employees");
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const createDeal = useSaveRow("deals", "Deal");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("All");
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);

  const myName = (employeeRows ?? []).find(
    (e) => e.email && me?.email && e.email.toLowerCase() === me.email.toLowerCase(),
  )?.name;

  const allInquiries = data ?? [];
  // A Salesman only ever sees the inquiries assigned to them — everyone else
  // sees the full list. Same rule as Developer/Projects: if we can't match
  // their login to an employee record yet, show nothing rather than an
  // unscoped list (an undefined name must never accidentally match an
  // inquiry whose `owner` field happens to be missing too).
  const inquiries =
    me?.access_role === "salesman"
      ? myName
        ? allInquiries.filter((i) => i.owner === myName)
        : []
      : allInquiries;
  const accounts = accountRows ?? [];
  const services = serviceRows ?? [];
  const quotes = quoteRows ?? [];

  const filtered = useMemo(() => {
    return inquiries.filter((i) => {
      const haystack =
        `${i.client_name} ${i.company ?? ""} ${i.email ?? ""} ${(i.tags ?? []).join(" ")}`.toLowerCase();
      const matchesQuery = haystack.includes(query.toLowerCase());
      return matchesQuery && (status === "All" || i.status === status);
    });
  }, [inquiries, query, status]);

  const open = inquiries.filter((i) => !CLOSED_STATUSES.includes(i.status));
  const converted = inquiries.filter((i) => i.status === "Deal Done");
  const conversionRate = inquiries.length
    ? Math.round((converted.length / inquiries.length) * 100)
    : 0;
  const pipelineValue = open.reduce((s, i) => s + Number(i.estimated_budget ?? 0), 0);
  const overdueCount = inquiries.filter(
    (i) =>
      i.next_follow_up &&
      !CLOSED_STATUSES.includes(i.status) &&
      new Date(i.next_follow_up).getTime() < Date.now(),
  ).length;
  // Still waiting on the auto/manual "generic response" — the timer hasn't
  // stopped yet for these.
  const awaitingResponse = inquiries.filter(
    (i) => !CLOSED_STATUSES.includes(i.status) && !firstResponseAt(i),
  );
  const respondedOnes = inquiries.filter((i) => firstResponseAt(i));
  const avgResponseMinutes = respondedOnes.length
    ? Math.round(respondedOnes.reduce((s, i) => s + responseMinutes(i), 0) / respondedOnes.length)
    : 0;

  function serviceName(inq: Inquiry) {
    return services.find((s) => s.id === inq.service_id)?.name ?? null;
  }

  // How each intake channel shows up in the "just in" strip — the point is
  // making the automated ones (Email, Web Form) visually obvious at a
  // glance, since those are the ones nobody typed in by hand.
  function sourceMeta(source: string) {
    switch (source) {
      case "Email":
        return { icon: Mail, label: "Email", tone: "bg-info/12 text-info border-info/25" };
      case "Web Form":
        return {
          icon: Globe,
          label: "Website",
          tone: "bg-primary/12 text-primary border-primary/25",
        };
      case "Marketing Campaign":
      case "Meta Ads":
        return {
          icon: Megaphone,
          label: source === "Meta Ads" ? "Meta Ads" : "Campaign",
          tone: "bg-warning/15 text-warning border-warning/30",
        };
      case "Advocates/Referrals":
        return {
          icon: UsersIcon,
          label: "Referral",
          tone: "bg-success/12 text-success border-success/25",
        };
      case "Cold Call":
        return {
          icon: PhoneCall,
          label: "Cold call",
          tone: "bg-muted text-muted-foreground border-border",
        };
      default:
        return { icon: Inbox, label: source, tone: "bg-muted text-muted-foreground border-border" };
    }
  }

  /** Small "timer" badge — green once responded, amber/red while still
   * waiting (red once it's been over 24h with no response). */
  function responseBadge(inq: Inquiry) {
    if (CLOSED_STATUSES.includes(inq.status)) return null;
    const minutes = responseMinutes(inq);
    if (firstResponseAt(inq)) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <Clock className="size-3" /> Responded in {formatDuration(minutes)}
        </span>
      );
    }
    const overdue = minutes > 24 * 60;
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs font-medium ${
          overdue ? "text-destructive" : "text-amber-600 dark:text-amber-400"
        }`}
      >
        <Timer className="size-3" /> Awaiting response — {formatDuration(minutes)}
      </span>
    );
  }

  // Newest first, regardless of stage — this is "what just came in," so a
  // closed/lost one that arrived five minutes ago still belongs at the top.
  // Capped at 4 and laid out as a grid rather than a scroll strip on
  // purpose — the moment a 5th one arrives, the oldest of these simply
  // drops off instead of sitting there needing to be scrolled past. This
  // is meant to read as "what's fresh right now," not an archive.
  const recentInquiries = useMemo(() => {
    return [...inquiries]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 4);
  }, [inquiries]);

  const bySource = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of inquiries) {
      map.set(i.source, (map.get(i.source) ?? 0) + 1);
    }
    const rows = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const max = rows.length ? rows[0]![1] : 1;
    return rows.map(([source, count]) => ({ source, count, pct: Math.round((count / max) * 100) }));
  }, [inquiries]);

  function accountName(inq: Inquiry) {
    return accounts.find((a) => a.id === inq.account_id)?.name ?? null;
  }

  function openDetail(inq: Inquiry) {
    setSelected(inq);
    setNotesDraft(inq.notes ?? "");
  }

  async function setStatusFor(inq: Inquiry, next: string) {
    if (next === inq.status) return;
    const log = [
      ...(inq.activity_log ?? []),
      {
        type: "status_changed",
        message: `Status updated from ${inq.status} to ${next}.`,
        at: new Date().toISOString(),
      },
    ];
    const { error } = await updateRow("inquiries", inq.id, { status: next, activity_log: log });
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["inquiries"] });
    if (selected?.id === inq.id) setSelected({ ...inq, status: next, activity_log: log });
    toast.success(`Inquiry moved to ${next}`);
  }

  async function saveNotes() {
    if (!selected) return;
    const { error } = await updateRow("inquiries", selected.id, { notes: notesDraft || null });
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["inquiries"] });
    setSelected({ ...selected, notes: notesDraft || null });
    toast.success("Notes saved");
  }

  function convertToDeal(inq: Inquiry) {
    // The real deal value is whatever was actually quoted and accepted —
    // not the rough early guess in "Estimated Budget". Prefer an Accepted
    // quote, then the most recent quote of any status, and only fall back
    // to the early guess if no quote was ever built for this inquiry.
    const inqQuotes = quotes.filter((q) => q.inquiry_id === inq.id);
    const bestQuote =
      inqQuotes.find((q) => q.status === "Accepted") ?? inqQuotes[inqQuotes.length - 1];
    const dealValue = bestQuote ? bestQuote.suggested_price : Number(inq.estimated_budget ?? 0);
    createDeal.mutate(
      {
        title: `${inq.company ?? inq.client_name} — ${inq.description.slice(0, 60)}`,
        account_id: inq.account_id,
        value: dealValue,
        // Not "Lead" — by the time this button exists, the client has
        // already approved a proposal, so the deal starts where it truly
        // is in the pipeline instead of redoing Lead/Contacted/Qualified.
        stage: "Proposal",
        owner: inq.owner,
        // Matches the stage above — a client-approved proposal is a much
        // stronger probability than a fresh, unqualified "Lead" would be.
        probability: 75,
        close_date: inq.expected_close_date,
        notes: `Converted from inquiry (${inq.source}). ${inq.notes ?? ""}`.trim(),
        inquiry_id: inq.id,
        // Without these, a Deal converted from a WhatsApp-sourced inquiry has no way back
        // to the conversation it came from, or the documents/voice notes the client sent —
        // the PM working the deal would have to go dig through WhatsApp by hand to find
        // context that was already captured on the inquiry.
        conversation_url: inq.conversation_url ?? null,
        attachments: inq.attachments ?? [],
      },
      {
        onSuccess: async (dealId) => {
          const log = [
            ...(inq.activity_log ?? []),
            {
              type: "converted",
              message: "Converted to a Sales deal.",
              at: new Date().toISOString(),
            },
          ];
          await updateRow("inquiries", inq.id, {
            status: "Deal Done",
            deal_id: dealId,
            activity_log: log,
          });
          await qc.invalidateQueries({ queryKey: ["inquiries"] });
          setSelected(null);
          toast.success("Inquiry converted — deal created in Sales");
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inquiries"
        description={
          me?.access_role === "salesman"
            ? "Your assigned inquiries — respond, qualify, and convert to a deal."
            : undefined
        }
        action={
          <Button asChild>
            <Link to="/inquiries/new">
              <Plus className="size-4" /> New Inquiry
            </Link>
          </Button>
        }
      />

      {recentInquiries.length ? (
        <div className="surface-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
                <span className="bg-primary relative inline-flex size-2 rounded-full" />
              </span>
              <h2 className="text-sm font-semibold">Just in</h2>
            </div>
            <span className="text-xs text-muted-foreground">
              Newest first — website and email submissions land here automatically, no manual entry
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {recentInquiries.map((inq) => {
              const { icon: SourceIcon, label: sourceLabel, tone } = sourceMeta(inq.source);
              const isFresh = Date.now() - new Date(inq.created_at).getTime() < 60 * 60 * 1000;
              return (
                <button
                  key={inq.id}
                  type="button"
                  onClick={() => openDetail(inq)}
                  className={`surface-card-hover group flex flex-col gap-3 rounded-xl border p-3.5 text-left transition-shadow ${
                    isFresh ? "border-primary/30 ring-1 ring-primary/10" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${tone}`}
                    >
                      <SourceIcon className="size-3" /> {sourceLabel}
                    </span>
                    {isFresh ? (
                      <span className="text-primary flex items-center gap-1 text-[10px] font-bold uppercase">
                        <span className="bg-primary size-1.5 animate-pulse rounded-full" />
                        New
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        {timeAgo(inq.created_at)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className="gradient-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold">
                      {initials(inq.client_name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{inq.client_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {inq.company ?? accountName(inq) ?? "No company given"}
                        {serviceName(inq) ? ` · ${serviceName(inq)}` : ""}
                      </p>
                    </div>
                  </div>

                  {inq.description ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{inq.description}</p>
                  ) : null}

                  <div className="border-border flex items-center justify-between border-t pt-2.5">
                    <StatusBadge value={inq.status} className="text-[10px]" />
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      {currency(inq.estimated_budget, true)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total inquiries" value={String(inquiries.length)} icon={Inbox} />
        <KpiCard label="Open" value={String(open.length)} icon={Sparkles} />
        <KpiCard
          label="Conversion rate"
          value={`${conversionRate}%`}
          hint={`${converted.length} converted`}
          icon={MessageSquare}
        />
        <KpiCard
          label="Pipeline value"
          value={currency(pipelineValue, true)}
          hint="open inquiries"
          icon={Wallet}
        />
        <KpiCard
          label="Overdue follow-ups"
          value={String(overdueCount)}
          icon={AlertTriangle}
          className={overdueCount ? "border-destructive/30" : ""}
        />
        <KpiCard
          label="Awaiting response"
          value={String(awaitingResponse.length)}
          hint="timer still running"
          icon={Timer}
          className={awaitingResponse.length ? "border-destructive/30" : ""}
        />
        <KpiCard
          label="Avg. response time"
          value={avgResponseMinutes ? formatDuration(avgResponseMinutes) : "—"}
          hint={`${respondedOnes.length} responded`}
          icon={Clock}
        />
      </div>

      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="list">List</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="pt-4">
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
              {INQUIRY_STAGES_WITH_LOST.map((stage) => {
                const items = inquiries.filter((i) => i.status === stage);
                return (
                  <div
                    key={stage}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      const inq = inquiries.find((i) => i.id === dragging);
                      if (inq) void setStatusFor(inq, stage);
                      setDragging(null);
                    }}
                    className="bg-muted/40 border-border min-h-40 rounded-xl border p-3 transition-colors"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-bold tracking-wide uppercase">{stage}</p>
                      <span className="bg-background rounded-full px-2 py-0.5 text-xs font-semibold">
                        {items.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {items.map((inq) => (
                        <div
                          key={inq.id}
                          draggable
                          onDragStart={() => setDragging(inq.id)}
                          onClick={() => openDetail(inq)}
                          className="surface-card surface-card-hover cursor-grab p-3 active:cursor-grabbing"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-semibold">{inq.client_name}</p>
                            <StatusBadge value={inq.priority} className="shrink-0" />
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {inq.company ?? accountName(inq) ?? "No account"}
                            {serviceName(inq) ? ` · ${serviceName(inq)}` : ""}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {inq.owner ?? "Unassigned"}
                          </p>
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-sm font-bold">
                              {currency(inq.estimated_budget, true)}
                            </span>
                            <span className="text-xs text-muted-foreground">{inq.source}</span>
                          </div>
                          <div className="mt-2">{responseBadge(inq)}</div>
                          <div
                            className="mt-2 flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                              <Link to="/inquiries/$inquiryId/edit" params={{ inquiryId: inq.id }}>
                                Edit
                              </Link>
                            </Button>
                            <DeleteButton
                              table="inquiries"
                              id={inq.id}
                              label="Inquiry"
                              name={inq.client_name}
                            />
                          </div>
                        </div>
                      ))}
                      {items.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">Empty</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="list" className="space-y-4 pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                className="pl-9"
                placeholder="Search inquiries..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["All", ...INQUIRY_STAGES_WITH_LOST].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    status === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <TableSkeleton />
          ) : (
            <div className="surface-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">ID</th>
                    <th className="px-4 py-3 text-left font-semibold">Prospect</th>
                    <th className="px-4 py-3 text-left font-semibold">Company</th>
                    <th className="px-4 py-3 text-left font-semibold">Source</th>
                    <th className="px-4 py-3 text-left font-semibold">Contact</th>
                    <th className="px-4 py-3 text-left font-semibold">Priority</th>
                    <th className="px-4 py-3 text-left font-semibold">Assigned To</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-left font-semibold">Response</th>
                    <th className="px-4 py-3 text-left font-semibold">Follow-up</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {filtered.map((inq) => (
                    <tr key={inq.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {inq.display_id ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          className="text-left font-medium hover:underline"
                          onClick={() => openDetail(inq)}
                        >
                          {inq.client_name}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {inq.company ?? accountName(inq) ?? "—"}
                        {serviceName(inq) ? (
                          <div className="text-xs text-muted-foreground">{serviceName(inq)}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className="bg-accent text-accent-foreground rounded px-2 py-0.5 text-[11px] font-semibold">
                          {inq.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {inq.email ?? inq.phone ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={inq.priority} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{inq.owner ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge value={inq.status} />
                      </td>
                      <td className="px-4 py-3">{responseBadge(inq)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {dateLabel(inq.next_follow_up)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button asChild variant="ghost" size="sm">
                            <Link to="/inquiries/$inquiryId/edit" params={{ inquiryId: inq.id }}>
                              <Pencil className="size-3.5" />
                            </Link>
                          </Button>
                          <DeleteButton
                            table="inquiries"
                            id={inq.id}
                            label="Inquiry"
                            name={inq.client_name}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={11}
                        className="px-4 py-10 text-center text-sm text-muted-foreground"
                      >
                        No inquiries found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {bySource.length ? (
        <div className="surface-card p-5">
          <h2 className="mb-4 font-semibold">Inquiries by source</h2>
          <div className="space-y-2.5">
            {bySource.map((row) => (
              <div key={row.source} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 truncate text-muted-foreground">{row.source}</span>
                <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                  <div
                    className="gradient-primary h-full rounded-full"
                    style={{ width: `${Math.max(4, row.pct)}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right font-semibold">{row.count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="sidebar-scroll w-full overflow-y-auto sm:max-w-lg">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {selected.client_name}
                  <StatusBadge value={selected.status} />
                </SheetTitle>
                <SheetDescription>
                  {selected.company ?? accountName(selected) ?? "Inquiry"}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-6 px-4 pb-6">
                <div>
                  <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
                    Prospect details
                  </p>
                  <div className="surface-card grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Contact</p>
                      <p className="mt-0.5 flex items-center gap-1.5">
                        <Mail className="size-3.5 text-muted-foreground" />
                        {selected.email ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Phone</p>
                      <p className="mt-0.5 flex items-center gap-1.5">
                        <Phone className="size-3.5 text-muted-foreground" />
                        {selected.phone ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Source channel</p>
                      <p className="mt-0.5">{selected.source}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Assigned to</p>
                      <p className="mt-0.5">{selected.owner ?? "Unassigned"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Industry</p>
                      <p className="mt-0.5">{selected.industry ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Preferred contact</p>
                      <p className="mt-0.5">{selected.preferred_contact_method ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Estimated budget</p>
                      <p className="mt-0.5 font-semibold">{currency(selected.estimated_budget)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Expected close</p>
                      <p className="mt-0.5">{dateLabel(selected.expected_close_date)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Received</p>
                      <p className="mt-0.5">{dateLabel(selected.received_date)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Next follow-up</p>
                      <p className="mt-0.5">{dateLabel(selected.next_follow_up)}</p>
                    </div>
                    {selected.address ? (
                      <div className="col-span-2">
                        <p className="text-[11px] text-muted-foreground">Address</p>
                        <p className="mt-0.5 flex items-center gap-1.5">
                          <MapPin className="size-3.5 text-muted-foreground" />
                          {selected.address}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
                    Description
                  </p>
                  <p className="text-sm">{selected.description}</p>
                  {selected.tags?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selected.tags.map((t) => (
                        <span
                          key={t}
                          className="bg-accent text-accent-foreground rounded px-2 py-0.5 text-xs font-semibold"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
                    Inquiry status
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {INQUIRY_STAGES_WITH_LOST.map((s) => (
                      <button
                        key={s}
                        onClick={() => void setStatusFor(selected, s)}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                          selected.status === s
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {selected.attachments?.length ? (
                  <div>
                    <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
                      Attachments
                    </p>
                    <ul className="space-y-1.5">
                      {selected.attachments.map((f) => (
                        <li
                          key={f.name}
                          className="bg-muted/50 rounded-lg px-3 py-2 text-sm"
                        >
                          <a
                            href={f.data_url}
                            download={f.name}
                            className="flex items-center gap-2 hover:underline"
                          >
                            <Paperclip className="text-muted-foreground size-3.5 shrink-0" />
                            <span className="min-w-0 flex-1 truncate">{f.name}</span>
                            {f.size ? (
                              <span className="text-muted-foreground shrink-0 text-xs">
                                {formatAttachmentSize(f.size)}
                              </span>
                            ) : null}
                            <Download className="text-muted-foreground size-3.5 shrink-0" />
                          </a>
                          {/* A voice note is far more useful to play right here than to
                              download and open elsewhere — the transcript already lives in
                              the description/notes, this is for actually hearing it. */}
                          {f.type?.startsWith("audio/") ? (
                            <audio controls src={f.data_url} className="mt-2 h-8 w-full">
                              <track kind="captions" />
                            </audio>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div>
                  <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
                    Internal notes
                  </p>
                  <Textarea
                    rows={3}
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="Add an internal note..."
                  />
                  {notesDraft !== (selected.notes ?? "") ? (
                    <Button size="sm" className="mt-2" onClick={() => void saveNotes()}>
                      Save notes
                    </Button>
                  ) : null}
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
                    Inquiry timeline &amp; activity log
                  </p>
                  <ol className="space-y-3 border-l border-border pl-4">
                    {(selected.activity_log ?? []).map((entry, i) => (
                      <li key={i} className="relative text-sm">
                        <span className="bg-primary absolute -left-[21px] top-1 size-2 rounded-full" />
                        <p className="font-medium capitalize">{entry.type.replace(/_/g, " ")}</p>
                        <p className="text-muted-foreground">{entry.message}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {dateTimeLabel(entry.at)}
                        </p>
                      </li>
                    ))}
                    {(selected.activity_log ?? []).length === 0 ? (
                      <li className="text-sm text-muted-foreground">No activity yet.</li>
                    ) : null}
                  </ol>
                </div>

                {selected.deal_id ? (
                  <p className="rounded-lg bg-success/10 px-3 py-2 text-xs font-medium text-success">
                    <MessageSquare className="mr-1 inline size-3.5" />
                    Converted to a Sales deal — continue the workflow from Sales.
                  </p>
                ) : selected.status === "Proposal Sent" ? (
                  <Button
                    className="w-full"
                    disabled={createDeal.isPending}
                    onClick={() => convertToDeal(selected)}
                  >
                    <Briefcase className="size-4" /> Convert to deal
                  </Button>
                ) : null}

                <div className="flex gap-2 border-t border-border/60 pt-4">
                  <Button asChild variant="outline" className="flex-1">
                    <Link to="/inquiries/$inquiryId/edit" params={{ inquiryId: selected.id }}>
                      <Pencil className="size-4" /> Edit inquiry
                    </Link>
                  </Button>
                  <DeleteButton
                    table="inquiries"
                    id={selected.id}
                    label="Inquiry"
                    name={selected.client_name}
                  />
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
