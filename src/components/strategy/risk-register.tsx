import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Flame,
  Plus,
  Shield,
  Target,
  XCircle,
} from "lucide-react";

import { useRows, type Row } from "@/lib/db";
import { number, dateLabel, initials } from "@/lib/format";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { DeleteButton } from "@/components/delete-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useSaveRow } from "@/lib/db";
import { useEffect } from "react";
import type { TableName } from "@/lib/db";

type RiskComment = {
  author: string;
  text: string;
  created_at: string;
};

type Risk = {
  id: string;
  title: string;
  category: string;
  likelihood: number;
  impact: number;
  score: number;
  status: string;
  owner: string;
  mitigation: string;
  related_objective_id: string;
  tags: string[];
  created_at: string;
  comments: RiskComment[];
};

const CATEGORIES = [
  "All",
  "Revenue",
  "Product",
  "Customer",
  "Engineering",
  "Operations",
  "Compliance",
  "People",
  "Financial",
  "Security",
];

const STATUSES = [
  "All",
  "Open",
  "In Progress",
  "Mitigated",
  "Resolved",
  "Escalated",
  "On Hold",
];

const LIKELIHOOD_OPTIONS = ["1", "2", "3", "4", "5"];
const IMPACT_OPTIONS = ["1", "2", "3", "4", "5"];

type SortKey =
  | "title"
  | "category"
  | "likelihood"
  | "impact"
  | "score"
  | "status"
  | "owner"
  | "created_at";

type SortOrder = {
  column: SortKey;
  ascending: boolean;
};

const FIELDS: FieldShape[] = [
  { name: "title", label: "Risk title", required: true, full: true, section: "Overview" },
  { name: "category", label: "Category", type: "select" as const, options: CATEGORIES.filter((c) => c !== "All") },
  {
    name: "status",
    label: "Status",
    type: "select" as const,
    options: STATUSES.filter((s) => s !== "All"),
  },
  { name: "owner", label: "Owner" },
  {
    name: "likelihood",
    label: "Likelihood (1-5)",
    type: "select" as const,
    options: LIKELIHOOD_OPTIONS,
  },
  {
    name: "impact",
    label: "Impact (1-5)",
    type: "select" as const,
    options: IMPACT_OPTIONS,
  },
  { name: "related_objective_id", label: "Related Objective ID", section: "Links" },
  {
    name: "tags",
    label: "Tags (comma-separated)",
    type: "tags" as const,
    full: true,
  },
  {
    name: "mitigation",
    label: "Mitigation plan",
    type: "textarea" as const,
    full: true,
    rows: 5,
    section: "Mitigation",
  },
];

function severityColor(score: number): string {
  if (score >= 15) return "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200";
  if (score >= 8) return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200";
  return "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200";
}

function severityLabel(score: number): string {
  if (score >= 15) return "Critical";
  if (score >= 12) return "High";
  if (score >= 8) return "Medium";
  return "Low";
}

type FieldShape = {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea" | "date" | "datetime-local" | "select" | "email" | "tags";
  options?: (string | { value: string; label: string })[];
  required?: boolean;
  placeholder?: string;
  full?: boolean;
  rows?: number;
  section?: string;
};

function toFormValue(field: { name: string; type?: string }, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (field.type === "tags" && Array.isArray(value)) return value.join(", ");
  return String(value);
}

function normalizeOptions(options: (string | { value: string; label: string })[]) {
  return options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
}

