import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Banknote,
  CreditCard,
  FileSpreadsheet,
  FileText,
  Landmark,
  MoreHorizontal,
  Plus,
  Receipt,
  Wallet,
} from "lucide-react";

import { useRows } from "@/lib/db";
import { currency, dateLabel } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog, type Field } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type InvoiceAccountOption,
  type InvoiceProjectOption,
  SendInvoiceDialog,
  buildInvoiceFields,
} from "@/components/invoice-shared";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — Time Global Tech CRM" },
      {
        name: "description",
        content:
          "Invoices raised against projects and deals, and the payments recorded against them.",
      },
      { property: "og:title", content: "Invoices — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "The last two steps of the inquiry-to-cash workflow.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InvoicesPage,
});

type Invoice = {
  id: string;
  invoice_number: string;
  project_id: string | null;
  deal_id: string | null;
  client: string | null;
  amount: number;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  notes: string | null;
  sent_to?: string | null;
};

type Payment = {
  id: string;
  invoice_id: string;
  amount: number;
  payment_date: string | null;
  method: string;
  reference: string | null;
  notes: string | null;
};

type ProjectRow = InvoiceProjectOption;
type Account = InvoiceAccountOption;

const PAYMENT_METHODS = ["Bank Transfer", "Credit Card", "Cash", "Cheque", "Other"];
const OPEN_STATUSES = ["Draft", "Sent", "Overdue"];

const METHOD_ICON: Record<string, typeof Landmark> = {
  "Bank Transfer": Landmark,
  "Credit Card": CreditCard,
  Cash: Banknote,
  Cheque: FileText,
  Other: MoreHorizontal,
};

function paymentFields(): Field[] {
  return [
    { name: "invoice_id", label: "Invoice", type: "hidden" },
    { name: "amount", label: "Amount (USD)", type: "number", required: true },
    { name: "payment_date", label: "Payment date", type: "date" },
    { name: "method", label: "Method", type: "select", options: PAYMENT_METHODS },
    { name: "reference", label: "Reference / transaction ID", full: true },
    { name: "notes", label: "Notes", type: "textarea", full: true },
  ];
}

