import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Copy, Download, RefreshCw, Save, Send, ShieldAlert } from "lucide-react";

import { callApi, useRow, useRows, useSaveRow } from "@/lib/db";
import { useConvertToDeal } from "@/lib/convert-to-deal";
import { getAuthToken, API_URL, useCurrentUser } from "@/lib/mock-auth";
import { currency, dateTimeLabel } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton, EmptyState } from "@/components/loading";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const PROPOSAL_TEMPLATES = [
  "Website Development",
  "Mobile App Development",
  "ERP Development",
  "Custom Software Development",
  "Maintenance & Support",
];

const SECTIONS: { key: keyof SectionState; label: string; hint: string }[] = [
  {
    key: "executive_summary",
    label: "Executive Summary",
    hint: "Why we're a fit, in one paragraph.",
  },
  { key: "client_requirements", label: "Client Requirements", hint: "What the client asked for." },
  { key: "proposed_solution", label: "Proposed Solution", hint: "How we'll solve it." },
  { key: "scope_of_work", label: "Scope of Work", hint: "Exactly what's included." },
  { key: "technology_stack", label: "Technology Stack", hint: "Languages, frameworks, tools." },
  { key: "deliverables", label: "Deliverables", hint: "Itemized, from the linked estimation." },
  { key: "timeline", label: "Project Timeline", hint: "How long, and how it's phased." },
  { key: "milestones", label: "Milestones", hint: "Kickoff, build, review, delivery." },
  { key: "payment_terms", label: "Payment Terms", hint: "Advance / delivery split, etc." },
  {
    key: "terms_conditions",
    label: "Terms & Conditions",
    hint: "Validity window, change control.",
  },
  { key: "assumptions", label: "Assumptions", hint: "What we're relying on the client for." },
  { key: "exclusions", label: "Exclusions", hint: "What's explicitly not included." },
];

type SectionState = {
  executive_summary: string;
  client_requirements: string;
  proposed_solution: string;
  scope_of_work: string;
  technology_stack: string;
  deliverables: string;
  timeline: string;
  milestones: string;
  payment_terms: string;
  terms_conditions: string;
  assumptions: string;
  exclusions: string;
};

type Proposal = SectionState & {
  id: string;
  inquiry_id: string;
  display_id: string | null;
  title: string;
  template: string;
  version: number;
  status: string;
  owner: string | null;
  client_email: string | null;
  cost: number | null;
  contact_info: string | null;
  correction_comments: string | null;
  correction_requested_by: string | null;
  correction_requested_at: string | null;
  sent_at: string | null;
  sent_by: string | null;
  sent_to: string | null;
  email_status: string | null;
  created_at: string;
};

type InquiryLite = {
  id: string;
  client_name: string;
  company: string | null;
  display_id: string | null;
  description: string;
  account_id: string | null;
  source: string;
  notes: string | null;
  expected_close_date: string | null;
  activity_log: { type: string; message: string; at: string }[];
  deal_id: string | null;
  owner: string | null;
};

type FormState = SectionState & {
  title: string;
  template: string;
  client_email: string;
  cost: string;
};

function toState(p: Proposal): FormState {
  return {
    title: p.title ?? "",
    template: p.template ?? PROPOSAL_TEMPLATES[3]!,
    client_email: p.client_email ?? "",
    cost: p.cost != null ? String(p.cost) : "",
    executive_summary: p.executive_summary ?? "",
    client_requirements: p.client_requirements ?? "",
    proposed_solution: p.proposed_solution ?? "",
    scope_of_work: p.scope_of_work ?? "",
    technology_stack: p.technology_stack ?? "",
    deliverables: p.deliverables ?? "",
    timeline: p.timeline ?? "",
    milestones: p.milestones ?? "",
    payment_terms: p.payment_terms ?? "",
    terms_conditions: p.terms_conditions ?? "",
    assumptions: p.assumptions ?? "",
    exclusions: p.exclusions ?? "",
  };
}

