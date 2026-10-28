import { Plus } from "lucide-react";

import { useRows } from "@/lib/db";
import { currency, dateLabel } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { TableSkeleton, EmptyState } from "@/components/loading";
import { RecordDialog } from "@/components/record-dialog";
import { Button } from "@/components/ui/button";
import {
  type InvoiceAccountOption,
  type InvoiceProjectOption,
  SendInvoiceDialog,
  buildInvoiceFields,
  useIsInvoiceAdmin,
} from "@/components/invoice-shared";
import type { Project } from "@/routes/_authenticated/project";

// Invoices are raised and emailed to the client by an Admin only. Everyone
// else on the project sees them here read-only, including whether and when
// each one went out. The server enforces the same rule.
type Invoice = {
  id: string;
  invoice_number: string;
  project_id: string | null;
  client: string | null;
  amount: number;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  sent_to?: string | null;
  sent_at?: string | null;
  sent_by?: string | null;
};

export function SendInvoiceTab({ project }: { projectId: string; project: Project }) {
  const isAdmin = useIsInvoiceAdmin();
  const { data: invoiceRows, isLoading } = useRows<Invoice>("invoices");
  const { data: projectRows } = useRows<InvoiceProjectOption>("projects");
  const { data: accountRows } = useRows<InvoiceAccountOption>("accounts");

  const invoices = (invoiceRows ?? []).filter((inv) => inv.project_id === project.id);
  const fields = buildInvoiceFields(projectRows ?? [], accountRows ?? []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Raise an invoice for this project and email it to the client."
            : "Invoices are raised and sent to the client by an Admin. You can see their status here."}
        </p>
        {isAdmin && (
          <RecordDialog
            table="invoices"
            label="Invoice"
            fields={fields}
            defaults={{
              status: "Draft",
              project_id: project.id,
              client: project.client ?? "",
              issue_date: new Date().toISOString().slice(0, 10),
            }}
            trigger={
              <Button size="sm">
                <Plus className="size-4" /> New invoice
              </Button>
            }
          />
        )}
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : invoices.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description={
            isAdmin
              ? 'No invoices have been raised for this project. Use "New invoice" to create one.'
              : "No invoices have been raised for this project yet."
          }
        />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Invoice #</th>
                <th className="px-4 py-3 text-left font-semibold">Client</th>
                <th className="px-4 py-3 text-left font-semibold">Issued</th>
                <th className="px-4 py-3 text-left font-semibold">Due</th>
                <th className="px-4 py-3 text-left font-semibold">Amount</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">{inv.invoice_number}</td>
                  <td className="px-4 py-3">{inv.client ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{dateLabel(inv.issue_date)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{dateLabel(inv.due_date)}</td>
                  <td className="px-4 py-3 font-semibold">{currency(inv.amount, true)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge value={inv.status} />
                    {inv.sent_at && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Sent to {inv.sent_to} · {dateLabel(inv.sent_at)}
                        {inv.sent_by ? ` by ${inv.sent_by}` : ""}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isAdmin ? (
                      <div className="flex justify-end gap-1">
                        <RecordDialog
                          table="invoices"
                          label="Invoice"
                          fields={fields}
                          record={inv}
                          trigger={
                            <Button variant="ghost" size="sm">
                              Edit
                            </Button>
                          }
                        />
                        <SendInvoiceDialog invoice={inv} />
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
