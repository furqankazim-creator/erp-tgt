import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Download, Star } from "lucide-react";

import { useRows } from "@/lib/db";
import { dateLabel } from "@/lib/format";
import { KpiCard } from "@/components/kpi-card";
import { EmptyState } from "@/components/loading";
import { Button } from "@/components/ui/button";
import type { Project } from "@/routes/_authenticated/project";

type Feedback = {
  id: string;
  project_id: string;
  client_name: string;
  rating: number;
  comment: string;
  submitted_at: string;
  status: string;
};

// Simple keyword categorisation of free-text comments — no manual tagging
// UI exists yet, so this stays a lightweight heuristic rollup rather than
// invented sentiment data.
function categorize(comment: string): "Positive" | "Issue" | "Requested improvement" {
  const c = comment.toLowerCase();
  if (/\b(bug|issue|problem|broken|slow|crash|fail)\b/.test(c)) return "Issue";
  if (/\b(could|should|please add|would like|suggest|improve|missing)\b/.test(c))
    return "Requested improvement";
  return "Positive";
}

function buildStatementPdf(
  project: Project,
  feedback: Feedback[],
  avg: number,
  buckets: Record<string, Feedback[]>,
) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`Client Feedback Statement — ${project.name}`, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`${project.client ?? "Internal"} · Average rating ${avg.toFixed(1)}/5`, 14, 25);
  autoTable(doc, {
    startY: 32,
    head: [["Date", "Client", "Rating", "Category", "Comment", "Status"]],
    body: feedback.map((f) => [
      dateLabel(f.submitted_at),
      f.client_name,
      String(f.rating),
      categorize(f.comment),
      f.comment,
      f.status,
    ]),
    headStyles: { fillColor: [20, 140, 130] },
    styles: { fontSize: 8, cellWidth: "wrap" },
    columnStyles: { 4: { cellWidth: 60 } },
  });
  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(
    `Positive ${buckets["Positive"]?.length ?? 0} · Issues ${buckets["Issue"]?.length ?? 0} · Requested improvements ${
      buckets["Requested improvement"]?.length ?? 0
    }`,
    14,
    finalY + 10,
  );
  return doc;
}

export function FeedbackStatementTab({ project }: { projectId: string; project: Project }) {
  const { data: feedbackRows } = useRows<Feedback>("client_feedback");

  const feedback = (feedbackRows ?? []).filter((f) => f.project_id === project.id);
  const avg = feedback.length ? feedback.reduce((s, f) => s + f.rating, 0) / feedback.length : 0;
  const buckets: Record<string, Feedback[]> = {};
  for (const f of feedback) {
    const key = categorize(f.comment);
    (buckets[key] ??= []).push(f);
  }
  const resolved = feedback.filter((f) => f.status === "Reviewed" || f.status === "Resolved").length;

  function exportPdf() {
    const doc = buildStatementPdf(project, feedback, avg, buckets);
    doc.save(`feedback-statement-${project.name.replace(/\s+/g, "-").toLowerCase()}.pdf`);
  }

  if (feedback.length === 0) {
    return <EmptyState title="No feedback yet" description="Nothing to summarize for this project." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button size="sm" onClick={exportPdf}>
          <Download className="size-4" /> Export PDF
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Average rating" value={`${avg.toFixed(1)}/5`} icon={Star} />
        <KpiCard label="Positive" value={String(buckets["Positive"]?.length ?? 0)} icon={Star} />
        <KpiCard label="Issues" value={String(buckets["Issue"]?.length ?? 0)} icon={Star} />
        <KpiCard label="Resolved" value={String(resolved)} icon={Star} />
      </div>
      <div className="surface-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Date</th>
              <th className="px-4 py-3 text-left font-semibold">Client</th>
              <th className="px-4 py-3 text-left font-semibold">Rating</th>
              <th className="px-4 py-3 text-left font-semibold">Category</th>
              <th className="px-4 py-3 text-left font-semibold">Comment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {feedback.map((f) => (
              <tr key={f.id}>
                <td className="px-4 py-3 text-muted-foreground">{dateLabel(f.submitted_at)}</td>
                <td className="px-4 py-3">{f.client_name}</td>
                <td className="px-4 py-3">{f.rating}/5</td>
                <td className="px-4 py-3 text-muted-foreground">{categorize(f.comment)}</td>
                <td className="px-4 py-3 text-muted-foreground">{f.comment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
