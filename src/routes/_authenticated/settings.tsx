import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2, ShieldCheck, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { auth, useCurrentUser, type AccessRole, type MockUser } from "@/lib/mock-auth";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { TableSkeleton, EmptyState } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Time Global Tech CRM" },
      { name: "description", content: "Manage who has access and what they can do." },
      { property: "og:title", content: "Settings — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "Manage who has access and what they can do.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const ROLE_LABEL: Record<AccessRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  developer: "Developer",
  salesman: "Salesman",
};

type CreatableRole = "developer" | "salesman" | "admin";

function CreateAccountDialog({ canCreateAdmins }: { canCreateAdmins: boolean }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<CreatableRole>("developer");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  function reset() {
    setFullName("");
    setEmail("");
    setPassword("");
    setRole("developer");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await auth.createAccount({
      email,
      password,
      full_name: fullName || undefined,
      access_role: role,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Account created for ${email}.`);
    void qc.invalidateQueries({ queryKey: ["auth", "accounts"] });
    reset();
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" /> Create account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create an account</DialogTitle>
          <DialogDescription>
            {canCreateAdmins
              ? "Create a Developer, Salesman or Admin login — they'll use these credentials to sign in."
              : "Create a Developer or Salesman login — they'll use these credentials to sign in."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div>
            <Label className="mb-1.5 block text-xs font-semibold">Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-semibold">Work email</Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-semibold">Temporary password</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs font-semibold">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as CreatableRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="developer">Developer</SelectItem>
                <SelectItem value="salesman">Salesman</SelectItem>
                {canCreateAdmins ? <SelectItem value="admin">Admin</SelectItem> : null}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? "Creating…" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AccountRow({
  account,
  isSuperAdmin,
  onChanged,
}: {
  account: MockUser;
  isSuperAdmin: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function setRole(next: "developer" | "salesman" | "admin") {
    setBusy(true);
    const { error } = await auth.updateAccount(account.id, { access_role: next });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${account.email} is now ${ROLE_LABEL[next]}.`);
    onChanged();
  }

  async function setActive(active: boolean) {
    setBusy(true);
    const { error } = await auth.updateAccount(account.id, { active });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(active ? `${account.email} reactivated.` : `${account.email} deactivated.`);
    onChanged();
  }

  const managed = isSuperAdmin && account.access_role !== "super_admin";

  return (
    <tr className="hover:bg-muted/40 transition-colors">
      <td className="px-4 py-3">
        <p className="font-medium">{account.user_metadata.full_name || "—"}</p>
        <p className="text-xs text-muted-foreground">{account.email}</p>
      </td>
      <td className="px-4 py-3">
        <Badge variant={account.access_role === "super_admin" ? "default" : "secondary"}>
          {ROLE_LABEL[account.access_role]}
        </Badge>
      </td>
      <td className="px-4 py-3">
        {account.active ? (
          <span className="text-success text-xs font-semibold">Active</span>
        ) : (
          <span className="text-muted-foreground text-xs font-semibold">Deactivated</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {managed ? (
          <div className="flex items-center justify-end gap-3">
            <Select
              value={
                account.access_role === "admin" || account.access_role === "salesman"
                  ? account.access_role
                  : "developer"
              }
              onValueChange={(v) => void setRole(v as "developer" | "salesman" | "admin")}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs" disabled={busy}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="developer">Developer</SelectItem>
                <SelectItem value="salesman">Salesman</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Switch
              checked={account.active}
              disabled={busy}
              onCheckedChange={(v) => void setActive(v)}
              aria-label={account.active ? "Deactivate account" : "Reactivate account"}
            />
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
    </tr>
  );
}

function Page() {
  const { data: me } = useCurrentUser();
  const role = me?.access_role;
  const qc = useQueryClient();

  const accounts = useQuery({
    queryKey: ["auth", "accounts"],
    enabled: role === "super_admin" || role === "admin",
    queryFn: async () => {
      const { data, error } = await auth.listAccounts();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  if (role === "developer" || role === "salesman") {
    return (
      <EmptyState
        title="No access"
        description="Settings is only available to Admin and Super Admin accounts."
      />
    );
  }

  if (!role) {
    return <TableSkeleton />;
  }

  const isSuperAdmin = role === "super_admin";
  const rows = accounts.data ?? [];
  const activeCount = rows.filter((a) => a.active).length;
  const developerCount = rows.filter((a) => a.access_role === "developer").length;
  const salesmanCount = rows.filter((a) => a.access_role === "salesman").length;
  const adminCount = rows.filter((a) => a.access_role === "admin").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description={
          isSuperAdmin
            ? "Manage every account on the platform — Super Admin, Admin, Salesman and Developer."
            : "Create and manage Developer and Salesman accounts for your team."
        }
        action={<CreateAccountDialog canCreateAdmins={isSuperAdmin} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Active accounts" value={String(activeCount)} icon={Users} />
        <KpiCard label="Developers" value={String(developerCount)} icon={Users} />
        <KpiCard label="Salesmen" value={String(salesmanCount)} icon={Users} />
        {isSuperAdmin ? (
          <KpiCard label="Admins" value={String(adminCount)} icon={ShieldCheck} />
        ) : (
          <KpiCard label="Total accounts" value={String(rows.length)} icon={ShieldCheck} />
        )}
      </div>

      <div className="surface-card p-5">
        <h3 className="font-semibold">Accounts</h3>
        <p className="text-sm text-muted-foreground">
          {isSuperAdmin
            ? "Every login on the platform. Promote, demote, or deactivate an account below."
            : "Developer and Salesman accounts you've created. Only a Super Admin can promote someone to Admin."}
        </p>

        {accounts.isLoading ? (
          <div className="mt-4">
            <TableSkeleton rows={3} />
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No accounts yet"
              description="Create the first Developer account to get started."
            />
          </div>
        ) : (
          <div className="surface-card mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Account</th>
                  <th className="px-4 py-3 text-left font-semibold">Role</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {rows.map((a) => (
                  <AccountRow
                    key={a.id}
                    account={a}
                    isSuperAdmin={isSuperAdmin}
                    onChanged={() => void qc.invalidateQueries({ queryKey: ["auth", "accounts"] })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
