import { createFileRoute, useParams } from "@tanstack/react-router";

import { InquiryFormPage } from "@/components/inquiry-form";

export const Route = createFileRoute("/_authenticated/inquiries/$inquiryId/edit")({
  head: () => ({
    meta: [
      { title: "Edit Inquiry — Time Global Tech CRM" },
      { name: "description", content: "Update inquiry details." },
      { property: "og:title", content: "Edit Inquiry — Time Global Tech CRM" },
      { property: "og:description", content: "Update inquiry details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EditInquiry,
});

function EditInquiry() {
  const { inquiryId } = useParams({ from: "/_authenticated/inquiries/$inquiryId/edit" });
  return <InquiryFormPage recordId={inquiryId} />;
}
