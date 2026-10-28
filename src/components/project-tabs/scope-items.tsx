import { useState } from "react";
import { ListChecks, Pencil, Plus } from "lucide-react";

import { useSaveRow } from "@/lib/db";
import { dateLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/loading";
import { DeleteButton } from "@/components/delete-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type ScopeItem,
  useProjectScopeItems,
  useScopePermission,
} from "@/components/project-tabs/scope-change-requests";
import type { Project } from "@/routes/_authenticated/project";

const ITEM_STATUSES = ["Agreed", "Added", "Modified", "Removed"] as const;

const STATUS_HINT: Record<string, string> = {
  Agreed: "part of the original agreed scope",
  Added: "added later through an approved change request",
  Modified: "changed through an approved change request",
  Removed: "dropped through an approved change request",
};

const labelClass =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85";

function ScopeItemDialog({
  projectId,
  item,
  open,
  onOpenChange,
}: {
  projectId: string;
  item: ScopeItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const save = useSaveRow("scope_items", "Scope item");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate(
      item
        ? { id: item.id, title: title.trim(), description: description.trim() }
        : { project_id: projectId, title: title.trim(), description: description.trim() },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? `Edit ${item.code}` : "Add scope item"}</DialogTitle>
          <DialogDescription>
            {item
              ? "Fix the wording only — to change what was agreed, raise a change request."
              : "One requirement from the agreed scope. It gets the next number (S1, S2, …)."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 pt-1">
          <div>
            <Label htmlFor="scope-item-title" className={labelClass}>
              Requirement <span className="text-destructive">*</span>
            </Label>
            <Input
              id="scope-item-title"
              required
              maxLength={200}
              placeholder="e.g. User login & signup"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="scope-item-description" className={labelClass}>
              Details
            </Label>
            <Textarea
              id="scope-item-description"
              rows={3}
              maxLength={4000}
              placeholder="What exactly is included."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending} className="min-w-[110px]">
              {save.isPending ? "Saving…" : item ? "Save" : "Add item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ScopeItems({ project }: { project: Project }) {
  const { canDecide } = useScopePermission(project);
  const { items, isLoading } = useProjectScopeItems(project.id);
  const [editing, setEditing] = useState<ScopeItem | "new" | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  const visible = filter ? items.filter((i) => i.status === filter) : items;
  const inScope = items.filter((i) => i.status !== "Removed").length;

  return (
    <div className="surface-card p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListChecks className="size-4 text-primary" />
          <h3 className="font-semibold">Scope log</h3>
          {items.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {inScope} in scope
            </span>
          )}
        </div>
        {canDecide && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing("new")}>
            <Plus className="size-3.5" />
            Add item
          </Button>
        )}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        The agreed scope as numbered items. After the baseline is set, items only change through
        approved change requests, so each item shows how it got to where it is.
        {canDecide ? "" : " Adding or editing items is a PM/Admin action."}
      </p>

      {items.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {ITEM_STATUSES.map((s) => {
            const count = items.filter((i) => i.status === s).length;
            const active = filter === s;
            return (
              <button
                key={s}
                type="button"
                title={STATUS_HINT[s]}
                onClick={() => setFilter(active ? null : s)}
                className={`inline-flex items-center gap-1 rounded-full pr-2 transition ${active ? "bg-primary/10 ring-2 ring-primary/50" : "hover:bg-muted"}`}
                aria-pressed={active}
              >
                <StatusBadge value={s} />
                <span className="text-xs font-semibold text-muted-foreground">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="No scope items yet"
          description={
            canDecide
              ? 'Break the agreed scope into items with "Add item" — they\'ll be numbered S1, S2, S3…'
              : "Your PM hasn't broken the scope into items yet."
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState title={`No ${filter?.toLowerCase()} items`} description="Clear the filter to see all." />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {visible.map((item) => {
            const removed = item.status === "Removed";
            const untouched = (item.history ?? []).length === 0;
            return (
              <div key={item.id} className="flex gap-3 px-4 py-3">
                <span
                  className={cn(
                    "flex h-7 min-w-9 shrink-0 items-center justify-center rounded-lg px-1.5 text-xs font-bold tabular-nums",
                    removed ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
                  )}
                >
                  {item.code}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className={cn("text-sm font-semibold", removed && "text-muted-foreground line-through")}>
                      {item.title}
                    </p>
                    <StatusBadge value={item.status} />
                  </div>
                  {item.description && (
                    <p className="whitespace-pre-line text-sm text-muted-foreground">{item.description}</p>
                  )}
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    <li>
                      {item.origin_change_request_code
                        ? `Added via ${item.origin_change_request_code}`
                        : "Original scope"}
                      {item.created_by ? ` · ${item.created_by}` : ""} · {dateLabel(item.created_at)}
                    </li>
                    {(item.history ?? [])
                      .filter((h) => h.change_request_code !== item.origin_change_request_code)
                      .map((h) => (
                        <li key={h.change_request_id}>
                          {h.change_type === "Removal" ? "Removed" : "Modified"} via{" "}
                          {h.change_request_code ?? "change request"} — {h.title}
                          {h.by ? ` · approved by ${h.by}` : ""} · {dateLabel(h.at)}
                        </li>
                      ))}
                  </ul>
                </div>
                {canDecide && !removed && (
                  <div className="flex shrink-0 items-start gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground"
                      aria-label={`Edit ${item.code}`}
                      onClick={() => setEditing(item)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    {untouched && (
                      <DeleteButton
                        table="scope_items"
                        id={item.id}
                        label="Scope item"
                        name={`${item.code} — ${item.title}`}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <ScopeItemDialog
          key={editing === "new" ? "new" : editing.id}
          projectId={project.id}
          item={editing === "new" ? null : editing}
          open
          onOpenChange={(v) => !v && setEditing(null)}
        />
      )}
    </div>
  );
}
