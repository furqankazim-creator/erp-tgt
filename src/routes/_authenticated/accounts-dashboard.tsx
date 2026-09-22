import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Banknote,
  FileSpreadsheet,
  HandCoins,
  Landmark,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { useRows } from "@/lib/db";
import { currency, dateLabel } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { TableSkeleton } from "@/components/loading";

export const Route = createFileRoute("/_authenticated/accounts-dashboard")({
  head: () => ({
    meta: [
      { title: "Finance Overview — Time Global Tech CRM" },
      {
        name: "description",
        content:
          "One screen for the whole Accounts module — receivables, payables, cash and P&L, pulled live from Invoices, Payables and Bookkeeping.",
      },
      { property: "og:title", content: "Finance Overview — Time Global Tech CRM" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccountsDashboardPage,
});

type Invoice = {
  id: string;
  invoice_number: string;
  client: string | null;
  amount: number;
  status: string;
  due_date: string | null;
};
type Payment = { id: string; invoice_id: string; amount: number; payment_date: string | null };
type Bill = {
  id: string;
  bill_number: string;
  payee: string;
  amount: number;
  status: string;
  due_date: string | null;
};
type BillPayment = { id: string; bill_id: string; amount: number; payment_date: string | null };
type CoaAccount = { id: string; name: string; category: string; opening_balance: number };
type Transaction = { id: string; coa_id: string; date: string; amount: number };

const OPEN_INVOICE_STATUSES = ["Draft", "Sent", "Overdue"];
const OPEN_BILL_STATUSES = ["Pending", "Overdue"];
// Xero's status-colored "Invoices by Status" bar, reusing this app's own
// reserved status tones instead of a generic categorical palette — this is
// status data, not series identity.
const INVOICE_STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  Paid: "success",
  Sent: "warning",
  Draft: "neutral",
  Overdue: "danger",
  Cancelled: "neutral",
};
const TONE_COLOR_VAR: Record<"success" | "warning" | "danger" | "neutral", string> = {
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-destructive)",
  neutral: "var(--color-muted-foreground)",
};

function monthLabel(d: Date) {
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

function last6Months() {
  const now = new Date();
  const months: { key: string; period: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, period: monthLabel(d) });
  }
  return months;
}

function daysBetween(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

// Not yet due / 1-30 / 31-60 / 61-90 / 90+ — the same "how overdue" buckets
// Xero's "by Payment Target" chart groups by, applied to whichever of
// Receivables/Payables the row still has outstanding.
const AGING_BUCKETS = ["Not yet due", "1–30 days", "31–60 days", "61–90 days", "90+ days"] as const;
function agingBucket(dueDate: string | null): (typeof AGING_BUCKETS)[number] {
  if (!dueDate) return "Not yet due";
  const overdueDays = daysBetween(new Date(), new Date(dueDate));
  if (overdueDays <= 0) return "Not yet due";
  if (overdueDays <= 30) return "1–30 days";
  if (overdueDays <= 60) return "31–60 days";
  if (overdueDays <= 90) return "61–90 days";
  return "90+ days";
}

function AccountsDashboardPage() {
  const { data: invoiceRows, isLoading: invoicesLoading } = useRows<Invoice>("invoices");
  const { data: paymentRows } = useRows<Payment>("payments");
  const { data: billRows, isLoading: billsLoading } = useRows<Bill>("bills");
  const { data: billPaymentRows } = useRows<BillPayment>("bill_payments");
  const { data: coaRows } = useRows<CoaAccount>("chart_of_accounts");
  const { data: txnRows } = useRows<Transaction>("bookkeeping_transactions");

  const invoices = invoiceRows ?? [];
  const payments = paymentRows ?? [];
  const bills = billRows ?? [];
  const billPayments = billPaymentRows ?? [];
  const coa = coaRows ?? [];
  const txns = txnRows ?? [];

  const isLoading = invoicesLoading || billsLoading;

  // --- Receivables (what clients owe us) ------------------------------
  const paidForInvoice = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments)
      map.set(p.invoice_id, (map.get(p.invoice_id) ?? 0) + Number(p.amount));
    return map;
  }, [payments]);
  const receivableRows = useMemo(
    () =>
      invoices.map((i) => ({
        ...i,
        outstanding: Math.max(0, Number(i.amount) - (paidForInvoice.get(i.id) ?? 0)),
      })),
    [invoices, paidForInvoice],
  );
  const totalReceivable = receivableRows.reduce((s, r) => s + r.outstanding, 0);
  const overdueReceivable = receivableRows
    .filter((r) => OPEN_INVOICE_STATUSES.includes(r.status) && r.outstanding > 0 && r.due_date)
    .filter((r) => new Date(r.due_date!).getTime() < Date.now());
  const overdueReceivableAmount = overdueReceivable.reduce((s, r) => s + r.outstanding, 0);

  // --- Payables (what we owe) ------------------------------------------
  const paidForBill = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of billPayments) map.set(p.bill_id, (map.get(p.bill_id) ?? 0) + Number(p.amount));
    return map;
  }, [billPayments]);
  const payableRows = useMemo(
    () =>
      bills.map((b) => ({
        ...b,
        outstanding: Math.max(0, Number(b.amount) - (paidForBill.get(b.id) ?? 0)),
      })),
    [bills, paidForBill],
  );
  const totalPayable = payableRows.reduce((s, r) => s + r.outstanding, 0);
  const overduePayable = payableRows
    .filter((r) => OPEN_BILL_STATUSES.includes(r.status) && r.outstanding > 0 && r.due_date)
    .filter((r) => new Date(r.due_date!).getTime() < Date.now());
  const overduePayableAmount = overduePayable.reduce((s, r) => s + r.outstanding, 0);

  // --- Bank balance — Asset accounts that are actually cash/bank, not
  // fixed assets like equipment or furniture, opening balance plus every
  // transaction ever posted against them. ------------------------------
  const bankAccountIds = new Set(
    coa.filter((a) => a.category === "Assets" && /cash|bank/i.test(a.name)).map((a) => a.id),
  );
  const bankBalance =
    coa
      .filter((a) => bankAccountIds.has(a.id))
      .reduce((s, a) => s + Number(a.opening_balance ?? 0), 0) +
    txns.filter((t) => bankAccountIds.has(t.coa_id)).reduce((s, t) => s + Number(t.amount), 0);

  // --- Income / Expense this month, from posted Bookkeeping transactions,
  // same source as the Bookkeeping page's own P&L tab. -------------------
  const coaById = useMemo(() => new Map(coa.map((a) => [a.id, a])), [coa]);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthTxns = txns.filter((t) => t.date?.slice(0, 7) === thisMonth);
  const monthIncome = monthTxns
    .filter((t) => coaById.get(t.coa_id)?.category === "Revenue")
    .reduce((s, t) => s + Number(t.amount), 0);
  const monthExpense = monthTxns
    .filter((t) => coaById.get(t.coa_id)?.category === "Expenses")
    .reduce((s, t) => s + Number(t.amount), 0);

  // --- Cash collected vs paid, last 6 months ----------------------------
  const cashFlow = useMemo(() => {
    const months = last6Months();
    const byKey = new Map(months.map((m) => [m.key, { ...m, collected: 0, paid: 0 }]));
    for (const p of payments) {
      if (!p.payment_date) continue;
      const d = new Date(p.payment_date);
      const bucket = byKey.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (bucket) bucket.collected += Number(p.amount);
    }
    for (const p of billPayments) {
      if (!p.payment_date) continue;
      const d = new Date(p.payment_date);
      const bucket = byKey.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (bucket) bucket.paid += Number(p.amount);
    }
    return [...byKey.values()];
  }, [payments, billPayments]);

  // --- Invoices by status -------------------------------------------
  const invoicesByStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of invoices) map.set(i.status, (map.get(i.status) ?? 0) + 1);
    const rows = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const max = rows.length ? Math.max(...rows.map(([, n]) => n)) : 1;
    return rows.map(([status, count]) => ({ status, count, pct: Math.round((count / max) * 100) }));
  }, [invoices]);

  // --- Receivables & Payables aging ----------------------------------
  const aging = useMemo(() => {
    const buckets = new Map(
      AGING_BUCKETS.map((b) => [b, { bucket: b, receivable: 0, payable: 0 }]),
    );
    for (const r of receivableRows) {
      if (r.outstanding <= 0) continue;
      buckets.get(agingBucket(r.due_date))!.receivable += r.outstanding;
    }
    for (const r of payableRows) {
      if (r.outstanding <= 0) continue;
      buckets.get(agingBucket(r.due_date))!.payable += r.outstanding;
    }
    return [...buckets.values()];
  }, [receivableRows, payableRows]);

  // --- Due & overdue table — both directions, soonest/most-overdue first
  const dueRows = useMemo(() => {
    const rec = receivableRows
      .filter((r) => r.outstanding > 0 && r.due_date)
      .map((r) => ({
        kind: "Receivable" as const,
        party: r.client ?? "—",
        number: r.invoice_number,
        amount: r.outstanding,
        dueDate: r.due_date!,
        status: r.status,
      }));
    const pay = payableRows
      .filter((r) => r.outstanding > 0 && r.due_date)
      .map((r) => ({
        kind: "Payable" as const,
        party: r.payee,
        number: r.bill_number,
        amount: r.outstanding,
        dueDate: r.due_date!,
        status: r.status,
      }));
    return [...rec, ...pay].sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    );
  }, [receivableRows, payableRows]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance Overview"
        description="One screen for the whole Accounts module — Receivables, Payables, cash and this month's P&L, pulled live from Invoices, Payables and Bookkeeping."
      />

      {isLoading ? (
        <TableSkeleton />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Invoices"
              value={String(invoices.length)}
              hint={`${overdueReceivable.length} overdue`}
              icon={FileSpreadsheet}
            />
            <KpiCard
              label="Accounts receivable"
              value={currency(totalReceivable, true)}
              hint="owed to us"
              icon={Wallet}
            />
            <KpiCard
              label="Accounts payable"
              value={currency(totalPayable, true)}
              hint="we owe"
              icon={HandCoins}
            />
            <KpiCard
              label="Bank balance"
              value={currency(bankBalance, true)}
              hint={bankAccountIds.size ? "cash/bank accounts" : "no cash account set up yet"}
              icon={Banknote}
            />
            <KpiCard
              label="Income"
              value={currency(monthIncome, true)}
              hint="this month"
              icon={TrendingUp}
            />
            <KpiCard
              label="Expense"
              value={currency(monthExpense, true)}
              hint="this month"
              icon={TrendingDown}
            />
            <KpiCard
              label="Overdue receivable"
              value={currency(overdueReceivableAmount, true)}
              hint={`${overdueReceivable.length} invoice(s)`}
              icon={AlertTriangle}
              className={overdueReceivableAmount ? "border-destructive/30" : ""}
            />
            <KpiCard
              label="Overdue payable"
              value={currency(overduePayableAmount, true)}
              hint={`${overduePayable.length} bill(s)`}
              icon={AlertTriangle}
              className={overduePayableAmount ? "border-destructive/30" : ""}
            />
          </div>

          <div className="surface-card p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <Landmark className="text-primary size-4" /> Cash collected vs. paid — last 6 months
            </h2>
            <p className="text-sm text-muted-foreground">
              Real payments recorded against Invoices (collected) and Payables (paid) — actual cash
              movement, not what was billed.
            </p>
            <div className="mt-6 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cashFlow}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    vertical={false}
                  />
                  <XAxis dataKey="period" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis
                    stroke="var(--color-muted-foreground)"
                    fontSize={12}
                    tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                    }}
                    formatter={(v: number) => currency(v)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="collected"
                    name="Collected"
                    stroke="var(--color-chart-1)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="paid"
                    name="Paid"
                    stroke="var(--color-chart-4)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="surface-card p-6">
              <h2 className="font-semibold">Invoices by status</h2>
              <p className="text-sm text-muted-foreground">
                Every invoice, grouped by where it is.
              </p>
              <div className="mt-5 space-y-2.5">
                {invoicesByStatus.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No invoices yet.</p>
                ) : (
                  invoicesByStatus.map((row) => {
                    const tone = INVOICE_STATUS_TONE[row.status] ?? "neutral";
                    return (
                      <div key={row.status} className="flex items-center gap-3 text-sm">
                        <span className="w-24 shrink-0">
                          <StatusBadge value={row.status} tone={tone} />
                        </span>
                        <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(4, row.pct)}%`,
                              background: TONE_COLOR_VAR[tone],
                            }}
                          />
                        </div>
                        <span className="w-6 shrink-0 text-right font-semibold">{row.count}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="surface-card p-6">
              <h2 className="font-semibold">Receivables &amp; payables aging</h2>
              <p className="text-sm text-muted-foreground">
                Outstanding amounts by how overdue they are.
              </p>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={aging}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="bucket"
                      stroke="var(--color-muted-foreground)"
                      fontSize={11}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      stroke="var(--color-muted-foreground)"
                      fontSize={12}
                      tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-popover)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 12,
                      }}
                      formatter={(v: number) => currency(v)}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="receivable"
                      name="Receivable"
                      fill="var(--color-chart-1)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="payable"
                      name="Payable"
                      fill="var(--color-chart-4)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="surface-card overflow-x-auto">
            <div className="flex items-center justify-between gap-2 p-4 pb-0">
              <div>
                <h2 className="font-semibold">Due &amp; overdue</h2>
                <p className="text-sm text-muted-foreground">
                  Every open invoice and bill with a due date, soonest first.
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <Link to="/invoices" className="text-primary hover:underline">
                  Open Invoices →
                </Link>
                <Link to="/payables" className="text-primary hover:underline">
                  Open Payables →
                </Link>
              </div>
            </div>
            {dueRows.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Nothing due — every invoice and bill is either paid or has no due date set.
              </p>
            ) : (
              <table className="mt-3 w-full text-sm">
                <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Type</th>
                    <th className="px-4 py-3 text-left font-semibold">Party</th>
                    <th className="px-4 py-3 text-left font-semibold">Reference</th>
                    <th className="px-4 py-3 text-left font-semibold">Due date</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {dueRows.map((r) => {
                    const overdueDays = daysBetween(new Date(), new Date(r.dueDate));
                    return (
                      <tr
                        key={`${r.kind}-${r.number}`}
                        className="hover:bg-muted/40 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <span
                            className="font-medium"
                            style={{
                              color:
                                r.kind === "Receivable"
                                  ? "var(--color-chart-1)"
                                  : "var(--color-chart-4)",
                            }}
                          >
                            {r.kind}
                          </span>
                        </td>
                        <td className="px-4 py-3">{r.party}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {r.number}
                        </td>
                        <td className="px-4 py-3">
                          {dateLabel(r.dueDate)}
                          {overdueDays > 0 ? (
                            <span className="text-destructive ml-1.5 text-xs font-semibold">
                              {overdueDays}d overdue
                            </span>
                          ) : (
                            <span className="text-muted-foreground ml-1.5 text-xs">
                              in {Math.abs(overdueDays)}d
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">{currency(r.amount)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            value={r.status}
                            tone={r.status === "Overdue" ? "danger" : "warning"}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
