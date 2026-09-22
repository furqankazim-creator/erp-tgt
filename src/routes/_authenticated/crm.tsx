import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Mail, Phone, Plus, Search } from "lucide-react";

import { useRows } from "@/lib/db";
import { useCurrentUser } from "@/lib/mock-auth";
import { dateLabel, initials } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { RecordDialog, type Field } from "@/components/record-dialog";
import { DeleteButton } from "@/components/delete-button";
import { TableSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/crm")({
  head: () => ({
    meta: [
      { title: "CRM — Time Global Tech CRM" },
      {
        name: "description",
        content: "Contact database with tags, filters and a lead-to-won pipeline board.",
      },
      { property: "og:title", content: "CRM — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "Manage contacts and move them through the pipeline.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CrmPage,
});

type Contact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  company: string | null;
  stage: string;
  tags: string[];
  source: string | null;
  owner: string | null;
  notes: string | null;
  created_at: string;
};
type Employee = { id: string; name: string; email: string | null };

const STAGES = ["Lead", "Contacted", "Qualified", "Proposal", "Won", "Lost"];

const FIELDS: Field[] = [
  { name: "name", label: "Full name", required: true },
  { name: "title", label: "Job title" },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Phone" },
  { name: "company", label: "Company" },
  { name: "stage", label: "Stage", type: "select", options: STAGES },
  {
    name: "source",
    label: "Source",
    type: "select",
    options: ["Website", "Referral", "Outbound", "Webinar", "Conference", "LinkedIn", "Partner"],
  },
  { name: "owner", label: "Owner", type: "owner" },
  { name: "tags", label: "Tags (comma separated)", type: "tags" },
  { name: "notes", label: "Notes", type: "textarea" },
];

function CrmPage() {
  const { data, isLoading } = useRows<Contact>("contacts");
  const { data: employeeRows } = useRows<Employee>("employees");
  const { data: me } = useCurrentUser();
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<string>("All");
  const [selected, setSelected] = useState<Contact | null>(null);

  const myName = (employeeRows ?? []).find(
    (e) => e.email && me?.email && e.email.toLowerCase() === me.email.toLowerCase(),
  )?.name;

  const contacts = useMemo(() => {
    const rows = data ?? [];
    // Same "own work only" rule as everywhere else Salesman is scoped.
    const scoped =
      me?.access_role === "salesman"
        ? myName
          ? rows.filter((c) => c.owner === myName)
          : []
        : rows;
    return scoped.filter((c) => {
      const matchesQuery = `${c.name} ${c.company ?? ""} ${c.email ?? ""} ${c.tags.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase());
      return matchesQuery && (stage === "All" || c.stage === stage);
    });
  }, [data, query, stage, me?.access_role, myName]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM"
        description={
          me?.access_role === "salesman"
            ? "Your contacts, tagged and tracked from first touch to closed won."
            : "Every relationship, tagged and tracked from first touch to closed won."
        }
        action={
          <RecordDialog
            table="contacts"
            label="Contact"
            fields={FIELDS}
            defaults={{
              stage: "Lead",
              owner: me?.access_role === "salesman" ? (myName ?? "") : "",
            }}
            trigger={
              <Button>
                <Plus className="size-4" /> New contact
              </Button>
            }
          />
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            className="pl-9"
            placeholder="Search contacts, companies, tags…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["All", ...STAGES].map((s) => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                stage === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="database">Database</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="pt-4">
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
              {STAGES.map((s) => {
                const items = contacts.filter((c) => c.stage === s);
                return (
                  <div key={s} className="bg-muted/40 border-border rounded-xl border p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-bold tracking-wide uppercase">{s}</p>
                      <span className="bg-background rounded-full px-2 py-0.5 text-xs font-semibold">
                        {items.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {items.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setSelected(c)}
                          className="surface-card surface-card-hover w-full p-3 text-left"
                        >
                          <p className="truncate text-sm font-semibold">{c.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {c.company ?? "No company"} · {c.owner ?? "Unassigned"}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {c.tags.slice(0, 2).map((t) => (
                              <span
                                key={t}
                                className="bg-accent text-accent-foreground rounded px-1.5 py-0.5 text-[10px] font-semibold"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </button>
                      ))}
                      {items.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">Empty</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="database" className="pt-4">
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <div className="surface-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Contact</th>
                    <th className="px-4 py-3 text-left font-semibold">Company</th>
                    <th className="px-4 py-3 text-left font-semibold">Stage</th>
                    <th className="px-4 py-3 text-left font-semibold">Source</th>
                    <th className="px-4 py-3 text-left font-semibold">Owner</th>
                    <th className="px-4 py-3 text-left font-semibold">Added</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {contacts.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3">
                        <button
                          className="flex items-center gap-3 text-left"
                          onClick={() => setSelected(c)}
                        >
                          <Avatar className="size-8">
                            <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                              {initials(c.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span>
                            <span className="block font-medium">{c.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {c.title ?? "—"}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3">{c.company ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge value={c.stage} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{c.source ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.owner ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{dateLabel(c.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <RecordDialog
                            table="contacts"
                            label="Contact"
                            fields={FIELDS}
                            record={c}
                            trigger={
                              <Button variant="ghost" size="sm">
                                Edit
                              </Button>
                            }
                          />
                          <DeleteButton table="contacts" id={c.id} label="Contact" name={c.name} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription>
                  {selected.title ?? "Contact"} · {selected.company ?? "—"}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-6">
                <StatusBadge value={selected.stage} />
                <div className="space-y-2 text-sm">
                  <p className="flex items-center gap-2">
                    <Mail className="text-muted-foreground size-4" /> {selected.email ?? "—"}
                  </p>
                  <p className="flex items-center gap-2">
                    <Phone className="text-muted-foreground size-4" /> {selected.phone ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Tags</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selected.tags.length ? (
                      selected.tags.map((t) => (
                        <span
                          key={t}
                          className="bg-accent text-accent-foreground rounded px-2 py-0.5 text-xs font-semibold"
                        >
                          {t}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">No tags</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Notes</p>
                  <p className="mt-1 text-sm">{selected.notes ?? "No notes yet."}</p>
                </div>
                <div className="flex gap-2">
                  <RecordDialog
                    table="contacts"
                    label="Contact"
                    fields={FIELDS}
                    record={selected}
                    trigger={<Button className="flex-1">Edit contact</Button>}
                  />
                  <DeleteButton
                    table="contacts"
                    id={selected.id}
                    label="Contact"
                    name={selected.name}
                  />
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
