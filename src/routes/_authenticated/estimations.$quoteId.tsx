import { createFileRoute, useParams } from "@tanstack/react-router";

import { EstimationDetailPage } from "@/components/estimation-detail";

export const Route = createFileRoute("/_authenticated/estimations/$quoteId")({
  head: () => ({
    meta: [
      { title: "Estimation — Time Global Tech CRM" },
      {
        name: "description",
        content: "Structured estimation — scope, tech stack, deliverables, cost slab, milestones.",
      },
      { property: "og:title", content: "Estimation — Time Global Tech CRM" },
      { property: "og:description", content: "Detailed estimation breakdown." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EstimationDetail,
});

function EstimationDetail() {
  const { quoteId } = useParams({ from: "/_authenticated/estimations/$quoteId" });
  return <EstimationDetailPage quoteId={quoteId} />;
}
