import { useEffect, useState, type ReactNode } from "react";

import { useRows, useSaveRow } from "@/lib/db";
import { useOrgCostPerHour } from "@/lib/costing";
import { currency } from "@/lib/format";
import { OwnerCombobox } from "@/components/strategy/owner-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type Deliverable = { id: string; name: string; hours: number; cost: number };
export type Milestone = { id: string; name: string; due_date: string | null; description: string };

export type Quote = {
  id: string;
  title: string;
  client: string | null;
  project_id: string | null;
  inquiry_id: string | null;
  deal_id: string | null;
  owner: string | null;
  estimated_hours: number;
  margin_percent: number;
  rate_used: number;
  cost_basis: number;
  suggested_price: number;
  margin_amount: number;
  status: string;
  notes: string | null;
  stale?: boolean;
  // Structured estimation — added on top of the quick calculator above;
  // all optional so the fast-path dialog never has to touch them.
  initial_scope?: string | null;
  tech_stack?: string[];
  deliverables?: Deliverable[];
  milestones?: Milestone[];
  cost_slab?: string | null;
  timeline_weeks?: number | null;
};

type Account = { id: string; name: string };
type ProjectRow = { id: string; name: string };
type InquiryRow = { id: string; client_name: string };
type DealRow = { id: string; title: string };

const QUOTE_STATUSES = ["Draft", "Sent", "Accepted", "Rejected"];

export function QuoteCalculatorDialog({
  quote,
  defaultProjectId,
  defaultInquiryId,
  defaultDealId,
  defaultOwner,
  defaultTitle,
  trigger,
}: {
  quote?: Quote;
  defaultProjectId?: string | undefined;
  defaultInquiryId?: string | undefined;
  defaultDealId?: string | undefined;
  defaultOwner?: string | undefined;
  defaultTitle?: string | undefined;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [client, setClient] = useState("");
  const [projectId, setProjectId] = useState("");
  const [inquiryId, setInquiryId] = useState("");
  const [dealId, setDealId] = useState("");
  const [owner, setOwner] = useState("");
  const [hours, setHours] = useState("0");
  const [margin, setMargin] = useState("30");
  const [rateUsed, setRateUsed] = useState("0");
  const [status, setStatus] = useState("Draft");
  const [notes, setNotes] = useState("");

  const { data: accounts } = useRows<Account>("accounts");
  const { data: projects } = useRows<ProjectRow>("projects");
  const { data: inquiries } = useRows<InquiryRow>("inquiries");
  const { data: deals } = useRows<DealRow>("deals");
  const { costPerHour } = useOrgCostPerHour();
  const save = useSaveRow("quotes", "Quote");

  useEffect(() => {
    if (!open) return;
    if (quote) {
      setTitle(quote.title);
      setClient(quote.client ?? "");
      setProjectId(quote.project_id ?? "");
      setInquiryId(quote.inquiry_id ?? "");
      setDealId(quote.deal_id ?? "");
      setOwner(quote.owner ?? "");
      setHours(String(quote.estimated_hours ?? 0));
      setMargin(String(quote.margin_percent ?? 0));
      setRateUsed(String(quote.rate_used ?? 0));
      setStatus(quote.status ?? "Draft");
      setNotes(quote.notes ?? "");
    } else {
      setTitle(defaultTitle ?? "");
      setClient("");
      setProjectId(defaultProjectId ?? "");
      setInquiryId(defaultInquiryId ?? "");
      setDealId(defaultDealId ?? "");
      setOwner(defaultOwner ?? "");
      setHours("0");
      setMargin("30");
      setRateUsed(costPerHour ? costPerHour.toFixed(2) : "0");
      setStatus("Draft");
      setNotes("");
    }
  }, [
    open,
    quote,
    defaultProjectId,
    defaultInquiryId,
    defaultDealId,
    defaultOwner,
    defaultTitle,
    costPerHour,
  ]);

  const hoursNum = Number(hours) || 0;
  const marginNum = Number(margin) || 0;
  const rateNum = Number(rateUsed) || 0;
  const costBasis = hoursNum * rateNum;
  const suggestedPrice = costBasis * (1 + marginNum / 100);
  const marginAmount = suggestedPrice - costBasis;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      title,
      client: client || null,
      project_id: projectId || null,
      inquiry_id: inquiryId || null,
      deal_id: dealId || null,
      owner: owner || null,
      estimated_hours: hoursNum,
      margin_percent: marginNum,
      rate_used: rateNum,
      cost_basis: Math.round(costBasis * 100) / 100,
      suggested_price: Math.round(suggestedPrice * 100) / 100,
      margin_amount: Math.round(marginAmount * 100) / 100,
      status,
      notes: notes || null,
    };
    save.mutate(
      { ...payload, ...(quote?.id ? { id: quote.id } : {}) },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[95vw] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{quote ? "Edit quote" : "New quote"}</DialogTitle>
          <DialogDescription>
            Priced off the live organizational cost per hour — hours × rate, plus your margin.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div>
            <Label htmlFor="quote-title" className="mb-1.5 block text-xs font-semibold">
              Title
            </Label>
            <Input
              id="quote-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">Client</Label>
              <Select value={client} onValueChange={setClient}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {(accounts ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.name}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">Project (optional)</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  {(projects ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">
                Related inquiry (optional)
              </Label>
              <Select value={inquiryId} onValueChange={setInquiryId}>
                <SelectTrigger>
                  <SelectValue placeholder="No linked inquiry" />
                </SelectTrigger>
                <SelectContent>
                  {(inquiries ?? []).map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.client_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">
                Related opportunity (optional)
              </Label>
              <Select value={dealId} onValueChange={setDealId}>
                <SelectTrigger>
                  <SelectValue placeholder="No linked opportunity" />
                </SelectTrigger>
                <SelectContent>
                  {(deals ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-semibold">Owner</Label>
            <OwnerCombobox value={owner} onValueChange={setOwner} placeholder="Select owner" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">Estimated hours</Label>
              <Input
                type="number"
                min="0"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">Margin %</Label>
              <Input
                type="number"
                min="0"
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-semibold">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUOTE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="surface-card space-y-2 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Rate used ($/hr)</span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={rateUsed}
                  onChange={(e) => setRateUsed(e.target.value)}
                  className="h-8 w-28 text-right"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => setRateUsed(costPerHour ? costPerHour.toFixed(2) : "0")}
                >
                  Use current (${costPerHour.toFixed(2)})
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Cost basis</span>
              <span className="font-semibold">{currency(costBasis)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Margin</span>
              <span className="font-semibold">{currency(marginAmount)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2 text-base">
              <span className="font-semibold">Suggested price</span>
              <span className="font-bold text-primary">{currency(suggestedPrice)}</span>
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-xs font-semibold">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : quote ? "Save changes" : "Save quote"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
