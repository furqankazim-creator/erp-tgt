import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Percent, Plus, Target, Trophy } from "lucide-react";

import { useRows } from "@/lib/db";
import { useCurrentUser } from "@/lib/mock-auth";
import { currency, number } from "@/lib/format";
import { useOrgCostPerHour } from "@/lib/costing";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { QuoteCalculatorDialog, type Quote } from "@/components/quote-calculator-dialog";

export const Route = createFileRoute("/_authenticated/estimations/")({
  head: () => ({
    meta: [
      { title: "Estimations — Time Global Tech CRM" },
      {
        name: "description",
        content: "Price estimates and quotations off the live organizational cost per hour.",
      },
      { property: "og:title", content: "Estimations — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "Every quote priced off real cost basis, hours and margin.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EstimationsPage,
});

type ProjectRow = { id: string; name: string };
type DealRow = { id: string; title: string };
type Employee = { id: string; name: string; email: string | null };

function EstimationsPage() {
  const { costPerHour } = useOrgCostPerHour();
  const { data: quoteRows, isLoading: quotesLoading } = useRows<Quote>("quotes");
  const { data: projectRows } = useRows<ProjectRow>("projects");
  const { data: dealRows } = useRows<DealRow>("deals");
  const { data: employeeRows } = useRows<Employee>("employees");
  const { data: me } = useCurrentUser();

  const myName = (employeeRows ?? []).find(
    (e) => e.email && me?.email && e.email.toLowerCase() === me.email.toLowerCase(),
  )?.name;

  const allQuotes = quoteRows ?? [];
  // Same "own work only" rule as everywhere else Salesman is scoped.
  const quotes =
    me?.access_role === "salesman"
      ? myName
        ? allQuotes.filter((q) => q.owner === myName)
        : []
      : allQuotes;
  const projects = projectRows ?? [];
  const deals = dealRows ?? [];

  const pipelineValue = quotes
    .filter((q) => q.status === "Draft" || q.status === "Sent")
    .reduce((s, q) => s + Number(q.suggested_price ?? 0), 0);
  const wonValue = quotes
    .filter((q) => q.status === "Accepted")
    .reduce((s, q) => s + Number(q.suggested_price ?? 0), 0);
  const decided = quotes.filter((q) => q.status === "Accepted" || q.status === "Rejected");
  const winRate = decided.length
    ? Math.round((decided.filter((q) => q.status === "Accepted").length / decided.length) * 100)
    : 0;
  const avgMargin = quotes.length
    ? Math.round(quotes.reduce((s, q) => s + Number(q.margin_percent ?? 0), 0) / quotes.length)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estimations"
        description={
          me?.access_role === "salesman"
            ? `Your quotes, priced off the live organizational cost per hour — ${currency(costPerHour)}/hr today.`
            : `Price estimates and quotations off the live organizational cost per hour — ${currency(costPerHour)}/hr today.`
        }
        action={
          <QuoteCalculatorDialog
            defaultOwner={me?.access_role === "salesman" ? (myName ?? "") : undefined}
            trigger={
              <Button>
                <Plus className="size-4" /> New quote
              </Button>
            }
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Pipeline value" value={currency(pipelineValue, true)} icon={FileText} />
        <KpiCard label="Won value" value={currency(wonValue, true)} icon={Trophy} />
        <KpiCard label="Win rate" value={`${winRate}%`} icon={Target} />
        <KpiCard label="Avg. margin" value={`${avgMargin}%`} icon={Percent} />
      </div>

      {quotesLoading ? (
        <TableSkeleton />
      ) : quotes.length === 0 ? (
        <div className="surface-card p-12 text-center">
          <p className="text-sm font-medium">No quotes yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use the calculator to price your first estimate.
          </p>
        </div>
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Quote</th>
                <th className="px-4 py-3 text-left font-semibold">Hours</th>
                <th className="px-4 py-3 text-left font-semibold">Rate</th>
                <th className="px-4 py-3 text-left font-semibold">Price</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {quotes.map((q) => {
                const project = projects.find((p) => p.id === q.project_id);
                const deal = deals.find((d) => d.id === q.deal_id);
                return (
                  <tr key={q.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium">{q.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {q.client ?? "—"}
                        {deal ? ` · ${deal.title}` : ""}
                        {project ? ` · ${project.name}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{number(q.estimated_hours)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{currency(q.rate_used)}/hr</td>
                    <td className="px-4 py-3 font-semibold">{currency(q.suggested_price)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge value={q.status} />
                        {q.stale ? (
                          <span
                            className="rounded-full bg-warning/12 px-2 py-0.5 text-[11px] font-semibold text-warning"
                            title="No update in 7+ days"
                          >
                            Stale
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="ghost" size="sm">
                          <Link to="/estimations/$quoteId" params={{ quoteId: q.id }}>
                            Detailed estimate
                          </Link>
                        </Button>
                        <QuoteCalculatorDialog
                          quote={q}
                          trigger={
                            <Button variant="ghost" size="sm">
                              Edit
                            </Button>
                          }
                        />
                        <DeleteButton table="quotes" id={q.id} label="Quote" name={q.title} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
