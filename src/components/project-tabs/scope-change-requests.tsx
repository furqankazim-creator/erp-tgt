import { useState } from "react";
import { CheckCircle2, ClipboardList, Eye, Plus, Rocket, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { useCurrentUser } from "@/lib/mock-auth";
import { useRows, useSaveRow } from "@/lib/db";
import { currency, dateLabel } from "@/lib/format";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Project } from "@/routes/_authenticated/project";

// Mirrors the server's allowed transitions (server/index.mjs) — the server
// is the one that actually enforces them; this only decides which buttons
// to show.
export const SCOPE_CHANGE_STATUSES = [
  "Pending",
  "Under Review",
  "Approved",
  "Rejected",
  "Implemented",
] as const;
const CHANGE_TYPES = ["Addition", "Modification", "Removal"] as const;

export type ScopeItem = {
  id: string;
  project_id: string;
  number: number;
  code: string;
  title: string;
  description: string | null;
  status: string;
  origin_change_request_code: string | null;
  history: {
    change_request_id: string;
    change_request_code: string | null;
    change_type: string;
    title: string;
    by: string | null;
    at: string;
  }[];
  created_by: string | null;
  created_at: string;
};

type ScopeChangeRequest = {
  id: string;
  display_id: string | null;
  project_id: string;
  scope_item_id?: string | null;
  title: string;
  description: string | null;
  change_type: string;
  impact_days: number;
  impact_cost: number;
  status: string;
  requested_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  implemented_at: string | null;
  created_at: string;
};

type Employee = { id: string; name: string; email: string | null };

const labelClass =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85";

/** Who's allowed to change this project's scope: its PM (the project's
 * `manager`) or an Admin. Mirrors the server's check — display only. */
export function useScopePermission(project: Project) {
  const { data: me } = useCurrentUser();
  const { data: employeeRows } = useRows<Employee>("employees");
  const myName = (employeeRows ?? []).find(
    (e) => e.email && me?.email && e.email.toLowerCase() === me.email.toLowerCase(),
  )?.name;
  const isAdmin = me?.access_role === "super_admin" || me?.access_role === "admin";
  return { myName, canDecide: isAdmin || Boolean(myName && project.manager === myName) };
}

export function useProjectScopeItems(projectId: string) {
  const query = useRows<ScopeItem>("scope_items");
  const items = (query.data ?? [])
    .filter((i) => i.project_id === projectId)
    .sort((a, b) => a.number - b.number);
  return { items, isLoading: query.isLoading };
}

