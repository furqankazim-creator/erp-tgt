import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  FileSignature,
  FileText,
  MessageSquare,
  TrendingUp,
} from "lucide-react";

import { useRows, useRow } from "@/lib/db";
import { currency, dateLabel, dateTimeLabel } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { TableSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/accounts/$accountId")({
  head: () => ({
    meta: [
      { title: "Account detail — Time Global Tech CRM" },
      {
        name: "description",
        content:
          "Full history for one client — inquiries, meetings, opportunities, quotes and agreements.",
      },
      { property: "og:title", content: "Account detail — Time Global Tech CRM" },
      {
        property: "og:description",
        content: "Contacts, deal history, notes and contract status for a client account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccountDetail,
});

type Account = {
  id: string;
  name: string;
  industry: string | null;
  owner: string | null;
  country: string | null;
  status: string;
  contract_status: string;
  annual_value: number;
  notes: string | null;
  website: string | null;
};
type Contact = {
  id: string;
  account_id: string | null;
  name: string;
  title: string | null;
  email: string | null;
  stage: string;
};
type Deal = {
  id: string;
  account_id: string | null;
  title: string;
  value: number;
  stage: string;
  close_date: string | null;
};
type Inquiry = {
  id: string;
  account_id: string | null;
  client_name: string;
  description: string;
  status: string;
  received_date: string | null;
};
type Meeting = {
  id: string;
  title: string;
  starts_at: string;
  status: string;
  kind: string;
  client: string | null;
  inquiry_id: string | null;
  deal_id: string | null;
};
type Quote = {
  id: string;
  title: string;
  client: string | null;
  status: string;
  suggested_price: number;
  inquiry_id: string | null;
  deal_id: string | null;
};
type Agreement = {
  id: string;
  title: string;
  account_id: string | null;
  deal_id: string | null;
  status: string;
  value: number;
  expires_at: string | null;
};

/** One shared line of history — an inquiry, meeting, quote or agreement — so
 * the whole customer story can be rendered as a single timeline instead of
 * four disconnected lists. */
type TimelineItem = {
  id: string;
  at: string | null;
  kind: "Inquiry" | "Meeting" | "Demo" | "Estimation" | "Agreement";
  title: string;
  meta: string;
  status: string;
};

function AccountDetail() {
  const { accountId } = useParams({ from: "/_authenticated/accounts/$accountId" });
  const account = useRow<Account>("accounts", accountId);
  const contacts = useRows<Contact>("contacts");
  const deals = useRows<Deal>("deals");
  const inquiries = useRows<Inquiry>("inquiries");
  const meetings = useRows<Meeting>("meetings");
  const quotes = useRows<Quote>("quotes");
  const agreements = useRows<Agreement>("agreements");

  if (account.isLoading) return <TableSkeleton />;
  if (!account.data) return <p className="text-muted-foreground">Account not found.</p>;

  const a = account.data;
  const accountContacts = (contacts.data ?? []).filter((c) => c.account_id === a.id);
  const accountDeals = (deals.data ?? []).filter((d) => d.account_id === a.id);
  const accountInquiries = (inquiries.data ?? []).filter((i) => i.account_id === a.id);

  const dealIds = new Set(accountDeals.map((d) => d.id));
  const inquiryIds = new Set(accountInquiries.map((i) => i.id));

  // Meetings/Demos, Estimations and Agreements aren't always linked by a
  // clean account_id — they're reached via the inquiry or deal they belong
  // to (or, for older unlinked records, by matching the client name string).
  const accountMeetings = (meetings.data ?? []).filter(
    (m) =>
      (m.inquiry_id && inquiryIds.has(m.inquiry_id)) ||
      (m.deal_id && dealIds.has(m.deal_id)) ||
      m.client === a.name,
  );
  const accountQuotes = (quotes.data ?? []).filter(
    (q) =>
      (q.inquiry_id && inquiryIds.has(q.inquiry_id)) ||
      (q.deal_id && dealIds.has(q.deal_id)) ||
      q.client === a.name,
  );
  const accountAgreements = (agreements.data ?? []).filter(
    (ag) => ag.account_id === a.id || (ag.deal_id && dealIds.has(ag.deal_id)),
  );

  const timeline: TimelineItem[] = [
    ...accountInquiries.map((i) => ({
      id: i.id,
      at: i.received_date,
      kind: "Inquiry" as const,
      title: i.description.slice(0, 80),
      meta: i.client_name,
      status: i.status,
    })),
    ...accountMeetings.map((m) => ({
      id: m.id,
      at: m.starts_at,
      kind: (m.kind === "Demo" ? "Demo" : "Meeting") as "Demo" | "Meeting",
      title: m.title,
      meta: m.kind ?? "Meeting",
      status: m.status,
    })),
    ...accountQuotes.map((q) => ({
      id: q.id,
      at: null,
      kind: "Estimation" as const,
      title: q.title,
      meta: currency(q.suggested_price, true),
      status: q.status,
    })),
    ...accountAgreements.map((ag) => ({
      id: ag.id,
      at: ag.expires_at,
      kind: "Agreement" as const,
      title: ag.title,
      meta: currency(ag.value, true),
      status: ag.status,
    })),
  ].sort((x, y) => (y.at ?? "0").localeCompare(x.at ?? "0"));

  const KIND_ICON: Record<TimelineItem["kind"], typeof MessageSquare> = {
    Inquiry: MessageSquare,
    Meeting: CalendarDays,
    Demo: CalendarDays,
    Estimation: FileText,
    Agreement: FileSignature,
  };

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/accounts">
          <ArrowLeft className="size-4" /> All accounts
        </Link>
      </Button>
      <PageHeader
        title={a.name}
        description={`${a.industry ?? "—"} · ${a.country ?? "—"} · Owner ${a.owner ?? "unassigned"}`}
        action={
          <>
            <StatusBadge value={a.status} />
            <StatusBadge value={a.contract_status} />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="surface-card p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Annual value</p>
          <p className="mt-2 text-2xl font-bold">{currency(a.annual_value)}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Inquiries</p>
          <p className="mt-2 text-2xl font-bold">{accountInquiries.length}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Deals</p>
          <p className="mt-2 text-2xl font-bold">{accountDeals.length}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Estimations</p>
          <p className="mt-2 text-2xl font-bold">{accountQuotes.length}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Agreements</p>
          <p className="mt-2 text-2xl font-bold">{accountAgreements.length}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="surface-card p-6 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <TrendingUp className="text-primary size-4" /> Full history — inquiry to agreement
          </h2>
          <p className="text-sm text-muted-foreground">
            Every inquiry, meeting, demo, estimation and agreement tied to {a.name}, newest first.
          </p>
          {timeline.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              Nothing tracked yet for this account.
            </p>
          ) : (
            <ol className="mt-5 space-y-4 border-l border-border pl-5">
              {timeline.map((t) => {
                const Icon = KIND_ICON[t.kind];
                return (
                  <li key={`${t.kind}-${t.id}`} className="relative">
                    <span className="bg-primary absolute top-1 -left-[27px] grid size-4 place-items-center rounded-full text-primary-foreground">
                      <Icon className="size-2.5" />
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-primary">
                        {t.kind}
                      </span>
                      <StatusBadge value={t.status} />
                      {t.at ? (
                        <span className="text-[11px] text-muted-foreground">
                          {dateTimeLabel(t.at)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.meta}</p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="space-y-5">
          <div className="surface-card p-6">
            <p className="text-sm text-muted-foreground">{a.notes ?? "No notes."}</p>
            {a.website ? <p className="mt-2 text-sm">{a.website}</p> : null}
          </div>
          <div className="surface-card p-6">
            <h2 className="font-semibold">Contacts</h2>
            <ul className="divide-border mt-3 divide-y">
              {accountContacts.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.title ?? "—"} · {c.email ?? "—"}
                    </p>
                  </div>
                  <StatusBadge value={c.stage} />
                </li>
              ))}
              {accountContacts.length === 0 ? (
                <li className="py-4 text-sm text-muted-foreground">No contacts yet.</li>
              ) : null}
            </ul>
          </div>
        </div>
      </div>

      <div className="surface-card p-6">
        <h2 className="font-semibold">Deals</h2>
        <ul className="divide-border mt-3 divide-y">
          {accountDeals.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium">{d.title}</p>
                <p className="text-xs text-muted-foreground">Close {dateLabel(d.close_date)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{currency(d.value, true)}</span>
                <StatusBadge value={d.stage} />
              </div>
            </li>
          ))}
          {accountDeals.length === 0 ? (
            <li className="py-4 text-sm text-muted-foreground">No deals yet.</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