function AddRiskDialog({
  trigger,
  record,
}: {
  trigger: React.ReactNode;
  record?: Risk;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const save = useSaveRow("risks" as TableName, "Risk");

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const field of FIELDS) {
      next[field.name] = record
        ? toFormValue(field as { name: string; type?: string }, (record as unknown as Row)[field.name])
        : field.name === "status"
          ? "Open"
          : field.name === "likelihood" || field.name === "impact"
            ? "3"
            : "";
    }
    setValues(next);
  }, [open, record]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload: Row & { id?: string } = {};
    for (const field of FIELDS) {
      const raw = values[field.name] ?? "";
      if (field.type === "tags")
        payload[field.name] = raw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      else if (field.type === "select" && (field.name === "likelihood" || field.name === "impact"))
        payload[field.name] = raw === "" ? 0 : Number(raw);
      else payload[field.name] = raw === "" ? null : raw;
    }
    const likelihood = Number(payload["likelihood"] ?? 0);
    const impact = Number(payload["impact"] ?? 0);
    payload["score"] = likelihood * impact;
    if (record?.id) payload.id = record.id;
    if (!payload["comments"]) payload["comments"] = [];
    save.mutate(payload, { onSuccess: () => setOpen(false) });
  }

  const sections: { label: string; start: number }[] = [];
  FIELDS.forEach((f, i) => {
    if (f.section && (i === 0 || FIELDS[i - 1]?.section !== f.section)) {
      sections.push({ label: f.section, start: i });
    }
  });
  const sectionIndex = (i: number) => {
    let idx = -1;
    for (let k = 0; k < sections.length; k++) {
      if (sections[k]!.start <= i) idx = k;
      else break;
    }
    return idx;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sidebar-scroll max-h-[calc(100vh-2rem)] overflow-y-auto w-[95vw] sm:max-w-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-xl">{record?.id ? "Edit Risk" : "New Risk"}</DialogTitle>
          <DialogDescription>
            Capture the risk details, likelihood and impact. The severity score is auto-computed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2 pt-1">
          {FIELDS.map((field, i) => (
            <div
              key={field.name}
              className={
                (field.full || field.type === "textarea" ? "sm:col-span-2" : "") +
                (sectionIndex(i) !== sectionIndex(i - 1) ? " sm:col-span-2 pt-2" : "")
              }
            >
              {sectionIndex(i) !== sectionIndex(i - 1) && field.section && (
                <div className="mb-4 -mx-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary bg-primary/10 rounded-full px-3 py-1">
                      {field.section}
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-primary/30 via-border/60 to-transparent" />
                  </div>
                </div>
              )}
              <div>
                <Label
                  htmlFor={field.name}
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85"
                >
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                {field.type === "textarea" ? (
                  <Textarea
                    id={field.name}
                    value={values[field.name] ?? ""}
                    placeholder={field.placeholder}
                    onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                    rows={field.rows ?? 4}
                    className="resize-y bg-primary/[0.07] border-primary/20 focus-visible:ring-primary/60 dark:bg-primary/[0.08]"
                  />
                ) : field.type === "select" ? (
                  <Select
                    value={values[field.name] ?? ""}
                    onValueChange={(val) => setValues((v) => ({ ...v, [field.name]: val }))}
                  >
                    <SelectTrigger
                      id={field.name}
                      className="bg-primary/[0.07] border-primary/20 focus:ring-primary/60 dark:bg-primary/[0.08]"
                    >
                      <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {normalizeOptions(field.options ?? []).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={field.name}
                    type={field.type === "tags" ? "text" : (field.type ?? "text")}
                    required={field.required}
                    placeholder={field.placeholder}
                    value={values[field.name] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                    className="bg-primary/[0.07] border-primary/20 focus-visible:ring-primary/60 dark:bg-primary/[0.08]"
                  />
                )}
              </div>
            </div>
          ))}
          <div className="sm:col-span-2 -mx-6 px-6 border-t border-border/60 pt-4 mt-2">
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending} className="min-w-[160px]">
                {save.isPending ? "Saving…" : record?.id ? "Save changes" : "Create Risk"}
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RiskRegister() {
  const { data, isLoading } = useRows<Risk>("risks");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>({
    column: "score",
    ascending: false,
  });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const RISKS = data ?? [];

  const computedRisks = useMemo(() => {
    return RISKS.map((r) => ({
      ...r,
      score: r.score ?? (r.likelihood ?? 0) * (r.impact ?? 0),
    }));
  }, [RISKS]);

  const filteredRisks = useMemo(() => {
    let list = computedRisks.filter((r) => {
      const matchesQuery = `${r.title} ${r.owner} ${r.category} ${r.mitigation ?? ""} ${(r.tags ?? []).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesCat = categoryFilter === "All" || r.category === categoryFilter;
      const matchesStatus = statusFilter === "All" || r.status === statusFilter;
      return matchesQuery && matchesCat && matchesStatus;
    });

    list.sort((a, b) => {
      const av = a[sortOrder.column];
      const bv = b[sortOrder.column];
      if (typeof av === "number" && typeof bv === "number") {
        return sortOrder.ascending ? av - bv : bv - av;
      }
      const as = String(av ?? "").toLowerCase();
      const bs = String(bv ?? "").toLowerCase();
      return sortOrder.ascending ? as.localeCompare(bs) : bs.localeCompare(as);
    });

    return list;
  }, [computedRisks, query, categoryFilter, statusFilter, sortOrder]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSort = (column: SortKey) => {
    setSortOrder((prev) => ({
      column,
      ascending: prev.column === column ? !prev.ascending : false,
    }));
  };

  const SortIndicator = ({ column }: { column: SortKey }) => {
    if (sortOrder.column !== column) return null;
    return sortOrder.ascending ? (
      <ArrowUp className="size-3 ml-1" />
    ) : (
      <ArrowDown className="size-3 ml-1" />
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="surface-card p-5 animate-pulse">
              <div className="h-3 bg-muted w-24 rounded mb-3" />
              <div className="h-7 bg-muted w-16 rounded" />
            </div>
          ))}
        </div>
        <div className="surface-card p-5 animate-pulse">
          <div className="h-8 bg-muted rounded mb-4" />
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const total = computedRisks.length;
  const openCount = computedRisks.filter(
    (r) => r.status === "Open" || r.status === "In Progress" || r.status === "Escalated",
  ).length;
  const highScoreCount = computedRisks.filter((r) => r.score > 12).length;
  const avgScore =
    total > 0
      ? Math.round(computedRisks.reduce((s, r) => s + r.score, 0) / total)
      : 0;

  const usedCategories = useMemo(() => {
    const set = new Set<string>();
    computedRisks.forEach((r) => r.category && set.add(r.category));
    return ["All", ...Array.from(set).sort()];
  }, [computedRisks]);

  const usedStatuses = useMemo(() => {
    const set = new Set<string>();
    computedRisks.forEach((r) => r.status && set.add(r.status));
    return ["All", ...Array.from(set).sort()];
  }, [computedRisks]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Risks"
          value={number(total)}
          icon={Shield}
          hint={`${number(filteredRisks.length)} matching filters`}
        />
        <KpiCard
          label="Open Risks"
          value={number(openCount)}
          icon={AlertTriangle}
          delta={total > 0 ? Math.round((openCount / total) * 100) - 50 : 0}
          hint="Open / In Progress / Escalated"
        />
        <KpiCard
          label="High Score (>12)"
          value={number(highScoreCount)}
          icon={XCircle}
          hint="Above severity threshold"
        />
        <KpiCard
          label="Avg Score"
          value={String(avgScore)}
          icon={Flame}
          hint={
            avgScore >= 12
              ? "Critical portfolio"
              : avgScore >= 8
                ? "Moderate exposure"
                : "Controlled exposure"
          }
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:max-w-sm">
            <Target className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Search risks, owners, tags…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {usedStatuses.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  statusFilter === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {usedCategories.map((c) => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                categoryFilter === c
                  ? "border-primary bg-primary/12 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{number(filteredRisks.length)}</span> of{" "}
          <span className="font-semibold text-foreground">{number(total)}</span> risks
        </div>
        <AddRiskDialog
          trigger={
            <Button>
              <Plus className="size-4" /> Add Risk
            </Button>
          }
        />
      </div>

      <div className="surface-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("title")}>
                <span className="inline-flex items-center">
                  Risk
                  <SortIndicator column="title" />
                </span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("category")}>
                <span className="inline-flex items-center">
                  Category
                  <SortIndicator column="category" />
                </span>
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-center"
                onClick={() => toggleSort("likelihood")}
              >
                <span className="inline-flex items-center justify-center w-full">
                  L
                  <SortIndicator column="likelihood" />
                </span>
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-center"
                onClick={() => toggleSort("impact")}
              >
                <span className="inline-flex items-center justify-center w-full">
                  I
                  <SortIndicator column="impact" />
                </span>
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-center"
                onClick={() => toggleSort("score")}
              >
                <span className="inline-flex items-center justify-center w-full">
                  Score
                  <SortIndicator column="score" />
                </span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("status")}>
                <span className="inline-flex items-center">
                  Status
                  <SortIndicator column="status" />
                </span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("owner")}>
                <span className="inline-flex items-center">
                  Owner
                  <SortIndicator column="owner" />
                </span>
              </TableHead>
              <TableHead
                className="cursor-pointer select-none hidden md:table-cell"
                onClick={() => toggleSort("created_at")}
              >
                <span className="inline-flex items-center">
                  Created
                  <SortIndicator column="created_at" />
                </span>
              </TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRisks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="p-12 text-center">
                  <Shield className="mx-auto size-10 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium">No risks match your filters</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Try a different search or create a new risk.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filteredRisks.map((risk) => (
                <Collapsible
                  key={risk.id}
                  open={expandedIds.has(risk.id)}
                  onOpenChange={() => toggleExpand(risk.id)}
                  asChild
                >
                  <>
                    <TableRow className="group">
                      <TableCell className="pr-0">
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-foreground"
                          >
                            {expandedIds.has(risk.id) ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                      </TableCell>
                      <TableCell className="font-medium max-w-[260px]">
                        <div className="truncate">{risk.title}</div>
                        {(risk.tags ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(risk.tags ?? []).slice(0, 3).map((t) => (
                              <Badge
                                key={t}
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 h-4 font-normal"
                              >
                                {t}
                              </Badge>
                            ))}
                            {(risk.tags ?? []).length > 3 && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 h-4 font-normal"
                              >
                                +{(risk.tags ?? []).length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{risk.category}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex size-7 items-center justify-center rounded-md bg-muted font-semibold text-sm">
                          {risk.likelihood}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex size-7 items-center justify-center rounded-md bg-muted font-semibold text-sm">
                          {risk.impact}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={`inline-flex min-w-[56px] items-center justify-center gap-1.5 rounded-lg px-2.5 py-1 font-bold text-xs ${severityColor(
                            risk.score,
                          )}`}
                        >
                          {risk.score}
                          <span className="opacity-70 font-medium">
                            ({severityLabel(risk.score)})
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge value={risk.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="size-6">
                            <AvatarFallback className="text-[10px] gradient-primary text-primary-foreground font-bold">
                              {initials(risk.owner)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs">{risk.owner}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                        {dateLabel(risk.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <AddRiskDialog
                            record={risk}
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-muted-foreground hover:text-primary"
                              >
                                <svg
                                  className="size-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                </svg>
                              </Button>
                            }
                          />
                          <DeleteButton
                            table="risks"
                            id={risk.id}
                            label="Risk"
                            name={risk.title}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                    <CollapsibleContent asChild>
                      <TableRow className="bg-muted/30 hover:bg-muted/40">
                        <TableCell colSpan={10} className="p-0">
                          <div className="grid gap-6 p-6 md:grid-cols-2">
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <h4 className="text-xs font-bold tracking-widest uppercase text-muted-foreground">
                                  Mitigation Plan
                                </h4>
                                <Badge variant="outline" className="text-[10px]">
                                  L×I = {risk.likelihood}×{risk.impact} = {risk.score}
                                </Badge>
                              </div>
                              {risk.mitigation ? (
                                <div className="rounded-xl border bg-primary/5 p-4 text-sm leading-relaxed whitespace-pre-wrap">
                                  {risk.mitigation}
                                </div>
                              ) : (
                                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground italic">
                                  No mitigation plan documented yet.
                                </div>
                              )}
                              {risk.related_objective_id && (
                                <div className="rounded-lg border bg-card p-3 text-xs">
                                  <span className="text-muted-foreground">Related Objective ID: </span>
                                  <span className="font-mono font-semibold">
                                    {risk.related_objective_id}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="space-y-3">
                              <h4 className="text-xs font-bold tracking-widest uppercase text-muted-foreground">
                                Comments ({(risk.comments ?? []).length})
                              </h4>
                              {(risk.comments ?? []).length === 0 ? (
                                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground italic">
                                  No comments yet.
                                </div>
                              ) : (
                                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                                  {(risk.comments ?? []).map((c, idx) => (
                                    <div
                                      key={idx}
                                      className="rounded-xl border bg-card p-3.5 text-sm"
                                    >
                                      <div className="flex items-center justify-between gap-2 mb-2">
                                        <div className="flex items-center gap-2">
                                          <Avatar className="size-5">
                                            <AvatarFallback className="text-[9px] gradient-primary text-primary-foreground font-bold">
                                              {initials(c.author)}
                                            </AvatarFallback>
                                          </Avatar>
                                          <span className="text-xs font-semibold">
                                            {c.author}
                                          </span>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                          {dateLabel(c.created_at)}
                                        </span>
                                      </div>
                                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap">
                                        {c.text}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    </CollapsibleContent>
                  </>
                </Collapsible>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
