import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BookOpen,
  Boxes,
  FolderOpen,
  HandCoins,
  Landmark,
  Plus,
  Receipt,
  Scale,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { useRows } from "@/lib/db";
import { currency, dateLabel } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { RecordDialog, type Field, type SelectOption } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/bookkeeping")({
  head: () => ({
    meta: [
      { title: "Bookkeeping — Time Global Tech CRM" },
      {
        name: "description",
        content: "Chart of Accounts, daily transactions, and a real Profit & Loss statement.",
      },
      { property: "og:title", content: "Bookkeeping — Time Global Tech CRM" },
      { property: "og:description", content: "Chart of Accounts, daily bookkeeping and P&L." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BookkeepingPage,
});

// The five top-level books — same labels and order as the reference chart:
// Capital, Liabilities, Assets, Revenue, Expenses. Capital/Liabilities/
// Assets live on the Balance Sheet; Revenue/Expenses live on the Income
// Statement — derived, not stored, so it can never drift out of sync.
const CATEGORIES = ["Capital", "Liabilities", "Assets", "Revenue", "Expenses"] as const;
const BALANCE_SHEET = new Set(["Capital", "Liabilities", "Assets"]);
function financialStatement(category: string) {
  return BALANCE_SHEET.has(category) ? "Balance Sheet" : "Income Statement";
}

// One consistent visual identity per book, reused across the Chart of
// Accounts columns, the Daily Bookkeeping filter pills and its table rows —
// green for money in, red for money out, matching how anyone reading a
// ledger already expects Revenue/Expenses to read, so the two Income
// Statement books are recognizable at a glance without reading the label.
const CATEGORY_META: Record<
  (typeof CATEGORIES)[number],
  { icon: typeof Landmark; tone: string; iconTone: string }
> = {
  Capital: {
    icon: Landmark,
    tone: "bg-primary/12 text-primary border-primary/25",
    iconTone: "bg-primary/12 text-primary",
  },
  Liabilities: {
    icon: HandCoins,
    tone: "bg-warning/15 text-warning border-warning/30",
    iconTone: "bg-warning/15 text-warning",
  },
  Assets: {
    icon: Boxes,
    tone: "bg-info/12 text-info border-info/25",
    iconTone: "bg-info/12 text-info",
  },
  Revenue: {
    icon: TrendingUp,
    tone: "bg-success/12 text-success border-success/25",
    iconTone: "bg-success/12 text-success",
  },
  Expenses: {
    icon: TrendingDown,
    tone: "bg-destructive/12 text-destructive border-destructive/25",
    iconTone: "bg-destructive/12 text-destructive",
  },
};

type Account = {
  id: string;
  account_number: string;
  name: string;
  category: string;
  parent_id: string | null;
  opening_balance: number;
  status: string;
};

type Transaction = {
  id: string;
  display_id: string | null;
  coa_id: string;
  date: string;
  amount: number;
  description: string;
  investor_name: string | null;
  debtor: string | null;
  asset_type: string | null;
  photo_note: string | null;
  location: string | null;
  parent_transaction_id: string | null;
  // Set when this entry was created automatically from an Invoice or Bill
  // payment, not typed in here directly — see server/index.mjs's
  // autoPostInvoicePayment/autoPostBillPayment.
  auto_posted?: boolean;
};

function accountFields(accounts: Account[], category: string): Field[] {
  const parentOptions: SelectOption[] = accounts
    .filter((a) => a.category === category)
    .map((a) => ({ value: a.id, label: `${a.account_number} — ${a.name}` }));
  return [
    { name: "category", type: "hidden", label: "Category" },
    { name: "account_number", label: "Account number", required: true, placeholder: "1010" },
    { name: "name", label: "Account name", required: true, full: true },
    {
      name: "parent_id",
      label: "Parent account (optional — makes this a sub-account)",
      type: "select",
      options: parentOptions,
    },
    { name: "opening_balance", label: "Opening balance", type: "number" },
    { name: "status", label: "Status", type: "select", options: ["Active", "Archived"] },
  ];
}

function transactionFields(accountOptions: SelectOption[], txnOptions: SelectOption[]): Field[] {
  return [
    {
      name: "coa_id",
      label: "Account (Chart of Accounts)",
      type: "select",
      options: accountOptions,
      required: true,
    },
    { name: "date", label: "Date", type: "date", required: true },
    { name: "amount", label: "Amount", type: "number", required: true },
    { name: "description", label: "Description", full: true, required: true },
    {
      name: "parent_transaction_id",
      label: "Parent transaction (optional — for a split/child entry)",
      type: "select",
      options: txnOptions,
    },
    { name: "investor_name", label: "Investor name (Capital entries)" },
    { name: "debtor", label: "Debtor (Liabilities entries)" },
    { name: "asset_type", label: "Asset type (Assets entries)" },
    { name: "location", label: "Location" },
    { name: "photo_note", label: "Photo / reference note", full: true },
  ];
}

function CoaColumn({
  category,
  accounts,
  balanceByAccount,
}: {
  category: (typeof CATEGORIES)[number];
  accounts: Account[];
  balanceByAccount: Map<string, number>;
}) {
  const inCategory = accounts.filter((a) => a.category === category);
  const topLevel = inCategory.filter((a) => !a.parent_id);
  const childrenOf = (id: string) => inCategory.filter((a) => a.parent_id === id);
  // A parent account's balance on its own, plus everything posted to its
  // sub-accounts — the number you'd actually want at a glance, not just
  // what was posted directly to the parent row itself.
  const rollup = (a: Account): number =>
    (balanceByAccount.get(a.id) ?? 0) + childrenOf(a.id).reduce((s, c) => s + rollup(c), 0);
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  const columnTotal = topLevel.reduce((s, a) => s + rollup(a), 0);

  return (
    <div className="surface-card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${meta.iconTone}`}>
            <Icon className="size-4" />
          </span>
          <div>
            <h3 className="text-sm leading-tight font-semibold">{category}</h3>
            <span
              className={`inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-semibold tracking-wide uppercase ${meta.tone}`}
            >
              {financialStatement(category)}
            </span>
          </div>
        </div>
        <RecordDialog
          table="chart_of_accounts"
          label={`${category} account`}
          fields={accountFields(accounts, category)}
          defaults={{ category, status: "Active" }}
          trigger={
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
              <Plus className="size-3.5" /> Add
            </Button>
          }
        />
      </div>
      {topLevel.length > 0 ? (
        <div className="flex items-baseline justify-between border-b border-border/60 pb-2 text-xs">
          <span className="text-muted-foreground">
            {topLevel.length} account{topLevel.length === 1 ? "" : "s"}
          </span>
          <span className="font-mono font-bold">{currency(columnTotal, true)}</span>
        </div>
      ) : null}
      {topLevel.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-6 text-center">
          <FolderOpen className="text-muted-foreground/50 size-6" />
          <p className="text-xs text-muted-foreground">No accounts yet.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {topLevel.map((a) => (
            <li key={a.id}>
              <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                <span className="min-w-0 truncate">
                  <span className="mr-1.5 font-mono text-xs text-muted-foreground">
                    {a.account_number}
                  </span>
                  {a.name}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-xs font-semibold">
                    {currency(rollup(a), true)}
                  </span>
                  <RecordDialog
                    table="chart_of_accounts"
                    label={`${category} account`}
                    fields={accountFields(accounts, category)}
                    record={a}
                    trigger={
                      <Button variant="ghost" size="sm" className="h-6 shrink-0 px-1.5 text-[11px]">
                        Edit
                      </Button>
                    }
                  />
                </span>
              </div>
              {childrenOf(a.id).length > 0 ? (
                <ul className="ml-4 space-y-1">
                  {childrenOf(a.id).map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-2 rounded-md border-l border-border px-2 py-1 pl-3 text-xs text-muted-foreground hover:bg-muted/40"
                    >
                      <span className="min-w-0 truncate">
                        <span className="mr-1.5 font-mono">{c.account_number}</span>
                        {c.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-[11px] font-semibold">
                          {currency(rollup(c), true)}
                        </span>
                        <RecordDialog
                          table="chart_of_accounts"
                          label={`${category} account`}
                          fields={accountFields(accounts, category)}
                          record={c}
                          trigger={
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 shrink-0 px-1 text-[10px]"
                            >
                              Edit
                            </Button>
                          }
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BookkeepingPage() {
  const { data: accountRows, isLoading: accountsLoading } = useRows<Account>("chart_of_accounts");
  const { data: txnRows, isLoading: txnsLoading } = useRows<Transaction>(
    "bookkeeping_transactions",
    { column: "date", ascending: false },
  );
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));

  const accounts = accountRows ?? [];
  const transactions = txnRows ?? [];
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  // What the Chart of Accounts view shows next to each account — opening
  // balance plus every transaction ever posted to it (all-time, not scoped
  // to the P&L's selected month), so a $12,000,000 test entry is exactly as
  // visible here as it is everywhere else, not hidden in a list that only
  // ever showed account names.
  const balanceByAccount = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of accounts) map.set(a.id, Number(a.opening_balance ?? 0));
    for (const t of transactions) {
      map.set(t.coa_id, (map.get(t.coa_id) ?? 0) + Number(t.amount));
    }
    return map;
  }, [accounts, transactions]);

  const accountOptions: SelectOption[] = accounts.map((a) => ({
    value: a.id,
    label: `${a.account_number} — ${a.name} (${a.category})`,
  }));
  const txnOptions: SelectOption[] = transactions.map((t) => ({
    value: t.id,
    label: `${t.display_id ?? "—"} · ${t.description.slice(0, 40)}`,
  }));

  const visibleTxns =
    categoryFilter === "All"
      ? transactions
      : transactions.filter((t) => accountById.get(t.coa_id)?.category === categoryFilter);

  // Profit & Loss for the selected month — Revenue accounts minus Expense
  // accounts, from real posted transactions only (not the recurring
  // Costing page, which prices work rather than reports P&L).
  const periodTxns = transactions.filter((t) => t.date?.slice(0, 7) === period);
  const revenueByAccount = new Map<string, number>();
  const expenseByAccount = new Map<string, number>();
  for (const t of periodTxns) {
    const acc = accountById.get(t.coa_id);
    if (!acc) continue;
    if (acc.category === "Revenue") {
      revenueByAccount.set(acc.name, (revenueByAccount.get(acc.name) ?? 0) + Number(t.amount));
    } else if (acc.category === "Expenses") {
      expenseByAccount.set(acc.name, (expenseByAccount.get(acc.name) ?? 0) + Number(t.amount));
    }
  }
  const totalRevenue = [...revenueByAccount.values()].reduce((s, v) => s + v, 0);
  const totalExpenses = [...expenseByAccount.values()].reduce((s, v) => s + v, 0);
  const netProfit = totalRevenue - totalExpenses;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bookkeeping"
        description="Chart of Accounts, daily transactions and a real Profit & Loss — separate from Costing, which prices your work, not reports on it."
      />

      <Tabs defaultValue="coa">
        <TabsList>
          <TabsTrigger value="coa">
            <BookOpen className="size-3.5" /> Chart of Accounts
          </TabsTrigger>
          <TabsTrigger value="transactions">
            <Receipt className="size-3.5" /> Daily Bookkeeping
          </TabsTrigger>
          <TabsTrigger value="pnl">
            <Scale className="size-3.5" /> Profit &amp; Loss
          </TabsTrigger>
        </TabsList>

        <TabsContent value="coa" className="pt-4">
          {accountsLoading ? (
            <TableSkeleton />
          ) : (
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
              {CATEGORIES.map((c) => (
                <CoaColumn
                  key={c}
                  category={c}
                  accounts={accounts}
                  balanceByAccount={balanceByAccount}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setCategoryFilter("All")}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  categoryFilter === "All"
                    ? "border-primary bg-primary/12 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30"
                }`}
              >
                All <span className="opacity-70">({transactions.length})</span>
              </button>
              {CATEGORIES.map((c) => {
                const meta = CATEGORY_META[c];
                const Icon = meta.icon;
                const count = transactions.filter(
                  (t) => accountById.get(t.coa_id)?.category === c,
                ).length;
                return (
                  <button
                    key={c}
                    onClick={() => setCategoryFilter(c)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      categoryFilter === c
                        ? meta.tone
                        : "border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    <Icon className="size-3" /> {c} <span className="opacity-70">({count})</span>
                  </button>
                );
              })}
            </div>
            <RecordDialog
              table="bookkeeping_transactions"
              label="Transaction"
              fields={transactionFields(accountOptions, txnOptions)}
              defaults={{ date: new Date().toISOString().slice(0, 10) }}
              trigger={
                <Button size="sm">
                  <Plus className="size-4" /> Record transaction
                </Button>
              }
            />
          </div>

          {txnsLoading ? (
            <TableSkeleton />
          ) : visibleTxns.length === 0 ? (
            <div className="surface-card flex flex-col items-center gap-2 p-12 text-center">
              <Receipt className="text-muted-foreground/40 size-8" />
              <p className="text-sm font-medium">No transactions in this filter</p>
              <p className="text-xs text-muted-foreground">
                Record daily expenses, purchases, or capital/liability entries against a COA
                account.
              </p>
            </div>
          ) : (
            <div className="surface-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Transaction</th>
                    <th className="px-4 py-3 text-left font-semibold">Date</th>
                    <th className="px-4 py-3 text-left font-semibold">Account</th>
                    <th className="px-4 py-3 text-left font-semibold">Description</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {visibleTxns.map((t) => {
                    const acc = accountById.get(t.coa_id);
                    return (
                      <tr key={t.id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {t.display_id ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{dateLabel(t.date)}</td>
                        <td className="px-4 py-3">
                          {acc ? (
                            <div className="flex flex-col items-start gap-0.5">
                              <span className="font-medium">{acc.name}</span>
                              <span
                                className={`inline-flex w-fit items-center rounded-full border px-1.5 py-px text-[10px] font-semibold ${CATEGORY_META[acc.category as (typeof CATEGORIES)[number]]?.tone ?? "border-border text-muted-foreground"}`}
                              >
                                {acc.category}
                              </span>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {t.description}
                          {t.auto_posted ? (
                            <span className="bg-primary/10 text-primary ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                              Auto
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">{currency(t.amount)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <RecordDialog
                              table="bookkeeping_transactions"
                              label="Transaction"
                              fields={transactionFields(accountOptions, txnOptions)}
                              record={t}
                              trigger={
                                <Button variant="ghost" size="sm">
                                  Edit
                                </Button>
                              }
                            />
                            <DeleteButton
                              table="bookkeeping_transactions"
                              id={t.id}
                              label="Transaction"
                              name={t.description}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="pnl" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">
                {new Date(`${period}-01T00:00:00`).toLocaleDateString("en-GB", {
                  month: "long",
                  year: "numeric",
                })}
              </h3>
              <p className="text-xs text-muted-foreground">
                Revenue minus Expenses, from posted Bookkeeping transactions this month.
              </p>
            </div>
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              label="Revenue"
              value={currency(totalRevenue, true)}
              icon={TrendingUp}
              className="ring-1 ring-success/25"
            />
            <KpiCard
              label="Expenses"
              value={currency(totalExpenses, true)}
              icon={TrendingDown}
              className="ring-1 ring-destructive/25"
            />
            <KpiCard
              label={netProfit >= 0 ? "Net profit" : "Net loss"}
              value={currency(Math.abs(netProfit), true)}
              icon={Landmark}
              className={netProfit >= 0 ? "ring-1 ring-success/30" : "ring-1 ring-destructive/30"}
            />
          </div>

          {totalRevenue + totalExpenses > 0 ? (
            <div className="surface-card p-5">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold">
                <span className="text-success">
                  Revenue {Math.round((totalRevenue / (totalRevenue + totalExpenses)) * 100)}%
                </span>
                <span className="text-destructive">
                  Expenses {Math.round((totalExpenses / (totalRevenue + totalExpenses)) * 100)}%
                </span>
              </div>
              <div className="bg-muted flex h-2.5 overflow-hidden rounded-full">
                <div
                  className="bg-success h-full"
                  style={{
                    width: `${(totalRevenue / (totalRevenue + totalExpenses)) * 100}%`,
                  }}
                />
                <div
                  className="bg-destructive h-full"
                  style={{
                    width: `${(totalExpenses / (totalRevenue + totalExpenses)) * 100}%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="surface-card p-5">
              <h3 className="mb-3 flex items-center gap-2 font-semibold">
                <span className="bg-success/12 text-success grid size-6 place-items-center rounded-full">
                  <TrendingUp className="size-3.5" />
                </span>
                Revenue by account
              </h3>
              {revenueByAccount.size === 0 ? (
                <p className="text-sm text-muted-foreground">No revenue posted this month.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {[...revenueByAccount.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, amt]) => (
                      <li key={name}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-muted-foreground">{name}</span>
                          <span className="font-semibold">{currency(amt)}</span>
                        </div>
                        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                          <div
                            className="bg-success h-full rounded-full"
                            style={{
                              width: `${Math.max(4, Math.round((amt / totalRevenue) * 100))}%`,
                            }}
                          />
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </div>
            <div className="surface-card p-5">
              <h3 className="mb-3 flex items-center gap-2 font-semibold">
                <span className="bg-destructive/12 text-destructive grid size-6 place-items-center rounded-full">
                  <TrendingDown className="size-3.5" />
                </span>
                Expenses by account
              </h3>
              {expenseByAccount.size === 0 ? (
                <p className="text-sm text-muted-foreground">No expenses posted this month.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {[...expenseByAccount.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, amt]) => (
                      <li key={name}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-muted-foreground">{name}</span>
                          <span className="font-semibold">{currency(amt)}</span>
                        </div>
                        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                          <div
                            className="bg-destructive h-full rounded-full"
                            style={{
                              width: `${Math.max(4, Math.round((amt / totalExpenses) * 100))}%`,
                            }}
                          />
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
