import { useState } from "react";
import { ExternalLink, Mail, Plus, Users } from "lucide-react";
import { toast } from "sonner";

import { callApi, useRows } from "@/lib/db";
import { useCurrentUser } from "@/lib/mock-auth";
import { dateTimeLabel } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog, type Field } from "@/components/record-dialog";
import { TableSkeleton, EmptyState } from "@/components/loading";
import { Button } from "@/components/ui/button";
import type { Project } from "@/routes/_authenticated/project";

type Meeting = {
  id: string;
  project_id: string | null;
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
  recording_url: string | null;
  minutes_discussion: string | null;
  minutes_decisions: string | null;
  minutes_action_items: string | null;
  minutes_sent: boolean;
  minutes_sent_at: string | null;
};

const MEETING_FIELDS: Field[] = [
  { name: "project_id", label: "Project", type: "hidden" },
  { name: "kind", label: "Type", type: "hidden" },
  { name: "client", label: "Client", type: "hidden" },
  { name: "title", label: "Meeting title", required: true, full: true },
  { name: "starts_at", label: "Date & time", type: "datetime-local", required: true },
  { name: "duration_minutes", label: "Duration (minutes)", type: "number" },
  { name: "attendees", label: "Attendees", full: true },
  { name: "client_email", label: "Client email (for minutes)", type: "email" },
  {
    name: "status",
    label: "Status",
    type: "select",
    options: ["Scheduled", "Completed", "Cancelled"],
  },
  { name: "link", label: "Meeting link", full: true },
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

function MeetingCard({ meeting, canSend }: { meeting: Meeting; canSend: boolean }) {
  return (
    <div className="surface-card space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{meeting.title}</h3>
            <StatusBadge value={meeting.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {dateTimeLabel(meeting.starts_at)} · {meeting.duration_minutes} min
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="size-3.5" /> {meeting.attendees ?? "No attendees listed"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {meeting.link ? (
            <Button asChild variant="outline" size="sm">
              <a href={meeting.link} target="_blank" rel="noreferrer">
                Join <ExternalLink className="size-3.5" />
              </a>
            </Button>
          ) : null}
          {canSend ? <SendMinutesButton meeting={meeting} /> : null}
          <RecordDialog
            table="meetings"
            label="Meeting"
            fields={MEETING_FIELDS}
            record={meeting}
            trigger={
              <Button variant="ghost" size="sm">
                Edit
              </Button>
            }
          />
        </div>
      </div>

      {meeting.minutes_discussion || meeting.minutes_decisions || meeting.minutes_action_items ? (
        <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-3">
          {meeting.minutes_discussion ? (
            <div>
              <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Discussion
              </p>
              <p className="whitespace-pre-line text-sm">{meeting.minutes_discussion}</p>
            </div>
          ) : null}
          {meeting.minutes_decisions ? (
            <div>
              <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Decisions
              </p>
              <p className="whitespace-pre-line text-sm">{meeting.minutes_decisions}</p>
            </div>
          ) : null}
          {meeting.minutes_action_items ? (
            <div>
              <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Action items
              </p>
              <p className="whitespace-pre-line text-sm">{meeting.minutes_action_items}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function MeetingMinutesTab({ projectId, project }: { projectId: string; project: Project }) {
  const { data: meetingRows, isLoading } = useRows<Meeting>("meetings", {
    column: "starts_at",
    ascending: false,
  });
  const { data: me } = useCurrentUser();

  // Server already scopes `meetings` to the developer's own projects (see
  // DEVELOPER_SCOPED_TABLES/PROJECT_LINKED_TABLES in server/index.mjs) — this
  // client-side filter is the redundant second layer, same reasoning as
  // project.index.tsx's own project filtering.
  const meetings = (meetingRows ?? []).filter((m) => m.project_id === projectId);
  const canSend = me?.access_role !== "developer";

  const newButton = (
    <RecordDialog
      table="meetings"
      label="Meeting"
      fields={MEETING_FIELDS}
      defaults={{
        project_id: projectId,
        status: "Scheduled",
        kind: "Meeting",
        duration_minutes: "30",
        client: project.client ?? "",
      }}
      trigger={
        <Button size="sm">
          <Plus className="size-4" /> Log meeting
        </Button>
      }
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end">{newButton}</div>

      {isLoading ? (
        <TableSkeleton />
      ) : meetings.length === 0 ? (
        <EmptyState
          title="No meetings logged yet"
          description="Log a meeting to keep track of attendees, discussion points and decisions for this project."
        />
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => (
            <MeetingCard key={m.id} meeting={m} canSend={canSend} />
          ))}
        </div>
      )}
    </div>
  );
}
