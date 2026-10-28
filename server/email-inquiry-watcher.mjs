import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

import { createRow, listRows, getRow, updateRow, appendActivityLog, nextDisplayId } from "./db.mjs";
import { sendMail } from "./mail.mjs";
import { buildInquiryThankYouEmail, buildInternalAlertEmail } from "./inquiry-mail.mjs";
import { notify } from "./notifications.mjs";
import { matchExistingContact, resolveAccountForContact } from "./matching.mjs";

// --- "2. Email → ERP" from the pipeline diagram -----------------------------
//
// Watches the same Gmail inbox already used to send outbound mail
// (SMTP_USER) for new, unread messages, and turns each one straight into an
// Inquiry — no one has to copy a client's email into the CRM by hand.
//
// Reuses the SMTP credentials already in server/.env by default. Gmail app
// passwords work for both SMTP and IMAP once 2-Step Verification is on, but
// IMAP access itself has to be turned on separately for the account:
// Gmail → Settings → See all settings → "Forwarding and POP/IMAP" → Enable
// IMAP → Save changes. Without that, every run below fails to connect and
// just logs the error — it never crashes the rest of the server.

const IMAP_HOST = process.env.IMAP_HOST || "imap.gmail.com";
const IMAP_PORT = Number(process.env.IMAP_PORT || 993);
const IMAP_USER = process.env.IMAP_USER || process.env.SMTP_USER;
const IMAP_PASSWORD = process.env.IMAP_APP_PASSWORD || process.env.SMTP_APP_PASSWORD;

function isConfigured() {
  return Boolean(IMAP_USER && IMAP_PASSWORD);
}

// Same closed-stage list index.mjs and jobs.mjs each already keep locally —
// small enough that duplicating it here beats importing across files that
// would otherwise circularly depend on each other.
const CLOSED_INQUIRY_STATUSES = ["Deal Done", "Lost"];
const INQUIRY_STAGE_ORDER = ["New", "In Review", "Responded", "Proposal Sent", "Deal Done"];
function advancedStatus(currentStatus, targetStatus) {
  if (CLOSED_INQUIRY_STATUSES.includes(currentStatus)) return null;
  const currentIndex = INQUIRY_STAGE_ORDER.indexOf(currentStatus);
  const targetIndex = INQUIRY_STAGE_ORDER.indexOf(targetStatus);
  if (targetIndex <= currentIndex) return null;
  return targetStatus;
}

// Inbound mail we never want to turn into an inquiry: delivery bounces,
// no-reply notification blasts, mailing-list noise, or the account's own
// address somehow mailing itself.
const IGNORE_SENDER_PATTERNS = [/mailer-daemon/i, /postmaster/i, /no-?reply/i, /^notifications?@/i];

function looksAutomated(parsed, fromAddress) {
  if (IGNORE_SENDER_PATTERNS.some((re) => re.test(fromAddress))) return true;
  const autoSubmitted = parsed.headers.get("auto-submitted");
  if (autoSubmitted && String(autoSubmitted).toLowerCase() !== "no") return true;
  if (parsed.headers.get("x-autoreply") || parsed.headers.get("x-autorespond")) return true;
  return false;
}

// "Is sender internal?" — a teammate emailing this inbox (CC'd on
// something, replying to an internal thread) should never turn into a
// lead. Two signals, both from real data already on file, nothing
// hardcoded: an exact match against an active Employee's email, or the
// sender's domain matching the company's own configured domain.
async function isInternalSender(fromAddress, company) {
  const employees = await listRows("employees");
  if (employees.some((e) => e.email && e.email.toLowerCase() === fromAddress)) return true;
  const companyDomain = company?.email?.split("@")[1]?.toLowerCase();
  const senderDomain = fromAddress.split("@")[1];
  if (companyDomain && senderDomain === companyDomain) return true;
  return false;
}