// Modifications / removals must point at an item still in scope.
function ScopeItemSelect({
  items,
  value,
  onChange,
  id,
}: {
  items: ScopeItem[];
  value: string;
  onChange: (v: string) => void;
  id: string;
}) {
  const live = items.filter((i) => i.status !== "Removed");
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={live.length ? "Pick a scope item" : "No scope items yet"} />
      </SelectTrigger>
      <SelectContent>
        {live.map((i) => (
          <SelectItem key={i.id} value={i.id}>
            {i.code} — {i.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RaiseChangeRequestDialog({ projectId, items }: { projectId: string; items: ScopeItem[] }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [changeType, setChangeType] = useState<string>("Addition");
  const [scopeItemId, setScopeItemId] = useState("");
  const [description, setDescription] = useState("");
  const [impactDays, setImpactDays] = useState("0");
  const [impactCost, setImpactCost] = useState("0");
  const save = useSaveRow("scope_change_requests", "Change request");
  const needsItem = changeType !== "Addition";

  function reset() {
    setTitle("");
    setChangeType("Addition");
    setScopeItemId("");
    setDescription("");
    setImpactDays("0");
    setImpactCost("0");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (needsItem && !scopeItemId) {
      toast.error(`Pick the scope item this ${changeType.toLowerCase()} changes.`);
      return;
    }
    save.mutate(
      {
        project_id: projectId,
        title: title.trim(),
        change_type: changeType,
        scope_item_id: needsItem ? scopeItemId : null,
        description: description.trim(),
        impact_days: Number(impactDays) || 0,
        impact_cost: Number(impactCost) || 0,
      },
      {
        onSuccess: () => {
          setOpen(false);
          reset();
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Plus className="size-3.5" />
          Raise request
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Raise scope change request</DialogTitle>
          <DialogDescription>
            Describe what should change from the originally agreed scope. The project&apos;s PM or
            an Admin will review it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 pt-1">
          <div>
            <Label htmlFor="cr-title" className={labelClass}>
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cr-title"
              required
              maxLength={200}
              placeholder="e.g. Add live chat to the customer portal"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <Label className={labelClass}>Type of change</Label>
            <Select value={changeType} onValueChange={setChangeType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANGE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t === "Addition"
                      ? "Addition — new work"
                      : t === "Modification"
                        ? "Modification — change agreed work"
                        : "Removal — drop agreed work"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsItem ? (
            <div>
              <Label htmlFor="cr-scope-item" className={labelClass}>
                Scope item affected <span className="text-destructive">*</span>
              </Label>
              <ScopeItemSelect
                id="cr-scope-item"
                items={items}
                value={scopeItemId}
                onChange={setScopeItemId}
              />
            </div>
          ) : (
            <p className="-mt-2 text-xs text-muted-foreground">
              Once approved, this is added to the scope log as a new numbered item.
            </p>
          )}

          <div>
            <Label htmlFor="cr-description" className={labelClass}>
              Details
            </Label>
            <Textarea
              id="cr-description"
              rows={4}
              maxLength={4000}
              placeholder="What exactly changes, who asked for it, and why."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cr-days" className={labelClass}>
                Extra days (estimate)
              </Label>
              <Input
                id="cr-days"
                type="number"
                min="0"
                value={impactDays}
                onChange={(e) => setImpactDays(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cr-cost" className={labelClass}>
                Extra cost (estimate)
              </Label>
              <Input
                id="cr-cost"
                type="number"
                min="0"
                value={impactCost}
                onChange={(e) => setImpactCost(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending} className="min-w-[120px]">
              {save.isPending ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DecisionDialog({
  request,
  decision,
  items,
}: {
  request: ScopeChangeRequest;
  decision: "Approved" | "Rejected";
  items: ScopeItem[];
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [scopeItemId, setScopeItemId] = useState("");
  const save = useSaveRow("scope_change_requests", "Change request");
  const qc = useQueryClient();
  const approving = decision === "Approved";
  // Requests raised before scope items existed don't name one — let the
  // approver pick it here rather than leave the request unapprovable.
  const needsItem = approving && request.change_type !== "Addition" && !request.scope_item_id;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (needsItem && !scopeItemId) {
      toast.error(`Pick the scope item this ${request.change_type.toLowerCase()} changes.`);
      return;
    }
    save.mutate(
      {
        id: request.id,
        status: decision,
        decision_note: note,
        ...(needsItem ? { scope_item_id: scopeItemId } : {}),
      },
      {
        onSuccess: () => {
          // Approval rewrites the scope log on the server.
          void qc.invalidateQueries({ queryKey: ["scope_items"] });
          setOpen(false);
          setNote("");
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className={
            approving
              ? "h-8 gap-1.5 px-2 text-xs text-success hover:text-success"
              : "h-8 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
          }
        >
          {approving ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
          {approving ? "Approve" : "Reject"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{approving ? "Approve" : "Reject"} change request?</DialogTitle>
          <DialogDescription>“{request.title}”</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 pt-1">
          {needsItem && (
            <div>
              <Label htmlFor={`cr-item-${request.id}`} className={labelClass}>
                Scope item affected <span className="text-destructive">*</span>
              </Label>
              <ScopeItemSelect
                id={`cr-item-${request.id}`}
                items={items}
                value={scopeItemId}
                onChange={setScopeItemId}
              />
            </div>
          )}
          {approving && (
            <p className="text-xs text-muted-foreground">
              {request.change_type === "Addition"
                ? "Approving adds this to the scope log as a new item."
                : request.change_type === "Removal"
                  ? "Approving marks the scope item as Removed."
                  : "Approving marks the scope item as Modified."}
            </p>
          )}
          <div>
            <Label htmlFor={`cr-note-${request.id}`} className={labelClass}>
              Note (optional)
            </Label>
            <Textarea
              id={`cr-note-${request.id}`}
              rows={3}
              maxLength={2000}
              placeholder={
                approving
                  ? "e.g. Approved with client — deadline moves by a week."
                  : "e.g. Out of budget for this phase, revisit in phase 2."
              }
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={approving ? "default" : "destructive"}
              disabled={save.isPending}
            >
              {save.isPending ? "Saving…" : approving ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatusButton({
  request,
  status,
  icon: Icon,
  label,
}: {
  request: ScopeChangeRequest;
  status: string;
  icon: typeof Eye;
  label: string;
}) {
  const save = useSaveRow("scope_change_requests", "Change request");
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-8 gap-1.5 px-2 text-xs"
      disabled={save.isPending}
      onClick={() => save.mutate({ id: request.id, status })}
    >
      <Icon className="size-3.5" />
      {label}
    </Button>
  );
}

export function ScopeChangeRequests({ project }: { project: Project }) {
  const { myName, canDecide } = useScopePermission(project);
  const { items } = useProjectScopeItems(project.id);
  const { data: requestRows, isLoading } = useRows<ScopeChangeRequest>("scope_change_requests");
  const [filter, setFilter] = useState<string | null>(null);
  const itemCode = (id: string | null | undefined) => items.find((i) => i.id === id)?.code;

  const requests = (requestRows ?? []).filter((r) => r.project_id === project.id);
  const visible = filter ? requests.filter((r) => r.status === filter) : requests;

  const approved = requests.filter((r) => r.status === "Approved" || r.status === "Implemented");
  const approvedDays = approved.reduce((sum, r) => sum + (Number(r.impact_days) || 0), 0);
  const approvedCost = approved.reduce((sum, r) => sum + (Number(r.impact_cost) || 0), 0);

  return (
    <div className="surface-card p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-4 text-primary" />
          <h3 className="font-semibold">Scope change requests</h3>
          {requests.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {requests.length}
            </span>
          )}
        </div>
        <RaiseChangeRequestDialog projectId={project.id} items={items} />
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Any change to what was originally agreed, tracked here for visibility.
        {canDecide
          ? " As this project's PM/Admin you can review, approve or reject requests."
          : " Approving or rejecting a request is a PM/Admin action."}
      </p>

      {requests.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {SCOPE_CHANGE_STATUSES.map((s) => {
            const count = requests.filter((r) => r.status === s).length;
            const active = filter === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(active ? null : s)}
                className={`inline-flex items-center gap-1 rounded-full pr-2 transition ${active ? "bg-primary/10 ring-2 ring-primary/50" : "hover:bg-muted"}`}
                aria-pressed={active}
              >
                <StatusBadge value={s} />
                <span className="text-xs font-semibold text-muted-foreground">{count}</span>
              </button>
            );
          })}
          {approved.length > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              Approved impact: +{approvedDays} day{approvedDays === 1 ? "" : "s"} ·{" "}
              {currency(approvedCost)}
            </span>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : requests.length === 0 ? (
        <EmptyState
          title="No scope change requests"
          description={`Nothing has been raised against this project's scope yet. Use "Raise request" to log one.`}
        />
      ) : visible.length === 0 ? (
        <EmptyState title={`No ${filter?.toLowerCase()} requests`} description="Clear the filter to see all." />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {visible.map((r) => {
            const isRequester = Boolean(myName && r.requested_by === myName);
            const canDelete = canDecide || (isRequester && r.status === "Pending");
            return (
              <div key={r.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {r.display_id && (
                        <span className="text-xs font-semibold text-muted-foreground">
                          {r.display_id}
                        </span>
                      )}
                      <p className="text-sm font-semibold">{r.title}</p>
                      {itemCode(r.scope_item_id) && (
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary">
                          {r.change_type === "Addition" ? "→ " : ""}
                          {itemCode(r.scope_item_id)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.change_type} · raised by {r.requested_by ?? "—"} on {dateLabel(r.created_at)}
                      {" · "}+{Number(r.impact_days) || 0} day
                      {Number(r.impact_days) === 1 ? "" : "s"} · {currency(Number(r.impact_cost) || 0)}
                    </p>
                  </div>
                  <StatusBadge value={r.status} />
                </div>

                {r.description && (
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{r.description}</p>
                )}

                {r.decided_by && (
                  <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    {r.status === "Rejected" ? "Rejected" : "Approved"} by {r.decided_by} on{" "}
                    {dateLabel(r.decided_at)}
                    {r.decision_note ? ` — ${r.decision_note}` : ""}
                    {r.implemented_at ? ` · Implemented ${dateLabel(r.implemented_at)}` : ""}
                  </p>
                )}

                {(canDecide || canDelete) && (
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {canDecide && r.status === "Pending" && (
                      <StatusButton request={r} status="Under Review" icon={Eye} label="Start review" />
                    )}
                    {canDecide && (r.status === "Pending" || r.status === "Under Review") && (
                      <>
                        <DecisionDialog request={r} decision="Approved" items={items} />
                        <DecisionDialog request={r} decision="Rejected" items={items} />
                      </>
                    )}
                    {canDecide && r.status === "Approved" && (
                      <StatusButton
                        request={r}
                        status="Implemented"
                        icon={Rocket}
                        label="Mark implemented"
                      />
                    )}
                    {canDelete && (
                      <DeleteButton
                        table="scope_change_requests"
                        id={r.id}
                        label="Change request"
                        name={r.title}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
