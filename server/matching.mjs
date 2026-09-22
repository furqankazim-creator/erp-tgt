// Shared by all three intake paths (Website's /api/public/inquiries, the email watcher,
// and ChatApp's WhatsApp intake) so "does this inquiry belong to someone we already know"
// and "did this person already submit an open inquiry" are answered the same way
// regardless of which channel it came in on — previously only the email watcher had any
// of this, and even that didn't resolve an Account.
import { listRows } from "./db.mjs";

const CLOSED_INQUIRY_STATUSES = ["Deal Done", "Lost"];

function normalizeEmail(email) {
  return email?.trim().toLowerCase() || null;
}

// Phone numbers arrive in wildly different formats across channels (a WhatsApp JID's raw
// digits vs. a human-typed "+971 50 118 2200") — comparing on digits only is what makes a
// match actually findable across sources, not just within one.
function normalizePhone(phone) {
  const digits = phone?.replace(/[^\d]/g, "");
  return digits && digits.length >= 7 ? digits : null;
}

// "Customer Matching" — is this inquiry from someone already in the CRM (the `contacts`
// collection, which is where email/phone actually live in this data model — `accounts`
// has neither)? Matches by email first (more reliable/unique than phone across formats),
// falls back to phone. Best-effort only, never blocks inquiry creation either way.
export async function matchExistingContact(email, phone) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedEmail && !normalizedPhone) return null;

  const contacts = await listRows("contacts");
  return (
    contacts.find((c) => {
      if (normalizedEmail && normalizeEmail(c.email) === normalizedEmail) return true;
      if (normalizedPhone && normalizePhone(c.phone) === normalizedPhone) return true;
      return false;
    }) || null
  );
}

// A matched Contact's `company` is free text, not a real id-linked relationship to
// `accounts` in this data model (verified against the live data, not just the seed file's
// authoring convenience) — this resolves it to a real Account only on an exact
// case-insensitive name match, so it's a *suggestion* for account_id, never assumed
// correct outright.
export async function resolveAccountForContact(contact) {
  const company = contact?.company?.trim().toLowerCase();
  if (!company) return null;
  const accounts = await listRows("accounts");
  return accounts.find((a) => a.name?.trim().toLowerCase() === company) || null;
}

// "Duplicate Checking" — an existing *open* inquiry from this same email means this new
// submission is a follow-up on that lead, not a second one. Mirrors the pattern the email
// watcher already had (tryLinkAsReply in email-inquiry-watcher.mjs), generalized so every
// intake path gets the same protection instead of only Email having it.
export async function findOpenInquiryByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const inquiries = await listRows("inquiries");
  return (
    inquiries
      .filter((i) => normalizeEmail(i.email) === normalized && !CLOSED_INQUIRY_STATUSES.includes(i.status))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null
  );
}
