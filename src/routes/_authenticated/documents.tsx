import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Download,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  HardDrive,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { useRows } from "@/lib/db";
import { useCurrentUser } from "@/lib/mock-auth";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { RecordDialog, type Field } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton, EmptyState } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({
    meta: [
      { title: "Documents — Time Global Tech CRM" },
      { name: "description", content: "File repository with folders, uploads and search." },
      { property: "og:title", content: "Documents — Time Global Tech CRM" },
      { property: "og:description", content: "File repository with folders, uploads and search." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

export type Document = {
  id: string;
  name: string;
  folder: string;
  file_type: string | null;
  size_kb: number;
  owner: string | null;
  project_id: string | null;
};
type Employee = { id: string; name: string; email: string | null };
type ProjectRow = { id: string; name: string };

const FILE_TYPES = ["pdf", "xlsx", "docx", "png", "csv", "zip"];

export function fileIcon(type: string | null) {
  switch (type) {
    case "pdf":
    case "docx":
      return FileText;
    case "xlsx":
    case "csv":
      return FileSpreadsheet;
    case "png":
    case "jpg":
      return FileImage;
    default:
      return File;
  }
}

export function sizeLabel(kb: number) {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

function Page() {
  const { data, isLoading } = useRows<Document>("documents");
  const { data: employeeRows } = useRows<Employee>("employees");
  const { data: projectRows } = useRows<ProjectRow>("projects");
  const { data: me } = useCurrentUser();
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<string | null>(null);

  const myName = (employeeRows ?? []).find(
    (e) => e.email && me?.email && e.email.toLowerCase() === me.email.toLowerCase(),
  )?.name;

  const allDocs = data ?? [];
  // Same "own work only" rule as everywhere else Salesman is scoped.
  const docs =
    me?.access_role === "salesman"
      ? myName
        ? allDocs.filter((d) => d.owner === myName)
        : []
      : allDocs;
  const projects = projectRows ?? [];
  const folders = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of docs) map.set(d.folder, (map.get(d.folder) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [docs]);

  const FIELDS: Field[] = [
    { name: "name", label: "File name", required: true, full: true },
    {
      name: "folder",
      label: "Folder",
      type: "select",
      options: folders.map(([f]) => f).length ? folders.map(([f]) => f) : ["General"],
    },
    { name: "file_type", label: "File type", type: "select", options: FILE_TYPES },
    { name: "size_kb", label: "Size (KB)", type: "number" },
    {
      name: "owner",
      label: "Owner",
      type: "select",
      options: (employeeRows ?? []).map((e) => e.name),
    },
    {
      name: "project_id",
      label: "Project",
      type: "select",
      options: projects.map((p) => ({ value: p.id, label: p.name })),
    },
  ];

  const rows = docs
    .filter((d) => !folder || d.folder === folder)
    .filter((d) => `${d.name} ${d.owner ?? ""}`.toLowerCase().includes(query.toLowerCase()));

  const totalSize = docs.reduce((s, d) => s + Number(d.size_kb), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description={
          me?.access_role === "salesman"
            ? "Your files, organised by folder."
            : "Company file repository, organised by folder."
        }
        action={
          <RecordDialog
            table="documents"
            label="Document"
            fields={FIELDS}
            defaults={{
              folder: "General",
              file_type: "pdf",
              owner: me?.access_role === "salesman" ? (myName ?? "") : "",
            }}
            trigger={
              <Button>
                <Upload className="size-4" /> Upload file
              </Button>
            }
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Total files" value={String(docs.length)} icon={File} />
        <KpiCard label="Folders" value={String(folders.length)} icon={Folder} />
        <KpiCard label="Storage used" value={sizeLabel(totalSize)} icon={HardDrive} />
      </div>

      <Input
        placeholder="Search documents…"
        className="sm:max-w-sm"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="grid gap-5 lg:grid-cols-4">
          <div className="surface-card p-4 lg:col-span-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase px-2 pb-2">
              Folders
            </p>
            <div className="space-y-1">
              <button
                onClick={() => setFolder(null)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  folder === null ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted",
                )}
              >
                <span className="flex items-center gap-2">
                  <Folder className="size-4" /> All files
                </span>
                <span className="text-xs text-muted-foreground">{docs.length}</span>
              </button>
              {folders.map(([f, count]) => (
                <button
                  key={f}
                  onClick={() => setFolder(f)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    folder === f ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted",
                  )}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Folder className="size-4 shrink-0" /> {f}
                  </span>
                  <span className="text-xs text-muted-foreground">{count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="surface-card overflow-x-auto lg:col-span-3">
            {rows.length === 0 ? (
              <EmptyState title="No files found" description="Try a different folder or search." />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Folder</th>
                    <th className="px-4 py-3 text-left font-semibold">Size</th>
                    <th className="px-4 py-3 text-left font-semibold">Owner</th>
                    <th className="px-4 py-3 text-left font-semibold">Project</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {rows.map((d) => {
                    const Icon = fileIcon(d.file_type);
                    return (
                      <tr key={d.id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Icon className="text-muted-foreground size-4 shrink-0" />
                            <span className="font-medium">{d.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{d.folder}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {sizeLabel(Number(d.size_kb))}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{d.owner ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {d.project_id ? (
                            me?.access_role === "salesman" ? (
                              // Salesman can't open a project page — no dead-end link.
                              (projects.find((p) => p.id === d.project_id)?.name ??
                              "Linked project")
                            ) : (
                              <Link
                                to="/project/$projectId"
                                params={{ projectId: d.project_id }}
                                className="text-primary font-medium hover:underline"
                              >
                                {projects.find((p) => p.id === d.project_id)?.name ??
                                  "View project"}
                              </Link>
                            )
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label="Download"
                              onClick={() =>
                                toast.info("Preview & download aren't available in this demo.")
                              }
                            >
                              <Download className="size-4" />
                            </Button>
                            <RecordDialog
                              table="documents"
                              label="Document"
                              fields={FIELDS}
                              record={d}
                              trigger={
                                <Button variant="ghost" size="sm">
                                  Edit
                                </Button>
                              }
                            />
                            <DeleteButton
                              table="documents"
                              id={d.id}
                              label="Document"
                              name={d.name}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
