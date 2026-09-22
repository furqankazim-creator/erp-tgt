import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ExternalLink,
  FileText,
  History,
  Mail,
  Paperclip,
  Plus,
  Save,
  ScrollText,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { callApi, updateRow, useRow, useRows, useSaveRow, type Row } from "@/lib/db";
import { dateTimeLabel, dateLabel, currency } from "@/lib/format";
import { OwnerCombobox } from "@/components/strategy/owner-combobox";
import { ClientCombobox, type ClientContact } from "@/components/client-combobox";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/loading";
import { RecordDialog, type Field } from "@/components/record-dialog";
import { QuoteCalculatorDialog } from "@/components/quote-calculator-dialog";
import { useCreateProposal } from "@/components/proposal-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const INQUIRY_STAGES = [
  "New",
  "In Review",
  "Responded",
  "Proposal Sent",
  "Deal Done",
] as const;
export const INQUIRY_STAGES_WITH_LOST = [...INQUIRY_STAGES, "Lost"] as const;

export const SOURCES = [
  "Web Form",
  "Meta Ads",
  "Advocates/Referrals",
  "Marketing Campaign",
  "Cold Call",
  "Email",
  "Social Media",
  "WhatsApp",
  "Partner",
  "CEO",
  "Salesman",
  "Lead Conversion",
  "Event/Exhibition",
  "Walk-in",
  "Other",
];
export const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
export const CONTACT_METHODS = ["Email", "Phone", "WhatsApp", "SMS"];
export const SOURCE_MEDIUMS = [
  "Website Form",
  "Facebook",
  "Instagram",
  "LinkedIn",
  "Email",
  "WhatsApp",
  "Phone Call",
  "Referral",
  "Other",
];
export const BUDGET_RANGES = [
  "Not Specified",
  "Under $1,000",
  "$1,000–$5,000",
  "$5,000–$10,000",
  "$10,000+",
  "Custom",
];
const BUDGET_RANGE_VALUES: Record<string, number> = {
  "Not Specified": 0,
  "Under $1,000": 999,
  "$1,000–$5,000": 5000,
  "$5,000–$10,000": 10000,
  "$10,000+": 15000,
};
export const FOLLOWUP_FREQUENCIES = [
  "No Follow-Up",
  "One Time",
  "Daily",
  "Every 2 Days",
  "Weekly",
  "Biweekly",
  "Monthly",
  "Custom",
];
// Every one of these except "Other" is wired to a real send — see
// RESPONSE_TEMPLATE_BUILDERS on the server (server/index.mjs).
export const RESPONSE_TEMPLATES = [
  "Inquiry Received",
  "Basic Quotation",
  "Meeting Request",
  "Other",
];
export const COMPLEXITY_LEVELS = ["Simple", "Medium", "Complex"];

type Attachment = { name: string; size: number; type: string; data_url: string };
type ActivityEntry = { type: string; message: string; at: string };
type Account = { id: string; name: string; industry: string | null };
type ServiceRow = { id: string; name: string; status: string };
type PriorInquiry = {
  id: string;
  client_name: string;
  email: string | null;
  account_id: string | null;
  status: string;
  description: string;
  created_at: string;
};

