import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { callApi, useRows } from "@/lib/db";
import { useCurrentUser } from "@/lib/mock-auth";
import { type Field } from "@/components/record-dialog";
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

export const INVOICE_STATUSES = ["Draft", "Sent", "Paid", "Overdue", "Cancelled"];

export type InvoiceProjectOption = { id: string; name: string; client: string | null };
export type InvoiceAccountOption = { id: string; name: string };

export function buildInvoiceFields(
  projects: InvoiceProjectOption[],
  accounts: InvoiceAccountOption[],
): Field[] {
  return [
    { name: "invoice_number", label: "Invoice #", required: true, placeholder: "INV-1001" },
    { name: "client", label: "Client", type: "select", options: accounts.map((a) => a.name) },
    {
      name: "project_id",
      label: "Project (optional)",
      type: "select",
      options: projects.map((p) => ({ value: p.id, label: p.name })),
    },
    { name: "amount", label: "Amount (USD)", type: "number", required: true },
    { name: "status", label: "Status", type: "select", options: INVOICE_STATUSES },
    { name: "issue_date", label: "Issue date", type: "date" },
    { name: "due_date", label: "Due date", type: "date" },
    { name: "notes", label: "Notes", type: "textarea", full: true },
  ];
}

/** Invoices are created and sent to the client by an Admin only — the
 * server enforces the same rule (POST /api/invoices/:id/send and the
 * invoice/payment write routes); this only decides what to show. */
export function useIsInvoiceAdmin() {
  const { data: me } = useCurrentUser();
  return me?.access_role === "super_admin" || me?.access_role === "admin";
}

type Account = { id: string; name: string; email?: string | null };
type Contact = { id: string; account: string | null; email: string | null };

/** Best guess at where the client wants invoices: the account's own email,
 * else the first contact on file for that account. */
export function useClientEmail(client: string | null) {
  const { data: accountRows } = useRows<Account>("accounts");
  const { data: contactRows } = useRows<Contact>("contacts");
  if (!client) return "";
  const accountEmail = (accountRows ?? []).find((a) => a.name === client)?.email;
  if (accountEmail) return accountEmail;
  return (contactRows ?? []).find((c) => c.account === client && c.email)?.email ?? "";
}

export type SendableInvoice = {
  id: string;
  invoice_number: string;
  client: string | null;
  sent_to?: string | null;
};

export function SendInvoiceDialog({ invoice }: { invoice: SendableInvoice }) {
  const defaultEmail = useClientEmail(invoice.client);
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const qc = useQueryClient();
  const resend = Boolean(invoice.sent_to);

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v) setTo(invoice.sent_to || defaultEmail);
  }

  async function send() {
    if (!to.trim()) {
      toast.error("Add a recipient email.");
      return;
    }
    setSending(true);
    try {
      await callApi(`/invoices/${invoice.id}/send`, {
        method: "POST",
        body: JSON.stringify({ to: to.trim() }),
      });
      await qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(`Invoice ${invoice.invoice_number} sent to ${to.trim()}`);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invoice");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant={resend ? "outline" : "default"}>
          <Send className="size-3.5" /> {resend ? "Resend" : "Send"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {resend ? "Resend" : "Send"} invoice {invoice.invoice_number}
          </DialogTitle>
          <DialogDescription>
            Emails the invoice to the client{resend ? "" : " and marks it Sent"}.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor={`invoice-to-${invoice.id}`} className="mb-1.5 block text-xs font-semibold">
            Recipient email
          </Label>
          <Input
            id={`invoice-to-${invoice.id}`}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="client@example.com"
          />
          {!defaultEmail && !invoice.sent_to && (
            <p className="mt-1 text-xs text-muted-foreground">
              No email is saved for {invoice.client ?? "this client"} — type it in.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={send} disabled={sending}>
            {sending ? "Sending…" : resend ? "Resend invoice" : "Send invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
