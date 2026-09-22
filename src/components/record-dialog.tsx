import { useEffect, useState, type ReactNode } from "react";

import { useSaveRow, type Row, type TableName } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { OwnerCombobox } from "@/components/strategy/owner-combobox";
import { TeamCombobox } from "@/components/team-combobox";

export type SelectOption = string | { value: string; label: string };

export type Field = {
  name: string;
  label: string;
  type?:
    | "text"
    | "number"
    | "textarea"
    | "date"
    | "datetime-local"
    | "select"
    | "email"
    | "tags"
    | "owner"
    | "team"
    | "hidden";
  options?: SelectOption[];
  required?: boolean;
  placeholder?: string;
  full?: boolean;
  rows?: number;
  section?: string;
};

function normalizeOptions(options: SelectOption[]): { value: string; label: string }[] {
  return options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
}

function toFormValue(field: Field, value: unknown): string {
  if (value === null || value === undefined) return "";
  if ((field.type === "tags" || field.type === "team") && Array.isArray(value))
    return value.join(", ");
  if (field.type === "datetime-local" && typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }
  return String(value);
}

export function RecordDialog({
  table,
  label,
  fields,
  record,
  trigger,
  title,
  defaults,
  dialogClassName,
  textareaRows = 4,
}: {
  table: TableName;
  label: string;
  fields: Field[];
  record?: Row & { id?: string };
  trigger: ReactNode;
  title?: string;
  defaults?: Record<string, string>;
  dialogClassName?: string;
  textareaRows?: number;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const save = useSaveRow(table, label);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const field of fields) {
      next[field.name] = record
        ? toFormValue(field, record[field.name])
        : (defaults?.[field.name] ?? "");
    }
    setValues(next);
  }, [open, record, fields, defaults]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Row & { id?: string } = {};
    for (const field of fields) {
      const raw = values[field.name] ?? "";
      if (field.type === "number") payload[field.name] = raw === "" ? 0 : Number(raw);
      else if (field.type === "tags" || field.type === "team")
        payload[field.name] = raw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      else if (field.type === "date" || field.type === "datetime-local")
        payload[field.name] = raw === "" ? null : new Date(raw).toISOString();
      else payload[field.name] = raw === "" ? null : raw;
    }
    if (record?.id) payload.id = record.id;
    save.mutate(payload, { onSuccess: () => setOpen(false) });
  }

  const sections: { label: string; start: number }[] = [];
  fields.forEach((f, i) => {
    if (f.section && (i === 0 || fields[i - 1]?.section !== f.section)) {
      sections.push({ label: f.section, start: i });
    }
  });
  const sectionIndex = (i: number) => {
    let idx = -1;
    for (let k = 0; k < sections.length; k++) {
      if (sections[k]!.start <= i) idx = k;
      else break;
    }
    return idx;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className={
          "sidebar-scroll max-h-[calc(100vh-2rem)] overflow-y-auto w-[95vw] sm:max-w-3xl " +
          (dialogClassName ?? "")
        }
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-xl">
            {title ?? (record?.id ? `Edit ${label}` : `New ${label}`)}
          </DialogTitle>
          <DialogDescription>
            Fill in the details below and save to update your workspace.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2 pt-1">
          {fields.map((field, i) => {
            if (field.type === "hidden") return null;
            return (
              <div
                key={field.name}
                className={
                  (field.full || field.type === "textarea" ? "sm:col-span-2" : "") +
                  (sectionIndex(i) !== sectionIndex(i - 1) ? " sm:col-span-2 pt-2" : "")
                }
              >
                {sectionIndex(i) !== sectionIndex(i - 1) && field.section && (
                  <div className="mb-4 -mx-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary bg-primary/10 rounded-full px-3 py-1">
                        {field.section}
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-r from-primary/30 via-border/60 to-transparent" />
                    </div>
                  </div>
                )}
                <div className={field.full || field.type === "textarea" ? "" : ""}>
                  <Label
                    htmlFor={field.name}
                    className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85"
                  >
                    {field.label}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  {field.type === "textarea" ? (
                    <Textarea
                      id={field.name}
                      value={values[field.name] ?? ""}
                      placeholder={field.placeholder}
                      onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                      rows={field.rows ?? textareaRows}
                      className="resize-y bg-primary/[0.07] border-primary/20 focus-visible:ring-primary/60 dark:bg-primary/[0.08]"
                    />
                  ) : field.type === "select" ? (
                    <Select
                      value={values[field.name] ?? ""}
                      onValueChange={(val) => setValues((v) => ({ ...v, [field.name]: val }))}
                    >
                      <SelectTrigger
                        id={field.name}
                        className="bg-primary/[0.07] border-primary/20 focus:ring-primary/60 dark:bg-primary/[0.08]"
                      >
                        <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {normalizeOptions(field.options ?? []).map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.type === "owner" ? (
                    <OwnerCombobox
                      value={values[field.name] ?? ""}
                      onValueChange={(val) => setValues((v) => ({ ...v, [field.name]: val }))}
                      placeholder={`Select ${field.label.toLowerCase()}`}
                    />
                  ) : field.type === "team" ? (
                    <TeamCombobox
                      value={
                        values[field.name]
                          ? values[field.name]!.split(",")
                              .map((t) => t.trim())
                              .filter(Boolean)
                          : []
                      }
                      onChange={(names) =>
                        setValues((v) => ({ ...v, [field.name]: names.join(", ") }))
                      }
                      placeholder={`Select ${field.label.toLowerCase()}`}
                    />
                  ) : (
                    <Input
                      id={field.name}
                      type={field.type === "tags" ? "text" : (field.type ?? "text")}
                      required={field.required}
                      placeholder={field.placeholder}
                      value={values[field.name] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                      className="bg-primary/[0.07] border-primary/20 focus-visible:ring-primary/60 dark:bg-primary/[0.08]"
                    />
                  )}
                </div>
              </div>
            );
          })}
          <div className="sm:col-span-2 -mx-6 px-6 border-t border-border/60 pt-4 mt-2">
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending} className="min-w-[160px]">
                {save.isPending ? "Saving…" : record?.id ? "Save changes" : `Create ${label}`}
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
