import { useEffect, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { CheckCircle2, Sparkles, Star } from "lucide-react";

import { callApi } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/feedback/$token")({
  head: () => ({
    meta: [
      { title: "Share your feedback — Time Global Tech" },
      { name: "description", content: "Tell us how your project is going." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: FeedbackPage,
});

type LinkInfo = { project_name: string; client: string | null; company_name: string };

const RATING_WORDS = ["", "Very unhappy", "Unhappy", "Okay", "Happy", "Very happy"];

// Public, no login: a client opens the link their PM shared and rates the
// project. Everything they submit lands in the project's Client Feedback tab.
function FeedbackPage() {
  const { token } = useParams({ from: "/feedback/$token" });
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [state, setState] = useState<"loading" | "invalid" | "form" | "sent">("loading");
  const [name, setName] = useState("");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    callApi(`/public/feedback/${token}`)
      .then((r) => {
        const data = r as LinkInfo;
        setInfo(data);
        setName(data.client ?? "");
        setState("form");
      })
      .catch(() => setState("invalid"));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) {
      setError("Pick a rating from 1 to 5 stars.");
      return;
    }
    if (!comment.trim()) {
      setError("Please add a short comment.");
      return;
    }
    setError(null);
    setSending(true);
    try {
      await callApi(`/public/feedback/${token}`, {
        method: "POST",
        body: JSON.stringify({ client_name: name, rating, comment }),
      });
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send your feedback. Please try again.");
    } finally {
      setSending(false);
    }
  }

  const shown = hover || rating;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="animate-rise w-full max-w-lg">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="gradient-primary text-primary-foreground grid size-9 place-items-center rounded-xl">
            <Sparkles className="size-5" />
          </span>
          <span className="font-bold">{info?.company_name ?? "Time Global Tech"}</span>
        </div>

        <div className="surface-card p-6 sm:p-8">
          {state === "loading" ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : state === "invalid" ? (
            <div className="text-center">
              <h1 className="text-xl font-bold tracking-tight">This feedback link isn&apos;t valid</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                It may have been replaced with a new one. Ask your project manager for the latest link.
              </p>
            </div>
          ) : state === "sent" ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto size-10 text-success" />
              <h1 className="mt-3 text-xl font-bold tracking-tight">Thank you!</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Your feedback on {info?.project_name} has reached the project team.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-5"
                onClick={() => {
                  setRating(0);
                  setComment("");
                  setState("form");
                }}
              >
                Send more feedback
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="grid gap-5">
              <div>
                <h1 className="text-xl font-bold tracking-tight">How is {info?.project_name} going?</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your feedback goes straight to the project team.
                </p>
              </div>

              <div>
                <Label className="mb-2 block text-xs font-semibold">Your rating</Label>
                <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-label={`${n} star${n === 1 ? "" : "s"}`}
                      aria-pressed={rating === n}
                      onMouseEnter={() => setHover(n)}
                      onClick={() => setRating(n)}
                      className="rounded-md p-0.5 focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <Star
                        className={`size-8 transition-colors ${n <= shown ? "fill-warning text-warning" : "text-muted-foreground/30"}`}
                      />
                    </button>
                  ))}
                  <span className="ml-2 text-sm text-muted-foreground">{RATING_WORDS[shown]}</span>
                </div>
              </div>

              <div>
                <Label htmlFor="fb-comment" className="mb-1.5 block text-xs font-semibold">
                  Comments
                </Label>
                <Textarea
                  id="fb-comment"
                  rows={5}
                  maxLength={4000}
                  placeholder="What's going well, what isn't, anything you'd like changed…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="fb-name" className="mb-1.5 block text-xs font-semibold">
                  Your name
                </Label>
                <Input
                  id="fb-name"
                  maxLength={200}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" disabled={sending}>
                {sending ? "Sending…" : "Send feedback"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
