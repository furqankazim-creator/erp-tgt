import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { callApi, useRows } from "@/lib/db";
import { currency, dateLabel } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { TableSkeleton, EmptyState } from "@/components/loading";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

// Developers are explicitly allowed to send invoices for their own projects
// (confirmed override of docs/developer-dashboard-modules-plan.md §12's
// admin/salesman-only recommendation). The server route
// (POST /api/invoices/:id/send) re-checks the developer role and re-scopes
// the invoice to their own projects — this button is UX, not the boundary.
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
};
type Account = { id: string; name: string; email?: string | null };

function SendInvoiceDialog({ invoice, defaultEmail }: { invoice: Invoice; defaultEmail: string }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultEmail);
  const [sending, setSending] = useState(false);
  const qc = useQueryClient();

  async function send() {
    if (!to.trim()) {
      toast.error("Add a recipient email.");
      return;
    }
    setSending(true);
    try {
      await callApi(`/invoices/${invoice.id}/send`, {
        method: "POST",
        body: JSON.stringify({ to }),
      });
      await qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(`Invoice ${invoice.invoice_number} sent`);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invoice");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Send className="size-3.5" /> Send
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send invoice {invoice.invoice_number}</DialogTitle>
          <DialogDescription>Emails the invoice to the client and marks it Sent.</DialogDescription>
        </DialogHeader>
        <div>
          <Label className="mb-1.5 block text-xs font-semibold">Recipient email</Label>
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={send} disabled={sending}>
            {sending ? "Sending…" : "Send invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SendInvoiceTab({ projectId }: { projectId: string }) {
  const { data: invoiceRows, isLoading } = useRows<Invoice>("invoices");
  const { data: accountRows } = useRows<Account>("accounts");

  const invoices = (invoiceRows ?? []).filter((inv) => inv.project_id === projectId);
  const accounts = accountRows ?? [];

  function clientEmail(client: string | null) {
    return accounts.find((a) => a.name === client)?.email ?? "";
  }

  return (
    <div className="space-y-6">
      {isLoading ? (
        <TableSkeleton />
      ) : invoices.length === 0 ? (
        <EmptyState title="No invoices yet" description="No invoices have been raised for this project." />
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
                  </td>
                  <td className="px-4 py-3 text-right">
                    <SendInvoiceDialog invoice={inv} defaultEmail={clientEmail(inv.client)} />
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
