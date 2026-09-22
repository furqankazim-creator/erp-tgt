import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, ExternalLink, Mail, Plus, Users } from "lucide-react";
import { toast } from "sonner";

import { callApi, useRows } from "@/lib/db";
import { useCurrentUser } from "@/lib/mock-auth";
import { dateTimeLabel } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog, type Field, type SelectOption } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/meeting")({
  head: () => ({
    meta: [
      { title: "Meetings — Time Global Tech CRM" },
      {
        name: "description",
        content: "Company meeting calendar with attendees, agendas, links and scheduling.",
      },
      { property: "og:title", content: "Meetings — Time Global Tech CRM" },
      { property: "og:description", content: "Schedule and manage client and internal meetings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MeetingPage,
});

type Meeting = {
  id: string;
  title: string;
  attendees: string | null;
  starts_at: string;
  duration_minutes: number;
  link: string | null;
  notes: string | null;
  status: string;
  kind: string;
  client: string | null;
  client_email: string | null;
  owner: string | null;
  inquiry_id: string | null;
  deal_id: string | null;
  recording_url: string | null;
  minutes_discussion: string | null;
  minutes_decisions: string | null;
  minutes_action_items: string | null;
  minutes_sent: boolean;
  minutes_sent_at: string | null;
};

function buildFields(inquiryOptions: SelectOption[], dealOptions: SelectOption[]): Field[] {
  return [
    { name: "title", label: "Meeting title", required: true, full: true },
    { name: "starts_at", label: "Date & time", type: "datetime-local", required: true },
    { name: "duration_minutes", label: "Duration (minutes)", type: "number" },
    { name: "attendees", label: "Attendees", full: true },
    { name: "client", label: "Client" },
    { name: "client_email", label: "Client email (for minutes)", type: "email" },
    { name: "owner", label: "Owner", type: "owner" },
    {
      name: "kind",
      label: "Type",
      type: "select",
      options: ["Meeting", "Demo", "Workshop", "Review"],
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: ["Scheduled", "Completed", "Cancelled"],
    },
    { name: "link", label: "Meeting link", full: true },
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
    { name: "notes", label: "Agenda / notes", type: "textarea" },
    { name: "recording_url", label: "Recording link", full: true, section: "Minutes" },
    {
      name: "minutes_discussion",
      label: "Discussion points",
      type: "textarea",
      full: true,
      section: "Minutes",
    },
    {
      name: "minutes_decisions",
      label: "Decisions",
      type: "textarea",
      full: true,
      section: "Minutes",
    },
    {
      name: "minutes_action_items",
      label: "Action items",
      type: "textarea",
      full: true,
      section: "Minutes",
    },
  ];
}

// Marking a meeting Completed already auto-sends this (see the meetings
// PUT handler in index.mjs) as soon as it has a client email — this button
// is for resending after adding real notes, or for triggering it manually
// on a meeting that isn't marked Completed yet.
function SendMinutesButton({ meeting }: { meeting: Meeting }) {
  const [sending, setSending] = useState(false);
  const hasMinutes = Boolean(
    meeting.minutes_discussion || meeting.minutes_decisions || meeting.minutes_action_items,
  );

  async function send() {
    setSending(true);
    try {
      await callApi(`/meetings/${meeting.id}/send-minutes`, { method: "POST" });
      toast.success(`Meeting detail sent to ${meeting.client_email || "the client"}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={sending || !meeting.client_email}
      title={!meeting.client_email ? "Add a client email to send meeting detail" : undefined}
      onClick={() => void send()}
    >
      <Mail className="size-3.5" />
      {sending
        ? "Sending…"
        : meeting.minutes_sent
          ? hasMinutes
            ? "Resend minutes"
            : "Resend detail"
          : hasMinutes
            ? "Send minutes"
            : "Send detail"}
    </Button>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthGrid(base: Date) {
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const days: (Date | null)[] = Array.from({ length: offset }, () => null);
  const total = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  for (let d = 1; d <= total; d += 1) days.push(new Date(base.getFullYear(), base.getMonth(), d));
  return days;
}

function MeetingPage() {
  const { data, isLoading } = useRows<Meeting>("meetings", {
    column: "starts_at",
    ascending: true,
  });
  const { data: inquiryRows } = useRows<{ id: string; client_name: string }>("inquiries");
  const { data: dealRows } = useRows<{ id: string; title: string }>("deals");
  const { data: employeeRows } = useRows<{ id: string; name: string; email: string | null }>(
    "employees",
  );
  const { data: me } = useCurrentUser();
  const [monthCursor, setMonthCursor] = useState(() => new Date(2026, 7, 1));

  const myName = (employeeRows ?? []).find(
    (e) => e.email && me?.email && e.email.toLowerCase() === me.email.toLowerCase(),
  )?.name;

  const allMeetings = data ?? [];
  // Same "own work only" rule as everywhere else Salesman is scoped.
  const meetings =
    me?.access_role === "salesman"
      ? myName
        ? allMeetings.filter((m) => m.owner === myName)
        : []
      : allMeetings;
  const inquiryOptions: SelectOption[] = (inquiryRows ?? []).map((i) => ({
    value: i.id,
    label: i.client_name,
  }));
  const dealOptions: SelectOption[] = (dealRows ?? []).map((d) => ({
    value: d.id,
    label: d.title,
  }));
  const FIELDS = buildFields(inquiryOptions, dealOptions);
  const grid = useMemo(() => monthGrid(monthCursor), [monthCursor]);
  const byDay = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    for (const m of meetings) {
      const key = new Date(m.starts_at).toDateString();
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return map;
  }, [meetings]);

  const newButton = (
    <RecordDialog
      table="meetings"
      label="Meeting"
      fields={FIELDS}
      defaults={{
        status: "Scheduled",
        kind: "Meeting",
        duration_minutes: "30",
        owner: me?.access_role === "salesman" ? (myName ?? "") : "",
      }}
      trigger={
        <Button>
          <Plus className="size-4" /> New meeting
        </Button>
      }
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meetings"
        description={
          me?.access_role === "salesman"
            ? "Your calls and demos."
            : "Client calls, demos and internal syncs in one shared calendar."
        }
        action={newButton}
      />

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="list">List</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="pt-4">
          <div className="surface-card p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold">
                <CalendarDays className="text-primary size-4" />
                {monthCursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </h2>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setMonthCursor(
                      new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1),
                    )
                  }
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setMonthCursor(
                      new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1),
                    )
                  }
                >
                  Next
                </Button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-muted-foreground">
              {WEEKDAYS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="mt-1.5 grid grid-cols-7 gap-1.5">
              {grid.map((day, i) => {
                const items = day ? (byDay.get(day.toDateString()) ?? []) : [];
                return (
                  <div
                    key={i}
                    className={`min-h-24 rounded-lg border p-1.5 text-left transition-colors ${
                      day ? "border-border hover:border-primary/40" : "border-transparent"
                    }`}
                  >
                    {day ? (
                      <>
                        <span className="text-xs font-semibold text-muted-foreground">
                          {day.getDate()}
                        </span>
                        <div className="mt-1 space-y-1">
                          {items.map((m) => (
                            <RecordDialog
                              key={m.id}
                              table="meetings"
                              label="Meeting"
                              fields={FIELDS}
                              record={m}
                              trigger={
                                <button className="bg-primary/12 text-primary hover:bg-primary/20 w-full truncate rounded px-1.5 py-1 text-left text-[10px] font-semibold transition-colors">
                                  {new Date(m.starts_at).toLocaleTimeString("en-GB", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}{" "}
                                  {m.title}
                                </button>
                              }
                            />
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="list" className="pt-4">
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <div className="space-y-3">
              {meetings.map((m) => (
                <div
                  key={m.id}
                  className="surface-card surface-card-hover flex flex-col gap-3 p-5 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{m.title}</h3>
                      <StatusBadge value={m.status} />
                      <StatusBadge value={m.kind} tone="primary" />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {dateTimeLabel(m.starts_at)} · {m.duration_minutes} min
                      {m.client ? ` · ${m.client}` : ""}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="size-3.5" /> {m.attendees ?? "No attendees listed"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {m.link ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={m.link} target="_blank" rel="noreferrer">
                          Join <ExternalLink className="size-3.5" />
                        </a>
                      </Button>
                    ) : null}
                    <SendMinutesButton meeting={m} />
                    <RecordDialog
                      table="meetings"
                      label="Meeting"
                      fields={FIELDS}
                      record={m}
                      trigger={
                        <Button variant="ghost" size="sm">
                          Reschedule
                        </Button>
                      }
                    />
                    <DeleteButton table="meetings" id={m.id} label="Meeting" name={m.title} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
