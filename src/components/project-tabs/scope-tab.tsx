import { ClipboardList, FileText } from "lucide-react";

import { useCurrentUser } from "@/lib/mock-auth";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/loading";
import type { Project } from "@/routes/_authenticated/project";

// Scope is stored on the project's `description` field (markdown-ish), split
// into sub-sections by heading — no need for six separate DB columns.
const SECTION_HEADINGS = [
  "Objectives",
  "Requirements",
  "In-scope",
  "Out-of-scope",
  "Assumptions",
  "Constraints",
];

function splitScope(scope: string | null) {
  if (!scope) return [];
  const lines = scope.split("\n");
  const sections: { heading: string; body: string[] }[] = [];
  let current: { heading: string; body: string[] } | null = null;
  for (const line of lines) {
    const heading = SECTION_HEADINGS.find(
      (h) => line.trim().replace(/^#+\s*/, "").toLowerCase() === h.toLowerCase(),
    );
    if (heading) {
      current = { heading, body: [] };
      sections.push(current);
    } else if (current) {
      if (line.trim()) current.body.push(line.trim());
    } else {
      if (!sections.length) sections.push({ heading: "Overview", body: [] });
      sections[sections.length - 1]!.body.push(line.trim());
    }
  }
  return sections.filter((s) => s.body.length > 0);
}

// No dedicated scope-change-requests collection exists yet — this list
// renders honestly empty until one is introduced, rather than fabricating
// sample rows. Statuses shown match the agreed enum for when it lands.
const SCOPE_CHANGE_STATUSES = ["Pending", "Under Review", "Approved", "Rejected", "Implemented"];

export function ScopeTab({ project }: { projectId: string; project: Project }) {
  const { data: me } = useCurrentUser();
  const sections = splitScope(project.description);

  return (
    <div className="space-y-6">
      <div className="surface-card p-6">
        {sections.length === 0 ? (
          <EmptyState
            title="No scope recorded"
            description="Your PM hasn't documented a formal scope for this project yet."
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {sections.map((s) => (
              <div key={s.heading} className="rounded-lg border border-border p-4">
                <div className="mb-2 flex items-center gap-2">
                  <FileText className="size-4 text-primary" />
                  <h3 className="text-sm font-bold">{s.heading}</h3>
                </div>
                <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                  {s.body.map((line, i) => (
                    <li key={i}>{line.replace(/^[-*]\s*/, "")}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="surface-card p-6">
        <div className="mb-3 flex items-center gap-2">
          <ClipboardList className="size-4 text-primary" />
          <h3 className="font-semibold">Scope change requests</h3>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Any change to what was originally agreed, tracked here for visibility.
          {me?.access_role === "developer"
            ? " Approving or rejecting a request is a PM/Admin action."
            : ""}
        </p>
        <EmptyState
          title="No scope change requests"
          description="Nothing has been raised against this project's scope yet."
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {SCOPE_CHANGE_STATUSES.map((s) => (
            <StatusBadge key={s} value={s} />
          ))}
        </div>
      </div>
    </div>
  );
}
