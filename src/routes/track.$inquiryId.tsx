import { useEffect, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { Check, Mail, Phone, Sparkles } from "lucide-react";

import { callApi } from "@/lib/db";
import { dateLabel } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";

export const Route = createFileRoute("/track/$inquiryId")({
  head: () => ({
    meta: [
      { title: "Track your inquiry — Time Global Tech" },
      { name: "description", content: "Check the status of your inquiry." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: TrackPage,
});

// The public-facing pipeline — same stages the CRM's Status Pipeline uses,
// just without the internal-only "Lost" branch shown as a step.
const STAGES = ["New", "In Review", "Responded", "Proposal Sent", "Deal Done"];

type PublicStatus = {
  display_id: string | null;
  client_name: string;
  status: string;
  received_date: string | null;
  expected_close_date: string | null;
  company: { display_name: string | null; phone: string | null; email: string | null };
} | null;

function TrackPage() {
  const { inquiryId } = useParams({ from: "/track/$inquiryId" });
  const [data, setData] = useState<PublicStatus>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    callApi(`/public/inquiries/${inquiryId}/status`)
      .then((r) => setData(r as PublicStatus))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [inquiryId]);

  const displayName = data?.company?.display_name || "Time Global Tech";
  const stepIndex = data ? STAGES.indexOf(data.status) : -1;
  const isLost = data?.status === "Lost";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="animate-rise w-full max-w-lg">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5">
          <span className="gradient-primary text-primary-foreground grid size-9 place-items-center rounded-xl">
            <Sparkles className="size-5" />
          </span>
          <span className="font-bold">{displayName}</span>
        </Link>

        <div className="surface-card p-6 sm:p-8">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : notFound || !data ? (
            <div className="text-center">
              <h1 className="text-xl font-bold tracking-tight">We couldn't find that inquiry</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Double-check the link, or reach out to us directly.
              </p>
            </div>
          ) : (
            <>
              <p className="font-mono text-xs font-semibold tracking-wide text-primary">
                {data.display_id ?? "Reference on file"}
              </p>
              <h1 className="mt-0.5 text-xl font-bold tracking-tight">
                Hi {data.client_name}, here's where things stand
              </h1>

              <div className="mt-6">
                {isLost ? (
                  <StatusBadge value="Lost" />
                ) : (
                  <div className="flex items-center">
                    {STAGES.map((stage, i) => (
                      <div key={stage} className="flex flex-1 items-center last:flex-none">
                        <div className="flex flex-col items-center gap-1.5">
                          <span
                            className={`grid size-8 place-items-center rounded-full text-xs font-bold transition-colors ${
                              i <= stepIndex
                                ? "gradient-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {i < stepIndex ? <Check className="size-3.5" /> : i + 1}
                          </span>
                          <span
                            className={`hidden text-center text-[10px] font-medium sm:block ${
                              i === stepIndex
                                ? "font-semibold text-primary"
                                : "text-muted-foreground"
                            }`}
                          >
                            {stage}
                          </span>
                        </div>
                        {i < STAGES.length - 1 ? (
                          <div
                            className={`mx-1.5 h-px flex-1 ${i < stepIndex ? "bg-primary" : "bg-border"}`}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-center text-sm font-medium sm:hidden">{data.status}</p>
              </div>

              <div className="mt-6 grid gap-3 border-t border-border/60 pt-5 text-sm sm:grid-cols-2">
                {data.received_date ? (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                      Received
                    </p>
                    <p className="mt-0.5">{dateLabel(data.received_date)}</p>
                  </div>
                ) : null}
                {data.expected_close_date ? (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                      Expected closure
                    </p>
                    <p className="mt-0.5">{dateLabel(data.expected_close_date)}</p>
                  </div>
                ) : null}
              </div>

              {data.company.phone || data.company.email ? (
                <div className="mt-5 space-y-1.5 border-t border-border/60 pt-5 text-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                    Questions? Reach us directly
                  </p>
                  {data.company.phone ? (
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="size-3.5" /> {data.company.phone}
                    </p>
                  ) : null}
                  {data.company.email ? (
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                      <Mail className="size-3.5" />
                      <a href={`mailto:${data.company.email}`} className="hover:text-foreground">
                        {data.company.email}
                      </a>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
