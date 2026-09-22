import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileText, Plus, Search } from "lucide-react";

import { useRows } from "@/lib/db";
import { dateLabel } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog, type Field } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/sales-literature")({
  head: () => ({
    meta: [
      { title: "Sales Literature — Time Global Tech CRM" },
      { name: "description", content: "Brochures, case studies, datasheets and pitch material." },
      { property: "og:title", content: "Sales Literature — Time Global Tech CRM" },
      { property: "og:description", content: "The library of client-facing sales collateral." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SalesLiteraturePage,
});

type Literature = {
  id: string;
  title: string;
  type: string;
  description: string | null;
  audience: string | null;
  version: string | null;
  status: string;
  tags: string[];
  updated_at: string;
};

const TYPES = ["Brochure", "Case Study", "Datasheet", "One-Pager", "Presentation", "Whitepaper"];
const STATUSES = ["Draft", "Published", "Archived"];

const FIELDS: Field[] = [
  { name: "title", label: "Title", required: true, full: true },
  { name: "type", label: "Type", type: "select", options: TYPES },
  { name: "audience", label: "Audience" },
  { name: "version", label: "Version" },
  { name: "status", label: "Status", type: "select", options: STATUSES },
  { name: "tags", label: "Tags (comma separated)", type: "tags" },
  { name: "description", label: "Description", type: "textarea", full: true },
];

function SalesLiteraturePage() {
  const { data, isLoading } = useRows<Literature>("sales_literature");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");

  const items = (data ?? []).filter((l) => {
    const matches = `${l.title} ${l.description ?? ""} ${l.audience ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase());
    return matches && (type === "All" || l.type === type);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Literature"
        description="Brochures, case studies, datasheets and pitch material for the sales team."
        action={
          <RecordDialog
            table="sales_literature"
            label="Document"
            fields={FIELDS}
            defaults={{ type: "Brochure", status: "Draft", audience: "General" }}
            trigger={
              <Button>
                <Plus className="size-4" /> New document
              </Button>
            }
          />
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            className="pl-9"
            placeholder="Search sales literature…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["All", ...TYPES].map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                type === t
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Document</th>
                <th className="px-4 py-3 text-left font-semibold">Type</th>
                <th className="px-4 py-3 text-left font-semibold">Audience</th>
                <th className="px-4 py-3 text-left font-semibold">Version</th>
                <th className="px-4 py-3 text-left font-semibold">Updated</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {items.map((l) => (
                <tr key={l.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 font-medium">
                      <FileText className="text-muted-foreground size-4 shrink-0" />
                      {l.title}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{l.type}</td>
                  <td className="px-4 py-3 text-muted-foreground">{l.audience ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{l.version ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{dateLabel(l.updated_at)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge value={l.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <RecordDialog
                        table="sales_literature"
                        label="Document"
                        fields={FIELDS}
                        record={l}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        }
                      />
                      <DeleteButton
                        table="sales_literature"
                        id={l.id}
                        label="Document"
                        name={l.title}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No documents found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
