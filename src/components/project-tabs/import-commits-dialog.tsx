import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, History, Upload } from "lucide-react";
import { toast } from "sonner";

import { callApi } from "@/lib/db";
import { dateLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

// Must stay in step with parseGitLogExport in server/index.mjs.
const PERIODS = [
  { value: "1 month ago", label: "Last 1 month" },
  { value: "3 months ago", label: "Last 3 months" },
  { value: "4 months ago", label: "Last 4 months" },
  { value: "6 months ago", label: "Last 6 months" },
  { value: "1 year ago", label: "Last 1 year" },
  { value: "all", label: "Entire history" },
];

function gitCommand(since: string) {
  return (
    `git log --all --no-merges ${since !== "all" ? `--since="${since}" ` : ""}--name-only ` +
    `--pretty=format:"@@@%H|%ae|%an|%aI|%s"`
  );
}

// PowerShell's `>` writes UTF-16, which would look like garbage if read as
// UTF-8 — sniff the byte-order mark and decode accordingly.
async function readExportFile(file: File) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
  return new TextDecoder("utf-8").decode(buf);
}

type ImportResult = {
  found: number;
  imported: number;
  skipped: number;
  unmatchedAuthors: string[];
  earliest: string;
};

export function ImportCommitsDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [since, setSince] = useState("4 months ago");
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const qc = useQueryClient();

  const command = gitCommand(since);
  const detected = (log.match(/@@@[0-9a-f]{7,40}\|/gi) ?? []).length;

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (!v) {
      setLog("");
      setResult(null);
    }
  }

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      toast.success("Command copied");
    } catch {
      toast.error("Couldn't copy — select the command and copy it manually.");
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLog(await readExportFile(file));
    e.target.value = "";
  }

  async function runImport() {
    setBusy(true);
    try {
      const res = (await callApi(`/projects/${projectId}/import-commits`, {
        method: "POST",
        body: JSON.stringify({ log }),
      })) as ImportResult;
      setResult(res);
      void qc.invalidateQueries({ queryKey: ["pm_commits"] });
      void qc.invalidateQueries({ queryKey: ["pm_daily_log"] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(`Imported ${res.imported} commit${res.imported === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <History className="size-3.5" /> Import past commits
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import past commits</DialogTitle>
          <DialogDescription>
            Brings in commits made before PM Connect was installed, with their real dates and
            authors. Commits already tracked are skipped, so it's safe to run again.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="grid gap-3 text-sm">
            <p>
              <span className="font-semibold">{result.imported}</span> new commit
              {result.imported === 1 ? "" : "s"} imported
              {result.skipped ? `, ${result.skipped} already tracked` : ""} — history now starts{" "}
              {dateLabel(result.earliest)}.
            </p>
            {result.unmatchedAuthors.length > 0 && (
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                No employee matched these git authors, so their commits are listed under the git
                name: <span className="font-medium">{result.unmatchedAuthors.join(", ")}</span>.
                Set the employee&apos;s git email in HR to link future commits.
              </p>
            )}
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">1. Period</Label>
              <Select value={since} onValueChange={setSince}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">
                2. Run this inside the project&apos;s git folder
              </Label>
              <div className="flex items-start gap-2">
                <code className="flex-1 overflow-x-auto whitespace-pre rounded-lg bg-muted px-3 py-2 text-xs">
                  {command}
                </code>
                <Button size="icon" variant="outline" className="size-8 shrink-0" onClick={copyCommand} aria-label="Copy command">
                  <Copy className="size-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Add <code>&gt; commits.txt</code> at the end to save it to a file, or copy the output
                straight from the terminal.
              </p>
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="commit-log" className="text-xs font-semibold">
                  3. Paste the output, or upload the file
                </Label>
                <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-primary">
                  <Upload className="size-3.5" /> Upload commits.txt
                  <input type="file" accept=".txt,.log,text/plain" className="sr-only" onChange={onFile} />
                </label>
              </div>
              <Textarea
                id="commit-log"
                rows={8}
                className="font-mono text-xs"
                placeholder={"@@@3f2a9c…|dev@example.com|Dev Name|2026-06-02T14:05:00+05:00|Fix login\nsrc/login.ts"}
                value={log}
                onChange={(e) => setLog(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {log ? `${detected} commit${detected === 1 ? "" : "s"} detected.` : "Nothing pasted yet."}
              </p>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={runImport} disabled={busy || detected === 0}>
                {busy ? "Importing…" : `Import ${detected || ""} commit${detected === 1 ? "" : "s"}`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
