import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";

import { useRows } from "@/lib/db";
import { useCurrentUser } from "@/lib/mock-auth";
import { currency } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog, type Field } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/accounts/")({
  head: () => ({
    meta: [
      { title: "Client Accounts — Time Global Tech CRM" },
      { name: "description", content: "Client accounts, ownership, status and contract value." },
      { property: "og:title", content: "Client Accounts — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "Client accounts, ownership, status and contract value.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccountsPage,
});

type Account = {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  owner: string | null;
  country: string | null;
  status: string;
  contract_status: string;
  annual_value: number;
  notes: string | null;
};

export const ACCOUNT_FIELDS: Field[] = [
  { name: "name", label: "Account name", required: true, full: true },
  { name: "industry", label: "Industry" },
  { name: "website", label: "Website" },
  { name: "owner", label: "Account owner", type: "owner" },
  { name: "country", label: "Country" },
  {
    name: "status",
    label: "Status",
    type: "select",
    options: ["Active", "Prospect", "Churn Risk", "Inactive"],
  },
  {
    name: "contract_status",
    label: "Contract status",
    type: "select",
    options: ["Draft", "Sent", "Signed", "Expired"],
  },
  { name: "annual_value", label: "Annual value (USD)", type: "number" },
  { name: "notes", label: "Notes", type: "textarea" },
];

function AccountsPage() {
  const { data, isLoading } = useRows<Account>("accounts");
  const { data: employeeRows } = useRows<{ id: string; name: string; email: string | null }>(
    "employees",
  );
  const { data: me } = useCurrentUser();
  const [query, setQuery] = useState("");

  const myName = (employeeRows ?? []).find(
    (e) => e.email && me?.email && e.email.toLowerCase() === me.email.toLowerCase(),
  )?.name;

  const allAccounts = data ?? [];
  // Same "own work only" rule as Salesman/Inquiries and Salesman/Opportunities.
  const accounts =
    me?.access_role === "salesman"
      ? myName
        ? allAccounts.filter((a) => a.owner === myName)
        : []
      : allAccounts;
  const rows = accounts.filter((a) =>
    `${a.name} ${a.industry ?? ""} ${a.owner ?? ""}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client Accounts"
        description={
          me?.access_role === "salesman"
            ? "Your accounts — ownership and contract value."
            : "Client accounts, ownership and contract value."
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-sm">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            className="pl-9"
            placeholder="Search accounts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <RecordDialog
          table="accounts"
          label="Account"
          fields={ACCOUNT_FIELDS}
          defaults={{
            status: "Prospect",
            contract_status: "Draft",
            owner: me?.access_role === "salesman" ? (myName ?? "") : "",
          }}
          trigger={
            <Button>
              <Plus className="size-4" /> New account
            </Button>
          }
        />
      </div>
      {isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Account</th>
                <th className="px-4 py-3 text-left font-semibold">Owner</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Contract</th>
                <th className="px-4 py-3 text-left font-semibold">Annual value</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      to="/accounts/$accountId"
                      params={{ accountId: a.id }}
                      className="font-medium hover:underline"
                    >
                      {a.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {a.industry ?? "—"} · {a.country ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">{a.owner ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge value={a.status} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={a.contract_status} />
                  </td>
                  <td className="px-4 py-3 font-semibold">{currency(a.annual_value, true)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <RecordDialog
                        table="accounts"
                        label="Account"
                        fields={ACCOUNT_FIELDS}
                        record={a}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        }
                      />
                      <DeleteButton table="accounts" id={a.id} label="Account" name={a.name} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
