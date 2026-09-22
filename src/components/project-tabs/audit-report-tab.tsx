import { useMemo, useState } from "react";
import { Activity, Search } from "lucide-react";

import { useRows } from "@/lib/db";
import { dateTimeLabel } from "@/lib/format";
import { TableSkeleton, EmptyState } from "@/components/loading";
import { Input } from "@/components/ui/input";

type Task = { id: string; project_id: string | null; title: string; status: string; updated_at: string };
type WorkLog = {
  id: string;
  employee: string;
  project_id: string | null;
  date: string;
  hours: number;
  notes: string | null;
};
type Notification = { id: string; type: string; message: string; created_at: string };

type ActivityRow = {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity: string;
};

// No dedicated audit_log collection exists yet — this is honestly labeled
// as a "Recent Activity" feed built from timestamps already on tasks and
// work_logs plus the notification stream, not a fabricated audit trail.
// Notifications carry no project_id, so they're shown unfiltered — the
// task/work-log rows below are what's actually scoped to this project.
export function AuditReportTab({ projectId }: { projectId: string }) {
  const { data: taskRows, isLoading: tasksLoading } = useRows<Task>("tasks");
  const { data: workLogRows, isLoading: logsLoading } = useRows<WorkLog>("work_logs");
  const { data: notificationRows, isLoading: notesLoading } = useRows<Notification>("notifications");
  const [query, setQuery] = useState("");

  const rows: ActivityRow[] = useMemo(() => {
    const fromTasks: ActivityRow[] = (taskRows ?? [])
      .filter((t) => t.project_id === projectId)
      .map((t) => ({
        id: `task-${t.id}`,
        at: t.updated_at,
        actor: "—",
        action: `Task status: ${t.status}`,
        entity: t.title,
      }));
    const fromLogs: ActivityRow[] = (workLogRows ?? [])
      .filter((l) => l.project_id === projectId)
      .map((l) => ({
        id: `log-${l.id}`,
        at: l.date,
        actor: l.employee,
        action: `Logged ${l.hours}h`,
        entity: l.notes ?? "",
      }));
    const fromNotifications: ActivityRow[] = (notificationRows ?? []).map((n) => ({
      id: `note-${n.id}`,
      at: n.created_at,
      actor: "System",
      action: n.type.replace(/_/g, " "),
      entity: n.message,
    }));
    return [...fromTasks, ...fromLogs, ...fromNotifications].sort((a, b) =>
      b.at.localeCompare(a.at),
    );
  }, [taskRows, workLogRows, notificationRows, projectId]);

  const filtered = rows.filter((r) =>
    `${r.actor} ${r.action} ${r.entity}`.toLowerCase().includes(query.toLowerCase()),
  );

  const isLoading = tasksLoading || logsLoading || notesLoading;

  return (
    <div className="space-y-6">
      <div className="relative sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search activity…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState title="No activity yet" description="Nothing recorded for this project." />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">When</th>
                <th className="px-4 py-3 text-left font-semibold">Actor</th>
                <th className="px-4 py-3 text-left font-semibold">Action</th>
                <th className="px-4 py-3 text-left font-semibold">Entity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.slice(0, 200).map((r) => (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3 text-muted-foreground">{dateTimeLabel(r.at)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <Activity className="size-3.5 text-primary" /> {r.actor}
                    </span>
                  </td>
                  <td className="px-4 py-3 capitalize">{r.action}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.entity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
