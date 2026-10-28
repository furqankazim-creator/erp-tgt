import { FileText, Paperclip, File, FileImage, FileSpreadsheet } from "lucide-react";

import { useCurrentUser } from "@/lib/mock-auth";
import { useRows } from "@/lib/db";
import { ScopeChangeRequests } from "@/components/project-tabs/scope-change-requests";
import { ScopeItems } from "@/components/project-tabs/scope-items";
import { OpenDocumentButton, UploadDocumentDialog } from "@/components/document-upload";
import { EmptyState } from "@/components/loading";
import { DeleteButton } from "@/components/delete-button";
import { Button } from "@/components/ui/button";
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

function fileIcon(type: string | null) {
  if (!type) return File;
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(type)) return FileImage;
  if (["xlsx", "csv"].includes(type)) return FileSpreadsheet;
  return FileText;
}

function sizeLabel(kb: number) {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

type ScopeDocument = {
  id: string;
  name: string;
  folder: string;
  file_type: string | null;
  size_kb: number;
  owner: string | null;
  project_id: string | null;
  drive_link: string | null;
  file_id?: string | null;
};

// Attach Scope File Dialog — a real upload (or Drive link) filed under the
// project's "<name> — Scope" folder, which is what the Scope tab lists.
export function AddScopeFileDialog({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  return (
    <UploadDocumentDialog
      title="Attach scope file"
      description="Attach a file (up to 25 MB) or a Drive link to this project's scope — the team will be able to open it."
      projectId={projectId}
      folder={`${projectName} — Scope`}
      trigger={
        <Button size="sm" variant="outline" className="gap-1.5">
          <Paperclip className="size-3.5" />
          Attach file
        </Button>
      }
    />
  );
}

// Main ScopeTab
export function ScopeTab({ project }: { projectId: string; project: Project }) {
  const { data: me } = useCurrentUser();
  const sections = splitScope(project.description);
  const documents = useRows<ScopeDocument>("documents");

  const isAdmin = me?.access_role === "super_admin" || me?.access_role === "admin";

  // Scope documents = documents filed under "<ProjectName> — Scope"
  const scopeDocs = (documents.data ?? []).filter(
    (d) => d.project_id === project.id && d.folder === `${project.name} — Scope`,
  );

  return (
    <div className="space-y-6">
      {/* Scope Sections */}
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

      {/* Scope Documents */}
      <div className="surface-card p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Paperclip className="size-4 text-primary" />
            <h3 className="font-semibold">Scope documents</h3>
            {scopeDocs.length > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {scopeDocs.length}
              </span>
            )}
          </div>
          {isAdmin && (
            <AddScopeFileDialog projectId={project.id} projectName={project.name} />
          )}
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          Files attached to this scope — specs, wireframes, contracts or any reference
          material the team needs.
          {me?.access_role === "developer"
            ? " Your PM or Admin manages these attachments."
            : ""}
        </p>

        {documents.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : scopeDocs.length === 0 ? (
          <EmptyState
            title="No scope files attached"
            description={
              isAdmin
                ? "Click \"Attach file\" to add specs, wireframes or reference docs."
                : "Your PM hasn't attached any scope files yet."
            }
          />
        ) : (
          <div className="divide-border divide-y rounded-xl border border-border overflow-hidden">
            {scopeDocs.map((doc) => {
              const Icon = fileIcon(doc.file_type);
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="size-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.file_type?.toUpperCase() ?? "FILE"} &middot;{" "}
                      {sizeLabel(Number(doc.size_kb))}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <OpenDocumentButton doc={doc} />
                    {isAdmin && (
                      <DeleteButton
                        table="documents"
                        id={doc.id}
                        label="Document"
                        name={doc.name}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ScopeItems project={project} />

      <ScopeChangeRequests project={project} />
    </div>
  );
}
