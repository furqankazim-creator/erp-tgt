import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlarmClock, LifeBuoy, Plus, Smile, Star } from "lucide-react";

import { useRows } from "@/lib/db";
import { countdown, dateTimeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog, type Field } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton, EmptyState } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/after-sales")({
  head: () => ({
    meta: [
      { title: "After Sales — Time Global Tech CRM" },
      { name: "description", content: "Support tickets, satisfaction and SLA countdowns." },
      { property: "og:title", content: "After Sales — Time Global Tech CRM" },
      { property: "og:description", content: "Support tickets, satisfaction and SLA countdowns." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Ticket = {
  id: string;
  subject: string;
  client: string | null;
  priority: string;
  status: string;
  satisfaction: number | null;
  assignee: string | null;
  sla_due_at: string | null;
};
type Employee = { id: string; name: string };

const STATUSES = ["Open", "Pending", "Resolved"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];

function isBreached(t: Ticket): boolean {
  if (!t.sla_due_at || t.status === "Resolved") return false;
  return new Date(t.sla_due_at).getTime() < Date.now();
}

function Satisfaction({ value }: { value: number | null }) {
  if (value == null)
    return <span className="text-xs text-muted-foreground">Awaiting feedback</span>;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn("size-3.5", i < value ? "fill-warning text-warning" : "text-border")}
        />
      ))}
    </div>
  );
}

function Page() {
  const { data, isLoading } = useRows<Ticket>("tickets");
  const { data: employeeRows } = useRows<Employee>("employees");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const FIELDS: Field[] = [
    { name: "subject", label: "Subject", required: true, full: true },
    { name: "client", label: "Client" },
    {
      name: "assignee",
      label: "Assignee",
      type: "select",
      options: (employeeRows ?? []).map((e) => e.name),
    },
    { name: "priority", label: "Priority", type: "select", options: PRIORITIES },
    { name: "status", label: "Status", type: "select", options: STATUSES },
    { name: "sla_due_at", label: "SLA due", type: "datetime-local" },
    { name: "satisfaction", label: "Satisfaction (1-5)", type: "number" },
  ];

  const tickets = data ?? [];
  const filtered = tickets
    .filter((t) => !statusFilter || t.status === statusFilter)
    .filter((t) =>
      `${t.subject} ${t.client ?? ""} ${t.assignee ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );

  const open = tickets.filter((t) => t.status !== "Resolved").length;
  const breached = tickets.filter(isBreached).length;
  const rated = tickets.filter((t) => t.satisfaction != null);
  const avgSatisfaction = rated.length
    ? (rated.reduce((s, t) => s + Number(t.satisfaction), 0) / rated.length).toFixed(1)
    : "—";
  const resolved = tickets.filter((t) => t.status === "Resolved").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="After Sales"
        description="Support queue with SLA countdowns and customer satisfaction."
        action={
          <RecordDialog
            table="tickets"
            label="Ticket"
            fields={FIELDS}
            defaults={{ status: "Open", priority: "Medium" }}
            trigger={
              <Button>
                <Plus className="size-4" /> New ticket
              </Button>
            }
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Open tickets" value={String(open)} icon={LifeBuoy} />
        <KpiCard
          label="SLA breached"
          value={String(breached)}
          hint={breached ? "needs attention" : "all within SLA"}
          icon={AlarmClock}
        />
        <KpiCard
          label="Avg. satisfaction"
          value={avgSatisfaction === "—" ? avgSatisfaction : `${avgSatisfaction}/5`}
          icon={Smile}
        />
        <KpiCard label="Resolved" value={String(resolved)} icon={Star} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Search tickets, clients, assignees…"
          className="sm:max-w-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={statusFilter === null ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(null)}
          >
            All
          </Button>
          {STATUSES.map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState title="No tickets found" description="Try a different filter or search." />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Ticket</th>
                <th className="px-4 py-3 text-left font-semibold">Priority</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">SLA</th>
                <th className="px-4 py-3 text-left font-semibold">Satisfaction</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3">
                    <span className="block font-medium">{t.subject}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t.client ?? "Internal"} · {t.assignee ?? "Unassigned"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={t.priority} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={t.status} />
                  </td>
                  <td className="px-4 py-3">
                    {t.status === "Resolved" ? (
                      <span className="text-success text-xs font-medium">Resolved</span>
                    ) : t.sla_due_at ? (
                      <span
                        className={cn(
                          "text-xs font-medium",
                          isBreached(t) ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {countdown(t.sla_due_at)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No SLA</span>
                    )}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {dateTimeLabel(t.sla_due_at)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Satisfaction value={t.satisfaction} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <RecordDialog
                        table="tickets"
                        label="Ticket"
                        fields={FIELDS}
                        record={t}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        }
                      />
                      <DeleteButton table="tickets" id={t.id} label="Ticket" name={t.subject} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
