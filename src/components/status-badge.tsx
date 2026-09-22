import { cn } from "@/lib/utils";

const TONES = {
  success: "bg-success/12 text-success border-success/25",
  warning: "bg-warning/15 text-warning border-warning/30",
  danger: "bg-destructive/12 text-destructive border-destructive/25",
  info: "bg-info/12 text-info border-info/25",
  primary: "bg-primary/12 text-primary border-primary/25",
  neutral: "bg-muted text-muted-foreground border-border",
} as const;

export type Tone = keyof typeof TONES;

const MAP: Record<string, Tone> = {
  "on track": "success",
  active: "success",
  won: "success",
  converted: "success",
  "deal done": "success",
  signed: "success",
  resolved: "success",
  responded: "success",
  done: "success",
  completed: "success",
  paid: "success",
  delivered: "success",
  approved: "success",
  accepted: "success",
  "at risk": "warning",
  pending: "warning",
  planning: "warning",
  sent: "warning",
  review: "warning",
  "in review": "warning",
  onboarding: "warning",
  "on hold": "warning",
  "on leave": "warning",
  paused: "warning",
  delayed: "danger",
  lost: "danger",
  expired: "danger",
  open: "danger",
  critical: "danger",
  cancelled: "danger",
  missed: "danger",
  rejected: "danger",
  urgent: "danger",
  "churn risk": "danger",
  upcoming: "info",
  "in progress": "info",
  qualified: "info",
  contacted: "info",
  scheduled: "info",
  high: "warning",
  medium: "info",
  low: "neutral",
  draft: "neutral",
  ended: "neutral",
  lead: "primary",
  new: "primary",
  proposal: "primary",
  "proposal sent": "primary",
  prospect: "primary",
  "to do": "neutral",
};

export function StatusBadge({
  value,
  tone,
  className,
}: {
  value: string | null | undefined;
  tone?: Tone;
  className?: string;
}) {
  // A record with a missing status/priority (bad data, an incomplete
  // import, an in-progress edit) should render as an honest "—" badge, not
  // crash the whole page — this component has no business taking down a
  // list/board view just because one row's field is blank.
  const resolved = tone ?? (value ? (MAP[value.toLowerCase()] ?? "neutral") : "neutral");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        TONES[resolved],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {value || "—"}
    </span>
  );
}
