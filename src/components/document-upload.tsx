import { useRef, useState, type ReactNode } from "react";
import { ExternalLink, Eye, Upload } from "lucide-react";
import { toast } from "sonner";

import { useSaveRow } from "@/lib/db";
import { MAX_UPLOAD_MB, fileExtension, openStoredFile, uploadFile } from "@/lib/files";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "__none__";
const labelClass =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85";

function sizeText(bytes: number) {
  const kb = Math.max(1, Math.round(bytes / 1024));
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

/**
 * Uploads a real file (stored server-side) and/or records a Drive link, then
 * saves the `documents` row pointing at it. Used by the Documents page, a
 * project's Documents tab and its Scope documents — each passes what's fixed
 * for it (project, folder) and what the user should pick.
 */
export function UploadDocumentDialog({
  trigger,
  title = "Upload document",
  description,
  projectId,
  projects,
  folder,
  folderOptions,
  owners,
  defaultOwner = "",
}: {
  trigger: ReactNode;
  title?: string;
  description?: string;
  /** Fixed project — hides the project picker. */
  projectId?: string | null;
  /** Offer a project picker (Documents page). */
  projects?: { id: string; name: string }[];
  /** Fixed folder — hides the folder field. */
  folder?: string;
  /** Suggested folders when the folder isn't fixed; a new one can be typed. */
  folderOptions?: string[];
  /** Employee names for the owner picker; omit to hide it. */
  owners?: string[];
  defaultOwner?: string;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [folderValue, setFolderValue] = useState(folderOptions?.[0] ?? "General");
  const [owner, setOwner] = useState(defaultOwner || NONE);
  const [pickedProject, setPickedProject] = useState(NONE);
  const [driveLink, setDriveLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const save = useSaveRow("documents", "Document");

  function reset() {
    setFile(null);
    setName("");
    setFolderValue(folderOptions?.[0] ?? "General");
    setOwner(defaultOwner || NONE);
    setPickedProject(NONE);
    setDriveLink("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function pick(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast.error(`That file is larger than ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    setFile(f);
    setName((n) => n || f.name.replace(/\.[^.]+$/, ""));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file && !driveLink.trim()) {
      toast.error("Choose a file to upload, or paste a Drive link.");
      return;
    }
    const project = projectId ?? (pickedProject === NONE ? null : pickedProject);
    setUploading(true);
    try {
      const stored = file ? await uploadFile(file, project) : null;
      save.mutate(
        {
          name: name.trim() || file?.name || "Document",
          folder: folder ?? (folderValue.trim() || "General"),
          file_type: file ? fileExtension(file.name) || null : "link",
          size_kb: file ? Math.max(1, Math.round(file.size / 1024)) : 0,
          owner: owner === NONE ? null : owner,
          project_id: project,
          drive_link: driveLink.trim() || null,
          file_id: stored?.id ?? null,
          content_type: stored?.content_type ?? null,
        },
        {
          onSuccess: () => {
            setOpen(false);
            reset();
          },
        },
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const busy = uploading || save.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ?? `Upload a file (up to ${MAX_UPLOAD_MB} MB), or link one from Google Drive.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 pt-1">
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick(e.dataTransfer.files?.[0]);
            }}
            className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-primary/30 bg-primary/[0.04] px-4 py-5 text-center transition hover:border-primary/60 hover:bg-primary/[0.08]"
          >
            <Upload className="size-6 text-primary/60" />
            {file ? (
              <>
                <span className="text-sm font-semibold">{file.name}</span>
                <span className="text-xs text-muted-foreground">
                  {sizeText(file.size)} · click to choose a different file
                </span>
              </>
            ) : (
              <>
                <span className="text-sm font-medium text-muted-foreground">
                  Click to choose a file, or drop it here
                </span>
                <span className="text-xs text-muted-foreground/70">PDF, Word, Excel, images, ZIP…</span>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </label>

          <div>
            <Label htmlFor="upload-doc-name" className={labelClass}>
              Name
            </Label>
            <Input
              id="upload-doc-name"
              placeholder="Defaults to the file name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {folder === undefined && (
            <div>
              <Label htmlFor="upload-doc-folder" className={labelClass}>
                Folder
              </Label>
              <Input
                id="upload-doc-folder"
                list="upload-doc-folders"
                value={folderValue}
                onChange={(e) => setFolderValue(e.target.value)}
              />
              <datalist id="upload-doc-folders">
                {(folderOptions ?? []).map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>
          )}

          {(owners || (projects && projectId === undefined)) && (
            <div className="grid grid-cols-2 gap-4">
              {owners && (
                <div>
                  <Label className={labelClass}>Owner</Label>
                  <Select value={owner} onValueChange={setOwner}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Unassigned</SelectItem>
                      {owners.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {projects && projectId === undefined && (
                <div>
                  <Label className={labelClass}>Project</Label>
                  <Select value={pickedProject} onValueChange={setPickedProject}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No project</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="upload-doc-link" className={labelClass}>
              Google Drive link (optional)
            </Label>
            <Input
              id="upload-doc-link"
              type="url"
              placeholder="https://drive.google.com/…"
              value={driveLink}
              onChange={(e) => setDriveLink(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="min-w-[110px]">
              {uploading ? "Uploading…" : save.isPending ? "Saving…" : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Open for a stored file, Drive for a linked one, nothing when neither. */
export function OpenDocumentButton({
  doc,
}: {
  doc: { name: string; file_id?: string | null; drive_link?: string | null };
}) {
  const [opening, setOpening] = useState(false);
  if (doc.file_id) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2 text-xs"
        disabled={opening}
        onClick={() => {
          setOpening(true);
          openStoredFile(doc.file_id!, doc.name)
            .catch((err: Error) => toast.error(err.message))
            .finally(() => setOpening(false));
        }}
      >
        <Eye className="size-3.5" /> {opening ? "Opening…" : "Open"}
      </Button>
    );
  }
  if (doc.drive_link) {
    return (
      <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs">
        <a href={doc.drive_link} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="size-3.5" /> Drive
        </a>
      </Button>
    );
  }
  return null;
}
