import { createFileRoute, useParams } from "@tanstack/react-router";

import { ProposalEditorPage } from "@/components/proposal-editor";

export const Route = createFileRoute("/_authenticated/proposals/$proposalId")({
  head: () => ({
    meta: [
      { title: "Proposal — Time Global Tech CRM" },
      { name: "description", content: "Edit, version and send this proposal." },
      { property: "og:title", content: "Proposal — Time Global Tech CRM" },
      { property: "og:description", content: "Edit, version and send this proposal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProposalDetail,
});

function ProposalDetail() {
  const { proposalId } = useParams({ from: "/_authenticated/proposals/$proposalId" });
  return <ProposalEditorPage proposalId={proposalId} />;
}