export type Inquiry = {
  id: string;
  display_id: string | null;
  title: string | null;
  customer_type: string;
  customer_status: string;
  reference: string | null;
  source: string;
  source_medium: string | null;
  account_id: string | null;
  client_name: string;
  company: string | null;
  designation: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  country: string | null;
  city: string | null;
  website: string | null;
  priority: string;
  owner: string | null;
  description: string;
  tags: string[];
  notes: string | null;
  industry: string | null;
  preferred_contact_method: string | null;
  estimated_budget: number;
  budget_range: string | null;
  expected_close_date: string | null;
  address: string | null;
  received_date: string | null;
  next_follow_up: string | null;
  followup_frequency: string | null;
  status: string;
  deal_id: string | null;
  // Set by the WhatsApp intake route (server/index.mjs) for a WhatsApp-sourced inquiry —
  // a direct link back to the exact conversation it came from. Absent for every other
  // source (Web Form, Email, Referral, ...), which have no such conversation to link to.
  conversation_url: string | null;
  attachments: Attachment[];
  activity_log: ActivityEntry[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
  // The automated drip — set once at creation, advanced by a background
  // job (jobs.mjs). Read-only here; never sent back in the submit payload.
  auto_quotation_send_at: string | null;
  auto_quotation_sent: boolean;
  auto_meeting_send_at: string | null;
  auto_meeting_sent: boolean;
  // Qualification — a quick read on how sales-ready this inquiry is, not a
  // full estimation (that's what the Estimation/Proposal stages are for).
  requirement_clear: boolean;
  budget_known: boolean;
  decision_maker_known: boolean;
  timeline_known: boolean;
  meeting_required: boolean;
  potential_value: number;
  // How complex this looks at a glance — feeds the tiered Basic Quotation
  // email's $/hr rate, not a full estimation.
  complexity: string;
  // Optional rough man-hours — when set, drives a real dollar ballpark in
  // the Basic Quotation email (hours × rate) instead of a bare rate, and
  // triggers an automatic Quote + Proposal draft (see auto-estimate.mjs).
  estimated_hours: number;
  // Auto response
  auto_response_enabled: boolean;
  response_template: string;
  // Pre-sales workspace fields — requirement gathering through client sign-off.
  service_id: string | null;
  client_approved: boolean;
  client_approved_at: string | null;
  client_approved_by: string | null;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

type FormState = {
  title: string;
  customer_type: string;
  customer_status: string;
  reference: string;
  client_name: string;
  company: string;
  designation: string;
  phone: string;
  whatsapp: string;
  email: string;
  country: string;
  city: string;
  website: string;
  account_id: string;
  source: string;
  source_medium: string;
  priority: string;
  owner: string;
  description: string;
  tags: string;
  notes: string;
  industry: string;
  preferred_contact_method: string;
  estimated_budget: string;
  budget_range: string;
  expected_close_date: string;
  address: string;
  received_date: string;
  next_follow_up: string;
  followup_frequency: string;
  status: string;
  requirement_clear: boolean;
  budget_known: boolean;
  decision_maker_known: boolean;
  timeline_known: boolean;
  meeting_required: boolean;
  potential_value: string;
  estimated_hours: string;
  complexity: string;
  auto_response_enabled: boolean;
  response_template: string;
  service_id: string;
  client_approved: boolean;
  client_approved_at: string;
  client_approved_by: string;
};

function emptyState(): FormState {
  return {
    title: "",
    customer_type: "B2B",
    customer_status: "New",
    reference: "",
    client_name: "",
    company: "",
    designation: "",
    phone: "",
    whatsapp: "",
    email: "",
    country: "",
    city: "",
    website: "",
    account_id: "",
    source: "Web Form",
    source_medium: "Website Form",
    priority: "Medium",
    owner: "",
    description: "",
    tags: "",
    notes: "",
    industry: "",
    preferred_contact_method: "Email",
    estimated_budget: "",
    budget_range: "Not Specified",
    expected_close_date: "",
    address: "",
    received_date: new Date().toISOString().slice(0, 10),
    next_follow_up: "",
    followup_frequency: "No Follow-Up",
    status: "New",
    requirement_clear: false,
    budget_known: false,
    decision_maker_known: false,
    timeline_known: false,
    meeting_required: false,
    potential_value: "",
    estimated_hours: "",
    complexity: "Medium",
    auto_response_enabled: true,
    response_template: "Inquiry Received",
    service_id: "",
    client_approved: false,
    client_approved_at: "",
    client_approved_by: "",
  };
}

function toState(r: Inquiry): FormState {
  return {
    title: r.title ?? "",
    customer_type: r.customer_type ?? "B2B",
    customer_status: r.customer_status ?? "New",
    reference: r.reference ?? "",
    client_name: r.client_name ?? "",
    company: r.company ?? "",
    designation: r.designation ?? "",
    phone: r.phone ?? "",
    whatsapp: r.whatsapp ?? "",
    email: r.email ?? "",
    country: r.country ?? "",
    city: r.city ?? "",
    website: r.website ?? "",
    account_id: r.account_id ?? "",
    source: r.source ?? "Web Form",
    source_medium: r.source_medium ?? "Website Form",
    priority: r.priority ?? "Medium",
    owner: r.owner ?? "",
    description: r.description ?? "",
    tags: (r.tags ?? []).join(", "),
    notes: r.notes ?? "",
    industry: r.industry ?? "",
    preferred_contact_method: r.preferred_contact_method ?? "Email",
    estimated_budget: r.estimated_budget != null ? String(r.estimated_budget) : "",
    budget_range: r.budget_range ?? "Not Specified",
    expected_close_date: r.expected_close_date ? r.expected_close_date.slice(0, 10) : "",
    address: r.address ?? "",
    received_date: r.received_date ? r.received_date.slice(0, 10) : "",
    next_follow_up: r.next_follow_up ? r.next_follow_up.slice(0, 10) : "",
    followup_frequency: r.followup_frequency ?? "No Follow-Up",
    status: r.status ?? "New",
    requirement_clear: r.requirement_clear ?? false,
    budget_known: r.budget_known ?? false,
    decision_maker_known: r.decision_maker_known ?? false,
    timeline_known: r.timeline_known ?? false,
    meeting_required: r.meeting_required ?? false,
    potential_value: r.potential_value != null ? String(r.potential_value) : "",
    estimated_hours: r.estimated_hours != null ? String(r.estimated_hours) : "",
    complexity: r.complexity ?? "Medium",
    auto_response_enabled: r.auto_response_enabled ?? true,
    response_template: r.response_template ?? "Inquiry Received",
    service_id: r.service_id ?? "",
    client_approved: r.client_approved ?? false,
    client_approved_at: r.client_approved_at ? r.client_approved_at.slice(0, 10) : "",
    client_approved_by: r.client_approved_by ?? "",
  };
}

function YesNoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
        {label}
      </Label>
      <div className="flex gap-2">
        {[
          { text: "Yes", val: true },
          { text: "No", val: false },
        ].map((opt) => (
          <button
            key={opt.text}
            type="button"
            onClick={() => onChange(opt.val)}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
              value === opt.val
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            {opt.text}
          </button>
        ))}
      </div>
    </div>
  );
}

