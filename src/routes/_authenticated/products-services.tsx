import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Package, Plus, Search } from "lucide-react";

import { useRows } from "@/lib/db";
import { currency } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog, type Field } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/products-services")({
  head: () => ({
    meta: [
      { title: "Products & Services — Time Global Tech CRM" },
      { name: "description", content: "Service catalog, pricing models and status." },
      { property: "og:title", content: "Products & Services — Time Global Tech CRM" },
      { property: "og:description", content: "What the company sells, and how it's priced." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductsServicesPage,
});

type ProductService = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  pricing_model: string;
  starting_price: number;
  status: string;
  tags: string[];
};

const CATEGORIES = ["Software", "Consulting", "Managed Services", "Training"];
const PRICING_MODELS = ["Fixed Price", "Hourly", "Subscription", "Custom Quote"];
const STATUSES = ["Active", "Beta", "Discontinued"];

const FIELDS: Field[] = [
  { name: "name", label: "Name", required: true, full: true },
  { name: "category", label: "Category", type: "select", options: CATEGORIES },
  { name: "pricing_model", label: "Pricing model", type: "select", options: PRICING_MODELS },
  { name: "starting_price", label: "Starting price (USD)", type: "number" },
  { name: "status", label: "Status", type: "select", options: STATUSES },
  { name: "tags", label: "Tags (comma separated)", type: "tags" },
  { name: "description", label: "Description", type: "textarea", full: true },
];

function ProductsServicesPage() {
  const { data, isLoading } = useRows<ProductService>("products_services");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const items = (data ?? []).filter((p) => {
    const matches = `${p.name} ${p.description ?? ""} ${p.tags.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase());
    return matches && (category === "All" || p.category === category);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products & Services"
        description="The service catalog — what the company sells, and how it's priced."
        action={
          <RecordDialog
            table="products_services"
            label="Product/Service"
            fields={FIELDS}
            defaults={{ category: "Software", pricing_model: "Fixed Price", status: "Active" }}
            trigger={
              <Button>
                <Plus className="size-4" /> New item
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
            placeholder="Search products & services…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["All", ...CATEGORIES].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                category === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => (
            <div key={p.id} className="surface-card surface-card-hover flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <span className="gradient-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-lg">
                  <Package className="size-5" />
                </span>
                <StatusBadge value={p.status} />
              </div>
              <h3 className="mt-3 font-semibold">{p.name}</h3>
              <p className="text-xs text-muted-foreground">{p.category}</p>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{p.description ?? "—"}</p>
              {p.tags?.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.tags.map((t) => (
                    <span
                      key={t}
                      className="bg-accent text-accent-foreground rounded px-1.5 py-0.5 text-[10px] font-semibold"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
                <div>
                  <p className="text-sm font-bold">
                    {currency(p.starting_price, true)}
                    {p.pricing_model === "Hourly" ? "/hr" : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{p.pricing_model}</p>
                </div>
                <div className="flex gap-1">
                  <RecordDialog
                    table="products_services"
                    label="Product/Service"
                    fields={FIELDS}
                    record={p}
                    trigger={
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    }
                  />
                  <DeleteButton
                    table="products_services"
                    id={p.id}
                    label="Product/Service"
                    name={p.name}
                  />
                </div>
              </div>
            </div>
          ))}
          {items.length === 0 ? (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
              No products or services found.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
