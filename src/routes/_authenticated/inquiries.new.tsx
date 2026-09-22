import { createFileRoute } from "@tanstack/react-router";

import { InquiryFormPage } from "@/components/inquiry-form";

export const Route = createFileRoute("/_authenticated/inquiries/new")({
  head: () => ({
    meta: [
      { title: "New Inquiry — Time Global Tech CRM" },
      { name: "description", content: "Manually enter new inquiry details." },
      { property: "og:title", content: "New Inquiry — Time Global Tech CRM" },
      { property: "og:description", content: "Manually enter new inquiry details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <InquiryFormPage />,
});
