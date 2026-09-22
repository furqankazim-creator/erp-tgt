import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Banknote,
  Briefcase,
  CreditCard,
  FileText,
  HandCoins,
  Landmark,
  MoreHorizontal,
  Receipt,
  UserRound,
  Wallet,
  Plus,
} from "lucide-react";

import { useRows } from "@/lib/db";
import { currency, dateLabel } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog, type Field } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/payables")({
  head: () => ({
    meta: [
      { title: "Payables — Time Global Tech CRM" },
      {
        name: "description",
        content:
          "Loans, salary dues and vendor bills — money the company owes, and what's been paid.",
      },
      { property: "og:title", content: "Payables — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "The mirror of Invoices — what's owed, not what's owing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PayablesPage,
});

type Bill = {
  id: string;
  bill_number: string;
  type: string;
  payee: string;
  employee_id: string | null;
  amount: number;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  notes: string | null;
};

type BillPayment = {
  id: string;
  bill_id: string;
  amount: number;
  payment_date: string | null;
  method: string;
  reference: string | null;
  notes: string | null;
};

type Employee = { id: string; name: string };

const BILL_TYPES = ["Loan", "Salary Dues", "Vendor Bill", "Other"];
const BILL_STATUSES = ["Pending", "Paid", "Overdue", "Cancelled"];
const OPEN_STATUSES = ["Pending", "Overdue"];
const PAYMENT_METHODS = ["Bank Transfer", "Credit Card", "Cash", "Cheque", "Other"];

const BILL_TYPE_ICON: Record<string, typeof Landmark> = {
  Loan: Landmark,
  "Salary Dues": UserRound,
  "Vendor Bill": Briefcase,
  Other: MoreHorizontal,
};
const METHOD_ICON: Record<string, typeof Landmark> = {
  "Bank Transfer": Landmark,
  "Credit Card": CreditCard,
  Cash: Banknote,
  Cheque: FileText,
  Other: MoreHorizontal,
};

function buildBillFields(employees: Employee[]): Field[] {
  return [
    { name: "bill_number", label: "Bill #", required: true, placeholder: "BILL-1001" },
    { name: "type", label: "Type", type: "select", options: BILL_TYPES, required: true },
    { name: "payee", label: "Payee (lender, employee, vendor)", required: true, full: true },
    {
      name: "employee_id",
      label: "Employee (for Salary Dues, optional)",
      type: "select",
      options: employees.map((e) => ({ value: e.id, label: e.name })),
    },
    { name: "amount", label: "Amount (USD)", type: "number", required: true },
    { name: "status", label: "Status", type: "select", options: BILL_STATUSES },
    { name: "issue_date", label: "Issue date", type: "date" },
    { name: "due_date", label: "Due date", type: "date" },
    { name: "notes", label: "Notes", type: "textarea", full: true },
  ];
}

function paymentFields(): Field[] {
  return [
    { name: "bill_id", label: "Bill", type: "hidden" },
    { name: "amount", label: "Amount (USD)", type: "number", required: true },
    { name: "payment_date", label: "Payment date", type: "date" },
    { name: "method", label: "Method", type: "select", options: PAYMENT_METHODS },
    { name: "reference", label: "Reference / transaction ID", full: true },
    { name: "notes", label: "Notes", type: "textarea", full: true },
  ];
}

function PayablesPage() {
  const { data, isLoading } = useRows<Bill>("bills");
  const { data: paymentRows, isLoading: paymentsLoading } = useRows<BillPayment>("bill_payments");
  const { data: employeeRows } = useRows<Employee>("employees");

  const bills = data ?? [];
  const payments = paymentRows ?? [];
  const employees = employeeRows ?? [];
  const FIELDS = buildBillFields(employees);

  function paidFor(billId: string) {
    return payments
      .filter((p) => p.bill_id === billId)
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);
  }

  function employeeName(bill: Bill) {
    return employees.find((e) => e.id === bill.employee_id)?.name ?? null;
  }

  const totalPayable = bills.reduce((s, b) => s + Number(b.amount ?? 0), 0);
  const totalPaidOut = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const outstanding = Math.max(0, totalPayable - totalPaidOut);
  const overdueCount = bills.filter(
    (b) =>
      OPEN_STATUSES.includes(b.status) &&
      b.due_date &&
      new Date(b.due_date).getTime() < Date.now() &&
      paidFor(b.id) < Number(b.amount ?? 0),
  ).length;

  const isLoadingAll = isLoading || paymentsLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payables"
        description="Loans, salary dues and vendor bills — the mirror of Invoices: what the company owes, not what's owed to it."
        action={
          <RecordDialog
            table="bills"
            label="Bill"
            fields={FIELDS}
            defaults={{
              status: "Pending",
              type: "Loan",
              issue_date: new Date().toISOString().slice(0, 10),
            }}
            trigger={
              <Button>
                <Plus className="size-4" /> New bill
              </Button>
            }
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total payable"
          value={currency(totalPayable, true)}
          icon={HandCoins}
          className="ring-1 ring-warning/25"
        />
        <KpiCard
          label="Total paid out"
          value={currency(totalPaidOut, true)}
          icon={Banknote}
          className="ring-1 ring-success/25"
          {...(totalPayable
            ? { hint: `${Math.round((totalPaidOut / totalPayable) * 100)}% cleared` }
            : {})}
        />
        <KpiCard label="Outstanding" value={currency(outstanding, true)} icon={Wallet} />
        <KpiCard
          label="Overdue"
          value={String(overdueCount)}
          icon={AlertTriangle}
          className={overdueCount ? "ring-1 ring-destructive/30" : ""}
        />
      </div>

      <Tabs defaultValue="bills">
        <TabsList>
          <TabsTrigger value="bills">Bills</TabsTrigger>
          <TabsTrigger value="payments">Payments Made</TabsTrigger>
        </TabsList>

        <TabsContent value="bills" className="pt-4">
          {isLoadingAll ? (
            <TableSkeleton />
          ) : (
            <div className="surface-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Bill #</th>
                    <th className="px-4 py-3 text-left font-semibold">Type</th>
                    <th className="px-4 py-3 text-left font-semibold">Payee</th>
                    <th className="px-4 py-3 text-left font-semibold">Amount</th>
                    <th className="px-4 py-3 text-left font-semibold">Paid</th>
                    <th className="px-4 py-3 text-left font-semibold">Due</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {bills.map((bill) => {
                    const paid = paidFor(bill.id);
                    const remaining = Math.max(0, Number(bill.amount ?? 0) - paid);
                    return (
                      <tr key={bill.id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3 font-medium">{bill.bill_number}</td>
                        <td className="px-4 py-3">
                          <span className="bg-warning/12 text-warning border-warning/30 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold">
                            {(() => {
                              const TypeIcon = BILL_TYPE_ICON[bill.type] ?? MoreHorizontal;
                              return <TypeIcon className="size-3" />;
                            })()}
                            {bill.type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {bill.payee}
                          {employeeName(bill) ? (
                            <span className="block text-xs text-muted-foreground">
                              {employeeName(bill)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 font-semibold">{currency(bill.amount, true)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              remaining > 0 ? "text-muted-foreground" : "text-success font-medium"
                            }
                          >
                            {currency(paid, true)}
                          </span>
                          {Number(bill.amount) > 0 ? (
                            <div className="bg-muted mt-1 h-1 w-20 overflow-hidden rounded-full">
                              <div
                                className={`h-full rounded-full ${remaining > 0 ? "bg-warning" : "bg-success"}`}
                                style={{
                                  width: `${Math.min(100, Math.round((paid / Number(bill.amount)) * 100))}%`,
                                }}
                              />
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {dateLabel(bill.due_date)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge value={bill.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            {remaining > 0 ? (
                              <RecordDialog
                                table="bill_payments"
                                label="Payment"
                                fields={paymentFields()}
                                defaults={{
                                  bill_id: bill.id,
                                  amount: String(remaining),
                                  method: "Bank Transfer",
                                  payment_date: new Date().toISOString().slice(0, 10),
                                }}
                                trigger={
                                  <Button variant="outline" size="sm">
                                    Record payment
                                  </Button>
                                }
                              />
                            ) : null}
                            <RecordDialog
                              table="bills"
                              label="Bill"
                              fields={FIELDS}
                              record={bill}
                              trigger={
                                <Button variant="ghost" size="sm">
                                  Edit
                                </Button>
                              }
                            />
                            <DeleteButton
                              table="bills"
                              id={bill.id}
                              label="Bill"
                              name={bill.bill_number}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {bills.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center">
                        <HandCoins className="text-muted-foreground/40 mx-auto mb-2 size-8" />
                        <p className="text-sm font-medium">No bills yet</p>
                        <p className="text-xs text-muted-foreground">
                          Add a loan, salary dues, or a vendor bill.
                        </p>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="payments" className="pt-4">
          {isLoadingAll ? (
            <TableSkeleton />
          ) : (
            <div className="surface-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Bill #</th>
                    <th className="px-4 py-3 text-left font-semibold">Amount</th>
                    <th className="px-4 py-3 text-left font-semibold">Date</th>
                    <th className="px-4 py-3 text-left font-semibold">Method</th>
                    <th className="px-4 py-3 text-left font-semibold">Reference</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {payments.map((p) => {
                    const bill = bills.find((b) => b.id === p.bill_id);
                    return (
                      <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3 font-medium">{bill?.bill_number ?? "—"}</td>
                        <td className="px-4 py-3 font-semibold">{currency(p.amount, true)}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {dateLabel(p.payment_date)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="bg-accent text-accent-foreground inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-semibold">
                            {(() => {
                              const MethodIcon = METHOD_ICON[p.method] ?? MoreHorizontal;
                              return <MethodIcon className="size-3" />;
                            })()}
                            {p.method}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{p.reference ?? "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            <DeleteButton
                              table="bill_payments"
                              id={p.id}
                              label="Payment"
                              name={bill?.bill_number ?? "payment"}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        <Receipt className="text-muted-foreground/40 mx-auto mb-2 size-8" />
                        <p className="text-sm font-medium">No payments made yet</p>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
