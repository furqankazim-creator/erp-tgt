import { useRow, useRows } from "@/lib/db";

export type Employee = {
  id: string;
  name: string;
  department: string | null;
  status: string;
  salary: number;
};

export type Cost = {
  id: string;
  name: string;
  category: string;
  vendor: string | null;
  amount: number;
  frequency: string;
  department: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  notes: string | null;
};

export type OrgSettings = {
  id: string;
  working_days_per_month: number;
  hours_per_day: number;
};

export function monthlyEquivalent(cost: Cost): number {
  const status = cost.status ?? "Active";
  if (status !== "Active") return 0;
  const amount = Number(cost.amount ?? 0);
  const frequency = cost.frequency ?? "Monthly";
  switch (frequency) {
    case "Yearly":
      return amount / 12;
    case "Quarterly":
      return amount / 3;
    case "One-time":
      return 0;
    default:
      return amount;
  }
}

export function useOrgCostPerHour() {
  const employeesQuery = useRows<Employee>("employees");
  const costsQuery = useRows<Cost>("costs");
  const settingsQuery = useRow<OrgSettings>("org_settings", "default");

  const employees = employeesQuery.data ?? [];
  const costs = costsQuery.data ?? [];
  const workingDays = Number(settingsQuery.data?.working_days_per_month ?? 22);
  const hoursPerDay = Number(settingsQuery.data?.hours_per_day ?? 8);

  const monthlyPayroll = employees.reduce((s, e) => s + Number(e.salary ?? 0), 0);
  const monthlyFixedCosts = costs.reduce((s, c) => s + monthlyEquivalent(c), 0);
  const totalMonthlyCost = monthlyPayroll + monthlyFixedCosts;
  const activeEmployees = employees.filter((e) => e.status === "Active").length;
  const productiveHours = activeEmployees * workingDays * hoursPerDay;
  const costPerHour = productiveHours > 0 ? totalMonthlyCost / productiveHours : 0;

  return {
    employees,
    costs,
    workingDays,
    hoursPerDay,
    monthlyPayroll,
    monthlyFixedCosts,
    totalMonthlyCost,
    activeEmployees,
    productiveHours,
    costPerHour,
    settings: settingsQuery.data ?? null,
    isLoading: employeesQuery.isLoading || costsQuery.isLoading || settingsQuery.isLoading,
  };
}
