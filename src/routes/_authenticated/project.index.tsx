import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Briefcase, CircleDollarSign, PiggyBank, Plus, Wallet } from "lucide-react";

import { useRows } from "@/lib/db";
import { currency, dateLabel } from "@/lib/format";
import { computeProjectProgress } from "@/lib/project-progress";
import { useCurrentUser } from "@/lib/mock-auth";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { CardGridSkeleton, EmptyState } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { buildProjectFields, type Project } from "./project";

type Account = { id: string; name: string };
type Task = { project_id: string | null; status: string };
type Employee = { id: string; name: string; email: string | null };

export const Route = createFileRoute("/_authenticated/project/")({
  head: () => ({
    meta: [
      { title: "Projects — Time Global Tech CRM" },
      { name: "description", content: "Project portfolio with progress, owners and deadlines." },
      { property: "og:title", content: "Projects — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "Project portfolio with progress, owners and deadlines.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { data, isLoading } = useRows<Project>("projects");
  const { data: accountRows } = useRows<Account>("accounts");
  const { data: taskRows } = useRows<Task>("tasks");
  const { data: employeeRows } = useRows<Employee>("employees");
  const { data: me } = useCurrentUser();
  const tasks = taskRows ?? [];
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const FIELDS = buildProjectFields((accountRows ?? []).map((a) => a.name));

  const myName = (employeeRows ?? []).find(
    (e) => e.email && me?.email && e.email.toLowerCase() === me.email.toLowerCase(),
  )?.name;

  const allProjects = data ?? [];
  // A Developer only ever sees the project(s) they're the manager of or on
  // the team for — everyone else sees the full portfolio. If we can't match
  // their login to an employee record yet (still loading, or no match at
  // all), show nothing rather than falling through to an unscoped list —
  // an `undefined` name must never accidentally match a project whose
  // `manager` field happens to be missing too.
  const projects =
    me?.access_role === "developer"
      ? myName
        ? allProjects.filter((p) => p.manager === myName || (p.team ?? []).includes(myName))
        : []
      : allProjects;
  const rows = projects.filter((p) =>
    `${p.name} ${p.client ?? ""} ${p.manager ?? ""} ${(p.team ?? []).join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const active = projects.filter((p) => p.status !== "Done" && p.status !== "Cancelled");
  const totalRevenue = projects.reduce((s, p) => s + Number(p.revenue ?? 0), 0);
  const totalCost = projects.reduce((s, p) => s + Number(p.cost ?? 0), 0);
  const margin = totalRevenue - totalCost;

  // Salesman's job ends at "Create project" — no ongoing Delivery access,
  // even via a direct link. This must be a hard block, not just a hidden
  // nav item, since e.g. a project doc on the Documents page can link here.
  if (me?.access_role === "salesman") {
    return (
      <EmptyState
        title="No access"
        description="Projects are managed by Delivery — once a deal becomes a project, it's out of Sales' hands."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description={
          me?.access_role === "developer"
            ? "Your assigned project(s) — tasks, milestones and delivery board."
            : "Progress, budgets and deadlines across every engagement — open one for its delivery board."
        }
        action={
          me?.access_role === "developer" ? null : (
            <RecordDialog
              table="projects"
              label="Project"
              fields={FIELDS}
              defaults={{ status: "Planning" }}
              trigger={
                <Button>
                  <Plus className="size-4" /> New project
                </Button>
              }
            />
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Active projects" value={String(active.length)} icon={Briefcase} />
        <KpiCard
          label="Total budget"
          value={currency(
            projects.reduce((s, p) => s + Number(p.budget), 0),
            true,
          )}
          icon={CircleDollarSign}
        />
        <KpiCard label="Total cost" value={currency(totalCost, true)} icon={Wallet} />
        <KpiCard
          label="Total revenue"
          value={currency(totalRevenue, true)}
          icon={CircleDollarSign}
        />
        <KpiCard
          label="Margin"
          value={currency(margin, true)}
          hint={margin >= 0 ? "on track" : "over cost"}
          icon={PiggyBank}
        />
      </div>

      <Input
        placeholder="Search projects, clients, managers, team members…"
        className="sm:max-w-sm"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {isLoading ? (
        <CardGridSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No projects found"
          description="Try a different search, or create one."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const progress = computeProjectProgress(p.id, tasks);
            return (
              <div
                key={p.id}
                onClick={() =>
                  void navigate({ to: "/project/$projectId", params: { projectId: p.id } })
                }
                className="surface-card surface-card-hover animate-rise cursor-pointer p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{p.name}</h2>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {p.client ?? "Internal"} · PM {p.manager ?? "TBD"}
                    </p>
                  </div>
                  <StatusBadge value={p.status} />
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span className="font-semibold">{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </div>

                {p.tags?.length || p.team?.length ? (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {p.tags?.map((t) => (
                      <span
                        key={t}
                        className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium"
                      >
                        {t}
                      </span>
                    ))}
                    {p.team?.length ? (
                      <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-semibold">
                        {p.team.length} on team
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Due {dateLabel(p.deadline)}</span>
                  <span className="font-semibold text-foreground">{currency(p.budget, true)}</span>
                </div>

                <div
                  className="mt-3 flex items-center gap-1 border-t border-border pt-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <RecordDialog
                    table="projects"
                    label="Project"
                    fields={FIELDS}
                    record={p}
                    trigger={
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                        Edit
                      </Button>
                    }
                  />
                  {me?.access_role === "developer" ? null : (
                    <DeleteButton table="projects" id={p.id} label="Project" name={p.name} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
