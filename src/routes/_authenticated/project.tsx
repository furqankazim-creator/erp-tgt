import { createFileRoute, Outlet } from "@tanstack/react-router";

import type { Field } from "@/components/record-dialog";
import { AddScopeFileDialog } from "@/components/project-tabs/scope-tab";

export const Route = createFileRoute("/_authenticated/project")({
  component: () => <Outlet />,
});

export type Project = {
  id: string;
  display_id: string | null;
  name: string;
  client: string | null;
  manager: string | null;
  team: string[];
  status: string;
  progress: number;
  start_date: string | null;
  deadline: string | null;
  budget: number;
  cost: number;
  revenue: number;
  description: string | null;
  image_url: string | null;
  tags: string[];
  live_url: string | null;
  live_status: string | null;
  live_checked_at: string | null;
  repo_url: string | null;
  started_at: string | null;
  deal_id: string | null;
  inquiry_id: string | null;
};

export const PROJECT_STATUSES = ["Planning", "In Progress", "On Hold", "Done", "Cancelled"];

export function buildProjectFields(accountNames: string[]): Field[] {
  return [
    { name: "name", label: "Project name", required: true, full: true, section: "Overview" },
    { name: "client", label: "Client", type: "select", options: accountNames },
    { name: "manager", label: "Project manager", type: "owner" },
    { name: "team", label: "Team", type: "team", full: true },
    { name: "status", label: "Status", type: "select", options: PROJECT_STATUSES },
    { name: "start_date", label: "Start date", type: "date", section: "Timeline" },
    { name: "deadline", label: "Deadline", type: "date" },
    { name: "budget", label: "Budget (USD)", type: "number", section: "Budget" },
    { name: "cost", label: "Cost to date (USD)", type: "number" },
    { name: "revenue", label: "Revenue recognized (USD)", type: "number" },
    { name: "tags", label: "Tags (comma separated)", type: "tags", full: true, section: "Details" },
    { 
      name: "description", 
      label: "Scope", 
      type: "textarea", 
      full: true,
      action: (record) => record?.id ? <AddScopeFileDialog projectId={record.id} projectName={record.name as string} /> : <span className="text-xs text-muted-foreground">Save project first to attach files</span>
    },
    { name: "live_url", label: "Live app URL", full: true, placeholder: "https://…" },
    {
      name: "repo_url",
      label: "Git repo URL (for PM Connect)",
      full: true,
      placeholder: "git@github.com:org/repo.git",
    },
    { name: "deal_id", label: "Deal", type: "hidden" },
    { name: "inquiry_id", label: "Inquiry", type: "hidden" },
  ];
}
