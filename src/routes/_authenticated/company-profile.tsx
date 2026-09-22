import { createFileRoute } from "@tanstack/react-router";
import { Building2, Globe, Mail, Phone, Users } from "lucide-react";

import { useRow } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { RecordDialog, type Field } from "@/components/record-dialog";
import { TableSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/company-profile")({
  head: () => ({
    meta: [
      { title: "Company Profile — Time Global Tech CRM" },
      { name: "description", content: "Company identity, contact details and business summary." },
      { property: "og:title", content: "Company Profile — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "The company info shown in proposals and client-facing materials.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CompanyProfilePage,
});

type CompanyProfile = {
  id: string;
  legal_name: string;
  display_name: string;
  tagline: string | null;
  industry: string | null;
  founded_year: number | null;
  headquarters: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  employee_count_band: string | null;
  description: string | null;
  portfolio_url: string | null;
  services_url: string | null;
  legal_docs_url: string | null;
  refund_policy: string | null;
  quotation_terms: string | null;
  process_overview: string | null;
  meeting_link: string | null;
  rate_simple: number | null;
  rate_medium: number | null;
  rate_complex: number | null;
};

const FIELDS: Field[] = [
  { name: "display_name", label: "Display name", required: true },
  { name: "legal_name", label: "Legal name", required: true },
  { name: "tagline", label: "Tagline", full: true },
  { name: "industry", label: "Industry" },
  { name: "founded_year", label: "Founded year", type: "number" },
  { name: "headquarters", label: "Headquarters" },
  { name: "website", label: "Website" },
  { name: "phone", label: "Phone" },
  { name: "email", label: "Email", type: "email" },
  { name: "employee_count_band", label: "Employee count" },
  { name: "description", label: "About / description", type: "textarea", full: true },
  { name: "portfolio_url", label: "Portfolio URL" },
  { name: "services_url", label: "Services / catalogue URL" },
  { name: "legal_docs_url", label: "Legal docs / terms URL" },
  { name: "meeting_link", label: "Meeting booking link (Calendly, etc.)" },
  {
    name: "process_overview",
    label: "Process overview (used in the thank-you email)",
    type: "textarea",
    full: true,
  },
  { name: "refund_policy", label: "Refund policy (short)", type: "textarea", full: true },
  {
    name: "quotation_terms",
    label: "Basic quotation terms & conditions (short)",
    type: "textarea",
    full: true,
  },
  { name: "rate_simple", label: "Basic quote rate — Simple ($/hr)", type: "number" },
  { name: "rate_medium", label: "Basic quote rate — Medium ($/hr)", type: "number" },
  { name: "rate_complex", label: "Basic quote rate — Complex ($/hr)", type: "number" },
];

function CompanyProfilePage() {
  const { data, isLoading } = useRow<CompanyProfile>("company_profile", "default");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company Profile"
        description="The company identity used across proposals and client-facing materials."
        action={
          data ? (
            <RecordDialog
              table="company_profile"
              label="Company profile"
              fields={FIELDS}
              record={data}
              trigger={<Button>Edit profile</Button>}
            />
          ) : null
        }
      />

      {isLoading ? (
        <TableSkeleton />
      ) : !data ? (
        <p className="text-sm text-muted-foreground">No company profile found.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="surface-card p-6 lg:col-span-2">
            <div className="flex items-start gap-4">
              <span className="gradient-primary text-primary-foreground grid size-14 shrink-0 place-items-center rounded-xl">
                <Building2 className="size-7" />
              </span>
              <div>
                <h2 className="text-xl font-bold">{data.display_name}</h2>
                <p className="text-sm text-muted-foreground">{data.legal_name}</p>
                {data.tagline ? <p className="mt-2 text-sm italic">"{data.tagline}"</p> : null}
              </div>
            </div>
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
              {data.description ?? "No description yet."}
            </p>
          </div>

          <div className="surface-card space-y-4 p-6">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">Industry</p>
              <p className="mt-1 text-sm">{data.industry ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">Founded</p>
              <p className="mt-1 text-sm">{data.founded_year ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">Headquarters</p>
              <p className="mt-1 text-sm">{data.headquarters ?? "—"}</p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Users className="text-muted-foreground size-4" /> {data.employee_count_band ?? "—"}{" "}
              employees
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Globe className="text-muted-foreground size-4" /> {data.website ?? "—"}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Phone className="text-muted-foreground size-4" /> {data.phone ?? "—"}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Mail className="text-muted-foreground size-4" /> {data.email ?? "—"}
            </div>
          </div>

          <div className="surface-card space-y-4 p-6 lg:col-span-3">
            <h2 className="font-semibold">Response Email Settings</h2>
            <p className="-mt-2 text-xs text-muted-foreground">
              Used to fill in the links, process text and basic-quote rates in the automatic and
              manual inquiry response emails.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">Portfolio</p>
                <p className="mt-1 truncate text-sm">{data.portfolio_url ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  Services / Catalogue
                </p>
                <p className="mt-1 truncate text-sm">{data.services_url ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  Legal / Terms
                </p>
                <p className="mt-1 truncate text-sm">{data.legal_docs_url ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  Meeting booking link
                </p>
                <p className="mt-1 truncate text-sm">{data.meeting_link ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  Basic quote rates
                </p>
                <p className="mt-1 text-sm">
                  Simple ${data.rate_simple ?? "—"}/hr · Medium ${data.rate_medium ?? "—"}/hr ·
                  Complex ${data.rate_complex ?? "—"}/hr
                </p>
              </div>
            </div>
            {data.process_overview ? (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  Process overview
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{data.process_overview}</p>
              </div>
            ) : null}
            {data.refund_policy ? (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  Refund policy
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{data.refund_policy}</p>
              </div>
            ) : null}
            {data.quotation_terms ? (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  Basic quotation terms &amp; conditions
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{data.quotation_terms}</p>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
