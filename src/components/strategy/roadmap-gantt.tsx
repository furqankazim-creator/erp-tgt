import { useMemo } from "react";
import { Diamond, Flag, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export type RoadmapMilestone = {
  title: string;
  status: "Done" | "In Progress" | "Blocked" | "Planned";
  date?: string;
};

export type RoadmapObjective = {
  id: string;
  title: string;
  owner: string;
  category: string;
  start_date: string;
  end_date: string;
  progress: number;
  status: string;
  milestones: RoadmapMilestone[];
};

type CatGradient = {
  gradient: string;
  border: string;
  text: string;
  accent: string;
  icon: LucideIcon;
};

const CATEGORY_STYLES: Record<string, CatGradient> = {
  Revenue: {
    gradient: "bg-gradient-to-r from-success/80 via-success/70 to-success/80",
    border: "border-success/40",
    text: "text-success-foreground",
    accent: "text-success",
    icon: Flag,
  },
  Product: {
    gradient: "bg-gradient-to-r from-info/80 via-info/70 to-chart-2/80",
    border: "border-info/40",
    text: "text-info-foreground",
    accent: "text-info",
    icon: Flag,
  },
  Customer: {
    gradient: "bg-gradient-to-r from-chart-5/80 via-primary/70 to-chart-4/80",
    border: "border-chart-5/40",
    text: "text-primary-foreground",
    accent: "text-chart-5",
    icon: Flag,
  },
  Engineering: {
    gradient: "bg-gradient-to-r from-chart-3/80 via-info/70 to-primary/60",
    border: "border-chart-3/40",
    text: "text-info-foreground",
    accent: "text-chart-3",
    icon: Flag,
  },
  Operations: {
    gradient: "bg-gradient-to-r from-warning/80 via-warning/70 to-chart-4/80",
    border: "border-warning/40",
    text: "text-warning-foreground",
    accent: "text-warning",
    icon: Flag,
  },
  Compliance: {
    gradient: "bg-gradient-to-r from-destructive/80 via-destructive/70 to-destructive/60",
    border: "border-destructive/40",
    text: "text-destructive-foreground",
    accent: "text-destructive",
    icon: Flag,
  },
  People: {
    gradient: "bg-gradient-to-r from-chart-2/80 via-primary/60 to-chart-5/80",
    border: "border-chart-2/40",
    text: "text-primary-foreground",
    accent: "text-chart-2",
    icon: Flag,
  },
};

const DEFAULT_CATEGORY: CatGradient = {
  gradient: "bg-gradient-to-r from-primary/80 via-primary/70 to-primary-glow/80",
  border: "border-primary/40",
  text: "text-primary-foreground",
  accent: "text-primary",
  icon: Flag,
};

function categoryStyle(category: string): CatGradient {
  return CATEGORY_STYLES[category] ?? DEFAULT_CATEGORY;
}

const MILESTONE_COLORS: Record<string, string> = {
  Done: "bg-success border-success-foreground/50 text-success-foreground",
  "In Progress": "bg-primary border-primary-foreground/50 text-primary-foreground",
  Blocked: "bg-destructive border-destructive-foreground/50 text-destructive-foreground",
  Planned: "bg-muted border-muted-foreground/40 text-muted-foreground",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function parseDate(s: string): Date {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    const parts = s.split("-");
    if (parts.length === 3) {
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
    return new Date();
  }
  return d;
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  return r;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function monthName(d: Date): string {
  return d.toLocaleString("default", { month: "short" });
}

function quarterLabel(d: Date): string {
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} ${d.getFullYear()}`;
}

function daysBetween(a: Date, b: Date): number {
  const MS = 1000 * 60 * 60 * 24;
  return Math.round((b.getTime() - a.getTime()) / MS);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

const ROW_HEIGHT = 88;
const HEADER_HEIGHT = 64;
const LABEL_WIDTH = 260;
const DAY_WIDTH = 3;
const MONTH_PADDING = 12;

export function RoadmapGantt({
  objectives,
  onSelect,
  className,
}: {
  objectives: RoadmapObjective[];
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const { rangeStart, months, totalDays, todayX, totalWidth } = useMemo(() => {
    if (objectives.length === 0) {
      const now = new Date();
      const s = startOfMonth(addMonths(now, -1));
      const e = endOfMonth(addMonths(now, 11));
      const months: Date[] = [];
      let cursor = new Date(s);
      while (cursor <= e) {
        months.push(new Date(cursor));
        cursor = addMonths(cursor, 1);
      }
      const totalDays = Math.max(1, daysBetween(s, e));
      const todayX = clamp01(daysBetween(s, now) / totalDays);
      const totalWidth = totalDays * DAY_WIDTH + MONTH_PADDING * 2;
      return { rangeStart: s, rangeEnd: e, months, totalDays, todayX, totalWidth };
    }

    const starts = objectives.map((o) => parseDate(o.start_date));
    const ends = objectives.map((o) => parseDate(o.end_date));
    const msDates = objectives.flatMap((o) =>
      (o.milestones ?? []).map((m) => (m.date ? parseDate(m.date) : null)).filter(Boolean) as Date[],
    );

    const allDates = [...starts, ...ends, ...msDates];
    let minD = new Date(Math.min(...allDates.map((d) => d.getTime())));
    let maxD = new Date(Math.max(...allDates.map((d) => d.getTime())));

    minD = startOfMonth(addMonths(minD, -1));
    maxD = endOfMonth(addMonths(maxD, 1));

    const now = new Date();
    if (now < minD) minD = startOfMonth(now);
    if (now > maxD) maxD = endOfMonth(now);

    const months: Date[] = [];
    let cursor = new Date(minD);
    while (cursor <= maxD) {
      months.push(new Date(cursor));
      cursor = addMonths(cursor, 1);
    }

    const totalDays = Math.max(1, daysBetween(minD, maxD));
    const todayX = clamp01(daysBetween(minD, now) / totalDays);
    const totalWidth = totalDays * DAY_WIDTH + MONTH_PADDING * 2;

    return { rangeStart: minD, rangeEnd: maxD, months, totalDays, todayX, totalWidth };
  }, [objectives]);

  const quarters = useMemo(() => {
    const qs: { label: string; startIdx: number; span: number }[] = [];
    let lastKey = "";
    months.forEach((m, i) => {
      const key = `${m.getFullYear()}-Q${Math.floor(m.getMonth() / 3) + 1}`;
      if (key !== lastKey) {
        qs.push({ label: quarterLabel(m), startIdx: i, span: 1 });
        lastKey = key;
      } else {
        const last = qs[qs.length - 1];
        if (last) last.span += 1;
      }
    });
    return qs;
  }, [months]);

  function xForDate(d: Date): number {
    const pct = clamp01(daysBetween(rangeStart, d) / totalDays);
    return MONTH_PADDING + pct * (totalWidth - MONTH_PADDING * 2);
  }

  function monthXRange(m: Date): { start: number; end: number } {
    const s = startOfMonth(m);
    const e = endOfMonth(m);
    return { start: xForDate(s), end: xForDate(e) };
  }

  return (
    <div className={cn("surface-card overflow-hidden", className)}>
      <div className="flex h-full w-full flex-col">
        <div className="flex min-h-0 flex-1">
          <div
            className="shrink-0 border-r bg-muted/30"
            style={{ width: LABEL_WIDTH, height: HEADER_HEIGHT + objectives.length * ROW_HEIGHT }}
          >
            <div
              className="flex flex-col items-stretch border-b bg-card"
              style={{ height: HEADER_HEIGHT }}
            >
              <div className="flex flex-1 items-center px-4 pt-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Objective
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {objectives.length} items
                  </p>
                </div>
              </div>
            </div>
            {objectives.map((obj) => {
              const style = categoryStyle(obj.category);
              const Icon = style.icon;
              return (
                <button
                  key={obj.id}
                  onClick={() => onSelect?.(obj.id)}
                  className="group block w-full border-b px-3 py-3 text-left transition-colors hover:bg-accent/40"
                  style={{ height: ROW_HEIGHT }}
                >
                  <div className="flex h-full items-start gap-2.5">
                    <div
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-lg border",
                        style.border,
                        "bg-card",
                      )}
                    >
                      <Icon className={cn("size-4", style.accent)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold leading-tight">
                        {obj.title}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <Avatar className="size-5 border border-border">
                          <AvatarFallback className="text-[9px] font-bold gradient-primary text-primary-foreground">
                            {initials(obj.owner)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {obj.owner}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "truncate rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                            style.border,
                            style.accent,
                            "bg-card",
                          )}
                        >
                          {obj.category}
                        </span>
                        <span className="text-[10px] font-bold text-muted-foreground shrink-0">
                          {obj.progress}%
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="sidebar-scroll relative min-w-0 flex-1 overflow-x-auto">
            <div style={{ width: totalWidth, position: "relative", minWidth: "100%" }}>
              <div
                className="sticky top-0 z-20 border-b bg-card backdrop-blur"
                style={{ height: HEADER_HEIGHT }}
              >
                <div className="relative h-full">
                  <div className="flex h-1/2 border-b border-border/60">
                    {quarters.map((q, qi) => {
                      const startMonth = months[q.startIdx];
                      const endMonthIdx = q.startIdx + q.span - 1;
                      const endMonth = months[endMonthIdx];
                      if (!startMonth || !endMonth) return null;
                      const start = monthXRange(startMonth).start;
                      const end = monthXRange(endMonth).end;
                      const width = Math.max(end - start, 1);
                      return (
                        <div
                          key={qi}
                          className="absolute top-0 flex items-center justify-center border-r border-border/40 last:border-r-0"
                          style={{
                            left: start,
                            width,
                            height: HEADER_HEIGHT / 2,
                          }}
                        >
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            {q.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="relative h-1/2">
                    {months.map((m, mi) => {
                      const { start, end } = monthXRange(m);
                      const width = Math.max(end - start, 1);
                      const isCurMonth = sameMonth(m, new Date());
                      return (
                        <div
                          key={mi}
                          className={cn(
                            "absolute top-0 flex items-center justify-center border-r border-border/40 last:border-r-0",
                            isCurMonth && "bg-primary/8",
                          )}
                          style={{
                            left: start,
                            width,
                            height: HEADER_HEIGHT / 2,
                          }}
                        >
                          <span
                            className={cn(
                              "text-[10px] font-semibold uppercase tracking-wider",
                              isCurMonth ? "text-primary font-bold" : "text-muted-foreground",
                            )}
                          >
                            {monthName(m)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div
                className="relative"
                style={{ height: objectives.length * ROW_HEIGHT }}
              >
                <div className="pointer-events-none absolute inset-0">
                  {months.map((m, mi) => {
                    const { start } = monthXRange(m);
                    return (
                      <div
                        key={mi}
                        className="absolute top-0 h-full w-px bg-border/60"
                        style={{ left: start }}
                      />
                    );
                  })}
                </div>

                <div
                  className="pointer-events-none absolute z-10 top-0"
                  style={{
                    left: MONTH_PADDING + todayX * (totalWidth - MONTH_PADDING * 2),
                    height: HEADER_HEIGHT - 1 + objectives.length * ROW_HEIGHT,
                    transform: "translateX(-0.5px)",
                  }}
                >
                  <div className="relative h-full w-0">
                    <div className="absolute inset-y-0 left-0 w-0 border-l-2 border-dashed border-destructive/70" />
                    <div className="absolute -top-0.5 -left-[34px] rounded-md bg-destructive px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-destructive-foreground shadow-sm whitespace-nowrap">
                      Today
                    </div>
                  </div>
                </div>

                {objectives.map((obj, oi) => {
                  const style = categoryStyle(obj.category);
                  const start = parseDate(obj.start_date);
                  const end = parseDate(obj.end_date);
                  const x1 = xForDate(start);
                  const x2 = xForDate(end);
                  const barLeft = Math.min(x1, x2);
                  const barWidth = Math.max(Math.abs(x2 - x1), DAY_WIDTH * 2);
                  const ms = obj.milestones ?? [];

                  return (
                    <div
                      key={obj.id}
                      className="absolute left-0 right-0 border-b border-border/40"
                      style={{ top: oi * ROW_HEIGHT, height: ROW_HEIGHT }}
                    >
                      <button
                        onClick={() => onSelect?.(obj.id)}
                        className="group absolute flex items-center transition-[transform,box-shadow] hover:z-[5] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-full"
                        style={{
                          left: barLeft,
                          top: ROW_HEIGHT / 2 - 22,
                          width: barWidth,
                          height: 44,
                        }}
                      >
                        <div
                          className={cn(
                            "absolute inset-0 overflow-hidden rounded-full border shadow-sm",
                            style.border,
                            style.gradient,
                            "transition-[filter,box-shadow]",
                            "group-hover:shadow-lg group-hover:[filter:brightness(1.05)]",
                          )}
                        />
                        <div
                          className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-foreground/15 backdrop-blur-[1px]"
                          style={{ width: `${clamp01(obj.progress / 100) * 100}%` }}
                        />
                        <div className="relative z-10 flex w-full items-center justify-between gap-2 px-3">
                          <span
                            className={cn(
                              "truncate text-[11px] font-bold leading-tight drop-shadow-sm",
                              style.text,
                            )}
                          >
                            {obj.title}
                          </span>
                          <span className="shrink-0 scale-90 opacity-95">
                            <StatusBadge
                              value={obj.status}
                              className="!border-0 !bg-background/95 !shadow-sm"
                            />
                          </span>
                        </div>

                        <div className="pointer-events-none absolute inset-0 z-20">
                          {ms.map((m, mi) => {
                            let pct: number;
                            if (m.date) {
                              const md = parseDate(m.date);
                              pct = clamp01(
                                (xForDate(md) - barLeft) / Math.max(barWidth, 1),
                              );
                            } else {
                              pct = (mi + 1) / (ms.length + 1);
                            }
                            const mc = MILESTONE_COLORS[m.status] ?? MILESTONE_COLORS["Planned"];
                            return (
                              <div
                                key={mi}
                                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                                style={{ left: `${pct * 100}%` }}
                                title={`${m.title} — ${m.status}${m.date ? ` · ${m.date}` : ""}`}
                              >
                                <div className="relative">
                                  <div
                                    className={cn(
                                      "size-3.5 rotate-45 border shadow-sm",
                                      mc,
                                    )}
                                  />
                                  <Diamond className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-2 opacity-90" />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </button>
                    </div>
                  );
                })}

                {objectives.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <Flag className="mx-auto size-8 text-muted-foreground/60" />
                      <p className="mt-2 text-sm font-medium text-muted-foreground">
                        No objectives to display
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Create objectives with start and end dates to see the roadmap.
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t bg-muted/30 px-4 py-3">
          {Object.entries(CATEGORY_STYLES).map(([name, s]) => (
            <div key={name} className="flex items-center gap-2">
              <span
                className={cn(
                  "size-3 rounded-sm border shadow-sm",
                  s.border,
                  s.gradient,
                )}
              />
              <span className="text-[11px] font-semibold text-muted-foreground">{name}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-4 text-[11px]">
            <div className="flex items-center gap-1.5">
              <div className="size-3.5 rotate-45 bg-success border border-success-foreground/50" />
              <span className="text-muted-foreground">Done</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="size-3.5 rotate-45 bg-primary border border-primary-foreground/50" />
              <span className="text-muted-foreground">In Progress</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="size-3.5 rotate-45 bg-destructive border border-destructive-foreground/50" />
              <span className="text-muted-foreground">Blocked</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="size-3.5 rotate-45 bg-muted border border-muted-foreground/40" />
              <span className="text-muted-foreground">Planned</span>
            </div>
            <div className="flex items-center gap-1.5 pl-3 border-l border-border">
              <div className="h-3 w-0 border-l-2 border-dashed border-destructive/70" />
              <span className="text-destructive font-semibold">Today</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
