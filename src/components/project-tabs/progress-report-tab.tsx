import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Download, Eye, FileBarChart } from "lucide-react";

import { useRows } from "@/lib/db";
import { computeProjectProgress } from "@/lib/project-progress";
import { dateLabel } from "@/lib/format";
import { KpiCard } from "@/components/kpi-card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import type { Project } from "@/routes/_authenticated/project";

type Task = { id: string; project_id: string | null; title: string; status: string };
type Ticket = { id: string; project_id: string | null; status: string };

const TASK_STATUSES = ["To Do", "In Progress", "Review", "Done"];

function buildReportPdf(project: Project, progress: number, tasks: Task[], tickets: Ticket[]) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`Progress Report — ${project.name}`, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(
    `${project.client ?? "Internal"} · Deadline ${dateLabel(project.deadline)} · Progress ${progress}%`,
    14,
    25,
  );
  autoTable(doc, {
    startY: 34,
    head: [["Task status", "Count"]],
    body: TASK_STATUSES.map((s) => [s, String(tasks.filter((t) => t.status === s).length)]),
    headStyles: { fillColor: [20, 140, 130] },
    styles: { fontSize: 9 },
  });
  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
  const openBugs = tickets.filter((t) => t.status !== "Resolved" && t.status !== "Closed").length;
  const resolvedBugs = tickets.length - openBugs;
  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text("Bugs", 14, finalY + 10);
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(`Open: ${openBugs}  |  Resolved: ${resolvedBugs}`, 14, finalY + 16);
  return doc;
}

export function ProgressReportTab({ project }: { projectId: string; project: Project }) {
  const { data: taskRows } = useRows<Task>("tasks");
  const { data: ticketRows } = useRows<Ticket>("tickets");

  const projectTasks = (taskRows ?? []).filter((t) => t.project_id === project.id);
  const projectTickets = (ticketRows ?? []).filter((t) => t.project_id === project.id);
  const progress = computeProjectProgress(project.id, taskRows ?? []);
  const openBugs = projectTickets.filter((t) => t.status !== "Resolved" && t.status !== "Closed").length;

  function exportPdf(mode: "preview" | "download") {
    const doc = buildReportPdf(project, progress, projectTasks, projectTickets);
    if (mode === "download") {
      doc.save(`progress-report-${project.name.replace(/\s+/g, "-").toLowerCase()}.pdf`);
    } else {
      window.open(doc.output("bloburl"), "_blank");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => exportPdf("preview")}>
          <Eye className="size-4" /> Preview
        </Button>
        <Button size="sm" onClick={() => exportPdf("download")}>
          <Download className="size-4" /> Export PDF
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Progress" value={`${progress}%`} icon={FileBarChart} />
        <KpiCard label="Total tasks" value={String(projectTasks.length)} icon={FileBarChart} />
        <KpiCard
          label="Done tasks"
          value={String(projectTasks.filter((t) => t.status === "Done").length)}
          icon={FileBarChart}
        />
        <KpiCard label="Open bugs" value={String(openBugs)} icon={FileBarChart} />
      </div>

      <div className="surface-card space-y-4 p-6">
        <div>
          <div className="mb-1.5 flex justify-between text-sm">
            <span className="text-muted-foreground">Overall progress</span>
            <span className="font-semibold">{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>
        <div className="grid grid-cols-4 gap-2">
          {TASK_STATUSES.map((s) => (
            <div key={s} className="rounded-md bg-muted/50 p-3 text-center">
              <p className="text-lg font-bold">{projectTasks.filter((t) => t.status === s).length}</p>
              <p className="text-[10px] uppercase text-muted-foreground">{s}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
