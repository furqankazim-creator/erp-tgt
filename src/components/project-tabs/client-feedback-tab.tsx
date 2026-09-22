import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { toast } from "sonner";

import { updateRow, useRows } from "@/lib/db";
import { dateLabel } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { CardGridSkeleton, EmptyState } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Feedback = {
  id: string;
  project_id: string;
  client_name: string;
  rating: number;
  comment: string;
  submitted_at: string;
  status: string;
  response?: string | null;
};

function Stars({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`size-3.5 ${i < value ? "fill-warning text-warning" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

function FeedbackCard({ f }: { f: Feedback }) {
  const [response, setResponse] = useState(f.response ?? "");
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();

  async function save() {
    const { error } = await updateRow("client_feedback", f.id, { response });
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["client_feedback"] });
    setEditing(false);
    toast.success("Response saved");
  }

  return (
    <div className="surface-card animate-rise space-y-2.5 p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">{f.client_name}</p>
        <StatusBadge value={f.status} />
      </div>
      <Stars value={f.rating} />
      <p className="text-sm">{f.comment}</p>
      <p className="text-xs text-muted-foreground">{dateLabel(f.submitted_at)}</p>
      {f.response && !editing ? (
        <div className="rounded-md bg-muted/50 p-2.5 text-sm">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Your response</p>
          {f.response}
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      ) : editing || !f.response ? (
        <div className="space-y-2 border-t border-border pt-2">
          <Textarea
            rows={2}
            placeholder="Write a response…"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
          />
          <Button size="sm" onClick={save} disabled={!response.trim()}>
            Save response
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ClientFeedbackTab({ projectId }: { projectId: string }) {
  const { data: feedbackRows, isLoading } = useRows<Feedback>("client_feedback");
  const feedback = (feedbackRows ?? [])
    .filter((f) => f.project_id === projectId)
    .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));

  const avgRating = feedback.length
    ? (feedback.reduce((s, f) => s + f.rating, 0) / feedback.length).toFixed(1)
    : "—";

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Average rating {avgRating}</p>

      {isLoading ? (
        <CardGridSkeleton />
      ) : feedback.length === 0 ? (
        <EmptyState title="No feedback yet" description="The client hasn't left feedback on this project." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {feedback.map((f) => (
            <FeedbackCard key={f.id} f={f} />
          ))}
        </div>
      )}
    </div>
  );
}
