import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calculator,
  CalendarClock,
  Flag,
  Layers,
  ListChecks,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import { useRow, useSaveRow } from "@/lib/db";
import { currency, dateLabel } from "@/lib/format";
import { useOrgCostPerHour } from "@/lib/costing";
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
import type { Quote, Deliverable, Milestone } from "@/components/quote-calculator-dialog";

const COST_SLABS = ["Simple", "Medium", "Complex"] as const;
const SLAB_RATE_KEY: Record<string, string> = {
  Simple: "rate_simple",
  Medium: "rate_medium",
  Complex: "rate_complex",
};

type CompanyProfile = {
  id: string;
  rate_simple: number | null;
  rate_medium: number | null;
  rate_complex: number | null;
};

function newDeliverable(): Deliverable {
  return { id: crypto.randomUUID(), name: "", hours: 0, cost: 0 };
}
function newMilestone(): Milestone {
  return { id: crypto.randomUUID(), name: "", due_date: null, description: "" };
}

function SectionHeading({ icon: Icon, title }: { icon: typeof Layers; title: string }) {
  return (
    <h2 className="flex items-center gap-2 font-semibold">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      {title}
    </h2>
  );
}

export function EstimationDetailPage({ quoteId }: { quoteId: string }) {
  const navigate = useNavigate();
  const existing = useRow<Quote>("quotes", quoteId);
  const { data: company } = useRow<CompanyProfile>("company_profile", "default");
  const { costPerHour } = useOrgCostPerHour();
  const save = useSaveRow("quotes", "Estimation");

  const [initialScope, setInitialScope] = useState("");
  const [techStackInput, setTechStackInput] = useState("");
  const [techStack, setTechStack] = useState<string[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [costSlab, setCostSlab] = useState<string>("Medium");
  const [timelineWeeks, setTimelineWeeks] = useState("");
  const [margin, setMargin] = useState("30");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!existing.data) return;
    setInitialScope(existing.data.initial_scope ?? "");
    setTechStack(existing.data.tech_stack ?? []);
    setDeliverables(
      existing.data.deliverables?.length ? existing.data.deliverables : [newDeliverable()],
    );
    setMilestones(existing.data.milestones ?? []);
    setCostSlab(existing.data.cost_slab ?? "Medium");
    setTimelineWeeks(
      existing.data.timeline_weeks != null ? String(existing.data.timeline_weeks) : "",
    );
    setMargin(String(existing.data.margin_percent ?? 30));
  }, [existing.data]);

  const quote = existing.data;

  const totalHours = deliverables.reduce((s, d) => s + (Number(d.hours) || 0), 0);
  const slabRate =
    (costSlab && company?.[SLAB_RATE_KEY[costSlab] as keyof CompanyProfile]) || costPerHour || 0;
  const costBasis = totalHours * Number(slabRate);
  const marginNum = Number(margin) || 0;
  const suggestedPrice = costBasis * (1 + marginNum / 100);

  function addDeliverable() {
    setDeliverables((d) => [...d, newDeliverable()]);
  }
  function updateDeliverable(id: string, patch: Partial<Deliverable>) {
    setDeliverables((list) => list.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }
  function removeDeliverable(id: string) {
    setDeliverables((list) => list.filter((d) => d.id !== id));
  }

  function addMilestone() {
    setMilestones((m) => [...m, newMilestone()]);
  }
  function updateMilestone(id: string, patch: Partial<Milestone>) {
    setMilestones((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }
  function removeMilestone(id: string) {
    setMilestones((list) => list.filter((m) => m.id !== id));
  }

  function addTechStack() {
    const v = techStackInput.trim();
    if (!v || techStack.includes(v)) {
      setTechStackInput("");
      return;
    }
    setTechStack((t) => [...t, v]);
    setTechStackInput("");
  }
  function removeTechStack(v: string) {
    setTechStack((t) => t.filter((x) => x !== v));
  }

  async function handleSave() {
    if (!quote) return;
    setSaving(true);
    try {
      await save.mutateAsync({
        id: quote.id,
        initial_scope: initialScope.trim() || null,
        tech_stack: techStack,
        deliverables: deliverables.filter((d) => d.name.trim()),
        milestones: milestones.filter((m) => m.name.trim()),
        cost_slab: costSlab,
        timeline_weeks: timelineWeeks === "" ? null : Number(timelineWeeks),
        estimated_hours: totalHours,
        rate_used: Number(slabRate),
        margin_percent: marginNum,
        cost_basis: Math.round(costBasis * 100) / 100,
        suggested_price: Math.round(suggestedPrice * 100) / 100,
        margin_amount: Math.round((suggestedPrice - costBasis) * 100) / 100,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save estimation");
    } finally {
      setSaving(false);
    }
  }

  if (existing.isLoading) return <TableSkeleton />;
  if (!quote) {
    return (
      <div className="space-y-4">
        <EmptyState title="Estimation not found" description="This quote may have been deleted." />
        <Button asChild variant="outline">
          <Link to="/estimations">
            <ArrowLeft className="size-4" /> Back to Estimations
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={quote.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Detailed estimation</span>
            <StatusBadge value={quote.status} />
          </span>
        }
        action={
          <Button asChild variant="ghost" size="sm">
            <Link to="/estimations">
              <ArrowLeft className="size-4" /> Back
            </Link>
          </Button>
        }
      />

      {/* Pricing summary — the number that matters most, up top. */}
      <section className="surface-card overflow-hidden p-0">
        <div className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
              Total hours
            </p>
            <p className="mt-1 text-2xl font-bold tracking-tight">{totalHours}h</p>
          </div>
          <div className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
              Cost basis
            </p>
            <p className="mt-1 text-2xl font-bold tracking-tight">{currency(costBasis)}</p>
          </div>
          <div className="gradient-primary p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-foreground/80">
              Suggested price
            </p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-primary-foreground">
              {currency(suggestedPrice)}
            </p>
          </div>
        </div>
      </section>

      <section className="surface-card space-y-3 p-6">
        <SectionHeading icon={Layers} title="Initial Scope" />
        <Textarea
          rows={4}
          placeholder="What's included at a glance — the working scope this estimate is priced against."
          value={initialScope}
          onChange={(e) => setInitialScope(e.target.value)}
        />
      </section>

      <section className="surface-card space-y-3 p-6">
        <SectionHeading icon={Calculator} title="Tech Stack" />
        {techStack.length ? (
          <div className="flex flex-wrap gap-2">
            {techStack.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
              >
                {t}
                <button
                  type="button"
                  onClick={() => removeTechStack(t)}
                  className="text-primary/70 hover:text-primary"
                  aria-label={`Remove ${t}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No technologies added yet.</p>
        )}
        <div className="flex gap-2">
          <Input
            placeholder="e.g. React, Node.js, PostgreSQL"
            value={techStackInput}
            onChange={(e) => setTechStackInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTechStack();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addTechStack}>
            Add
          </Button>
        </div>
      </section>

      <section className="surface-card space-y-4 p-6">
        <div className="flex items-center justify-between">
          <SectionHeading icon={ListChecks} title="Deliverables" />
          <Button type="button" variant="outline" size="sm" onClick={addDeliverable}>
            <Plus className="size-4" /> Add deliverable
          </Button>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">#</th>
                <th className="px-4 py-2.5 text-left font-semibold">Deliverable</th>
                <th className="px-4 py-2.5 text-right font-semibold">Hours</th>
                <th className="px-4 py-2.5 text-right font-semibold">Est. cost</th>
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {deliverables.map((d, i) => (
                <tr key={d.id}>
                  <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-2">
                    <Input
                      placeholder="e.g. Frontend — product listing pages"
                      value={d.name}
                      onChange={(e) => updateDeliverable(d.id, { name: e.target.value })}
                      className="h-8 border-transparent bg-transparent px-1 focus-visible:border-input focus-visible:bg-background"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      type="number"
                      placeholder="0"
                      value={d.hours || ""}
                      onChange={(e) =>
                        updateDeliverable(d.id, { hours: Number(e.target.value) || 0 })
                      }
                      className="h-8 w-20 border-transparent bg-transparent px-1 text-right focus-visible:border-input focus-visible:bg-background"
                    />
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground">
                    {currency((Number(d.hours) || 0) * Number(slabRate))}
                  </td>
                  <td className="px-2 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive size-7"
                      onClick={() => removeDeliverable(d.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/40 font-semibold">
                <td className="px-4 py-2.5" colSpan={2}>
                  Total
                </td>
                <td className="px-4 py-2.5 text-right">{totalHours}h</td>
                <td className="px-4 py-2.5 text-right">{currency(costBasis)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="surface-card space-y-4 p-6">
        <SectionHeading icon={Calculator} title="Cost Slab & Timeline" />
        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
              Cost Slab
            </Label>
            <Select value={costSlab} onValueChange={setCostSlab}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COST_SLABS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Rate: {slabRate ? currency(Number(slabRate)) : "—"}/hr
              {!company?.[SLAB_RATE_KEY[costSlab] as keyof CompanyProfile]
                ? " (org default — set real slab rates in Company Profile)"
                : ""}
            </p>
          </div>
          <div>
            <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
              Margin %
            </Label>
            <Input type="number" value={margin} onChange={(e) => setMargin(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
              Timeline (weeks)
            </Label>
            <Input
              type="number"
              value={timelineWeeks}
              onChange={(e) => setTimelineWeeks(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="surface-card space-y-4 p-6">
        <div className="flex items-center justify-between">
          <SectionHeading icon={Flag} title="Milestones" />
          <Button type="button" variant="outline" size="sm" onClick={addMilestone}>
            <Plus className="size-4" /> Add milestone
          </Button>
        </div>
        {milestones.length === 0 ? (
          <p className="text-sm text-muted-foreground">No milestones yet.</p>
        ) : (
          <ol className="space-y-4">
            {milestones.map((m, i) => (
              <li key={m.id} className="flex gap-3">
                <div className="flex flex-col items-center pt-2.5">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                    {i + 1}
                  </span>
                  {i < milestones.length - 1 ? (
                    <span className="mt-1 w-px flex-1 bg-border" />
                  ) : null}
                </div>
                <div className="flex-1 space-y-2 pb-1">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Milestone name"
                      value={m.name}
                      onChange={(e) => updateMilestone(m.id, { name: e.target.value })}
                      className="flex-1"
                    />
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <CalendarClock className="size-4 shrink-0" />
                      <Input
                        type="date"
                        value={m.due_date ?? ""}
                        onChange={(e) =>
                          updateMilestone(m.id, { due_date: e.target.value || null })
                        }
                        className="w-40"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => removeMilestone(m.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <Textarea
                    rows={2}
                    placeholder="Description"
                    value={m.description}
                    onChange={(e) => updateMilestone(m.id, { description: e.target.value })}
                  />
                  {m.due_date ? (
                    <p className="text-[11px] text-muted-foreground">
                      Target: {dateLabel(m.due_date)}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => void navigate({ to: "/estimations" })}>
          Cancel
        </Button>
        <Button type="button" disabled={saving} onClick={() => void handleSave()}>
          <Save className="size-4" /> {saving ? "Saving…" : "Save estimation"}
        </Button>
      </div>
    </div>
  );
}
