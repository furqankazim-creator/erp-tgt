import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getAuthToken, API_URL } from "@/lib/mock-auth";

export type TableName =
  | "employees"
  | "accounts"
  | "contacts"
  | "inquiries"
  | "company_profile"
  | "products_services"
  | "sales_literature"
  | "certifications"
  | "deals"
  | "projects"
  | "tasks"
  | "milestones"
  | "deliverables"
  | "meetings"
  | "agreements"
  | "tickets"
  | "documents"
  | "campaigns"
  | "processes"
  | "trainings"
  | "goals"
  | "risks"
  | "costs"
  | "org_settings"
  | "budgets"
  | "cost_snapshots"
  | "quotes"
  | "work_logs"
  | "pm_commits"
  | "pm_daily_log"
  | "report_history"
  | "report_subscriptions"
  | "company_strategy"
  | "company_goals"
  | "invoices"
  | "payments"
  | "notifications"
  | "inquiry_followups"
  | "proposals"
  | "chart_of_accounts"
  | "bookkeeping_transactions"
  | "bills"
  | "bill_payments"
  | "sprints"
  | "client_feedback";

export type Row = Record<string, unknown>;

type OrderOpts = { column?: string; ascending?: boolean; refetchInterval?: number };

async function apiFetch(path: string, init?: RequestInit): Promise<unknown> {
  const token = getAuthToken();
  const headers = new Headers({ "Content-Type": "application/json", ...(init?.headers ?? {}) });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/** For one-off backend actions that aren't plain CRUD (e.g. "send this
 * inquiry's confirmation email") — same auth/error handling as every other
 * request, just not tied to a table row shape. */
export async function callApi(path: string, init?: RequestInit): Promise<unknown> {
  return apiFetch(path, init);
}

async function fetchRows(table: TableName, order: OrderOpts): Promise<Row[]> {
  const params = new URLSearchParams();
  if (order.column) params.set("column", order.column);
  if (order.ascending) params.set("ascending", "true");
  const qs = params.toString();
  return (await apiFetch(`/${table}${qs ? `?${qs}` : ""}`)) as Row[];
}

async function fetchRow(table: TableName, id: string): Promise<Row | null> {
  try {
    return (await apiFetch(`/${table}/${id}`)) as Row;
  } catch {
    return null;
  }
}

async function saveRow(table: TableName, values: Row & { id?: string }): Promise<string> {
  const { id, ...rest } = values;
  if (id) {
    const updated = (await apiFetch(`/${table}/${id}`, {
      method: "PUT",
      body: JSON.stringify(rest),
    })) as Row;
    return String(updated["id"]);
  }
  const created = (await apiFetch(`/${table}`, {
    method: "POST",
    body: JSON.stringify(rest),
  })) as Row;
  return String(created["id"]);
}

async function deleteRow(table: TableName, id: string): Promise<void> {
  await apiFetch(`/${table}/${id}`, { method: "DELETE" });
}

export async function updateRow(
  table: TableName,
  id: string,
  patch: Row,
): Promise<{ error: Error | null }> {
  try {
    await saveRow(table, { id, ...patch });
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }
}

export function useRows<T extends Row>(table: TableName, order: OrderOpts = {}) {
  return useQuery({
    queryKey: [table, order.column ?? "created_at", order.ascending ?? false],
    queryFn: () => fetchRows(table, order) as Promise<T[]>,
    ...(order.refetchInterval ? { refetchInterval: order.refetchInterval } : {}),
  });
}

export function useRow<T extends Row>(table: TableName, id?: string) {
  return useQuery({
    queryKey: [table, "single", id],
    enabled: Boolean(id),
    queryFn: () => fetchRow(table, id!) as Promise<T | null>,
  });
}

export function useSaveRow(table: TableName, label = "Record") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: Row & { id?: string }) => saveRow(table, values),
    onSuccess: (_data, values) => {
      void qc.invalidateQueries({ queryKey: [table] });
      toast.success(values.id ? `${label} updated` : `${label} created`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteRow(table: TableName, label = "Record") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRow(table, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [table] });
      toast.success(`${label} deleted`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