// "Is it a potential client inquiry?" — a simple, deterministic filter
// (no AI call, nothing that can hallucinate) for the obviously-not-a-lead
// case: a near-empty body, or the footer language every bulk marketing
// newsletter tool stamps on its sends. A real inquiry almost never has
// either of these; a promo blast almost always has at least one.
const MARKETING_FOOTER_PATTERNS = [
  /unsubscribe/i,
  /view (this|it) in (your )?browser/i,
  /you('| a)re receiving this (email|newsletter)/i,
  /manage your (email )?preferences/i,
];
function looksLikeMarketingOrNoise(body) {
  const trimmed = body.trim();
  if (trimmed.length < 15 || trimmed === "(no message body)") return true;
  return MARKETING_FOOTER_PATTERNS.some((re) => re.test(trimmed));
}

// Matches the same { name, size, type, data_url } shape the Inquiry form
// already uses for uploads (src/components/inquiry-form.tsx) — inline
// base64, no separate file storage to wire up. Capped per-file and per-
// message so one oversized email can't blow past the 10mb JSON body limit
// the rest of the API already enforces.
function extractAttachments(parsed) {
  return (parsed.attachments || [])
    .filter((a) => a.content && a.size && a.size < 8 * 1024 * 1024)
    .slice(0, 5)
    .map((a) => ({
      name: a.filename || "attachment",
      size: a.size,
      type: a.contentType || "application/octet-stream",
      data_url: `data:${a.contentType || "application/octet-stream"};base64,${a.content.toString("base64")}`,
    }));
}

function bodyText(parsed) {
  const text = (parsed.text || "").trim();
  if (text) return text.slice(0, 4000);
  // No plain-text part — fall back to a tag-stripped version of the HTML.
  const html = (parsed.html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return html.slice(0, 4000) || "(no message body)";
}

// Same Thank You + internal alert every other creation path fires
// (server/index.mjs's onInquiryCreated) — duplicated here rather than
// imported, since index.mjs is the process entrypoint and importing back
// into it from here would be circular.
async function sendThankYouAndAlert(inquiry) {
  const now = new Date().toISOString();
  const company = await getRow("company_profile", "default");
  try {
    if (inquiry.email && inquiry.auto_response_enabled !== false) {
      const { subject, html } = buildInquiryThankYouEmail(inquiry, company);
      await sendMail({ to: inquiry.email, subject, html });
      await appendActivityLog("inquiries", inquiry.id, {
        type: "email",
        message: `Thank-you email sent to ${inquiry.email}`,
        at: now,
      });
    }
  } catch (err) {
    console.error("[email watcher] thank-you send failed:", err);
    await appendActivityLog("inquiries", inquiry.id, {
      type: "email_failed",
      message: `Thank-you email failed: ${err.message}`,
      at: now,
    }).catch(() => {});
  }
  try {
    const subs = await listRows("report_subscriptions");
    const recipients = subs
      .filter((s) => s.report_type === "InquiryAlert" && s.status === "Active")
      .map((s) => s.recipients)
      .filter(Boolean);
    const to =
      recipients.length > 0
        ? recipients.join(", ")
        : process.env.INTERNAL_ALERT_EMAIL || company?.email || null;
    if (to) {
      const { subject, html } = buildInternalAlertEmail(inquiry, company);
      await sendMail({ to, subject, html });
      await appendActivityLog("inquiries", inquiry.id, {
        type: "internal_alert",
        message: `Internal team notified (${to}).`,
        at: now,
      });
    }
  } catch (err) {
    console.error("[email watcher] internal alert failed:", err);
  }
}

// "Check Duplicate Customer" — anyone who already has an open inquiry on
// file gets this new message added to that record's timeline instead of a
// second Inquiry being created, whether or not the subject line says
// "Re:"/"Fwd:" (plenty of real clients start a fresh subject line on a
// second email and still mean the same conversation). The same idea as the
// "follow-up logged -> In Review" trigger, just arriving by email.
async function tryLinkAsReply(subject, fromAddress) {
  const inquiries = await listRows("inquiries");
  const existing = inquiries
    .filter(
      (i) =>
        i.email &&
        i.email.toLowerCase() === fromAddress &&
        !CLOSED_INQUIRY_STATUSES.includes(i.status),
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  if (!existing) return false;

  const now = new Date().toISOString();
  await appendActivityLog("inquiries", existing.id, {
    type: "email_reply",
    message: `Reply received from ${fromAddress}: "${subject}"`,
    at: now,
  });
  const nextStatus = advancedStatus(existing.status, "In Review");
  if (nextStatus) {
    await updateRow("inquiries", existing.id, { status: nextStatus });
  }
  console.log(`[email watcher] linked reply from ${fromAddress} to ${existing.display_id}.`);
  return true;
}

// Exported (rather than kept private) so it's directly testable end to end
// with a real mailparser-parsed message, without needing a live IMAP round
// trip for every test.
export async function handleMessage(parsed) {
  const fromAddress = (parsed.from?.value?.[0]?.address || "").toLowerCase().trim();
  const fromName = parsed.from?.value?.[0]?.name?.trim() || fromAddress || "Unknown sender";
  const subject = (parsed.subject || "(no subject)").trim();

  if (!fromAddress) {
    console.log("[email watcher] skipped a message with no readable From address.");
    return;
  }
  if (IMAP_USER && fromAddress === IMAP_USER.toLowerCase()) {
    return; // the account mailing itself — never an inquiry
  }
  if (looksAutomated(parsed, fromAddress)) {
    console.log(`[email watcher] skipped automated/no-reply message from ${fromAddress}.`);
    return;
  }

  const company = await getRow("company_profile", "default");
  if (await isInternalSender(fromAddress, company)) {
    console.log(`[email watcher] skipped internal sender ${fromAddress}.`);
    return;
  }

  // Existing customer, any subject line -> goes on their timeline, never a
  // second Inquiry.
  if (await tryLinkAsReply(subject, fromAddress)) return;

  const body = bodyText(parsed);
  if (looksLikeMarketingOrNoise(body)) {
    console.log(`[email watcher] skipped low-signal/marketing-looking message from ${fromAddress}.`);
    return; // left as a read email in the inbox — not lost, just not an Inquiry
  }

  const now = new Date().toISOString();
  const nowMs = Date.now();
  const attachments = extractAttachments(parsed);
  // Customer Matching — same as the other two intake paths (public web form, WhatsApp):
  // is this sender already a known contact? Duplicate checking for Email already exists
  // above (tryLinkAsReply) — this is the account-matching half that was still missing.
  const matchedContact = await matchExistingContact(fromAddress, null);
  const matchedAccount = matchedContact ? await resolveAccountForContact(matchedContact) : null;
  const row = await createRow("inquiries", {
    client_name: fromName.slice(0, 200),
    company: null,
    phone: null,
    email: fromAddress,
    description: `Subject: ${subject}\n\n${bodyText(parsed)}`,
    service_id: null,
    industry: null,
    source: "Email",
    // Distinct field from `source` — the edit form falls back to "Website Form" for
    // source_medium when it's unset, so this was showing wrong for every email-sourced
    // inquiry too, same gap as the Web Form and WhatsApp routes.
    source_medium: "Email",
    priority: "Medium",
    status: "New",
    owner: null,
    account_id: matchedAccount?.id || null,
    tags: [],
    notes: null,
    preferred_contact_method: "Email",
    estimated_budget: 0,
    expected_close_date: null,
    address: null,
    received_date: now,
    next_follow_up: null,
    deal_id: null,
    attachments,
    activity_log: [
      { type: "created", message: `Inquiry received by email from ${fromAddress}.`, at: now },
      ...(matchedContact
        ? [{
          type: "matched",
          message: `Matched to existing contact: ${matchedContact.name}${matchedAccount ? ` (${matchedAccount.name})` : ""}`,
          at: now,
        }]
        : []),
    ],
    created_by: "Email (auto-captured)",
    auto_response_enabled: true,
    auto_quotation_send_at: new Date(nowMs + 30 * 60 * 1000).toISOString(),
    auto_meeting_send_at: new Date(nowMs + 60 * 60 * 1000).toISOString(),
    client_approved: false,
    client_approved_at: null,
    client_approved_by: null,
  });
  const display_id = await nextDisplayId("INQ");
  const updated = (await updateRow("inquiries", row.id, { display_id })) ?? row;
  console.log(`[email watcher] created ${display_id} from an email from ${fromAddress}.`);
  // Unowned, same as the website path — an Admin/Super Admin sees it right
  // away for triage; a Salesman only sees it once it's actually assigned to
  // them.
  await notify({
    type: "inquiries_created",
    message: `New inquiry from ${updated.client_name} — via Email`,
    link: "/inquiries",
    owner: null,
    actor: null,
  }).catch((err) => console.error("[email watcher] notification failed:", err));
  await sendThankYouAndAlert(updated);
}

export async function runEmailInquiryWatcher() {
  if (!isConfigured()) {
    console.log(
      "[email watcher] no IMAP_USER/IMAP_APP_PASSWORD (or SMTP_USER/SMTP_APP_PASSWORD) configured — skipping.",
    );
    return;
  }
  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: IMAP_USER, pass: IMAP_PASSWORD },
    logger: false,
  });
  // ImapFlow emits socket failures (e.g. a timeout after a failed connect)
  // as an 'error' event; with no listener Node treats that as an uncaught
  // exception and takes the whole API server down with it.
  client.on("error", (err) => {
    console.error("[email watcher] IMAP error:", err.message);
  });
  try {
    await client.connect();
  } catch (err) {
    console.error("[email watcher] IMAP connection failed:", err.message);
    return;
  }
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      if (!uids || uids.length === 0) return;
      for (const uid of uids) {
        try {
          const message = await client.fetchOne(uid, { source: true }, { uid: true });
          if (!message?.source) continue;
          const parsed = await simpleParser(message.source);
          await handleMessage(parsed);
        } catch (err) {
          console.error(`[email watcher] failed processing message uid ${uid}:`, err);
        } finally {
          // Always mark it seen, even on failure — otherwise one malformed
          // message would get retried forever and block everything behind it.
          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true }).catch(() => {});
        }
      }
      console.log(`[email watcher] processed ${uids.length} new message(s).`);
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error("[email watcher] run failed:", err);
  } finally {
    await client.logout().catch(() => {});
  }
}
