import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Plus, Send, ShieldAlert } from "lucide-react";

import { useRows } from "@/lib/db";
import { useCurrentUser } from "@/lib/mock-auth";
import { currency } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton } from "@/components/loading";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROPOSAL_TEMPLATES, useCreateProposal } from "@/components/proposal-editor";

export const Route = createFileRoute("/_authenticated/proposals/")({
  head: () => ({
    meta: [
      { title: "Proposals — Time Global Tech CRM" },
      {
        name: "description",
        content: "Draft, version and send client proposal documents.",
      },
      { property: "og:title", content: "Proposals — Time Global Tech CRM" },
      { property: "og:description", content: "Proposal documents, templated and versioned." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProposalsPage,
});

type ProposalRow = {
  id: string;
  inquiry_id: string;
  display_id: string | null;
  title: string;
  version: number;
  status: string;
  owner: string | null;
  cost: number | null;
  created_at: string;
};

type InquiryLite = {
  id: string;
  client_name: string;
  company: string | null;
  display_id: string | null;
  owner: string | null;
  email: string | null;
};

type Employee = { id: string; name: string; email: string | null };

function NewProposalDialog({
  inquiries,
  myName,
}: {
  inquiries: InquiryLite[];
  myName?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [inquiryId, setInquiryId] = useState("");
  const [template, setTemplate] = useState(PROPOSAL_TEMPLATES[3]!);
  const { createProposal, creating } = useCreateProposal();

  async function handleCreate() {
    const inquiry = inquiries.find((i) => i.id === inquiryId);
    if (!inquiry) return;
    const id = await createProposal({
      inquiryId: inquiry.id,
      title: `${inquiry.client_name} — Proposal`,
      template,
      ownerName: inquiry.owner ?? myName ?? null,
      clientEmail: inquiry.email,
    });
    if (id) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New proposal
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New proposal</DialogTitle>
          <DialogDescription>
            Drafts every section from the linked inquiry's real data — review and edit before
            sending.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Inquiry</Label>
            <Select value={inquiryId} onValueChange={setInquiryId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an inquiry" />
              </SelectTrigger>
              <SelectContent>
                {inquiries.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.client_name}
                    {i.company ? ` — ${i.company}` : ""}
                    {i.display_id ? ` (${i.display_id})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Template</Label>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROPOSAL_TEMPLATES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!inquiryId || creating}
            onClick={() => void handleCreate()}
          >
            {creating ? "Drafting…" : "Draft proposal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProposalsPage() {
  const { data: proposalRows, isLoading } = useRows<ProposalRow>("proposals");
  const { data: inquiryRows } = useRows<InquiryLite>("inquiries");
  const { data: employeeRows } = useRows<Employee>("employees");
  const { data: me } = useCurrentUser();

  const myName = (employeeRows ?? []).find(
    (e) => e.email && me?.email && e.email.toLowerCase() === me.email.toLowerCase(),
  )?.name;

  const allProposals = proposalRows ?? [];
  const proposals =
    me?.access_role === "salesman"
      ? myName
        ? allProposals.filter((p) => p.owner === myName)
        : []
      : allProposals;
  const inquiries = inquiryRows ?? [];

  const scopedInquiries =
    me?.access_role === "salesman"
      ? myName
        ? inquiries.filter((i) => i.owner === myName)
        : []
      : inquiries;

  const sent = proposals.filter((p) => p.status === "Sent").length;
  const correctionsPending = proposals.filter((p) => p.status === "Correction Required").length;
  const draftValue = proposals
    .filter((p) => p.status === "Draft")
    .reduce((s, p) => s + Number(p.cost ?? 0), 0);
  const sentValue = proposals
    .filter((p) => p.status === "Sent")
    .reduce((s, p) => s + Number(p.cost ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proposals"
        description={
          me?.access_role === "salesman"
            ? "Your proposal documents — drafted, versioned and tracked to send."
            : "Client proposal documents — templated, AI-drafted from inquiry data, versioned and tracked."
        }
        action={<NewProposalDialog inquiries={scopedInquiries} myName={myName} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total proposals" value={String(proposals.length)} icon={FileText} />
        <KpiCard label="Sent" value={String(sent)} icon={Send} />
        <KpiCard label="Needs correction" value={String(correctionsPending)} icon={ShieldAlert} />
        <KpiCard
          label="Draft + sent value"
          value={currency(draftValue + sentValue, true)}
          icon={FileText}
        />
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : proposals.length === 0 ? (
        <div className="surface-card p-12 text-center">
          <p className="text-sm font-medium">No proposals yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create one from an inquiry, or start here with "New proposal".
          </p>
        </div>
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Proposal</th>
                <th className="px-4 py-3 text-left font-semibold">Client</th>
                <th className="px-4 py-3 text-left font-semibold">Version</th>
                <th className="px-4 py-3 text-left font-semibold">Cost</th>
                <th className="px-4 py-3 text-left font-semibold">Owner</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {proposals.map((p) => {
                const inquiry = inquiries.find((i) => i.id === p.inquiry_id);
                return (
                  <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium">{p.title}</span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {p.display_id ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {inquiry
                        ? `${inquiry.client_name}${inquiry.company ? ` · ${inquiry.company}` : ""}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">v{p.version}</td>
                    <td className="px-4 py-3 font-semibold">{currency(p.cost ?? 0)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.owner ?? "Unassigned"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={p.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="ghost" size="sm">
                          <Link to="/proposals/$proposalId" params={{ proposalId: p.id }}>
                            Open
                          </Link>
                        </Button>
                        <DeleteButton table="proposals" id={p.id} label="Proposal" name={p.title} />
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
