import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Plus, RefreshCw, Star } from "lucide-react";
import { toast } from "sonner";

import { callApi, updateRow, useRows, useSaveRow } from "@/lib/db";
import { useCurrentUser } from "@/lib/mock-auth";
import { dateLabel } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { CardGridSkeleton, EmptyState } from "@/components/loading";
import { DeleteButton } from "@/components/delete-button";
import { useScopePermission } from "@/components/project-tabs/scope-change-requests";
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
import type { Project } from "@/routes/_authenticated/project";

export type Feedback = {
  id: string;
  project_id: string;
  client_name: string;
  rating: number;
  comment: string;
  submitted_at: string;
  status: string;
  source?: string | null;
  logged_by?: string | null;
  response?: string | null;
};

// New → Reviewed (someone on the team has read it) → Resolved (acted on).
const NEXT_STATUS: Record<string, { to: string; label: string }> = {
  New: { to: "Reviewed", label: "Mark reviewed" },
  Reviewed: { to: "Resolved", label: "Mark resolved" },
};

function Stars({ value, size = "size-3.5" }: { value: number; size?: string }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`${size} ${i < value ? "fill-warning text-warning" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

function AddFeedbackDialog({ project }: { project: Project }) {
  const { myName } = useScopePermission(project);
  const [open, setOpen] = useState(false);
  const [clientName, setClientName] = useState(project.client ?? "");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const save = useSaveRow("client_feedback", "Feedback");

  function reset() {
    setClientName(project.client ?? "");
    setRating(0);
    setComment("");
    setDate(new Date().toISOString().slice(0, 10));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) {
      toast.error("Pick a rating from 1 to 5 stars.");
      return;
    }
    save.mutate(
      {
        project_id: project.id,
        client_name: clientName.trim() || project.client || "Client",
        rating,
        comment: comment.trim(),
        submitted_at: new Date(`${date}T12:00:00`).toISOString(),
        status: "New",
        source: "Logged by staff",
        logged_by: myName ?? null,
        response: null,
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
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="size-4" /> Add feedback
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add client feedback</DialogTitle>
          <DialogDescription>
            Record feedback the client gave on a call, in a meeting or by email.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div>
            <Label className="mb-1.5 block text-xs font-semibold">Rating</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  aria-pressed={rating === n}
                  onClick={() => setRating(n)}
                  className="rounded p-0.5"
                >
                  <Star
                    className={`size-6 ${n <= rating ? "fill-warning text-warning" : "text-muted-foreground/30"}`}
                  />
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="fb-add-comment" className="mb-1.5 block text-xs font-semibold">
              What the client said <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="fb-add-comment"
              required
              rows={4}
              maxLength={4000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="fb-add-name" className="mb-1.5 block text-xs font-semibold">
                Client / person
              </Label>
              <Input id="fb-add-name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="fb-add-date" className="mb-1.5 block text-xs font-semibold">
                Date
              </Label>
              <Input id="fb-add-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save feedback"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FeedbackLinkDialog({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = token ? `${window.location.origin}/feedback/${token}` : "";

  async function load(regenerate = false) {
    setBusy(true);
    try {
      const res = (await callApi(`/projects/${project.id}/feedback-link`, {
        method: "POST",
        body: JSON.stringify({ regenerate }),
      })) as { token: string };
      setToken(res.token);
      if (regenerate) toast.success("New link created — the old one no longer works.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the link");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && !token) void load();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Link2 className="size-4" /> Client feedback link
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ask {project.client ?? "the client"} for feedback</DialogTitle>
          <DialogDescription>
            Send this link to the client (email, WhatsApp…). They can rate the project and comment
            without logging in, and it shows up here as New.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input readOnly value={busy && !token ? "Creating link…" : url} onFocus={(e) => e.target.select()} />
          <Button size="icon" variant="outline" className="shrink-0" onClick={copy} disabled={!token} aria-label="Copy link">
            <Copy className="size-4" />
          </Button>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => void load(true)} disabled={busy}>
            <RefreshCw className="size-3.5" /> Replace link
          </Button>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeedbackCard({ f, canDelete }: { f: Feedback; canDelete: boolean }) {
  const [response, setResponse] = useState(f.response ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const next = NEXT_STATUS[f.status];

  async function patch(values: Partial<Feedback>, message: string) {
    setBusy(true);
    const { error } = await updateRow("client_feedback", f.id, values);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    await qc.invalidateQueries({ queryKey: ["client_feedback"] });
    toast.success(message);
    return true;
  }

  return (
    <div className="surface-card animate-rise space-y-2.5 p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{f.client_name}</p>
          <p className="text-xs text-muted-foreground">
            {dateLabel(f.submitted_at)}
            {f.source === "Client link"
              ? " · via feedback link"
              : f.logged_by
                ? ` · logged by ${f.logged_by}`
                : ""}
          </p>
        </div>
        <StatusBadge value={f.status} />
      </div>
      <Stars value={f.rating} />
      <p className="whitespace-pre-line text-sm">{f.comment}</p>

      {f.response && !editing ? (
        <div className="rounded-md bg-muted/50 p-2.5 text-sm">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Team response</p>
          <p className="whitespace-pre-line">{f.response}</p>
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      ) : (
        <div className="space-y-2 border-t border-border pt-2">
          <Textarea
            rows={2}
            placeholder="How the team is responding…"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !response.trim()}
            onClick={async () => {
              if (await patch({ response: response.trim() }, "Response saved")) setEditing(false);
            }}
          >
            Save response
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        {next ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void patch({ status: next.to }, `Marked ${next.to.toLowerCase()}`)}
          >
            {next.label}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void patch({ status: "Reviewed" }, "Reopened")}
          >
            Reopen
          </Button>
        )}
        {canDelete && (
          <DeleteButton table="client_feedback" id={f.id} label="Feedback" name={f.client_name} />
        )}
      </div>
    </div>
  );
}

export function ClientFeedbackTab({ project }: { projectId: string; project: Project }) {
  const { data: me } = useCurrentUser();
  const { canDecide } = useScopePermission(project);
  const { data: feedbackRows, isLoading } = useRows<Feedback>("client_feedback");
  const feedback = (feedbackRows ?? [])
    .filter((f) => f.project_id === project.id)
    .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));

  const avgRating = feedback.length
    ? (feedback.reduce((s, f) => s + Number(f.rating), 0) / feedback.length).toFixed(1)
    : null;
  const isAdmin = me?.access_role === "super_admin" || me?.access_role === "admin";
  const newCount = feedback.filter((f) => f.status === "New").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {avgRating ? (
            <>
              <Stars value={Math.round(Number(avgRating))} size="size-4" />
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{avgRating}</span> average from{" "}
                {feedback.length} response{feedback.length === 1 ? "" : "s"}
                {newCount ? ` · ${newCount} new` : ""}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No ratings yet</p>
          )}
        </div>
        <div className="flex gap-2">
          <AddFeedbackDialog project={project} />
          {canDecide && <FeedbackLinkDialog project={project} />}
        </div>
      </div>

      {isLoading ? (
        <CardGridSkeleton />
      ) : feedback.length === 0 ? (
        <EmptyState
          title="No feedback yet"
          description={
            canDecide
              ? 'Send the client the "Client feedback link", or use "Add feedback" to record what they told you.'
              : 'Use "Add feedback" to record what the client told you.'
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {feedback.map((f) => (
            <FeedbackCard key={f.id} f={f} canDelete={isAdmin || canDecide} />
          ))}
        </div>
      )}
    </div>
  );
}
