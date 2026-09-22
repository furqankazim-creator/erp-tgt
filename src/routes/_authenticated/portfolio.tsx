import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Building2,
  Calendar1,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  HeartPulse,
  Palette,
  Rocket,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Truck,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { useRows } from "@/lib/db";
import { currency, dateLabel } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { CardGridSkeleton, EmptyState } from "@/components/loading";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio — Time Global Tech CRM" },
      { name: "description", content: "Completed projects and case studies." },
      { property: "og:title", content: "Portfolio — Time Global Tech CRM" },
      { property: "og:description", content: "Completed projects and case studies." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Project = {
  id: string;
  name: string;
  client: string | null;
  status: string;
  progress: number;
  manager: string | null;
  team: string[];
  deadline: string | null;
  budget: number;
  description: string | null;
  tags: string[];
  live_url: string | null;
  live_status: string | null;
  live_checked_at: string | null;
};
type Task = { id: string; project_id: string | null; assignee: string | null; status: string };

function LiveLink({ project }: { project: Project }) {
  if (!project.live_url) return null;
  const dotClass =
    project.live_status === "Up"
      ? "bg-success"
      : project.live_status === "Down"
        ? "bg-destructive"
        : "bg-muted-foreground";
  const label =
    project.live_status === "Up" ? "Live" : project.live_status === "Down" ? "Down" : "Unchecked";
  return (
    <a
      href={project.live_url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="border-border hover:border-primary/40 hover:bg-muted inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
    >
      <span className={`size-1.5 rounded-full ${dotClass}`} />
      {label}
      <ExternalLink className="size-3" />
    </a>
  );
}

const THEMES: { gradient: string; icon: LucideIcon; match: string[] }[] = [
  {
    gradient: "linear-gradient(135deg, oklch(0.6 0.14 205), oklch(0.72 0.13 230))",
    icon: Truck,
    match: ["logistics", "web"],
  },
  {
    gradient: "linear-gradient(135deg, oklch(0.65 0.15 155), oklch(0.75 0.12 190))",
    icon: HeartPulse,
    match: ["healthcare", "data"],
  },
  {
    gradient: "linear-gradient(135deg, oklch(0.62 0.16 20), oklch(0.72 0.14 60))",
    icon: Zap,
    match: ["energy", "iot"],
  },
  {
    gradient: "linear-gradient(135deg, oklch(0.6 0.14 280), oklch(0.7 0.12 250))",
    icon: Smartphone,
    match: ["fintech", "mobile"],
  },
  {
    gradient: "linear-gradient(135deg, oklch(0.62 0.15 75), oklch(0.72 0.13 100))",
    icon: ShoppingBag,
    match: ["ecommerce", "design"],
  },
];
const FALLBACK_THEME = {
  gradient: "linear-gradient(135deg, oklch(0.55 0.03 255), oklch(0.68 0.03 255))",
  icon: Sparkles,
};

function themeFor(tags: string[]) {
  for (const theme of THEMES) {
    if (tags.some((t) => theme.match.includes(t.toLowerCase()))) return theme;
  }
  return { ...FALLBACK_THEME, match: [] as string[] };
}

function Page() {
  const { data, isLoading } = useRows<Project>("projects");
  const { data: taskRows } = useRows<Task>("tasks");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "done">("all");
  const [selected, setSelected] = useState<Project | null>(null);

  const projects = data ?? [];
  const tasks = taskRows ?? [];

  const stats = useMemo(() => {
    const map = new Map<string, { team: number; done: number; total: number }>();
    for (const p of projects) {
      const projectTasks = tasks.filter((t) => t.project_id === p.id);
      const team = new Set(projectTasks.map((t) => t.assignee).filter(Boolean));
      if (p.manager) team.add(p.manager);
      for (const member of p.team ?? []) team.add(member);
      map.set(p.id, {
        team: team.size,
        done: projectTasks.filter((t) => t.status === "Done").length,
        total: projectTasks.length,
      });
    }
    return map;
  }, [projects, tasks]);

  const rows = projects
    .filter((p) => filter === "all" || p.status === "Done")
    .filter((p) =>
      `${p.name} ${p.client ?? ""} ${(p.tags ?? []).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfolio"
        description="Showcase of delivered and in-flight work — open a case study for the full picture."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Search case studies, clients, tags…"
          className="sm:max-w-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex gap-1.5">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
          >
            All work
          </Button>
          <Button
            variant={filter === "done" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("done")}
          >
            Completed only
          </Button>
        </div>
      </div>

      {isLoading ? (
        <CardGridSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState title="No case studies found" description="Try a different search or filter." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const theme = themeFor(p.tags ?? []);
            const Icon = theme.icon;
            const s = stats.get(p.id) ?? { team: 0, done: 0, total: 0 };
            return (
              <div
                key={p.id}
                onClick={() => setSelected(p)}
                className="surface-card surface-card-hover animate-rise group cursor-pointer overflow-hidden text-left"
              >
                <div
                  className="relative flex h-36 items-center justify-center overflow-hidden"
                  style={{ backgroundImage: theme.gradient }}
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-[0.12]"
                    style={{
                      backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
                      backgroundSize: "18px 18px",
                    }}
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-white/10 blur-2xl"
                  />
                  <span className="relative grid size-14 place-items-center rounded-2xl bg-white/15 backdrop-blur-sm">
                    <Icon className="size-7 text-white" />
                  </span>
                  <span className="absolute top-3 right-3">
                    <StatusBadge value={p.status} />
                  </span>
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="truncate font-semibold">{p.name}</h2>
                    <ArrowUpRight className="text-muted-foreground size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{p.client ?? "Internal"}</p>
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                    {p.description ?? "No description yet."}
                  </p>

                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span className="font-semibold">
                        {s.total ? Math.round((s.done / s.total) * 100) : 0}%
                      </span>
                    </div>
                    <Progress value={s.total ? Math.round((s.done / s.total) * 100) : 0} />
                  </div>

                  <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="size-3.5" /> {s.team || 1}
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="size-3.5" /> {s.done}/{s.total}
                    </span>
                    <span className="ml-auto font-semibold text-foreground">
                      {currency(p.budget, true)}
                    </span>
                  </div>

                  {p.live_url ? (
                    <div className="mt-3">
                      <LiveLink project={p} />
                    </div>
                  ) : null}

                  {p.tags?.length ? (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {p.tags.map((t) => (
                        <span
                          key={t}
                          className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          {selected ? (
            <CaseStudy
              project={selected}
              stats={stats.get(selected.id) ?? { team: 0, done: 0, total: 0 }}
              onOpenBoard={() => {
                const id = selected.id;
                setSelected(null);
                void navigate({ to: "/project/$projectId", params: { projectId: id } });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CaseStudy({
  project,
  stats,
  onOpenBoard,
}: {
  project: Project;
  stats: { team: number; done: number; total: number };
  onOpenBoard: () => void;
}) {
  const theme = themeFor(project.tags ?? []);
  const Icon = theme.icon;
  return (
    <>
      <div
        className="relative -mx-6 -mt-6 flex h-28 items-center justify-between px-6"
        style={{ backgroundImage: theme.gradient }}
      >
        <span className="grid size-12 place-items-center rounded-2xl bg-white/15 backdrop-blur-sm">
          <Icon className="size-6 text-white" />
        </span>
        <StatusBadge value={project.status} />
      </div>
      <DialogHeader className="pt-4">
        <DialogTitle>{project.name}</DialogTitle>
        <DialogDescription>{project.client ?? "Internal"}</DialogDescription>
      </DialogHeader>

      <p className="text-sm text-muted-foreground">
        {project.description ?? "No description yet."}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="border-border rounded-lg border p-3 text-center">
          <CircleDollarSign className="text-primary mx-auto size-4" />
          <p className="mt-1.5 text-sm font-bold">{currency(project.budget, true)}</p>
          <p className="text-[11px] text-muted-foreground">Budget</p>
        </div>
        <div className="border-border rounded-lg border p-3 text-center">
          <Calendar1 className="text-primary mx-auto size-4" />
          <p className="mt-1.5 text-sm font-bold">{dateLabel(project.deadline)}</p>
          <p className="text-[11px] text-muted-foreground">Deadline</p>
        </div>
        <div className="border-border rounded-lg border p-3 text-center">
          <Users className="text-primary mx-auto size-4" />
          <p className="mt-1.5 text-sm font-bold">{stats.team || 1}</p>
          <p className="text-[11px] text-muted-foreground">Team</p>
        </div>
        <div className="border-border rounded-lg border p-3 text-center">
          <CheckCircle2 className="text-primary mx-auto size-4" />
          <p className="mt-1.5 text-sm font-bold">
            {stats.done}/{stats.total}
          </p>
          <p className="text-[11px] text-muted-foreground">Tasks done</p>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
          <span>Delivery progress</span>
          <span className="font-semibold">
            {stats.total ? Math.round((stats.done / stats.total) * 100) : 0}%
          </span>
        </div>
        <Progress value={stats.total ? Math.round((stats.done / stats.total) * 100) : 0} />
      </div>

      {project.tags?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {project.tags.map((t) => (
            <span
              key={t}
              className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}

      <DialogFooter className="sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Building2 className="size-3.5" /> PM {project.manager ?? "TBD"}
          </span>
          <LiveLink project={project} />
        </div>
        <Button onClick={onOpenBoard}>
          <Rocket className="size-4" /> Open delivery board
        </Button>
      </DialogFooter>
    </>
  );
}
