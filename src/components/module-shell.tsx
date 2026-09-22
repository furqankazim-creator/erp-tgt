import type { ReactNode } from "react";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export type ShellItem = {
  title: string;
  subtitle?: string;
  status?: string;
  meta?: string[];
  progress?: number;
};

export function ModuleShell({
  title,
  description,
  actionLabel,
  items,
  extra,
}: {
  title: string;
  description: string;
  actionLabel: string;
  items: ShellItem[];
  extra?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} action={<Button>{actionLabel}</Button>} />
      <Input placeholder={`Search ${title.toLowerCase()}…`} className="sm:max-w-sm" />
      {extra}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.title} className="surface-card surface-card-hover animate-rise p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-semibold">{item.title}</h2>
                {item.subtitle ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">{item.subtitle}</p>
                ) : null}
              </div>
              {item.status ? <StatusBadge value={item.status} /> : null}
            </div>
            {item.progress !== undefined ? (
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span className="font-semibold">{item.progress}%</span>
                </div>
                <Progress value={item.progress} />
              </div>
            ) : null}
            {item.meta?.length ? (
              <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
                {item.meta.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
