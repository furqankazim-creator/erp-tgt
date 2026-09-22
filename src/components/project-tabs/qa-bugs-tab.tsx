import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bug, HelpCircle } from "lucide-react";
import { toast } from "sonner";

import { updateRow, useRows } from "@/lib/db";
import { countdown } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Ticket = {
  id: string;
  subject: string;
  client: string | null;
  priority: string;
  status: string;
  satisfaction: number | null;
  assignee: string | null;
  sla_due_at: string | null;
  project_id: string | null;
  response?: string | null;
};

const SEVERITY_ORDER = ["Critical", "High", "Medium", "Low"];

function severityRank(p: string) {
  const i = SEVERITY_ORDER.indexOf(p);
  return i === -1 ? SEVERITY_ORDER.length : i;
}

// `tickets` has no type/category discriminator in the live data today — a
// ticket whose subject reads as a question (ends with "?" or opens with a
// question word) is treated as Q&A; everything else is a bug.
function isQuestion(t: Ticket) {
  const s = t.subject.trim().toLowerCase();
  return s.endsWith("?") || /^(how|why|what|when|can|should|is|does)\b/.test(s);
}

function TicketDrawer({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
  const [response, setResponse] = useState(ticket?.response ?? "");
  const qc = useQueryClient();

  if (!ticket) return null;

  async function submitResponse() {
    const { error } = await updateRow("tickets", ticket!.id, { response });
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["tickets"] });
    toast.success("Response saved");
  }

  return (
    <Sheet open={Boolean(ticket)} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sidebar-scroll overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{ticket.subject}</SheetTitle>
          <SheetDescription>{ticket.client ?? "Internal"}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-4">
          <div className="flex items-center gap-2">
            <StatusBadge value={ticket.status} />
            <StatusBadge value={ticket.priority} />
          </div>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Assignee</dt>
              <dd>{ticket.assignee ?? "Unassigned"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">SLA</dt>
              <dd>{countdown(ticket.sla_due_at)}</dd>
            </div>
          </dl>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Your response</p>
            <Textarea rows={5} value={response} onChange={(e) => setResponse(e.target.value)} />
            <Button size="sm" className="mt-2" onClick={submitResponse}>
              Save response
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TicketTable({ rows, onOpen }: { rows: Ticket[]; onOpen: (t: Ticket) => void }) {
  if (rows.length === 0) {
    return <EmptyState title="Nothing here" description="No tickets match this view." />;
  }
  return (
    <div className="surface-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left font-semibold">Subject</th>
            <th className="px-4 py-3 text-left font-semibold">Severity</th>
            <th className="px-4 py-3 text-left font-semibold">SLA</th>
            <th className="px-4 py-3 text-left font-semibold">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((t) => (
            <tr
              key={t.id}
              className="cursor-pointer transition-colors hover:bg-muted/40"
              onClick={() => onOpen(t)}
            >
              <td className="px-4 py-3 font-medium">{t.subject}</td>
              <td className="px-4 py-3">
                <StatusBadge value={t.priority} />
              </td>
              <td className="px-4 py-3 text-muted-foreground">{countdown(t.sla_due_at)}</td>
              <td className="px-4 py-3">
                <StatusBadge value={t.status} />
              </td>
              <td className="px-4 py-3 text-right text-xs text-primary">View</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QaBugsTab({ projectId }: { projectId: string }) {
  const { data: ticketRows } = useRows<Ticket>("tickets");
  const [active, setActive] = useState<Ticket | null>(null);
  const tickets = (ticketRows ?? []).filter((t) => t.project_id === projectId);

  const bugs = tickets
    .filter((t) => !isQuestion(t))
    .sort((a, b) => severityRank(a.priority) - severityRank(b.priority));
  const questions = tickets.filter(isQuestion);

  return (
    <div className="space-y-6">
      <Tabs defaultValue="bugs">
        <TabsList>
          <TabsTrigger value="bugs">
            <Bug className="mr-1.5 size-3.5" /> Bugs ({bugs.length})
          </TabsTrigger>
          <TabsTrigger value="qa">
            <HelpCircle className="mr-1.5 size-3.5" /> Q&amp;A ({questions.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="bugs" className="pt-4">
          <TicketTable rows={bugs} onOpen={setActive} />
        </TabsContent>
        <TabsContent value="qa" className="pt-4">
          <TicketTable rows={questions} onOpen={setActive} />
        </TabsContent>
      </Tabs>

      <TicketDrawer ticket={active} onClose={() => setActive(null)} />
    </div>
  );
}
