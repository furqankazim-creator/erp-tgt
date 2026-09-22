import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Briefcase, ExternalLink, Plus } from "lucide-react";

import { useRows } from "@/lib/db";
import { useCurrentUser } from "@/lib/mock-auth";
import { currency, dateLabel } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog, type Field, type SelectOption } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildProjectFields } from "./project";

type Account = { id: string; name: string };
type Deal = { id: string; title: string; account_id: string | null; stage: string };

export const Route = createFileRoute("/_authenticated/agreements")({
  head: () => ({
    meta: [
      { title: "Agreements — Time Global Tech CRM" },
      {
        name: "description",
        content: "Contract tracker with client, status, value and expiry dates.",
      },
      { property: "og:title", content: "Agreements — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "Contract tracker with client, status, value and expiry dates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgreementsPage,
});

type Agreement = {
  id: string;
  title: string;
  client: string | null;
  account_id: string | null;
  deal_id: string | null;
  owner: string | null;
  status: string;
  value: number;
  signed_at: string | null;
  expires_at: string | null;
  notes: string | null;
};

function buildFields(accountOptions: SelectOption[], dealOptions: SelectOption[]): Field[] {
  return [
    { name: "title", label: "Agreement title", required: true, full: true },
    { name: "account_id", label: "Account", type: "select", options: accountOptions },
    {
      name: "deal_id",
      label: "Winning opportunity (optional)",
      type: "select",
      options: dealOptions,
    },
    { name: "owner", label: "Owner", type: "owner" },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: ["Draft", "Sent", "Signed", "Expired"],
    },
    { name: "value", label: "Value (USD)", type: "number" },
    { name: "signed_at", label: "Signed on", type: "date" },
    { name: "expires_at", label: "Expires on", type: "date" },
    { name: "notes", label: "Notes", type: "textarea" },
  ];
}

type Employee = { id: string; name: string; email: string | null };

function AgreementsPage() {
  const { data, isLoading } = useRows<Agreement>("agreements");
  const { data: accountRows } = useRows<Account>("accounts");
  const { data: dealRows } = useRows<Deal>("deals");
  const { data: employeeRows } = useRows<Employee>("employees");
  const { data: me } = useCurrentUser();
  const [selected, setSelected] = useState<Agreement | null>(null);
  const [query, setQuery] = useState("");

  const myName = (employeeRows ?? []).find(
    (e) => e.email && me?.email && e.email.toLowerCase() === me.email.toLowerCase(),
  )?.name;

  const accounts = accountRows ?? [];
  const deals = dealRows ?? [];
  const accountOptions: SelectOption[] = accounts.map((a) => ({ value: a.id, label: a.name }));
  const dealOptions: SelectOption[] = deals.map((d) => ({ value: d.id, label: d.title }));
  const FIELDS = buildFields(accountOptions, dealOptions);
  const PROJECT_FIELDS = buildProjectFields(accounts.map((a) => a.name));

  function accountName(r: Agreement) {
    return accounts.find((a) => a.id === r.account_id)?.name ?? r.client ?? "Internal";
  }
  function dealTitle(r: Agreement) {
    return deals.find((d) => d.id === r.deal_id)?.title ?? null;
  }

  const allAgreements = data ?? [];
  // Same "own work only" rule as everywhere else Salesman is scoped.
  const agreements =
    me?.access_role === "salesman"
      ? myName
        ? allAgreements.filter((r) => r.owner === myName)
        : []
      : allAgreements;
  const rows = agreements.filter((r) =>
    `${r.title} ${accountName(r)}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agreements"
        description={
          me?.access_role === "salesman"
            ? "Your contracts, from draft to signature and renewal."
            : "Track every contract from draft to signature and renewal."
        }
        action={
          <RecordDialog
            table="agreements"
            label="Agreement"
            fields={FIELDS}
            defaults={{
              status: "Draft",
              owner: me?.access_role === "salesman" ? (myName ?? "") : "",
            }}
            trigger={
              <Button>
                <Plus className="size-4" /> New agreement
              </Button>
            }
          />
        }
      />
      <Input
        className="sm:max-w-sm"
        placeholder="Search agreements…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="surface-card overflow-x-auto lg:col-span-2">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Agreement</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Value</th>
                  <th className="px-4 py-3 text-left font-semibold">Expires</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-muted/40 cursor-pointer transition-colors"
                    onClick={() => setSelected(r)}
                  >
                    <td className="px-4 py-3">
                      <span className="block font-medium">{r.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {accountName(r)}
                        {dealTitle(r) ? ` · ${dealTitle(r)}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={r.status} />
                    </td>
                    <td className="px-4 py-3 font-semibold">{currency(r.value, true)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{dateLabel(r.expires_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <RecordDialog
                          table="agreements"
                          label="Agreement"
                          fields={FIELDS}
                          record={r}
                          trigger={
                            <Button variant="ghost" size="sm">
                              Edit
                            </Button>
                          }
                        />
                        <DeleteButton
                          table="agreements"
                          id={r.id}
                          label="Agreement"
                          name={r.title}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="surface-card p-6">
            {selected ? (
              <>
                <h2 className="font-semibold">{selected.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{accountName(selected)}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <StatusBadge value={selected.status} />
                  {selected.deal_id ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-semibold text-primary">
                      <ExternalLink className="size-3" /> {dealTitle(selected)}
                    </span>
                  ) : null}
                  {selected.status === "Signed" ? (
                    <RecordDialog
                      table="projects"
                      label="Project"
                      fields={PROJECT_FIELDS}
                      defaults={{
                        name: selected.title,
                        client: accountName(selected),
                        budget: String(selected.value ?? 0),
                        status: "Planning",
                        progress: "0",
                        deal_id: selected.deal_id ?? "",
                      }}
                      trigger={
                        <Button size="sm" variant="outline">
                          <Briefcase className="size-4" /> Create project
                        </Button>
                      }
                    />
                  ) : null}
                </div>
                <dl className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Value</dt>
                    <dd className="font-semibold">{currency(selected.value)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Signed</dt>
                    <dd>{dateLabel(selected.signed_at)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Expires</dt>
                    <dd>{dateLabel(selected.expires_at)}</dd>
                  </div>
                </dl>
                <p className="mt-4 text-sm">{selected.notes ?? "No notes."}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select an agreement to see its details.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
