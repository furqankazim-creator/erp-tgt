import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Award, Plus, Search } from "lucide-react";

import { useRows } from "@/lib/db";
import { dateLabel } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog, type Field } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/certifications")({
  head: () => ({
    meta: [
      { title: "Certifications — Time Global Tech CRM" },
      {
        name: "description",
        content: "Company certifications, compliance attestations and renewal dates.",
      },
      { property: "og:title", content: "Certifications — Time Global Tech CRM" },
      { property: "og:description", content: "What the company is certified for, and until when." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CertificationsPage,
});

type Certification = {
  id: string;
  name: string;
  issuing_body: string;
  category: string;
  certificate_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  notes: string | null;
};

const CATEGORIES = ["Security", "Quality", "Industry", "Compliance"];

const FIELDS: Field[] = [
  { name: "name", label: "Certification name", required: true, full: true },
  { name: "issuing_body", label: "Issuing body", required: true },
  { name: "category", label: "Category", type: "select", options: CATEGORIES },
  { name: "certificate_number", label: "Certificate number" },
  { name: "issue_date", label: "Issue date", type: "date" },
  { name: "expiry_date", label: "Expiry date", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
];

function expiryStatus(expiryDate: string | null): {
  label: string;
  tone: "success" | "warning" | "danger";
} {
  if (!expiryDate) return { label: "No expiry", tone: "success" };
  const days = (new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (days < 0) return { label: "Expired", tone: "danger" };
  if (days <= 60) return { label: "Expiring soon", tone: "warning" };
  return { label: "Active", tone: "success" };
}

function CertificationsPage() {
  const { data, isLoading } = useRows<Certification>("certifications");
  const [query, setQuery] = useState("");

  const items = (data ?? []).filter((c) =>
    `${c.name} ${c.issuing_body} ${c.category}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Certifications"
        description="Company certifications, compliance attestations and renewal dates."
        action={
          <RecordDialog
            table="certifications"
            label="Certification"
            fields={FIELDS}
            defaults={{ category: "Security" }}
            trigger={
              <Button>
                <Plus className="size-4" /> New certification
              </Button>
            }
          />
        }
      />

      <div className="relative sm:max-w-sm">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          className="pl-9"
          placeholder="Search certifications…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => {
            const status = expiryStatus(c.expiry_date);
            return (
              <div key={c.id} className="surface-card p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className="gradient-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-lg">
                    <Award className="size-5" />
                  </span>
                  <StatusBadge value={status.label} tone={status.tone} />
                </div>
                <h3 className="mt-3 font-semibold">{c.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {c.issuing_body} · {c.category}
                </p>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {c.certificate_number ? <p>№ {c.certificate_number}</p> : null}
                  <p>
                    Issued {dateLabel(c.issue_date)} · Expires {dateLabel(c.expiry_date)}
                  </p>
                </div>
                {c.notes ? <p className="mt-3 text-sm">{c.notes}</p> : null}
                <div className="mt-4 flex justify-end gap-1 border-t border-border/60 pt-3">
                  <RecordDialog
                    table="certifications"
                    label="Certification"
                    fields={FIELDS}
                    record={c}
                    trigger={
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    }
                  />
                  <DeleteButton
                    table="certifications"
                    id={c.id}
                    label="Certification"
                    name={c.name}
                  />
                </div>
              </div>
            );
          })}
          {items.length === 0 ? (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
              No certifications found.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