async function downloadProposalPdf(id: string, filename: string) {
  const token = getAuthToken();
  const res = await fetch(`${API_URL}/proposals/${id}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    toast.error("Failed to generate PDF");
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Drafts every section from the linked inquiry (server-side, from real
 * data), creates the proposal row, and navigates straight to its editor —
 * shared by the Inquiry form's "New proposal" action and the Proposals list
 * page, so both create records the same way. */
export function useCreateProposal() {
  const navigate = useNavigate();
  const saveProposal = useSaveRow("proposals", "Proposal");
  const [creating, setCreating] = useState(false);

  async function createProposal(opts: {
    inquiryId: string;
    title: string;
    template: string;
    ownerName?: string | null;
    clientEmail?: string | null;
    quoteId?: string | null;
  }) {
    setCreating(true);
    try {
      const draft = (await callApi("/proposals/draft", {
        method: "POST",
        body: JSON.stringify({
          inquiry_id: opts.inquiryId,
          quote_id: opts.quoteId ?? null,
          template: opts.template,
        }),
      })) as Record<string, unknown>;
      const id = await saveProposal.mutateAsync({
        ...draft,
        inquiry_id: opts.inquiryId,
        title: opts.title,
        template: opts.template,
        version: 1,
        status: "Draft",
        owner: opts.ownerName || null,
        client_email: opts.clientEmail || null,
      });
      void navigate({ to: "/proposals/$proposalId", params: { proposalId: id } });
      return id;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create proposal");
      return null;
    } finally {
      setCreating(false);
    }
  }

  return { createProposal, creating };
}

export function ProposalEditorPage({ proposalId }: { proposalId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const existing = useRow<Proposal>("proposals", proposalId);
  const { data: allProposals } = useRows<Proposal>("proposals");
  const { data: inquiries } = useRows<InquiryLite>("inquiries");
  const saveProposal = useSaveRow("proposals", "Proposal");
  const { convertToDeal, pending: converting } = useConvertToDeal();

  const [values, setValues] = useState<FormState>(toState({} as Proposal));
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [versioning, setVersioning] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionComment, setCorrectionComment] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTo, setSendTo] = useState("");

  useEffect(() => {
    if (existing.data) {
      setValues(toState(existing.data));
      setSendTo(existing.data.client_email ?? "");
    }
  }, [existing.data]);

  const proposal = existing.data;
  const canManage = me?.access_role === "super_admin" || me?.access_role === "admin";
  const inquiry = inquiries?.find((i) => i.id === proposal?.inquiry_id);
  const versions = (allProposals ?? [])
    .filter((p) => proposal && p.inquiry_id === proposal.inquiry_id && p.title === proposal.title)
    .sort((a, b) => a.version - b.version);

  function setField<K extends keyof FormState>(key: K, val: FormState[K]) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  async function handleSave() {
    if (!proposal) return;
    setSaving(true);
    try {
      await saveProposal.mutateAsync({
        id: proposal.id,
        title: values.title.trim(),
        template: values.template,
        client_email: values.client_email.trim() || null,
        cost: Number(values.cost) || 0,
        executive_summary: values.executive_summary,
        client_requirements: values.client_requirements,
        proposed_solution: values.proposed_solution,
        scope_of_work: values.scope_of_work,
        technology_stack: values.technology_stack,
        deliverables: values.deliverables,
        timeline: values.timeline,
        milestones: values.milestones,
        payment_terms: values.payment_terms,
        terms_conditions: values.terms_conditions,
        assumptions: values.assumptions,
        exclusions: values.exclusions,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerate() {
    if (!proposal) return;
    setRegenerating(true);
    try {
      const draft = (await callApi("/proposals/draft", {
        method: "POST",
        body: JSON.stringify({ inquiry_id: proposal.inquiry_id, template: values.template }),
      })) as Partial<SectionState> & { cost?: number; contact_info?: string };
      setValues(
        (v) =>
          ({
            ...v,
            ...draft,
            cost: draft.cost != null ? String(draft.cost) : v.cost,
          }) as FormState,
      );
      toast.success("Draft regenerated from the linked inquiry — review before saving.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to regenerate draft");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleSend() {
    if (!proposal) return;
    setSending(true);
    try {
      await handleSave();
      await callApi(`/proposals/${proposal.id}/send`, {
        method: "POST",
        body: JSON.stringify({ to: sendTo.trim() || undefined }),
      });
      toast.success("Proposal emailed to the client.");
      setSendOpen(false);
      void qc.invalidateQueries({ queryKey: ["proposals"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send proposal");
    } finally {
      setSending(false);
    }
  }

  // The one-click path for "client said yes" right after sending — no
  // need to leave this page and go find the Client Approval checkbox on
  // the Inquiry. Uses the proposal's own accepted price, since that's the
  // real number the client just agreed to.
  async function handleClientAccepted() {
    if (!proposal || !inquiry) return;
    const dealId = await convertToDeal({
      inquiry,
      dealValue: Number(proposal.cost ?? 0),
      owner: proposal.owner ?? inquiry.owner ?? null,
    });
    if (dealId) {
      void qc.invalidateQueries({ queryKey: ["inquiries"] });
    }
  }

  async function handleRequestCorrection() {
    if (!proposal) return;
    try {
      await callApi(`/proposals/${proposal.id}/request-correction`, {
        method: "POST",
        body: JSON.stringify({ comments: correctionComment.trim() || undefined }),
      });
      toast.success("Correction requested.");
      setCorrectionOpen(false);
      setCorrectionComment("");
      void qc.invalidateQueries({ queryKey: ["proposals"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to request correction");
    }
  }

  async function handleNewVersion() {
    if (!proposal) return;
    setVersioning(true);
    try {
      await handleSave();
      const created = (await callApi(`/proposals/${proposal.id}/new-version`, {
        method: "POST",
        body: JSON.stringify({}),
      })) as { id: string };
      void qc.invalidateQueries({ queryKey: ["proposals"] });
      void navigate({ to: "/proposals/$proposalId", params: { proposalId: created.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create new version");
    } finally {
      setVersioning(false);
    }
  }

  if (existing.isLoading) return <TableSkeleton />;
  if (!proposal) {
    return (
      <div className="space-y-4">
        <EmptyState title="Proposal not found" description="This proposal may have been deleted." />
        <Button asChild variant="outline">
          <Link to="/proposals">
            <ArrowLeft className="size-4" /> Back to Proposals
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={values.title || "Proposal"}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {proposal.display_id ?? "—"} · v{proposal.version}
            </span>
            <StatusBadge value={proposal.status} />
            {inquiry ? (
              <Link
                to="/inquiries/$inquiryId/edit"
                params={{ inquiryId: inquiry.id }}
                className="text-xs text-primary hover:underline"
              >
                {inquiry.client_name}
                {inquiry.company ? ` · ${inquiry.company}` : ""}
              </Link>
            ) : null}
          </span>
        }
        action={
          <Button asChild variant="ghost" size="sm">
            <Link to="/proposals">
              <ArrowLeft className="size-4" /> Back
            </Link>
          </Button>
        }
      />

      {proposal.status === "Correction Required" && proposal.correction_comments ? (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-warning">
            <ShieldAlert className="size-4" /> Correction requested
            {proposal.correction_requested_by ? ` by ${proposal.correction_requested_by}` : ""}
          </p>
          <p className="mt-1 text-muted-foreground">{proposal.correction_comments}</p>
        </div>
      ) : null}

      {proposal.status === "Sent" && proposal.sent_at ? (
        <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm text-muted-foreground">
          Sent to <span className="font-medium text-foreground">{proposal.sent_to}</span> by{" "}
          {proposal.sent_by ?? "—"} on {dateTimeLabel(proposal.sent_at)}.
        </div>
      ) : null}

      <section className="surface-card space-y-5 p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Overview</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleRegenerate()}
            disabled={regenerating}
          >
            <RefreshCw className={`size-4 ${regenerating ? "animate-spin" : ""}`} />
            {regenerating ? "Regenerating…" : "Regenerate draft"}
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Title</Label>
            <Input value={values.title} onChange={(e) => setField("title", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Template</Label>
            <Select value={values.template} onValueChange={(v) => setField("template", v)}>
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
          <div className="space-y-1.5">
            <Label>Investment (cost)</Label>
            <Input
              type="number"
              value={values.cost}
              onChange={(e) => setField("cost", e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Client email</Label>
            <Input
              type="email"
              value={values.client_email}
              onChange={(e) => setField("client_email", e.target.value)}
              placeholder="client@company.com"
            />
          </div>
        </div>
      </section>

      <section className="surface-card space-y-5 p-6">
        <h2 className="font-semibold">Document Content</h2>
        {SECTIONS.map((s) => (
          <div key={s.key} className="space-y-1.5">
            <Label>{s.label}</Label>
            <p className="text-xs text-muted-foreground">{s.hint}</p>
            <Textarea
              rows={s.key === "executive_summary" || s.key === "scope_of_work" ? 5 : 3}
              value={values[s.key]}
              onChange={(e) => setField(s.key, e.target.value)}
            />
          </div>
        ))}
      </section>

      {versions.length > 1 ? (
        <section className="surface-card space-y-3 p-6">
          <h2 className="font-semibold">Version History</h2>
          <ul className="divide-border divide-y">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>
                  v{v.version} — {v.display_id ?? "—"}
                </span>
                <div className="flex items-center gap-2">
                  <StatusBadge value={v.status} />
                  {v.id === proposal.id ? (
                    <span className="text-xs text-muted-foreground">Current</span>
                  ) : (
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/proposals/$proposalId" params={{ proposalId: v.id }}>
                        Open
                      </Link>
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        {canManage ? (
          <Dialog open={correctionOpen} onOpenChange={setCorrectionOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline">
                <ShieldAlert className="size-4" /> Request correction
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Request a correction</DialogTitle>
                <DialogDescription>
                  Marks this proposal as needing revision and notes what to fix.
                </DialogDescription>
              </DialogHeader>
              <Textarea
                rows={4}
                placeholder="What needs to change?"
                value={correctionComment}
                onChange={(e) => setCorrectionComment(e.target.value)}
              />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setCorrectionOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void handleRequestCorrection()}>
                  Request correction
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}

        <Button
          type="button"
          variant="outline"
          onClick={() => void handleNewVersion()}
          disabled={versioning}
        >
          <Copy className="size-4" /> {versioning ? "Creating…" : "New version"}
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() =>
            void downloadProposalPdf(proposal.id, `${proposal.display_id ?? "proposal"}.pdf`)
          }
        >
          <Download className="size-4" /> Download PDF
        </Button>

        <Button type="button" variant="outline" onClick={() => void handleSave()} disabled={saving}>
          <Save className="size-4" /> {saving ? "Saving…" : "Save"}
        </Button>

        <Dialog open={sendOpen} onOpenChange={setSendOpen}>
          <DialogTrigger asChild>
            <Button type="button">
              <Send className="size-4" /> Send to client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send proposal to client</DialogTitle>
              <DialogDescription>
                Emails the PDF and a summary to the client, and marks this proposal Sent.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label>Client email</Label>
              <Input type="email" value={sendTo} onChange={(e) => setSendTo(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setSendOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleSend()} disabled={sending}>
                {sending ? "Sending…" : "Send"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {proposal.status === "Sent" && inquiry ? (
          inquiry.deal_id ? (
            <span className="flex items-center text-sm text-muted-foreground">
              Already converted to a deal
            </span>
          ) : (
            <Button
              type="button"
              className="bg-success text-success-foreground hover:bg-success/90"
              disabled={converting}
              onClick={() => void handleClientAccepted()}
            >
              {converting ? "Converting…" : "Client Accepted — Create Deal"}
            </Button>
          )
        ) : null}
      </div>

      {proposal.cost ? (
        <p className="text-right text-sm text-muted-foreground">
          Investment:{" "}
          <span className="font-semibold text-foreground">{currency(proposal.cost)}</span>
        </p>
      ) : null}
    </div>
  );
}
