import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  RotateCcw,
  Trash2,
  Search,
  Clock,
  Layers,
  ArchiveX,
  AlertTriangle,
} from "lucide-react";

import {
  useTrashRows,
  useRestoreRow,
  usePermanentDeleteRow,
  useEmptyTrash,
  type TrashItem,
  type TableName,
} from "@/lib/db";
import { dateTimeLabel } from "@/lib/format";
import { useCurrentUser } from "@/lib/mock-auth";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { TableSkeleton, EmptyState } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/trash")({
  head: () => ({
    meta: [
      { title: "Trash — Time Global Tech ERP" },
      { name: "description", content: "Recycle bin to review and restore deleted records." },
      { property: "og:title", content: "Trash — Time Global Tech ERP" },
      { property: "og:description", content: "Recycle bin to review and restore deleted records." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrashPage,
});

const TABLE_LABELS: Record<string, string> = {
  inquiries: "Enquiry",
  contacts: "Lead / Contact",
  accounts: "Client Account",
  deals: "Deal",
  projects: "Project",
  tasks: "Task",
  invoices: "Invoice",
  documents: "Document",
  meetings: "Meeting",
  agreements: "Agreement",
  tickets: "Support Ticket",
  proposals: "Proposal",
  employees: "Employee",
  milestones: "Milestone",
  deliverables: "Deliverable",
  campaigns: "Campaign",
  work_logs: "Work Log",
  bills: "Bill",
  bill_payments: "Bill Payment",
  payments: "Payment",
  bookkeeping_transactions: "Transaction",
  scope_items: "Scope Item",
  scope_change_requests: "Scope Change",
  quotes: "Quote",
  budgets: "Budget",
  costs: "Cost",
};

function formatModule(table: string): string {
  return TABLE_LABELS[table] ?? table.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getItemTitle(item: TrashItem): string {
  if (typeof item.title === "string" && item.title) return item.title;
  if (typeof item.name === "string" && item.name) return item.name;
  if (typeof item.subject === "string" && item.subject) return item.subject;
  if (typeof item.client_name === "string" && item.client_name) return item.client_name;
  if (typeof item.display_id === "string" && item.display_id) return item.display_id;
  if (typeof item.code === "string" && item.code) return item.code;
  if (typeof item.email === "string" && item.email) return item.email;
  if (typeof item.invoice_number === "string" && item.invoice_number) return `Invoice #${item.invoice_number}`;
  return `Item ${item.id.slice(0, 8)}`;
}

function getItemSubtitle(item: TrashItem): string | null {
  const parts: string[] = [];
  if (typeof item.display_id === "string" && item.display_id && item.display_id !== getItemTitle(item)) {
    parts.push(item.display_id);
  }
  if (typeof item.code === "string" && item.code && item.code !== getItemTitle(item)) {
    parts.push(item.code);
  }
  if (typeof item.email === "string" && item.email && item.email !== getItemTitle(item)) {
    parts.push(item.email);
  }
  if (typeof item.client === "string" && item.client) {
    parts.push(`Client: ${item.client}`);
  }
  if (typeof item.company === "string" && item.company) {
    parts.push(item.company);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function getDaysRemaining(deletedAtIso?: string): number {
  if (!deletedAtIso) return 30;
  const deleted = new Date(deletedAtIso).getTime();
  if (Number.isNaN(deleted)) return 30;
  const daysPassed = (Date.now() - deleted) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(30 - daysPassed));
}

function TrashPage() {
  const { data: items = [], isLoading, isFetching, refetch } = useTrashRows();
  const restoreMutation = useRestoreRow();
  const deleteMutation = usePermanentDeleteRow();
  const emptyTrashMutation = useEmptyTrash();
  const { data: currentUser } = useCurrentUser();

  const [search, setSearch] = useState("");
  const [selectedModule, setSelectedModule] = useState<string>("all");
  const [emptyDialogOpen, setEmptyDialogOpen] = useState(false);
  const [restoreConfirmItem, setRestoreConfirmItem] = useState<TrashItem | null>(null);
  const [permanentConfirmItem, setPermanentConfirmItem] = useState<TrashItem | null>(null);

  const isAdmin = currentUser?.access_role === "super_admin" || currentUser?.access_role === "admin";

  const moduleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item._table] = (counts[item._table] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (selectedModule !== "all" && item._table !== selectedModule) return false;
      if (!term) return true;
      const title = getItemTitle(item).toLowerCase();
      const subtitle = (getItemSubtitle(item) ?? "").toLowerCase();
      const mod = formatModule(item._table).toLowerCase();
      const actor = (String(item.deleted_by ?? "")).toLowerCase();
      return (
        title.includes(term) ||
        subtitle.includes(term) ||
        mod.includes(term) ||
        actor.includes(term) ||
        item.id.toLowerCase().includes(term)
      );
    });
  }, [items, search, selectedModule]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trash"
        description="Records you remove from any tab are kept in your own trash for 30 days before automatic deletion. You can restore your records anytime."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RotateCcw className={cn("size-4", isFetching && "animate-spin")} />
              Refresh
            </Button>
            {items.length > 0 ? (
            <AlertDialog open={emptyDialogOpen} onOpenChange={setEmptyDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2">
                  <ArchiveX className="size-4" />
                  Empty Trash
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Empty Trash permanently?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all {items.length} items in your Trash. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => emptyTrashMutation.mutate()}
                  >
                    Empty Trash
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Items in Trash"
          value={String(items.length)}
          icon={Trash2}
          hint={items.length === 0 ? "Trash is clean" : `${filteredItems.length} matching search`}
        />
        <KpiCard
          label="Auto-Purge Policy"
          value="30 Days"
          icon={Clock}
          hint="Items automatically delete after 1 month"
        />
        <KpiCard
          label="Modules Affected"
          value={String(Object.keys(moduleCounts).length)}
          icon={Layers}
          hint="Different tabs with deleted items"
        />
      </div>

      <div className="surface-card space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deleted records..."
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={selectedModule === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedModule("all")}
            >
              All ({items.length})
            </Button>
            {Object.entries(moduleCounts).map(([table, count]) => (
              <Button
                key={table}
                variant={selectedModule === table ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedModule(table)}
              >
                {formatModule(table)} ({count})
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            title={items.length === 0 ? "Trash is empty" : "No matching items found"}
            description={
              items.length === 0
                ? "When items are deleted from any tab in the software, they appear here."
                : "Try clearing your search query or module filter."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Record</th>
                  <th className="px-4 py-3">Original Tab</th>
                  <th className="px-4 py-3">Deleted By</th>
                  <th className="px-4 py-3">Deleted On</th>
                  <th className="px-4 py-3">Auto-Purge</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredItems.map((item) => {
                  const title = getItemTitle(item);
                  const subtitle = getItemSubtitle(item);
                  const daysRemaining = getDaysRemaining(item.deleted_at);

                  return (
                    <tr key={`${item._table}-${item.id}`} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <div className="font-semibold text-foreground">{title}</div>
                        {subtitle ? (
                          <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {formatModule(item._table)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {String(item.deleted_by ?? "System")}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {dateTimeLabel(item.deleted_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
                            daysRemaining <= 3
                              ? "bg-destructive/15 text-destructive"
                              : daysRemaining <= 7
                              ? "bg-warning/20 text-warning"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          <Clock className="size-3" />
                          {daysRemaining === 0 ? "Purging soon" : `${daysRemaining}d remaining`}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs font-medium"
                            onClick={() =>
                              restoreMutation.mutate({
                                table: item._table as TableName,
                                id: item.id,
                              })
                            }
                            disabled={restoreMutation.isPending}
                          >
                            <RotateCcw className="size-3.5" />
                            Restore
                          </Button>

                          {isAdmin ? (
                            <AlertDialog
                              open={permanentConfirmItem?.id === item.id}
                              onOpenChange={(open) => setPermanentConfirmItem(open ? item : null)}
                            >
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 text-muted-foreground hover:text-destructive"
                                  title="Delete forever"
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Permanently delete record?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    “{title}” will be permanently wiped from the database. This action cannot be reversed.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => {
                                      deleteMutation.mutate({
                                        table: item._table as TableName,
                                        id: item.id,
                                      });
                                    }}
                                  >
                                    Delete Forever
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          ) : null}
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
    </div>
  );
}

