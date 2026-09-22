import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { updateRow, useRows } from "@/lib/db";
import { dateLabel } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { CardGridSkeleton, EmptyState } from "@/components/loading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Sprint = { id: string; project_id: string; name: string; status: string };
type Task = {
  id: string;
  project_id: string | null;
  title: string;
  assignee: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  sprint_id: string | null;
};

// Kanban columns per the modules plan — extends the plain 4-status board
// used on the Tasks tab with the two extra delivery gates a sprint needs.
// Existing rows with the old 4-value status still render fine; they just
// land in their matching column.
const COLUMNS = ["Backlog", "To Do", "In Progress", "Code Review", "QA Testing", "Done"];

export function SprintsBoardTab({ projectId }: { projectId: string }) {
  const { data: sprintRows, isLoading: sprintsLoading } = useRows<Sprint>("sprints");
  const { data: taskRows, isLoading: tasksLoading } = useRows<Task>("tasks");
  const qc = useQueryClient();
  const [dragging, setDragging] = useState<string | null>(null);

  const sprints = (sprintRows ?? []).filter((s) => s.project_id === projectId);
  const tasks = (taskRows ?? []).filter((t) => t.project_id === projectId);

  const [sprintId, setSprintId] = useState<string>("__backlog__");

  async function moveTask(id: string, status: string) {
    const { error } = await updateRow("tasks", id, { status });
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["tasks"] });
    toast.success(`Task moved to ${status}`);
  }

  const scoped =
    sprintId === "__backlog__"
      ? tasks.filter((t) => !t.sprint_id)
      : tasks.filter((t) => t.sprint_id === sprintId);

  const isLoading = sprintsLoading || tasksLoading;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Select value={sprintId} onValueChange={setSprintId}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__backlog__">Backlog (no sprint)</SelectItem>
            {sprints.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <CardGridSkeleton />
      ) : sprintId !== "__backlog__" && scoped.length === 0 ? (
        <EmptyState title="No tasks in this sprint" description="Assign tasks from Sprint Planning." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {COLUMNS.map((status) => {
            const items = scoped.filter((t) => t.status === status);
            return (
              <div
                key={status}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragging) void moveTask(dragging, status);
                  setDragging(null);
                }}
                className="min-h-40 rounded-xl border border-border bg-muted/40 p-3 transition-colors"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide">{status}</p>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {items.map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={() => setDragging(t.id)}
                      className="surface-card surface-card-hover cursor-grab p-3 active:cursor-grabbing"
                    >
                      <p className="text-sm font-semibold">{t.title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {t.assignee ?? "Unassigned"}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <StatusBadge value={t.priority} />
                        <span className="text-[11px] text-muted-foreground">
                          {dateLabel(t.due_date)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">No tasks</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
