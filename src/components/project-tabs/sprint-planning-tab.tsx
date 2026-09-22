import { useState } from "react";
import { CalendarRange, Plus } from "lucide-react";

import { useRows, useSaveRow } from "@/lib/db";
import { dateLabel } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { CardGridSkeleton, EmptyState } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Sprint = {
  id: string;
  project_id: string;
  name: string;
  goal: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  capacity: number | null;
};
type Task = {
  id: string;
  project_id: string | null;
  title: string;
  status: string;
  sprint_id: string | null;
};

const TASK_STATUSES = ["To Do", "In Progress", "Review", "Done"];

function CreateSprintDialog({ projectId, tasks }: { projectId: string; tasks: Task[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [capacity, setCapacity] = useState("40");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const saveSprint = useSaveRow("sprints", "Sprint");
  const saveTask = useSaveRow("tasks", "Task");

  const backlog = tasks.filter((t) => t.project_id === projectId && !t.sprint_id);

  function reset() {
    setName("");
    setGoal("");
    setStartDate("");
    setEndDate("");
    setCapacity("40");
    setSelectedTaskIds([]);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    saveSprint.mutate(
      {
        project_id: projectId,
        name,
        goal: goal || null,
        start_date: startDate || null,
        end_date: endDate || null,
        status: "Planned",
        capacity: capacity === "" ? null : Number(capacity),
      },
      {
        onSuccess: (sprintId) => {
          for (const taskId of selectedTaskIds) {
            saveTask.mutate({ id: taskId, sprint_id: sprintId });
          }
          setOpen(false);
          reset();
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Create sprint
        </Button>
      </DialogTrigger>
      <DialogContent className="sidebar-scroll max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New sprint</DialogTitle>
          <DialogDescription>
            Name it, set a goal and dates, then pull tasks in from the backlog.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div>
            <Label className="mb-1.5 block text-xs font-semibold">Sprint name</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-semibold">Goal</Label>
            <Textarea rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">Start</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">End</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">Capacity (hrs)</Label>
              <Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-semibold">
              Assign tasks from backlog ({backlog.length} available)
            </Label>
            <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-md border border-border p-2">
              {backlog.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">
                  No unassigned tasks for this project.
                </p>
              ) : (
                backlog.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedTaskIds.includes(t.id)}
                      onCheckedChange={(v) =>
                        setSelectedTaskIds((ids) =>
                          v ? [...ids, t.id] : ids.filter((id) => id !== t.id),
                        )
                      }
                    />
                    {t.title}
                  </label>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveSprint.isPending}>
              {saveSprint.isPending ? "Creating…" : "Create sprint"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SprintPlanningTab({ projectId }: { projectId: string }) {
  const { data: sprintRows, isLoading: sprintsLoading } = useRows<Sprint>("sprints");
  const { data: taskRows } = useRows<Task>("tasks");

  const sprints = (sprintRows ?? [])
    .filter((s) => s.project_id === projectId)
    .sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? ""));
  const tasks = taskRows ?? [];

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <CreateSprintDialog projectId={projectId} tasks={tasks} />
      </div>

      {sprintsLoading ? (
        <CardGridSkeleton />
      ) : sprints.length === 0 ? (
        <EmptyState title="No sprints yet" description="Create your first sprint above." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sprints.map((s) => {
            const sprintTasks = tasks.filter((t) => t.sprint_id === s.id);
            const done = sprintTasks.filter((t) => t.status === "Done").length;
            return (
              <div key={s.id} className="surface-card animate-rise space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate font-semibold">{s.name}</h3>
                  <StatusBadge value={s.status} />
                </div>
                {s.goal ? <p className="text-sm text-muted-foreground">{s.goal}</p> : null}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarRange className="size-3.5" />
                  {dateLabel(s.start_date)} – {dateLabel(s.end_date)}
                </div>
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  {TASK_STATUSES.map((status) => (
                    <div key={status} className="rounded-md bg-muted/50 p-1.5 text-center">
                      <p className="text-sm font-bold">
                        {sprintTasks.filter((t) => t.status === status).length}
                      </p>
                      <p className="text-[9px] uppercase text-muted-foreground">{status}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {done}/{sprintTasks.length} tasks done
                  {s.capacity ? ` · capacity ${s.capacity}h` : ""}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