function InvoicesPage() {
  const { data, isLoading } = useRows<Invoice>("invoices");
  const { data: paymentRows, isLoading: paymentsLoading } = useRows<Payment>("payments");
  const { data: projectRows } = useRows<ProjectRow>("projects");
  const { data: accountRows } = useRows<Account>("accounts");

  const invoices = data ?? [];
  const payments = paymentRows ?? [];
  const projects = projectRows ?? [];
  const accounts = accountRows ?? [];
  const FIELDS = buildInvoiceFields(projects, accounts);

  function paidFor(invoiceId: string) {
    return payments
      .filter((p) => p.invoice_id === invoiceId)
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);
  }

  function projectName(inv: Invoice) {
    return projects.find((p) => p.id === inv.project_id)?.name ?? null;
  }

  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.amount ?? 0), 0);
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const outstanding = Math.max(0, totalInvoiced - totalPaid);
  const overdueCount = invoices.filter(
    (i) =>
      OPEN_STATUSES.includes(i.status) &&
      i.due_date &&
      new Date(i.due_date).getTime() < Date.now() &&
      paidFor(i.id) < Number(i.amount ?? 0),
  ).length;

  const isLoadingAll = isLoading || paymentsLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Won Deal → Project → Invoice → Payment. The final two steps of the workflow, linked back to the project that earned them."
        action={
          <RecordDialog
            table="invoices"
            label="Invoice"
            fields={FIELDS}
            defaults={{ status: "Draft", issue_date: new Date().toISOString().slice(0, 10) }}
            trigger={
              <Button>
                <Plus className="size-4" /> New invoice
              </Button>
            }
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total invoiced"
          value={currency(totalInvoiced, true)}
          icon={FileSpreadsheet}
          className="ring-1 ring-primary/20"
        />
        <KpiCard
          label="Total collected"
          value={currency(totalPaid, true)}
          icon={CreditCard}
          className="ring-1 ring-success/25"
          {...(totalInvoiced
            ? { hint: `${Math.round((totalPaid / totalInvoiced) * 100)}% of invoiced` }
            : {})}
        />
        <KpiCard label="Outstanding" value={currency(outstanding, true)} icon={Wallet} />
        <KpiCard
          label="Overdue"
          value={String(overdueCount)}
          icon={AlertTriangle}
          className={overdueCount ? "ring-1 ring-destructive/30" : ""}
        />
      </div>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="pt-4">
          {isLoadingAll ? (
            <TableSkeleton />
          ) : (
            <div className="surface-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Invoice #</th>
                    <th className="px-4 py-3 text-left font-semibold">Client</th>
                    <th className="px-4 py-3 text-left font-semibold">Project</th>
                    <th className="px-4 py-3 text-left font-semibold">Amount</th>
                    <th className="px-4 py-3 text-left font-semibold">Paid</th>
                    <th className="px-4 py-3 text-left font-semibold">Due</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {invoices.map((inv) => {
                    const paid = paidFor(inv.id);
                    const remaining = Math.max(0, Number(inv.amount ?? 0) - paid);
                    return (
                      <tr key={inv.id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3 font-medium">{inv.invoice_number}</td>
                        <td className="px-4 py-3">{inv.client ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {projectName(inv) ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-semibold">{currency(inv.amount, true)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              remaining > 0 ? "text-muted-foreground" : "text-success font-medium"
                            }
                          >
                            {currency(paid, true)}
                          </span>
                          {Number(inv.amount) > 0 ? (
                            <div className="bg-muted mt-1 h-1 w-20 overflow-hidden rounded-full">
                              <div
                                className={`h-full rounded-full ${remaining > 0 ? "bg-primary" : "bg-success"}`}
                                style={{
                                  width: `${Math.min(100, Math.round((paid / Number(inv.amount)) * 100))}%`,
                                }}
                              />
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {dateLabel(inv.due_date)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={inv.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            {remaining > 0 ? (
                              <RecordDialog
                                table="payments"
                                label="Payment"
                                fields={paymentFields()}
                                defaults={{
                                  invoice_id: inv.id,
                                  amount: String(remaining),
                                  method: "Bank Transfer",
                                  payment_date: new Date().toISOString().slice(0, 10),
                                }}
                                trigger={
                                  <Button variant="outline" size="sm">
                                    Record payment
                                  </Button>
                                }
                              />
                            ) : null}
                            <RecordDialog
                              table="invoices"
                              label="Invoice"
                              fields={FIELDS}
                              record={inv}
                              trigger={
                                <Button variant="ghost" size="sm">
                                  Edit
                                </Button>
                              }
                            />
                            <SendInvoiceDialog invoice={inv} />
                            <DeleteButton
                              table="invoices"
                              id={inv.id}
                              label="Invoice"
                              name={inv.invoice_number}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center">
                        <FileSpreadsheet className="text-muted-foreground/40 mx-auto mb-2 size-8" />
                        <p className="text-sm font-medium">No invoices yet</p>
                        <p className="text-xs text-muted-foreground">
                          Raise one from a delivered project.
                        </p>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="payments" className="pt-4">
          {isLoadingAll ? (
            <TableSkeleton />
          ) : (
            <div className="surface-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Invoice #</th>
                    <th className="px-4 py-3 text-left font-semibold">Amount</th>
                    <th className="px-4 py-3 text-left font-semibold">Date</th>
                    <th className="px-4 py-3 text-left font-semibold">Method</th>
                    <th className="px-4 py-3 text-left font-semibold">Reference</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {payments.map((p) => {
                    const inv = invoices.find((i) => i.id === p.invoice_id);
                    return (
                      <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3 font-medium">{inv?.invoice_number ?? "—"}</td>
                        <td className="px-4 py-3 font-semibold">{currency(p.amount, true)}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {dateLabel(p.payment_date)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="bg-accent text-accent-foreground inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-semibold">
                            {(() => {
                              const MethodIcon = METHOD_ICON[p.method] ?? MoreHorizontal;
                              return <MethodIcon className="size-3" />;
                            })()}
                            {p.method}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{p.reference ?? "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            <DeleteButton
                              table="payments"
                              id={p.id}
                              label="Payment"
                              name={inv?.invoice_number ?? "payment"}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        <Receipt className="text-muted-foreground/40 mx-auto mb-2 size-8" />
                        <p className="text-sm font-medium">No payments recorded yet</p>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