type LinkedMeeting = {
  id: string;
  title: string;
  starts_at: string;
  status: string;
  inquiry_id: string | null;
};
type LinkedQuote = {
  id: string;
  title: string;
  status: string;
  suggested_price: number;
  inquiry_id: string | null;
};
type FollowUp = {
  id: string;
  inquiry_id: string | null;
  follow_up_date: string | null;
  method: string;
  note: string | null;
  assigned_to: string | null;
  customer_response: string | null;
  next_action: string | null;
  status: string;
  created_at: string;
};
type LinkedProposal = {
  id: string;
  inquiry_id: string;
  display_id: string | null;
  title: string;
  version: number;
  status: string;
  cost: number | null;
  created_at: string;
};

const FOLLOWUP_METHODS = ["Email", "Phone", "WhatsApp", "SMS", "Meeting", "Other"];
const FOLLOWUP_STATUSES = ["Pending", "Completed"];

export function InquiryFormPage({ recordId }: { recordId?: string }) {
  const isEdit = Boolean(recordId);
  const existing = useRow<Inquiry>("inquiries", recordId);
  const { data: accountRows } = useRows<Account>("accounts");
  const { data: serviceRows } = useRows<ServiceRow>("products_services");
  const services = (serviceRows ?? []).filter((s) => s.status !== "Discontinued");
  const { data: meetingRows } = useRows<LinkedMeeting>("meetings");
  const { data: quoteRows } = useRows<LinkedQuote>("quotes");
  const { data: followUpRows } = useRows<FollowUp>("inquiry_followups");
  const { data: proposalRows } = useRows<LinkedProposal>("proposals");
  const { data: priorInquiryRows } = useRows<PriorInquiry>("inquiries");
  const accounts = accountRows ?? [];
  const linkedMeetings = (meetingRows ?? [])
    .filter((m) => m.inquiry_id === recordId)
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const linkedQuotes = (quoteRows ?? []).filter((q) => q.inquiry_id === recordId);
  const linkedProposals = (proposalRows ?? [])
    .filter((p) => p.inquiry_id === recordId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const { createProposal, creating: creatingProposal } = useCreateProposal();
  const linkedFollowUps = (followUpRows ?? [])
    .filter((f) => f.inquiry_id === recordId)
    .sort((a, b) =>
      (a.follow_up_date ?? a.created_at).localeCompare(b.follow_up_date ?? b.created_at),
    );
  const save = useSaveRow("inquiries", "Inquiry");
  const navigate = useNavigate();

  const [values, setValues] = useState<FormState>(emptyState());
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [sendingConfirmation, setSendingConfirmation] = useState(false);
  const [clientMode, setClientMode] = useState<"new" | "existing">("new");
  const [pickedContact, setPickedContact] = useState<ClientContact | null>(null);
  const [showResponsePreview, setShowResponsePreview] = useState(false);

  useEffect(() => {
    if (existing.data) {
      setValues(toState(existing.data));
      setAttachments(existing.data.attachments ?? []);
    }
  }, [existing.data]);

  if (isEdit && existing.isLoading) return <TableSkeleton />;

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  // Picking a returning client fills in everything we already know about
  // them — the fields stay editable in case anything's changed since.
  function applyExistingClient(contact: ClientContact) {
    setPickedContact(contact);
    const linkedAccount = contact.account_id
      ? accounts.find((a) => a.id === contact.account_id)
      : undefined;
    setValues((v) => ({
      ...v,
      client_name: contact.name,
      company: contact.company ?? linkedAccount?.name ?? v.company,
      email: contact.email ?? v.email,
      phone: contact.phone ?? v.phone,
      account_id: contact.account_id ?? v.account_id,
      industry: linkedAccount?.industry ?? v.industry,
    }));
    toast.success(`Filled in from ${contact.name} — double-check before saving.`);
  }

  // Same client, spotted again — matched by the linked CRM account first
  // (most reliable), falling back to email for contacts with no account yet.
  const priorInquiriesForClient = (() => {
    if (!pickedContact || isEdit) return [];
    return (priorInquiryRows ?? []).filter((i) => {
      if (pickedContact.account_id) return i.account_id === pickedContact.account_id;
      if (pickedContact.email) return i.email === pickedContact.email;
      return false;
    });
  })();

  async function sendConfirmation(template?: string) {
    if (!recordId) return;
    setSendingConfirmation(true);
    try {
      await callApi(`/inquiries/${recordId}/send-confirmation`, {
        method: "POST",
        body: JSON.stringify({ template: template ?? "Inquiry Received" }),
      });
      toast.success(`${template ?? "Confirmation"} email sent to ${values.email || "the client"}.`);
      await existing.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send confirmation email.");
    } finally {
      setSendingConfirmation(false);
    }
  }

  async function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const next: Attachment[] = [...attachments];
    for (const file of Array.from(fileList)) {
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} is over the 10MB limit`);
        continue;
      }
      const data_url = await fileToDataUrl(file);
      next.push({ name: file.name, size: file.size, type: file.type, data_url });
    }
    setAttachments(next);
  }

  function removeAttachment(name: string) {
    setAttachments((a) => a.filter((f) => f.name !== name));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.client_name.trim() || !values.description.trim()) {
      toast.error("Client name and description are required");
      return;
    }

    const prevLog: ActivityEntry[] = existing.data?.activity_log ?? [];
    const now = new Date().toISOString();
    const log = [...prevLog];
    if (!isEdit) {
      log.push({ type: "created", message: "Inquiry created manually.", at: now });
    } else if (existing.data && existing.data.status !== values.status) {
      log.push({
        type: "status_changed",
        message: `Status updated from ${existing.data.status} to ${values.status}.`,
        at: now,
      });
    }
    const wasApproved = existing.data?.client_approved ?? false;
    if (values.client_approved && !wasApproved) {
      log.push({
        type: "approved",
        message: `Client approval recorded${values.client_approved_by ? ` — confirmed by ${values.client_approved_by}` : ""}.`,
        at: now,
      });
    } else if (!values.client_approved && wasApproved) {
      log.push({ type: "approval_reverted", message: "Client approval was reverted.", at: now });
    }

    const payload: Row & { id?: string } = {
      title: values.title.trim() || null,
      customer_type: values.customer_type,
      customer_status: values.customer_status,
      reference: values.reference.trim() || null,
      client_name: values.client_name.trim(),
      company: values.company.trim() || null,
      designation: values.designation.trim() || null,
      phone: values.phone.trim() || null,
      whatsapp: values.whatsapp.trim() || null,
      email: values.email.trim() || null,
      country: values.country.trim() || null,
      city: values.city.trim() || null,
      website: values.website.trim() || null,
      account_id: values.account_id || null,
      source: values.source,
      source_medium: values.source_medium || null,
      priority: values.priority,
      owner: values.owner || null,
      description: values.description.trim(),
      tags: values.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      notes: values.notes.trim() || null,
      industry: values.industry.trim() || null,
      preferred_contact_method: values.preferred_contact_method || null,
      estimated_budget: values.estimated_budget === "" ? 0 : Number(values.estimated_budget),
      budget_range: values.budget_range,
      expected_close_date: values.expected_close_date
        ? new Date(values.expected_close_date).toISOString()
        : null,
      address: values.address.trim() || null,
      received_date: values.received_date ? new Date(values.received_date).toISOString() : null,
      next_follow_up: values.next_follow_up ? new Date(values.next_follow_up).toISOString() : null,
      followup_frequency: values.followup_frequency,
      status: values.status,
      requirement_clear: values.requirement_clear,
      budget_known: values.budget_known,
      decision_maker_known: values.decision_maker_known,
      timeline_known: values.timeline_known,
      meeting_required: values.meeting_required,
      potential_value: values.potential_value === "" ? 0 : Number(values.potential_value),
      estimated_hours: values.estimated_hours === "" ? 0 : Number(values.estimated_hours),
      complexity: values.complexity,
      auto_response_enabled: values.auto_response_enabled,
      response_template: values.response_template,
      attachments,
      activity_log: log,
      service_id: values.service_id || null,
      client_approved: values.client_approved,
      client_approved_at: values.client_approved
        ? values.client_approved_at
          ? new Date(values.client_approved_at).toISOString()
          : now
        : null,
      client_approved_by: values.client_approved ? values.client_approved_by.trim() || null : null,
    };
    if (isEdit && recordId) payload.id = recordId;

    save.mutate(payload, {
      onSuccess: () => void navigate({ to: "/inquiries" }),
    });
  }

  const stepIndex = INQUIRY_STAGES.indexOf(values.status as (typeof INQUIRY_STAGES)[number]);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/inquiries">
          <ArrowLeft className="size-4" /> Back to inquiries
        </Link>
      </Button>
      {isEdit && existing.data ? (
        <div className="surface-card flex flex-wrap items-center justify-between gap-4 border-l-4 border-l-primary p-5">
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold tracking-wide text-primary">
              {existing.data.display_id ?? "INQ-PENDING"}
            </p>
            <h1 className="mt-0.5 truncate text-xl font-bold tracking-tight">
              {values.client_name || "Untitled inquiry"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge value={values.status} />
              <StatusBadge value={values.priority} />
              <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[11px] font-semibold">
                {values.customer_type}
              </span>
              {values.owner ? (
                <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[11px] font-semibold">
                  {values.owner}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Created {dateLabel(existing.data.created_at)}
              {existing.data.created_by ? ` by ${existing.data.created_by}` : ""}
              {existing.data.updated_at && existing.data.updated_at !== existing.data.created_at
                ? ` · Last updated ${dateLabel(existing.data.updated_at)}`
                : ""}
            </p>
          </div>
          {values.email ? (
            <Button
              type="button"
              variant="outline"
              disabled={sendingConfirmation}
              onClick={() => void sendConfirmation()}
            >
              <Mail className="size-4" />
              {sendingConfirmation ? "Sending…" : "Send confirmation email"}
            </Button>
          ) : null}
        </div>
      ) : (
        <PageHeader
          title="New Inquiry"
          description="A record number (e.g. INQ-2026-00001) is assigned automatically once you save."
        />
      )}

      <form onSubmit={submit} className="space-y-6">
        <section className="surface-card space-y-5 p-6">
          <h2 className="font-semibold">1. Inquiry Information</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Customer Type
              </Label>
              <div className="flex gap-2">
                {["B2B", "B2C"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set("customer_type", t)}
                    className={`flex-1 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                      values.customer_type === t
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Inquiry Source <span className="text-destructive">*</span>
              </Label>
              <Select value={values.source} onValueChange={(v) => set("source", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Source Medium
              </Label>
              <Select value={values.source_medium} onValueChange={(v) => set("source_medium", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_MEDIUMS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Reference
              </Label>
              <Input
                placeholder="Campaign, referral person, ad, website page…"
                value={values.reference}
                onChange={(e) => set("reference", e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Priority <span className="text-destructive">*</span>
              </Label>
              <Select value={values.priority} onValueChange={(v) => set("priority", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Date Received
              </Label>
              <Input
                type="date"
                value={values.received_date}
                onChange={(e) => set("received_date", e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="surface-card space-y-5 p-6">
          <h2 className="font-semibold">2. Customer Information</h2>

          {!isEdit ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setClientMode("new");
                    setPickedContact(null);
                    set("customer_status", "New");
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    clientMode === "new"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <UserPlus className="size-3.5" /> New client
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setClientMode("existing");
                    set("customer_status", "Existing");
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    clientMode === "existing"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <Users className="size-3.5" /> Existing client
                </button>
              </div>

              {clientMode === "existing" ? (
                <ClientCombobox
                  onSelect={applyExistingClient}
                  placeholder={
                    pickedContact ? `${pickedContact.name} selected — search to change` : undefined
                  }
                />
              ) : null}

              {priorInquiriesForClient.length > 0 ? (
                <div className="border-primary/20 bg-primary/[0.04] flex items-start gap-2 rounded-lg border p-3 text-sm">
                  <History className="text-primary mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="font-medium">
                      {priorInquiriesForClient.length} previous{" "}
                      {priorInquiriesForClient.length === 1 ? "inquiry" : "inquiries"} from this
                      client
                    </p>
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {priorInquiriesForClient.slice(0, 3).map((p) => (
                        <li key={p.id}>
                          {dateLabel(p.created_at)} — {p.description.slice(0, 60)}
                          {p.description.length > 60 ? "…" : ""}{" "}
                          <span className="font-medium">({p.status})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                {values.customer_type === "B2B" ? "Contact Person" : "Customer Name"}{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                required
                placeholder="John Doe"
                value={values.client_name}
                onChange={(e) => set("client_name", e.target.value)}
              />
            </div>
            {values.customer_type === "B2B" ? (
              <>
                <div>
                  <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                    Company Name
                  </Label>
                  <Input
                    placeholder="Company Name"
                    value={values.company}
                    onChange={(e) => set("company", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                    Designation
                  </Label>
                  <Input
                    placeholder="e.g. Operations Manager"
                    value={values.designation}
                    onChange={(e) => set("designation", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                    Website
                  </Label>
                  <Input
                    placeholder="https://company.com"
                    value={values.website}
                    onChange={(e) => set("website", e.target.value)}
                  />
                </div>
              </>
            ) : null}
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Email
              </Label>
              <Input
                type="email"
                placeholder="client@company.com"
                value={values.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Phone
              </Label>
              <Input
                placeholder="+1 234 567 8900"
                value={values.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                WhatsApp Number
              </Label>
              <Input
                placeholder="+1 234 567 8900"
                value={values.whatsapp}
                onChange={(e) => set("whatsapp", e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Preferred Contact Method
              </Label>
              <Select
                value={values.preferred_contact_method}
                onValueChange={(v) => set("preferred_contact_method", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Country
              </Label>
              <Input
                placeholder="Country"
                value={values.country}
                onChange={(e) => set("country", e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                City
              </Label>
              <Input
                placeholder="City"
                value={values.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Full Address
              </Label>
              <Input
                placeholder="Street, area or full address (optional)"
                value={values.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="surface-card space-y-5 p-6">
          <h2 className="font-semibold">3. Requirement Details</h2>
          <div>
            <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
              Inquiry Title
            </Label>
            <Input
              placeholder="e.g. E-Commerce Website Development"
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Service / Product
              </Label>
              <Select value={values.service_id} onValueChange={(v) => set("service_id", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick from your service catalog" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Industry
              </Label>
              <Input
                placeholder="e.g. E-commerce, Healthcare, Real Estate"
                value={values.industry}
                onChange={(e) => set("industry", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
              Requirement Details <span className="text-destructive">*</span>
            </Label>
            <Textarea
              required
              rows={4}
              placeholder="Customer requires an e-commerce website with product management, customer registration, online payments, order management and an admin dashboard."
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Customer Budget
              </Label>
              <Select
                value={values.budget_range}
                onValueChange={(v) => {
                  set("budget_range", v);
                  if (v !== "Custom") set("estimated_budget", String(BUDGET_RANGE_VALUES[v] ?? 0));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUDGET_RANGES.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {values.budget_range === "Custom" ? (
                <Input
                  className="mt-2"
                  type="number"
                  placeholder="Custom amount ($)"
                  value={values.estimated_budget}
                  onChange={(e) => set("estimated_budget", e.target.value)}
                />
              ) : null}
            </div>
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Expected Deal Closure
              </Label>
              <Input
                type="date"
                value={values.expected_close_date}
                onChange={(e) => set("expected_close_date", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
              Tags
            </Label>
            <Input
              placeholder="hot_lead, follow_up, webinar_2024 (comma separated)"
              value={values.tags}
              onChange={(e) => set("tags", e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
              Notes
            </Label>
            <Textarea
              rows={3}
              placeholder="Additional notes..."
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </section>

        <section className="surface-card space-y-5 p-6">
          <h2 className="font-semibold">4. Qualification &amp; Follow-Up</h2>
          <div className="grid gap-5 sm:grid-cols-3">
            <YesNoField
              label="Requirement Clear?"
              value={values.requirement_clear}
              onChange={(v) => set("requirement_clear", v)}
            />
            <YesNoField
              label="Budget Known?"
              value={values.budget_known}
              onChange={(v) => set("budget_known", v)}
            />
            <YesNoField
              label="Decision Maker Identified?"
              value={values.decision_maker_known}
              onChange={(v) => set("decision_maker_known", v)}
            />
            <YesNoField
              label="Timeline Known?"
              value={values.timeline_known}
              onChange={(v) => set("timeline_known", v)}
            />
            <YesNoField
              label="Meeting Required?"
              value={values.meeting_required}
              onChange={(v) => set("meeting_required", v)}
            />
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Potential Value ($)
              </Label>
              <Input
                type="number"
                placeholder="Optional — quick sales estimate"
                value={values.potential_value}
                onChange={(e) => set("potential_value", e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Complexity
              </Label>
              <Select value={values.complexity} onValueChange={(v) => set("complexity", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPLEXITY_LEVELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Sets the rate used in the Basic Quotation email.
              </p>
            </div>
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Estimated Hours
              </Label>
              <Input
                type="number"
                placeholder="Optional — rough man-hours"
                value={values.estimated_hours}
                onChange={(e) => set("estimated_hours", e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Fill this in and the Basic Quotation email shows a real ballpark price (hours ×
                rate), and a Quote + Proposal draft are created automatically — nothing sends to the
                client until someone reviews and clicks Send.
              </p>
            </div>
          </div>
          <div className="grid gap-5 border-t border-border/60 pt-5 sm:grid-cols-3">
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Assigned To
              </Label>
              <OwnerCombobox
                value={values.owner}
                onValueChange={(v) => set("owner", v)}
                placeholder="Team member name"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Follow-Up Frequency
              </Label>
              <Select
                value={values.followup_frequency}
                onValueChange={(v) => set("followup_frequency", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOLLOWUP_FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Next Follow-Up
              </Label>
              <Input
                type="date"
                value={values.next_follow_up}
                onChange={(e) => set("next_follow_up", e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Log each individual follow-up call/email/meeting as its own dated record in the
            Follow-Ups section below, once the inquiry is saved.
          </p>
        </section>

        <section className="surface-card space-y-5 p-6">
          <h2 className="font-semibold">5. Auto Response</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Send Auto Response
              </Label>
              <div className="flex gap-2">
                {[
                  { text: "ON", val: true },
                  { text: "OFF", val: false },
                ].map((opt) => (
                  <button
                    key={opt.text}
                    type="button"
                    onClick={() => set("auto_response_enabled", opt.val)}
                    className={`flex-1 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                      values.auto_response_enabled === opt.val
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {opt.text}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
                Response Template
              </Label>
              <Select
                value={values.response_template}
                onValueChange={(v) => set("response_template", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESPONSE_TEMPLATES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {isEdit && recordId ? (
            <div className="space-y-3 border-t border-border/60 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowResponsePreview((s) => !s)}
                >
                  {showResponsePreview ? "Hide preview" : "Preview Response"}
                </Button>
                {values.email ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={sendingConfirmation || values.response_template === "Other"}
                    onClick={() => void sendConfirmation(values.response_template)}
                    title={
                      values.response_template === "Other"
                        ? '"Other" has no template behind it yet — pick a real template to send'
                        : undefined
                    }
                  >
                    <Mail className="size-4" />
                    {sendingConfirmation ? "Sending…" : "Send Response"}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Add a client email above to send a response.
                  </p>
                )}
              </div>
              {showResponsePreview ? (
                <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm whitespace-pre-line">
                  {values.response_template === "Inquiry Received"
                    ? `Thanks for your patience — here's a summary of what we have on file, reference ${existing.data?.display_id ?? "INQ-PENDING"}. Includes any configured links, process overview and refund policy from Company Profile.`
                    : values.response_template === "Basic Quotation"
                      ? `A rough $/hr ballpark quote based on the "${values.complexity}" complexity level set above (rate pulled from Company Profile → Response Email Settings), reference ${existing.data?.display_id ?? "INQ-PENDING"}.`
                      : values.response_template === "Meeting Request"
                        ? "Invites the client to book a call — uses the meeting link configured in Company Profile if one is set, otherwise asks them to reply with times that work."
                        : "This template isn't wired to an automatic send yet."}
                </div>
              ) : null}

              {values.email && values.auto_response_enabled ? (
                <div className="rounded-lg border border-border/60 p-3 text-xs text-muted-foreground">
                  <p className="mb-1.5 font-semibold uppercase tracking-wider text-[10px] text-muted-foreground/85">
                    Automated sequence
                  </p>
                  <ul className="space-y-1">
                    <li>Thank you — sent on save</li>
                    <li>
                      Basic Quotation —{" "}
                      {existing.data?.auto_quotation_sent
                        ? "sent"
                        : existing.data?.auto_quotation_send_at
                          ? `scheduled for ${dateTimeLabel(existing.data.auto_quotation_send_at)}`
                          : "not scheduled"}
                    </li>
                    <li>
                      Meeting Request —{" "}
                      {existing.data?.auto_meeting_sent
                        ? "sent"
                        : existing.data?.auto_meeting_send_at
                          ? `scheduled for ${dateTimeLabel(existing.data.auto_meeting_send_at)}`
                          : "not scheduled"}
                    </li>
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Save the inquiry first to preview or send a response.
            </p>
          )}
        </section>

        <section className="surface-card space-y-5 p-6">
          <h2 className="font-semibold">Status Pipeline</h2>
          <div className="flex items-center">
            {INQUIRY_STAGES.map((stage, i) => (
              <div key={stage} className="flex flex-1 items-center last:flex-none">
                <button
                  type="button"
                  onClick={() => set("status", stage)}
                  className="flex flex-col items-center gap-1.5"
                >
                  <span
                    className={`grid size-9 place-items-center rounded-full text-sm font-bold transition-colors ${
                      i <= stepIndex
                        ? "gradient-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {i < stepIndex ? <Check className="size-4" /> : i + 1}
                  </span>
                  <span
                    className={`text-xs font-medium whitespace-nowrap ${i === stepIndex ? "text-primary font-semibold" : "text-muted-foreground"}`}
                  >
                    {stage}
                  </span>
                </button>
                {i < INQUIRY_STAGES.length - 1 ? (
                  <div
                    className={`mx-2 h-px flex-1 ${i < stepIndex ? "bg-primary" : "bg-border"}`}
                  />
                ) : null}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85">
              Or mark as
            </Label>
            <button
              type="button"
              onClick={() => set("status", "Lost")}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                values.status === "Lost"
                  ? "border-destructive bg-destructive text-destructive-foreground"
                  : "border-border text-muted-foreground hover:border-destructive/40"
              }`}
            >
              Lost
            </button>
          </div>
        </section>

        {isEdit && recordId ? (
          <section className="surface-card space-y-5 p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Follow-Ups</h2>
              <RecordDialog
                table="inquiry_followups"
                label="Follow-Up"
                fields={
                  [
                    { name: "inquiry_id", label: "Inquiry", type: "hidden" },
                    {
                      name: "follow_up_date",
                      label: "Follow-up date",
                      type: "date",
                      required: true,
                    },
                    { name: "method", label: "Method", type: "select", options: FOLLOWUP_METHODS },
                    { name: "assigned_to", label: "Assigned to", type: "owner" },
                    { name: "note", label: "Follow-up note", type: "textarea", full: true },
                    {
                      name: "customer_response",
                      label: "Customer response",
                      full: true,
                    },
                    { name: "next_action", label: "Next action", full: true },
                    { name: "status", label: "Status", type: "select", options: FOLLOWUP_STATUSES },
                  ] as Field[]
                }
                defaults={{
                  inquiry_id: recordId,
                  follow_up_date: new Date().toISOString().slice(0, 10),
                  method: "Email",
                  status: "Completed",
                  assigned_to: values.owner,
                }}
                trigger={
                  <Button type="button" variant="outline" size="sm">
                    <Plus className="size-4" /> Add Follow-Up
                  </Button>
                }
              />
            </div>
            {linkedFollowUps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No follow-ups logged yet.</p>
            ) : (
              <ol className="divide-border divide-y">
                {linkedFollowUps.map((f, i) => (
                  <li key={f.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">Follow-up #{i + 1}</span>
                      <StatusBadge value={f.method} />
                      <StatusBadge value={f.status} />
                      <span className="text-xs text-muted-foreground">
                        {dateTimeLabel(f.follow_up_date)}
                        {f.assigned_to ? ` · ${f.assigned_to}` : ""}
                      </span>
                    </div>
                    {f.note ? <p className="mt-1.5 text-sm">{f.note}</p> : null}
                    {f.customer_response ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Response: {f.customer_response}
                      </p>
                    ) : null}
                    {f.next_action ? (
                      <p className="mt-1 text-xs text-muted-foreground">Next: {f.next_action}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        ) : null}

        {isEdit ? (
          <section className="surface-card space-y-4 p-6">
            <div>
              <h2 className="font-semibold">Related Records</h2>
              <p className="text-xs text-muted-foreground">
                Meetings, estimates and proposals linked to this inquiry.
              </p>
            </div>
            <div className="border-border/60 rounded-xl border p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted-foreground/85 uppercase">
                  <span className="bg-primary/10 text-primary grid size-6 place-items-center rounded-full">
                    <CalendarDays className="size-3.5" />
                  </span>
                  Meetings
                </p>
                <RecordDialog
                  table="meetings"
                  label="Meeting"
                  fields={
                    [
                      { name: "title", label: "Meeting title", required: true, full: true },
                      {
                        name: "starts_at",
                        label: "Date & time",
                        type: "datetime-local",
                        required: true,
                      },
                      { name: "duration_minutes", label: "Duration (minutes)", type: "number" },
                      { name: "attendees", label: "Attendees", full: true },
                      { name: "client", label: "Client" },
                      {
                        name: "kind",
                        label: "Type",
                        type: "select",
                        options: ["Meeting", "Demo", "Workshop", "Review"],
                      },
                      {
                        name: "status",
                        label: "Status",
                        type: "select",
                        options: ["Scheduled", "Completed", "Cancelled"],
                      },
                      { name: "link", label: "Meeting link", full: true },
                      { name: "notes", label: "Agenda / notes", type: "textarea" },
                      { name: "inquiry_id", label: "Inquiry", type: "hidden" },
                    ] as Field[]
                  }
                  defaults={{
                    status: "Scheduled",
                    kind: "Meeting",
                    duration_minutes: "30",
                    client: values.client_name,
                    inquiry_id: recordId ?? "",
                  }}
                  trigger={
                    <Button type="button" variant="outline" size="sm">
                      <Plus className="size-4" /> Schedule meeting
                    </Button>
                  }
                />
              </div>
              {linkedMeetings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No meetings linked yet.</p>
              ) : (
                <ul className="divide-border divide-y">
                  {linkedMeetings.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{m.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {dateTimeLabel(m.starts_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge value={m.status} />
                        <Button asChild variant="ghost" size="sm">
                          <Link to="/meeting">
                            Open <ExternalLink className="size-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-border/60 rounded-xl border p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted-foreground/85 uppercase">
                  <span className="bg-primary/10 text-primary grid size-6 place-items-center rounded-full">
                    <FileText className="size-3.5" />
                  </span>
                  Quotes / Estimates
                </p>
                <QuoteCalculatorDialog
                  defaultInquiryId={recordId}
                  defaultTitle={`${values.client_name} — Proposal`}
                  trigger={
                    <Button type="button" variant="outline" size="sm">
                      <Plus className="size-4" /> Add estimate
                    </Button>
                  }
                />
              </div>
              {linkedQuotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No estimate yet. Fill in Estimated Hours above and send the Basic Quotation email
                  — one gets created automatically. Or add one by hand here.
                </p>
              ) : (
                <ul className="divide-border divide-y">
                  {linkedQuotes.map((q) => (
                    <li key={q.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{q.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {currency(q.suggested_price)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge value={q.status} />
                        <Button asChild variant="ghost" size="sm">
                          <Link to="/estimations/$quoteId" params={{ quoteId: q.id }}>
                            Open <ExternalLink className="size-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-border/60 rounded-xl border p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted-foreground/85 uppercase">
                  <span className="bg-primary/10 text-primary grid size-6 place-items-center rounded-full">
                    <ScrollText className="size-3.5" />
                  </span>
                  Proposal Documents
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={creatingProposal || !recordId}
                  onClick={() =>
                    void createProposal({
                      inquiryId: recordId!,
                      title: `${values.client_name} — Proposal`,
                      template: "Custom Software Development",
                      ownerName: values.owner,
                      clientEmail: values.email,
                      quoteId:
                        linkedQuotes.find((q) => q.status === "Accepted")?.id ??
                        linkedQuotes[linkedQuotes.length - 1]?.id ??
                        null,
                    })
                  }
                >
                  <Plus className="size-4" /> {creatingProposal ? "Drafting…" : "New proposal"}
                </Button>
              </div>
              {linkedProposals.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No proposal document yet — same auto-creation applies here as Quotes/Estimates
                  above, or draft one manually once an estimate exists.
                </p>
              ) : (
                <ul className="divide-border divide-y">
                  {linkedProposals.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {p.title}{" "}
                          <span className="font-normal text-muted-foreground">v{p.version}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.display_id ?? "—"} · {currency(p.cost ?? 0)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge value={p.status} />
                        <Button asChild variant="ghost" size="sm">
                          <Link to="/proposals/$proposalId" params={{ proposalId: p.id }}>
                            Open <ExternalLink className="size-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : null}

        <section className="surface-card space-y-4 p-6">
          <h2 className="font-semibold">Attachments</h2>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void addFiles(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <Upload className="text-muted-foreground size-6" />
            <p className="text-sm">Drag and drop files here, or click to browse</p>
            <p className="text-xs text-muted-foreground">PDF, DOC, XLS, images up to 10MB</p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold">
              + Add Files
            </span>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => void addFiles(e.target.files)}
            />
          </label>
          {attachments.length ? (
            <ul className="space-y-1.5">
              {attachments.map((f) => (
                <li
                  key={f.name}
                  className="bg-muted/50 flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Paperclip className="text-muted-foreground size-3.5 shrink-0" />
                    <span className="truncate">{f.name}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {formatSize(f.size)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(f.name)}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => void navigate({ to: "/inquiries" })}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending} className="min-w-[160px]">
            <Save className="size-4" />
            {save.isPending ? "Saving…" : "Save Inquiry"}
          </Button>
        </div>
      </form>
    </div>
  );
}
