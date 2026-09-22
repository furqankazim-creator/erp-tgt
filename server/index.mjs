import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";

import {
  TABLES,
  connectDB,
  listRows,
  getRow,
  createRow,
  updateRow,
  appendActivityLog,
  deleteRow,
  nextDisplayId,
  findUserByEmail,
  findUserByEmailWithPassword,
  findUserById,
  createUser,
  verifyPassword,
  listUsers,
  updateUserAccount,
} from "./db.mjs";
import { sendMail } from "./mail.mjs";
import { startJobs } from "./jobs.mjs";
import pmRouter, { initPmCollections } from "./pmconnect.mjs";
import {
  buildInquiryThankYouEmail,
  buildInquiryConfirmationEmail,
  buildInternalAlertEmail,
  buildBasicQuotationEmail,
  buildMeetingRequestEmail,
  buildMeetingMinutesEmail,
} from "./inquiry-mail.mjs";
import { notify } from "./notifications.mjs";
import { buildProposalDraft, buildProposalPdf, buildProposalSentEmail } from "./proposal-lib.mjs";
import { autoEstimateFromInquiry } from "./auto-estimate.mjs";
import { matchExistingContact, resolveAccountForContact, findOpenInquiryByEmail } from "./matching.mjs";

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production-local-dev-fallback-12345";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30d";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    access_role: user.access_role ?? "developer",
    active: user.active ?? true,
    user_metadata: { full_name: user.full_name },
  };
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.access_role ?? "developer" }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

function requireAuth(req, res, next) {
  const header = req.headers["authorization"];
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    req.userRole = payload.role ?? "developer";
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  next();
}

/** Gate a route to specific access roles. Must run after requireAuth. */
function requireRole(...allowed) {
  return (req, res, next) => {
    if (!allowed.includes(req.userRole)) {
      return res.status(403).json({ error: "You don't have permission to do this." });
    }
    next();
  };
}

// Basic per-IP throttle for the unauthenticated public inquiry form — no new
// dependency needed for a sliding window this simple. Not meant to stop a
// determined attacker, just casual spam/bot floods against an open endpoint.
const publicHits = new Map();
function publicRateLimit(max, windowMs) {
  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    const hits = (publicHits.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= max) {
      return res.status(429).json({ error: "Too many submissions. Please try again later." });
    }
    hits.push(now);
    publicHits.set(ip, hits);
    next();
  };
}

function requireTable(req, res, next) {
  if (!TABLES.includes(req.params.table)) {
    return res.status(404).json({ error: `Unknown table "${req.params.table}"` });
  }
  next();
}

// Trusted server-to-server intake for the ChatApp WhatsApp sync — not a
// browser, so a shared secret instead of a login session. Fails closed: if
// the key isn't configured on this server at all, every request is refused
// rather than silently accepted unauthenticated.
function requireIntegrationKey(req, res, next) {
  const expected = process.env.WHATSAPP_INTEGRATION_KEY;
  if (!expected) {
    return res.status(503).json({ error: "WhatsApp integration is not configured on this server." });
  }
  if (req.headers["x-integration-key"] !== expected) {
    return res.status(401).json({ error: "Invalid integration key" });
  }
  next();
}

app.use("/api/pmconnect", pmRouter);

app.get("/api/health", (req, res) => res.json({ ok: true, tables: TABLES }));

// Account creation is admin-gated, not public self-signup — only Super Admin
// and Admin can create new accounts (Admin can create Developer or Salesman
// accounts; Super Admin can also create Admin accounts).
app.post(
  "/api/auth/register",
  requireAuth,
  requireRole("super_admin", "admin"),
  async (req, res, next) => {
    try {
      const { email, password, full_name } = req.body ?? {};
      let { access_role } = req.body ?? {};
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      if (req.userRole === "admin") {
        // Admin can create Developer or Salesman, never Admin.
        if (!["developer", "salesman"].includes(access_role)) access_role = "developer";
      } else if (!["developer", "salesman", "admin"].includes(access_role)) {
        access_role = "developer"; // Super Admin: default to Developer unless something else was picked
      }
      const existing = await findUserByEmail(email);
      if (existing) {
        return res.status(409).json({ error: "An account with this email already exists." });
      }
      const user = await createUser({ email, password, full_name, access_role });
      res.status(201).json({ user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  },
);

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    const user = await findUserByEmailWithPassword(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    if (user.active === false) {
      return res.status(403).json({ error: "This account has been deactivated." });
    }
    const valid = await verifyPassword(user, password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    const token = signToken(user);
    res.json({ user: publicUser(user), token });
  } catch (err) {
    next(err);
  }
});

// List accounts for the Settings page. Admin only sees Developer/Salesman
// accounts (not other Admins/Super Admin); Super Admin sees everyone.
app.get(
  "/api/auth/accounts",
  requireAuth,
  requireRole("super_admin", "admin"),
  async (req, res, next) => {
    try {
      const users = await listUsers();
      const visible =
        req.userRole === "admin"
          ? users.filter((u) => ["developer", "salesman"].includes(u.access_role ?? "developer"))
          : users;
      res.json(visible.map(publicUser));
    } catch (err) {
      next(err);
    }
  },
);

// Change an account's role or active status — Super Admin only.
app.patch(
  "/api/auth/accounts/:id",
  requireAuth,
  requireRole("super_admin"),
  async (req, res, next) => {
    try {
      const { access_role, active } = req.body ?? {};
      const patch = {};
      if (access_role !== undefined) {
        if (!["developer", "salesman", "admin"].includes(access_role)) {
          return res
            .status(400)
            .json({ error: "access_role must be 'developer', 'salesman' or 'admin'." });
        }
        patch.access_role = access_role;
      }
      if (active !== undefined) patch.active = Boolean(active);
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "Nothing to update." });
      }
      const updated = await updateUserAccount(req.params.id, patch);
      if (!updated) return res.status(404).json({ error: "Account not found." });
      res.json(publicUser(updated));
    } catch (err) {
      next(err);
    }
  },
);

app.get("/api/auth/me", requireAuth, async (req, res, next) => {
  try {
    const user = await findUserById(req.userId);
    if (!user) return res.status(401).json({ error: "User not found" });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.status(204).end();
});

app.post("/api/reports/send", requireAuth, async (req, res) => {
  const { to, subject, html, attachmentBase64, attachmentFilename } = req.body ?? {};
  if (!to || !subject) {
    return res.status(400).json({ error: "Recipient and subject are required" });
  }
  try {
    await sendMail({ to, subject, html, attachmentBase64, attachmentFilename });
    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to send report email:", err);
    res.status(500).json({ error: err.message || "Failed to send email" });
  }
});

// --- Public, unauthenticated intake (Step 1 of the inquiry workflow) ---
// Lets a real website form (or this app's own /inquire page) submit a lead
// straight into the CRM without a login. Fields are explicitly whitelisted —
// this endpoint must never accept arbitrary writes the way the authenticated
// generic CRUD routes do. Registered before the generic /api/:table routes
// so "/api/public/..." is matched here first, not treated as table "public".

app.get("/api/public/company", async (req, res, next) => {
  try {
    const c = await getRow("company_profile", "default");
    if (!c) return res.json(null);
    const { display_name, legal_name, tagline, phone, email, website } = c;
    res.json({ display_name, legal_name, tagline, phone, email, website });
  } catch (err) {
    next(err);
  }
});

app.get("/api/public/services", async (req, res, next) => {
  try {
    const services = await listRows("products_services");
    res.json(
      services
        .filter((s) => s.status !== "Discontinued")
        .map((s) => ({ id: s.id, name: s.name, category: s.category })),
    );
  } catch (err) {
    next(err);
  }
});

// A website's own contact form rarely knows the internal service_id from
// your catalog — let it send a plain "service" label instead (e.g. "ERP
// Development") and fold it into the message so it's still visible at a
// glance, without trying to fuzzy-match it to a real catalog row.
function describeWithService(description, service) {
  const trimmed = description.trim().slice(0, 4000);
  const label = service?.trim().slice(0, 200);
  if (!label) return trimmed;
  return `Service interest: ${label}\n\n${trimmed}`.slice(0, 4000);
}

// Same { name, size, type, data_url } shape the Inquiry form itself uses
// (src/components/inquiry-form.tsx) — inline base64, capped so a handful of
// files can't blow past the 10mb JSON body limit on the whole request.
function sanitizePublicAttachments(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((a) => a && typeof a.data_url === "string" && a.data_url.startsWith("data:"))
    .slice(0, 5)
    .map((a) => ({
      name: String(a.name || "attachment").slice(0, 200),
      size: Number(a.size) || 0,
      type: String(a.type || "application/octet-stream").slice(0, 100),
      data_url: a.data_url,
    }));
}

// Same options and representative dollar values as the internal Inquiry
// form's BUDGET_RANGES/BUDGET_RANGE_VALUES (src/components/inquiry-form.tsx)
// — a public form doesn't get to type an exact number, just pick a bracket,
// same as an internal user does.
const PUBLIC_BUDGET_RANGES = {
  "Not Specified": 0,
  "Under $1,000": 999,
  "$1,000–$5,000": 5000,
  "$5,000–$10,000": 10000,
  "$10,000+": 15000,
};
const PUBLIC_CONTACT_METHODS = ["Email", "Phone", "WhatsApp", "SMS"];

app.post("/api/public/inquiries", publicRateLimit(8, 15 * 60 * 1000), async (req, res, next) => {
  try {
    const {
      client_name,
      company,
      phone,
      email,
      description,
      service_id,
      service,
      industry,
      attachments,
      budget_range,
      preferred_contact_method,
    } = req.body ?? {};
    if (!client_name?.trim() || !description?.trim()) {
      return res.status(400).json({ error: "Name and message are required." });
    }

    // Duplicate Checking — this source never had it before (unlike Email's own
    // tryLinkAsReply in email-inquiry-watcher.mjs, and WhatsApp's isInquiryOpen check in
    // ChatApp) even though it's just as reachable by a client resubmitting the same
    // contact form twice. An existing *open* inquiry from this same email means this is a
    // follow-up, not a second lead — logged onto that inquiry's own timeline instead of
    // creating a disconnected duplicate record.
    const existingOpen = await findOpenInquiryByEmail(email);
    if (existingOpen) {
      const replyAt = new Date().toISOString();
      await appendActivityLog("inquiries", existingOpen.id, {
        type: "web_form_reply",
        message: `Follow-up submitted via the public website form: "${description.trim().slice(0, 300)}"`,
        at: replyAt,
      });
      return res.status(200).json({ ok: true, id: existingOpen.id, display_id: existingOpen.display_id, linkedToExisting: true });
    }

    // Customer Matching — is this from someone already in the CRM (the `contacts`
    // collection, where email/phone actually live)? A repeat client shouldn't start every
    // new inquiry as a total stranger. Best-effort: never blocks creation either way.
    const matchedContact = await matchExistingContact(email, phone);
    const matchedAccount = matchedContact ? await resolveAccountForContact(matchedContact) : null;

    const resolvedBudgetRange =
      budget_range && Object.hasOwn(PUBLIC_BUDGET_RANGES, budget_range)
        ? budget_range
        : "Not Specified";
    const resolvedContactMethod = PUBLIC_CONTACT_METHODS.includes(preferred_contact_method)
      ? preferred_contact_method
      : "Email";
    const now = new Date().toISOString();
    const nowMs = Date.now();
    const display_id = await nextDisplayId("INQ");
    const row = await createRow("inquiries", {
      display_id,
      client_name: client_name.trim().slice(0, 200),
      company: company?.trim().slice(0, 200) || null,
      phone: phone?.trim().slice(0, 60) || null,
      email: email?.trim().slice(0, 200) || null,
      description: describeWithService(description, service),
      service_id: service_id || null,
      industry: industry?.trim().slice(0, 200) || null,
      source: "Web Form",
      // `source` and `source_medium` are two separate fields on this record (the edit
      // form falls back to "Website Form" for source_medium when it's unset) — every
      // intake route was only ever setting `source`, so this one just happened to look
      // right by coincidence of that fallback value, not because it was actually set.
      source_medium: "Website Form",
      priority: "Medium",
      status: "New",
      owner: null,
      account_id: matchedAccount?.id || null,
      tags: [],
      notes: null,
      preferred_contact_method: resolvedContactMethod,
      budget_range: resolvedBudgetRange,
      estimated_budget: PUBLIC_BUDGET_RANGES[resolvedBudgetRange],
      expected_close_date: null,
      address: null,
      received_date: now,
      next_follow_up: null,
      deal_id: null,
      attachments: sanitizePublicAttachments(attachments),
      activity_log: [
        { type: "created", message: "Inquiry submitted via public website form.", at: now },
        ...(matchedContact
          ? [{
            type: "matched",
            message: `Matched to existing contact: ${matchedContact.name}${matchedAccount ? ` (${matchedAccount.name})` : ""}`,
            at: now,
          }]
          : []),
      ],
      created_by: "Website (public form)",
      auto_response_enabled: true,
      // Same drip schedule as the authenticated create path — Thank You
      // fires immediately below, Basic Quotation in 30 minutes, Meeting
      // Request 30 minutes after that (T+60 total), picked up by the
      // auto-response-sequence cron job.
      auto_quotation_send_at: email?.trim() ? new Date(nowMs + 30 * 60 * 1000).toISOString() : null,
      auto_meeting_send_at: email?.trim()
        ? new Date(nowMs + 60 * 60 * 1000).toISOString()
        : null,
      client_approved: false,
      client_approved_at: null,
      client_approved_by: null,
    });
    res.status(201).json({ ok: true, id: row.id });
    void onInquiryCreated(row);
    // A website submission has no logged-in "actor" to notify as, so this
    // isn't scoped to anyone's owner field — it goes out unowned, which
    // means every Admin/Super Admin sees it (a Salesman only sees
    // notifications already owned by them, so this correctly stays out of
    // their feed until the inquiry is actually assigned to someone).
    void notify({
      type: "inquiries_created",
      message: ACTIVITY_NOTIFY_MESSAGE.inquiries(row),
      link: ACTIVITY_NOTIFY_LINK.inquiries,
      owner: null,
      actor: null,
    }).catch((err) => console.error("[notify] website inquiry notification failed:", err));
  } catch (err) {
    next(err);
  }
});

// The "Inquiry link" the workflow diagram calls for — a client-facing,
// no-login status page. Looked up by the internal UUID (unguessable),
// never the sequential display_id, and returns only fields safe to show a
// client — no notes, budget, owner, email/phone, or activity log.
app.get(
  "/api/public/inquiries/:id/status",
  publicRateLimit(30, 15 * 60 * 1000),
  async (req, res, next) => {
    try {
      const inquiry = await getRow("inquiries", req.params.id);
      if (!inquiry) return res.status(404).json({ error: "Inquiry not found" });
      const company = await getRow("company_profile", "default");
      res.json({
        display_id: inquiry.display_id,
        client_name: inquiry.client_name,
        status: inquiry.status,
        received_date: inquiry.received_date,
        expected_close_date: inquiry.expected_close_date,
        company: {
          display_name: company?.display_name ?? null,
          phone: company?.phone ?? null,
          email: company?.email ?? null,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// Lets ChatApp offer a real picker — search by inquiry number or client name — instead
// of only ever guessing "whichever inquiry this chat happens to already be linked to."
// A message's detail doesn't always belong to that guess (a client with more than one
// live inquiry, or a chat that was never explicitly linked yet), so the admin should be
// able to deliberately choose the target. Small, capped result set — this is a picker,
// not a full inquiry list/export.
app.get(
  "/api/integrations/whatsapp/inquiries/search",
  requireIntegrationKey,
  async (req, res, next) => {
    try {
      const q = (req.query.q || "").trim().toLowerCase();
      const all = await listRows("inquiries");
      const matches = (q
        ? all.filter((i) =>
            i.display_id?.toLowerCase().includes(q) ||
            i.client_name?.toLowerCase().includes(q) ||
            i.company?.toLowerCase().includes(q),
          )
        : all
      )
        .slice(0, 20)
        .map((i) => ({
          id: i.id,
          display_id: i.display_id,
          client_name: i.client_name,
          company: i.company,
          status: i.status,
        }));
      res.json(matches);
    } catch (err) {
      next(err);
    }
  },
);

// --- ChatApp -> ERP TGT (the WhatsApp side of "1. Inquiry" in the pipeline) -
// Called by the ChatApp backend the moment the boss confirms a WhatsApp
// message as a new inquiry. Deliberately a separate, trusted route rather
// than reusing /api/public/inquiries above — that one is reachable by anyone
// and can't be allowed to set source/owner itself, so it always stamps
// "Web Form". This route is only reachable with the shared integration key,
// so it can correctly stamp "WhatsApp" and carry a real link back to the
// conversation the inquiry came from.
app.post(
  "/api/integrations/whatsapp/inquiries",
  requireIntegrationKey,
  async (req, res, next) => {
    try {
      const {
        client_name, phone, description, attachments, conversation_url, owner,
        company, email, industry, service, budget_range,
      } = req.body ?? {};
      if (!client_name?.trim() || !description?.trim()) {
        return res.status(400).json({ error: "client_name and description are required." });
      }
      const now = new Date().toISOString();
      const display_id = await nextDisplayId("INQ");
      const resolvedBudgetRange =
        budget_range && Object.hasOwn(PUBLIC_BUDGET_RANGES, budget_range) ? budget_range : "Not Specified";
      // Same "Service interest: X" fold-in the public web-form route uses, so a service
      // label detected from the WhatsApp message shows up the same way regardless of
      // which intake path an inquiry came in through.
      const withService = describeWithService(description, service);
      // Customer Matching — same as the other two intake paths: is this WhatsApp number
      // (or an email the client happened to mention) already a known contact? Duplicate
      // checking for WhatsApp already happens upstream, in ChatApp itself, before this
      // route is ever called (see isInquiryOpen in erp.service.js) — this route only
      // still needs the account-matching half.
      const matchedContact = await matchExistingContact(email, phone);
      const matchedAccount = matchedContact ? await resolveAccountForContact(matchedContact) : null;
      // No dedicated "linked conversation" field on this record, and this
      // collection is schemaless (MongoDB) — appended to the description in
      // plain text so it's visible wherever the description already renders
      // in the existing ERP TGT UI, with no frontend changes needed here.
      const linkLine = conversation_url ? `\n\nWhatsApp conversation: ${conversation_url}` : "";
      const row = await createRow("inquiries", {
        display_id,
        client_name: client_name.trim().slice(0, 200),
        company: company?.trim().slice(0, 200) || null,
        phone: phone?.trim().slice(0, 60) || null,
        email: email?.trim().slice(0, 200) || null,
        description: `${withService}${linkLine}`.slice(0, 4000),
        service_id: null,
        industry: industry?.trim().slice(0, 200) || null,
        source: "WhatsApp",
        // See the Web Form route's own comment above — `source_medium` is a distinct
        // field the edit form falls back to "Website Form" for when unset, which is
        // exactly the bug that showed a WhatsApp-sourced inquiry's Source Medium as
        // "Website Form" in the UI.
        source_medium: "WhatsApp",
        priority: "Medium",
        status: "New",
        owner: owner?.trim().slice(0, 200) || null,
        account_id: matchedAccount?.id || null,
        tags: ["whatsapp"],
        notes: null,
        preferred_contact_method: "WhatsApp",
        budget_range: resolvedBudgetRange,
        estimated_budget: PUBLIC_BUDGET_RANGES[resolvedBudgetRange],
        expected_close_date: null,
        address: null,
        received_date: now,
        next_follow_up: null,
        deal_id: null,
        conversation_url: conversation_url || null,
        attachments: sanitizePublicAttachments(attachments),
        activity_log: [
          { type: "created", message: "Inquiry created from a WhatsApp conversation via ChatApp.", at: now },
          ...(matchedContact
            ? [{
              type: "matched",
              message: `Matched to existing contact: ${matchedContact.name}${matchedAccount ? ` (${matchedAccount.name})` : ""}`,
              at: now,
            }]
            : []),
        ],
        created_by: "WhatsApp (ChatApp sync)",
        // No client email on a WhatsApp-sourced lead — the conversation itself
        // *is* the contact channel, so the email drip sequence (which needs an
        // address to send to) is switched off rather than left to silently no-op.
        auto_response_enabled: false,
        auto_quotation_send_at: null,
        auto_meeting_send_at: null,
        client_approved: false,
        client_approved_at: null,
        client_approved_by: null,
      });
      res.status(201).json({ ok: true, id: row.id, display_id: row.display_id });
      // Same as the public web-form path: no email on file means
      // onInquiryCreated's Thank You send is a no-op, but the internal team
      // alert still fires so someone actually sees the new lead.
      void onInquiryCreated(row);
      void notify({
        type: "inquiries_created",
        message: ACTIVITY_NOTIFY_MESSAGE.inquiries(row),
        link: ACTIVITY_NOTIFY_LINK.inquiries,
        owner: null,
        actor: null,
      }).catch((err) => console.error("[notify] WhatsApp inquiry notification failed:", err));
    } catch (err) {
      next(err);
    }
  },
);

// Lets ChatApp check whether a chat's already-linked inquiry is still open (a new
// message in that chat is just a reply on it) or closed — Deal Done or Lost — in which
// case a genuinely new request from the same client should go through the Inquiry stage
// again as its own fresh record, never skipped and never folded into whatever the old
// inquiry became. Trusted route, same key as the intake route above; deliberately not
// the public /api/public/inquiries/:id/status route, which is rate-limited for browsers.
app.get(
  "/api/integrations/whatsapp/inquiries/:id/status",
  requireIntegrationKey,
  async (req, res, next) => {
    try {
      const inquiry = await getRow("inquiries", req.params.id);
      if (!inquiry) return res.status(404).json({ error: "Inquiry not found" });
      res.json({ id: inquiry.id, display_id: inquiry.display_id, status: inquiry.status });
    } catch (err) {
      next(err);
    }
  },
);

// Fills in previously-missing fields on an existing Inquiry from a later WhatsApp
// message — e.g. the first message had no email, and a follow-up (a document, a voice
// note, or just a quick reply) gave one. Deliberately fill-only: never overwrites a
// field someone already set, by hand in the CRM or from an earlier WhatsApp message — a
// later, possibly less complete AI read should never clobber a better value on file.
app.patch(
  "/api/integrations/whatsapp/inquiries/:id",
  requireIntegrationKey,
  async (req, res, next) => {
    try {
      const inquiry = await getRow("inquiries", req.params.id);
      if (!inquiry) return res.status(404).json({ error: "Inquiry not found" });

      const { client_name, company, email, phone, industry, service, budget_range, summary, attachments } = req.body ?? {};
      const patch = {};
      const filled = [];
      // Every note this route might append accumulates here (starting from what's
      // already on file) rather than each field independently deriving its own "old
      // notes + one new line" — otherwise a request that fills more than one
      // notes-worthy field at once (service AND a summary, say) would have the second
      // one silently overwrite the first instead of both landing.
      let notes = inquiry.notes || "";
      function appendNote(line) {
        if (notes.includes(line)) return; // don't pile up the exact same line twice
        notes = notes ? `${notes}\n${line}` : line;
      }

      if (client_name?.trim() && !inquiry.client_name?.trim()) {
        patch.client_name = client_name.trim().slice(0, 200);
        filled.push(`name: ${patch.client_name}`);
      }
      if (company?.trim() && !inquiry.company?.trim()) {
        patch.company = company.trim().slice(0, 200);
        filled.push(`company: ${patch.company}`);
      }
      if (email?.trim() && !inquiry.email?.trim()) {
        patch.email = email.trim().slice(0, 200);
        filled.push(`email: ${patch.email}`);
      }
      // The primary phone field is always the real WhatsApp number this chat is
      // mirroring — near-never empty, so this only actually fires on the rare
      // inquiry that somehow has none on file. A phone mentioned *inside* a message on
      // a record that already has its WhatsApp number is a secondary/alternate contact,
      // not a replacement, so that case is logged as a note instead, below.
      if (phone?.trim() && !inquiry.phone?.trim()) {
        patch.phone = phone.trim().slice(0, 60);
        filled.push(`phone: ${patch.phone}`);
      } else if (phone?.trim() && inquiry.phone?.trim() && phone.trim() !== inquiry.phone.trim()) {
        appendNote(`Alternate phone (from WhatsApp): ${phone.trim().slice(0, 60)}`);
        filled.push(`alternate phone: ${phone.trim()}`);
      }
      if (industry?.trim() && !inquiry.industry?.trim()) {
        patch.industry = industry.trim().slice(0, 200);
        filled.push(`industry: ${patch.industry}`);
      }
      if (
        budget_range &&
        Object.hasOwn(PUBLIC_BUDGET_RANGES, budget_range) &&
        (!inquiry.budget_range || inquiry.budget_range === "Not Specified")
      ) {
        patch.budget_range = budget_range;
        patch.estimated_budget = PUBLIC_BUDGET_RANGES[budget_range];
        filled.push(`budget: ${budget_range}`);
      }
      // No dedicated "service" field on this record (schemaless collection, and the
      // create path folds it into the description instead) — appended to notes here so
      // it's still visible on the record without touching the original description.
      if (service?.trim()) {
        appendNote(`Service interest (from WhatsApp): ${service.trim().slice(0, 200)}`);
        filled.push(`service: ${service.trim()}`);
      }
      // The AI's read of *this specific* follow-up (a voice note transcript, a
      // document's content, or just what a short text said) — logged so the sales team
      // can see what came in over time without re-opening every attachment.
      if (summary?.trim()) {
        appendNote(`Update from WhatsApp: ${summary.trim().slice(0, 500)}`);
        filled.push("summary");
      }
      if (notes !== (inquiry.notes || "")) {
        patch.notes = notes;
      }
      // A document arriving in a follow-up message is appended to the existing
      // attachment list — never replaces it — same cap as the intake route's own
      // sanitizePublicAttachments (5 files, 8mb each) so a long-running conversation
      // can't quietly balloon one inquiry's payload.
      if (Array.isArray(attachments) && attachments.length > 0) {
        const combined = [...(inquiry.attachments || []), ...sanitizePublicAttachments(attachments)].slice(0, 5);
        patch.attachments = combined;
        filled.push("attachment");
      }

      if (Object.keys(patch).length === 0) {
        return res.json({ ok: true, id: inquiry.id, display_id: inquiry.display_id, updatedFields: [] });
      }

      const updated = await updateRow("inquiries", inquiry.id, patch);
      await appendActivityLog("inquiries", inquiry.id, {
        type: "whatsapp_update",
        message: `Details added from a WhatsApp conversation: ${filled.join(", ")}.`,
        at: new Date().toISOString(),
      });

      res.json({ ok: true, id: updated.id, display_id: updated.display_id, updatedFields: filled });
    } catch (err) {
      next(err);
    }
  },
);

// Tables a Developer's own dashboard/work needs, scoped to their own
// projects/tasks/logs/notifications server-side — the generic /api/:table
// route otherwise returns every row in the collection to any authenticated
// caller (fine for Admin/Salesman today), so without this a Developer could
// read another employee's tasks or work logs just by hitting the API
// directly, bypassing the client-side filtering in DeveloperDashboard.
const DEVELOPER_SCOPED_TABLES = new Set([
  "projects",
  "tasks",
  "work_logs",
  "notifications",
  "quotes",
  "inquiries",
  "tickets",
  "sprints",
  "client_feedback",
  "invoices",
  "meetings",
]);

// Tables whose rows are scoped by "does this row's project_id belong to me" —
// same shape of check, different collection each time.
const PROJECT_LINKED_TABLES = new Set([
  "tasks",
  "quotes",
  "tickets",
  "sprints",
  "client_feedback",
  "invoices",
  "meetings",
]);

async function resolveEmployeeName(userId) {
  const user = await findUserById(userId);
  if (!user?.email) return null;
  const employees = await listRows("employees");
  const email = user.email.toLowerCase();
  return employees.find((e) => e.email && e.email.toLowerCase() === email)?.name ?? null;
}

async function myProjectIdSet(myName) {
  const projects = await listRows("projects");
  return new Set(
    projects
      .filter((p) => myName && (p.manager === myName || (p.team ?? []).includes(myName)))
      .map((p) => p.id),
  );
}

async function scopeRowsForDeveloper(table, rows, userId) {
  const myName = await resolveEmployeeName(userId);
  if (table === "projects") {
    return myName ? rows.filter((p) => p.manager === myName || (p.team ?? []).includes(myName)) : [];
  }
  if (table === "work_logs") {
    return myName ? rows.filter((l) => l.employee === myName) : [];
  }
  if (table === "notifications") {
    return myName ? rows.filter((n) => n.owner === myName) : [];
  }
  if (table === "inquiries") {
    const myProjectIds = await myProjectIdSet(myName);
    const projects = await listRows("projects");
    const myInquiryIds = new Set(
      projects.filter((p) => myProjectIds.has(p.id) && p.inquiry_id).map((p) => p.inquiry_id),
    );
    return rows.filter((i) => myInquiryIds.has(i.id));
  }
  if (table === "tickets") {
    const myProjectIds = await myProjectIdSet(myName);
    return rows.filter(
      (t) => (t.project_id && myProjectIds.has(t.project_id)) || t.assignee === myName,
    );
  }
  if (PROJECT_LINKED_TABLES.has(table)) {
    const myProjectIds = await myProjectIdSet(myName);
    return rows.filter((r) => r.project_id && myProjectIds.has(r.project_id));
  }
  return rows;
}

app.get("/api/:table", requireTable, requireAuth, async (req, res, next) => {
  try {
    const { column, ascending } = req.query;
    let rows = await listRows(req.params.table, {
      column: column || undefined,
      ascending: ascending === "true",
    });
    if (req.userRole === "developer" && DEVELOPER_SCOPED_TABLES.has(req.params.table)) {
      rows = await scopeRowsForDeveloper(req.params.table, rows, req.userId);
    }
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.get("/api/:table/:id", requireTable, requireAuth, async (req, res, next) => {
  try {
    const row = await getRow(req.params.table, req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    if (req.userRole === "developer" && DEVELOPER_SCOPED_TABLES.has(req.params.table)) {
      const scoped = await scopeRowsForDeveloper(req.params.table, [row], req.userId);
      if (scoped.length === 0) return res.status(404).json({ error: "Not found" });
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// Fires the instant "Thank You" email the moment an inquiry is created — logs
// success/failure into the inquiry's own activity_log either way, so a failed
// send (e.g. bad email address) is visible on the inquiry itself, not just
// in a server log nobody reads.
// Appends via appendActivityLog (an atomic $push), not a read-modify-write
// off `inquiry.activity_log` — this can run within moments of other
// independent writers touching the same inquiry (the internal alert right
// after it, a follow-up someone logs immediately, the auto-response
// sequence), and a full-array overwrite from a stale read would silently
// erase whichever of those got there first.
async function sendInquiryThankYou(inquiry) {
  const now = new Date().toISOString();
  try {
    const company = await getRow("company_profile", "default");
    const { subject, html } = buildInquiryThankYouEmail(inquiry, company);
    await sendMail({ to: inquiry.email, subject, html });
    await appendActivityLog("inquiries", inquiry.id, {
      type: "email",
      message: `Thank-you email sent to ${inquiry.email}`,
      at: now,
    });
  } catch (err) {
    console.error("[inquiry email] thank-you send failed:", err);
    await appendActivityLog("inquiries", inquiry.id, {
      type: "email_failed",
      message: `Thank-you email failed: ${err.message}`,
      at: now,
    }).catch(() => {});
  }
}

// Pings your own team the moment an inquiry lands — separate from the
// client-facing thank-you email above. Goes to INTERNAL_ALERT_EMAIL if set
// (comma-separated list allowed), otherwise falls back to the company's own
// contact email from Company Profile.
// Who gets pinged is a plain "InquiryAlert" row in Report Subscriptions —
// the same recipients-list mechanism already used for Daily/Weekly/Monthly
// reports and Budget/Task alerts, managed from Reports → Manage subscriptions.
// No subscription set up yet? Falls back to INTERNAL_ALERT_EMAIL, then to
// the Company Profile contact address, so it still works out of the box.
async function resolveInternalAlertRecipients(company) {
  const subs = await listRows("report_subscriptions");
  const recipients = subs
    .filter((s) => s.report_type === "InquiryAlert" && s.status === "Active")
    .map((s) => s.recipients)
    .filter(Boolean);
  if (recipients.length > 0) return recipients.join(", ");
  return process.env.INTERNAL_ALERT_EMAIL || company?.email || null;
}

async function sendInternalAlert(inquiry) {
  const now = new Date().toISOString();
  try {
    const company = await getRow("company_profile", "default");
    const to = await resolveInternalAlertRecipients(company);
    if (!to) return; // nowhere configured to send it — silently skip
    const { subject, html } = buildInternalAlertEmail(inquiry, company);
    await sendMail({ to, subject, html });
    await appendActivityLog("inquiries", inquiry.id, {
      type: "internal_alert",
      message: `Internal team notified (${to}).`,
      at: now,
    });
  } catch (err) {
    console.error("[inquiry email] internal alert failed:", err);
  }
}

// Both of these append atomically now, so there's no longer a need to chain
// one's result into the other to avoid a lost update — each can safely run
// off the original row.
async function onInquiryCreated(row) {
  if (row.email && row.auto_response_enabled !== false) {
    await sendInquiryThankYou(row);
  }
  await sendInternalAlert(row);
}

// Who did this — resolved to the employee name convention every "owner"
// field in the app already uses (matched by login email), so a
// notification's `owner` lines up with the same person's Inquiries/Deals/etc.
// Falls back to their account name/email if there's no employee record yet.
async function resolveActorName(userId) {
  const user = await findUserById(userId);
  if (!user) return null;
  const employees = await listRows("employees");
  const match = employees.find(
    (e) => e.email && user.email && e.email.toLowerCase() === user.email.toLowerCase(),
  );
  return match?.name ?? user.full_name ?? user.email;
}

// Which tables generate an activity notification on create, and how to
// phrase it — this is the "salesman creates an inquiry/contact/deal" feed.
const ACTIVITY_NOTIFY_MESSAGE = {
  inquiries: (row) =>
    `New inquiry from ${row.client_name}${row.company ? ` (${row.company})` : ""} — via ${row.source ?? "CRM"}`,
  contacts: (row) => `New contact added: ${row.name}${row.company ? ` (${row.company})` : ""}`,
  deals: (row) => `New deal created: ${row.title}`,
  accounts: (row) => `New account added: ${row.name}`,
  meetings: (row) => `New ${row.kind === "Demo" ? "demo" : "meeting"} scheduled: ${row.title}`,
  quotes: (row) => `New estimate created: ${row.title}`,
  agreements: (row) => `New agreement created: ${row.title}`,
  projects: (row) => `New project created: ${row.name}`,
};

// Table name doesn't always match its route path (contacts lives at /crm,
// quotes at /estimations, meetings at the singular /meeting) — map it once
// here instead of guessing per-request.
const ACTIVITY_NOTIFY_LINK = {
  inquiries: "/inquiries",
  contacts: "/crm",
  deals: "/opportunities",
  accounts: "/accounts",
  meetings: "/meeting",
  quotes: "/estimations",
  agreements: "/agreements",
  projects: "/project",
};

// Human-readable record numbers, matching your boss's INQ-2026-00001 style —
// only for the record types that actually get referenced by number in
// conversation (an inquiry, a deal, a project). Everything else keeps its
// internal id only.
const DISPLAY_ID_PREFIX = {
  inquiries: "INQ",
  deals: "DEAL",
  projects: "PRJ",
  proposals: "PROP",
  bookkeeping_transactions: "TXN",
};

app.post("/api/:table", requireTable, requireAuth, async (req, res, next) => {
  try {
    const body = req.body ?? {};
    // A Developer logging their own work can't be trusted to send the right
    // `employee` value client-side — force it to whoever is actually logged
    // in, the same "server sets it, client can't override" rule as
    // inquiries.created_by above, so one developer can't log hours under
    // someone else's name.
    if (req.params.table === "work_logs" && req.userRole === "developer") {
      const myName = await resolveEmployeeName(req.userId);
      if (!myName) return res.status(403).json({ error: "No employee record linked to this account." });
      body.employee = myName;
    }
    let row = await createRow(req.params.table, body);
    const patch = {};
    const prefix = DISPLAY_ID_PREFIX[req.params.table];
    if (prefix) {
      patch.display_id = await nextDisplayId(prefix);
    }
    // "Created By" is server-set once, at creation, from the logged-in
    // user — never trust a client-supplied value here.
    if (req.params.table === "inquiries") {
      patch.created_by = await resolveActorName(req.userId);
      // Schedules the rest of the auto-response drip — Thank You already
      // fired synchronously below via onInquiryCreated; these two are timed
      // off the creation moment and picked up by the auto-response-sequence
      // cron job in jobs.mjs once due. Skipped entirely if there's no email
      // to send to, or the toggle was off. Three emails, thirty minutes
      // apart: Thank You at T+0, Basic Quotation at T+30, Meeting Request
      // at T+60 — the whole sequence lands inside the first hour.
      if (row.email && row.auto_response_enabled !== false) {
        const createdAt = Date.now();
        patch.auto_quotation_send_at = new Date(createdAt + 30 * 60 * 1000).toISOString();
        patch.auto_meeting_send_at = new Date(createdAt + 60 * 60 * 1000).toISOString();
      }
    }
    if (Object.keys(patch).length) {
      row = (await updateRow(req.params.table, row.id, patch)) ?? row;
    }
    res.status(201).json(row);
    if (req.params.table === "inquiries") {
      void onInquiryCreated(row);
    }
    // Logging a follow-up is a real signal someone's actively working the
    // inquiry — the same "move the card forward automatically" rule as
    // sending a response or a proposal, just triggered by this instead.
    if (req.params.table === "inquiry_followups" && row.inquiry_id) {
      void (async () => {
        const inquiry = await getRow("inquiries", row.inquiry_id);
        if (!inquiry) return;
        const nextStatus = advancedStatus(inquiry.status, "In Review");
        if (!nextStatus) return;
        await updateRow("inquiries", inquiry.id, { status: nextStatus });
        await appendActivityLog("inquiries", inquiry.id, {
          type: "status_changed",
          message: `Status updated from ${inquiry.status} to ${nextStatus} (follow-up logged).`,
          at: new Date().toISOString(),
        });
      })().catch((err) => console.error("[follow-ups] inquiry stage advance failed:", err));
    }
    // See autoPostInvoicePayment/autoPostBillPayment above — mirrors the
    // payment into Bookkeeping automatically so Income/Expense and the P&L
    // never require it to be entered twice.
    if (req.params.table === "payments") {
      void autoPostInvoicePayment(row);
    }
    if (req.params.table === "bill_payments") {
      void autoPostBillPayment(row);
    }
    const buildMessage = ACTIVITY_NOTIFY_MESSAGE[req.params.table];
    if (buildMessage) {
      void (async () => {
        const actor = await resolveActorName(req.userId);
        await notify({
          type: `${req.params.table}_created`,
          message: buildMessage(row),
          link: ACTIVITY_NOTIFY_LINK[req.params.table] ?? `/${req.params.table}`,
          owner: actor,
          actor,
        });
      })().catch((err) => console.error("[notify] activity notification failed:", err));
    }
  } catch (err) {
    next(err);
  }
});

// The Inquiry Kanban board's real column order — used so sending a response
// or a proposal can move the card forward on its own, the way a person
// dragging it would, instead of leaving it wherever it started.
const INQUIRY_STAGE_ORDER = ["New", "In Review", "Responded", "Proposal Sent", "Deal Done"];
const CLOSED_INQUIRY_STATUSES = ["Deal Done", "Lost"];

// Only ever moves a card forward, never backward, and never touches one
// that's already closed (Deal Done / Lost) — an automated side-effect
// should never reopen or downgrade a record a person already resolved.
function advancedStatus(currentStatus, targetStatus) {
  if (CLOSED_INQUIRY_STATUSES.includes(currentStatus)) return null;
  const currentIndex = INQUIRY_STAGE_ORDER.indexOf(currentStatus);
  const targetIndex = INQUIRY_STAGE_ORDER.indexOf(targetStatus);
  if (targetIndex === -1 || targetIndex <= currentIndex) return null;
  return targetStatus;
}

// Recording a payment in Invoices or Payables used to be a dead end for
// Bookkeeping — Income/Expense and the P&L only ever read
// bookkeeping_transactions, so real cash that moved through a payment never
// showed up there unless someone typed the exact same entry a second time.
// These two auto-post a matching Bookkeeping entry the moment a payment is
// recorded, so one entry is enough. Best-effort and non-fatal: if no
// matching Chart of Accounts account exists yet, it just skips and logs —
// never blocks the payment itself from saving.
async function findCoaAccount(category, preferredNames) {
  const accounts = await listRows("chart_of_accounts");
  const inCategory = accounts.filter((a) => a.category === category && a.status !== "Archived");
  for (const name of preferredNames) {
    const match = inCategory.find((a) => a.name.toLowerCase().includes(name.toLowerCase()));
    if (match) return match;
  }
  return inCategory[0] ?? null;
}

async function autoPostInvoicePayment(payment) {
  try {
    const invoice = await getRow("invoices", payment.invoice_id);
    const account = await findCoaAccount("Revenue", ["Sales Revenue", "Service Revenue"]);
    if (!account) {
      console.warn(
        `[bookkeeping] no active Revenue account found — skipped auto-post for payment ${payment.id}`,
      );
      return;
    }
    const display_id = await nextDisplayId("TXN");
    await createRow("bookkeeping_transactions", {
      display_id,
      coa_id: account.id,
      date: payment.payment_date || new Date().toISOString().slice(0, 10),
      amount: Number(payment.amount) || 0,
      description: `Payment received — ${invoice?.invoice_number ?? "invoice"}${invoice?.client ? ` (${invoice.client})` : ""}`,
      investor_name: null,
      debtor: invoice?.client ?? null,
      asset_type: null,
      location: null,
      photo_note: null,
      parent_transaction_id: null,
      auto_posted: true,
      source_table: "payments",
      source_id: payment.id,
    });
  } catch (err) {
    console.error("[bookkeeping] auto-post invoice payment failed:", err);
  }
}

async function autoPostBillPayment(payment) {
  try {
    const bill = await getRow("bills", payment.bill_id);
    // A loan repayment isn't an expense — it pays down a liability. Salary
    // Dues and Vendor Bills are real expenses. "Other" falls back to
    // whatever Expense account exists first.
    const isLoan = bill?.type === "Loan";
    const category = isLoan ? "Liabilities" : "Expenses";
    const preferredNames = isLoan
      ? ["Bank Loan", "Loan"]
      : bill?.type === "Salary Dues"
        ? ["Salary Expense", "Salary"]
        : bill?.type === "Vendor Bill"
          ? ["Vendor"]
          : [];
    const account = await findCoaAccount(category, preferredNames);
    if (!account) {
      console.warn(
        `[bookkeeping] no active ${category} account found — skipped auto-post for bill payment ${payment.id}`,
      );
      return;
    }
    const display_id = await nextDisplayId("TXN");
    await createRow("bookkeeping_transactions", {
      display_id,
      coa_id: account.id,
      date: payment.payment_date || new Date().toISOString().slice(0, 10),
      amount: Number(payment.amount) || 0,
      description: `Payment made — ${bill?.bill_number ?? "bill"}${bill?.payee ? ` (${bill.payee})` : ""}`,
      investor_name: null,
      debtor: null,
      asset_type: null,
      location: null,
      photo_note: null,
      parent_transaction_id: null,
      auto_posted: true,
      source_table: "bill_payments",
      source_id: payment.id,
    });
  } catch (err) {
    console.error("[bookkeeping] auto-post bill payment failed:", err);
  }
}

// Which response template maps to which builder + a human label for the
// activity log — "Inquiry Received" reuses the fuller confirmation email
// (not the instant thank-you, since by the time someone clicks Send
// Response the record usually has more detail on it than at creation).
// `autoField` is the flag the auto-response-sequence cron job (jobs.mjs)
// checks before firing that same template automatically — set here too so a
// human sending it manually first means the cron job never re-sends it.
const RESPONSE_TEMPLATE_BUILDERS = {
  "Inquiry Received": { build: buildInquiryConfirmationEmail, label: "Confirmation" },
  "Basic Quotation": {
    build: buildBasicQuotationEmail,
    label: "Basic quotation",
    autoField: "auto_quotation_sent",
  },
  "Meeting Request": {
    build: buildMeetingRequestEmail,
    label: "Meeting request",
    autoField: "auto_meeting_sent",
  },
};

// Manual "send response" — Admin/Salesman fires this once an inquiry's
// details are complete, dispatching whichever response template is
// currently selected on the record (defaults to the full confirmation email
// for backward compatibility with callers that don't pass a template).
app.post(
  "/api/inquiries/:id/send-confirmation",
  requireAuth,
  requireRole("super_admin", "admin", "salesman"),
  async (req, res, next) => {
    try {
      const inquiry = await getRow("inquiries", req.params.id);
      if (!inquiry) return res.status(404).json({ error: "Inquiry not found" });
      if (!inquiry.email) {
        return res.status(400).json({ error: "This inquiry has no client email on file." });
      }
      const templateName = req.body?.template || "Inquiry Received";
      const builder = RESPONSE_TEMPLATE_BUILDERS[templateName];
      if (!builder) {
        return res
          .status(400)
          .json({ error: `"${templateName}" isn't wired to an automatic send yet.` });
      }
      const company = await getRow("company_profile", "default");
      const { subject, html } = builder.build(inquiry, company);
      const now = new Date().toISOString();
      try {
        await sendMail({ to: inquiry.email, subject, html });
        // Responding to the client is exactly what moves a card from "New"/
        // "In Review" into "Responded" on the board — do it here so nobody
        // has to remember to drag it themselves.
        const nextStatus = advancedStatus(inquiry.status, "Responded");
        if (builder.autoField || nextStatus) {
          await updateRow("inquiries", inquiry.id, {
            ...(builder.autoField ? { [builder.autoField]: true } : {}),
            ...(nextStatus ? { status: nextStatus } : {}),
          });
        }
        const updated = await appendActivityLog("inquiries", inquiry.id, [
          { type: "email", message: `${builder.label} email sent to ${inquiry.email}`, at: now },
          ...(nextStatus
            ? [
                {
                  type: "status_changed",
                  message: `Status updated from ${inquiry.status} to ${nextStatus}.`,
                  at: now,
                },
              ]
            : []),
        ]);
        if (templateName === "Basic Quotation") {
          void autoEstimateFromInquiry(inquiry, company).catch((err) =>
            console.error(`[auto-estimate] failed for ${inquiry.id}:`, err),
          );
        }
        res.json(updated);
      } catch (err) {
        await appendActivityLog("inquiries", inquiry.id, {
          type: "email_failed",
          message: `${builder.label} email failed: ${err.message}`,
          at: now,
        });
        res.status(500).json({ error: err.message || "Failed to send email" });
      }
    } catch (err) {
      next(err);
    }
  },
);

// "Send meeting minutes" — fires once a meeting's minutes are filled in on
// its record, emailing the client the recording link (if any) plus the
// structured discussion/decisions/action items.
app.post(
  "/api/meetings/:id/send-minutes",
  requireAuth,
  requireRole("super_admin", "admin", "salesman"),
  async (req, res, next) => {
    try {
      const meeting = await getRow("meetings", req.params.id);
      if (!meeting) return res.status(404).json({ error: "Meeting not found" });
      const to = req.body?.to || meeting.client_email;
      if (!to) {
        return res.status(400).json({ error: "No client email on file for this meeting." });
      }
      // No longer requires minutes text — the email itself degrades
      // gracefully to a plain meeting-detail recap when there's nothing
      // else yet, matching the same content the auto-send-on-Completed path
      // sends.
      const company = await getRow("company_profile", "default");
      const { subject, html } = buildMeetingMinutesEmail(meeting, company);
      const now = new Date().toISOString();
      try {
        await sendMail({ to, subject, html });
        const updated = await updateRow("meetings", meeting.id, {
          minutes_sent: true,
          minutes_sent_at: now,
        });
        res.json(updated);
      } catch (err) {
        res.status(500).json({ error: err.message || "Failed to send email" });
      }
    } catch (err) {
      next(err);
    }
  },
);

// Tables where handing an existing record to someone new is worth a
// notification — the "Assigned To" / "Owner" field changing on a record
// that already existed, as opposed to that person creating it themselves.
const ASSIGNMENT_NOTIFY_MESSAGE = {
  inquiries: (row) =>
    `Inquiry assigned to you: ${row.client_name}${row.company ? ` (${row.company})` : ""}`,
  deals: (row) => `Deal assigned to you: ${row.title}`,
  contacts: (row) => `Contact assigned to you: ${row.name}`,
  accounts: (row) => `Account assigned to you: ${row.name}`,
  agreements: (row) => `Agreement assigned to you: ${row.title}`,
};

// --- Proposals: draft, PDF, send, versioning, correction ---

// Drafts every section from the real linked inquiry/quote/company — done
// server-side so there's one source of truth, not a duplicated composition
// function in the frontend too.
app.post(
  "/api/proposals/draft",
  requireAuth,
  requireRole("super_admin", "admin", "salesman"),
  async (req, res, next) => {
    try {
      const { inquiry_id, quote_id, template } = req.body ?? {};
      const [inquiry, quote, company] = await Promise.all([
        inquiry_id ? getRow("inquiries", inquiry_id) : null,
        quote_id ? getRow("quotes", quote_id) : null,
        getRow("company_profile", "default"),
      ]);
      const draft = buildProposalDraft({
        inquiry,
        quote,
        company,
        template: template || "Custom Software Development",
      });
      res.json(draft);
    } catch (err) {
      next(err);
    }
  },
);

app.get("/api/proposals/:id/pdf", requireAuth, async (req, res, next) => {
  try {
    const proposal = await getRow("proposals", req.params.id);
    if (!proposal) return res.status(404).json({ error: "Proposal not found" });
    const company = await getRow("company_profile", "default");
    const doc = buildProposalPdf(proposal, company);
    const buffer = Buffer.from(doc.output("arraybuffer"));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${proposal.display_id ?? "proposal"}.pdf"`,
    );
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

app.post(
  "/api/proposals/:id/send",
  requireAuth,
  requireRole("super_admin", "admin", "salesman"),
  async (req, res, next) => {
    try {
      const proposal = await getRow("proposals", req.params.id);
      if (!proposal) return res.status(404).json({ error: "Proposal not found" });
      const { to } = req.body ?? {};
      const recipient = to || proposal.client_email;
      if (!recipient) {
        return res.status(400).json({ error: "No client email on file for this proposal." });
      }
      if (!proposal.cost || Number(proposal.cost) <= 0) {
        return res.status(400).json({ error: "Add a price before sending this proposal." });
      }
      if (!proposal.scope_of_work) {
        return res.status(400).json({ error: "Scope of Work is required before sending." });
      }
      const company = await getRow("company_profile", "default");
      const { subject, html } = buildProposalSentEmail(proposal, company);
      const doc = buildProposalPdf(proposal, company);
      const attachmentBase64 = doc.output("datauristring").split(",")[1];
      const now = new Date().toISOString();
      try {
        await sendMail({
          to: recipient,
          subject,
          html,
          attachmentBase64,
          attachmentFilename: `${proposal.display_id ?? "proposal"}.pdf`,
        });
        const actor = await resolveActorName(req.userId);
        const updated = await updateRow("proposals", proposal.id, {
          status: "Sent",
          sent_at: now,
          sent_by: actor,
          sent_to: recipient,
          email_status: "Sent",
        });
        void notify({
          type: "proposal_sent",
          message: `Proposal sent: ${proposal.title} (${proposal.display_id ?? ""})`,
          link: "/inquiries",
          owner: proposal.owner ?? actor,
          actor,
        }).catch((err) => console.error("[notify] proposal-sent notification failed:", err));

        // Sending the proposal is what actually moves the linked Inquiry's
        // board card into "Proposal Sent" — same forward-only rule as the
        // response endpoint above.
        if (proposal.inquiry_id) {
          void (async () => {
            const inquiry = await getRow("inquiries", proposal.inquiry_id);
            if (!inquiry) return;
            const nextStatus = advancedStatus(inquiry.status, "Proposal Sent");
            if (!nextStatus) return;
            await updateRow("inquiries", inquiry.id, { status: nextStatus });
            await appendActivityLog("inquiries", inquiry.id, {
              type: "status_changed",
              message: `Status updated from ${inquiry.status} to ${nextStatus} (proposal sent).`,
              at: now,
            });
          })().catch((err) => console.error("[proposals] inquiry stage advance failed:", err));
        }

        res.json(updated);
      } catch (err) {
        await updateRow("proposals", proposal.id, { email_status: "Failed" }).catch(() => {});
        res.status(500).json({ error: err.message || "Failed to send email" });
      }
    } catch (err) {
      next(err);
    }
  },
);

// Same shape as the proposal/meeting send routes above. Developers are
// explicitly allowed to send invoices for their own projects (confirmed
// override of the original admin/salesman-only recommendation) — the
// invoice itself is still scoped to the developer's own projects via
// DEVELOPER_SCOPED_TABLES/PROJECT_LINKED_TABLES above, so this only ever
// lets them send an invoice that already belongs to one of their projects.
app.post(
  "/api/invoices/:id/send",
  requireAuth,
  requireRole("super_admin", "admin", "salesman", "developer"),
  async (req, res, next) => {
    try {
      const invoice = await getRow("invoices", req.params.id);
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });
      if (req.userRole === "developer") {
        const scoped = await scopeRowsForDeveloper("invoices", [invoice], req.userId);
        if (scoped.length === 0) return res.status(404).json({ error: "Invoice not found" });
      }
      const { to } = req.body ?? {};
      let recipient = to;
      if (!recipient && invoice.client) {
        const accounts = await listRows("accounts");
        recipient = accounts.find((a) => a.name === invoice.client)?.email ?? null;
      }
      if (!recipient) {
        return res
          .status(400)
          .json({ error: "No client email on file for this invoice — provide one to send." });
      }
      const company = await getRow("company_profile", "default");
      const subject = `Invoice ${invoice.invoice_number} from ${company?.name ?? "Time Global Tech"}`;
      const html = `
        <p>Hi,</p>
        <p>Please find your invoice details below.</p>
        <table cellpadding="6" style="border-collapse:collapse">
          <tr><td><strong>Invoice #</strong></td><td>${invoice.invoice_number}</td></tr>
          <tr><td><strong>Amount</strong></td><td>$${Number(invoice.amount ?? 0).toLocaleString()}</td></tr>
          <tr><td><strong>Due date</strong></td><td>${invoice.due_date ?? "—"}</td></tr>
        </table>
        <p>Thank you for your business.</p>
        <p>${company?.name ?? "Time Global Tech"}</p>
      `;
      const now = new Date().toISOString();
      try {
        await sendMail({ to: recipient, subject, html });
        const actor = await resolveActorName(req.userId);
        const updated = await updateRow("invoices", invoice.id, {
          status: invoice.status === "Draft" ? "Sent" : invoice.status,
          sent_at: now,
          sent_by: actor,
          sent_to: recipient,
        });
        res.json(updated);
      } catch (err) {
        res.status(500).json({ error: err.message || "Failed to send email" });
      }
    } catch (err) {
      next(err);
    }
  },
);

// Correction requested by management — locks the proposal into a distinct
// state until it's revised, matching the spec's "Correction Required" step.
app.post(
  "/api/proposals/:id/request-correction",
  requireAuth,
  requireRole("super_admin", "admin"),
  async (req, res, next) => {
    try {
      const proposal = await getRow("proposals", req.params.id);
      if (!proposal) return res.status(404).json({ error: "Proposal not found" });
      const { comments } = req.body ?? {};
      const actor = await resolveActorName(req.userId);
      const updated = await updateRow("proposals", proposal.id, {
        status: "Correction Required",
        correction_comments: comments || null,
        correction_requested_by: actor,
        correction_requested_at: new Date().toISOString(),
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

// A new version doesn't overwrite the old one — it's a new row sharing the
// same inquiry, with version+1, so v1/v2/v3 stay browsable as real history.
app.post(
  "/api/proposals/:id/new-version",
  requireAuth,
  requireRole("super_admin", "admin", "salesman"),
  async (req, res, next) => {
    try {
      const proposal = await getRow("proposals", req.params.id);
      if (!proposal) return res.status(404).json({ error: "Proposal not found" });
      const {
        id: _id,
        display_id: _displayId,
        created_at: _createdAt,
        updated_at: _updatedAt,
        ...rest
      } = proposal;
      const row = await createRow("proposals", {
        ...rest,
        version: Number(proposal.version ?? 1) + 1,
        status: "Draft",
        sent_at: null,
        sent_by: null,
        sent_to: null,
        email_status: null,
        correction_comments: null,
        correction_requested_by: null,
        correction_requested_at: null,
      });
      const display_id = await nextDisplayId("PROP");
      const updated = (await updateRow("proposals", row.id, { display_id })) ?? row;
      res.status(201).json(updated);
    } catch (err) {
      next(err);
    }
  },
);

app.put("/api/:table/:id", requireTable, requireAuth, async (req, res, next) => {
  try {
    // Snapshot before the update — the only way to tell "owner changed" from
    // "owner resaved unchanged" (the edit form resends every field on every
    // save, whether or not the user actually touched it).
    const before = await getRow(req.params.table, req.params.id);
    if (
      req.userRole === "developer" &&
      DEVELOPER_SCOPED_TABLES.has(req.params.table) &&
      before
    ) {
      const scoped = await scopeRowsForDeveloper(req.params.table, [before], req.userId);
      if (scoped.length === 0) return res.status(404).json({ error: "Not found" });
    }
    const body = req.body ?? {};
    if (req.params.table === "work_logs" && req.userRole === "developer") {
      const myName = await resolveEmployeeName(req.userId);
      if (!myName) return res.status(403).json({ error: "No employee record linked to this account." });
      body.employee = myName;
    }
    const row = await updateRow(req.params.table, req.params.id, body);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);

    if (req.params.table === "deals" && req.body?.stage === "Won") {
      void (async () => {
        const actor = await resolveActorName(req.userId);
        await notify({
          type: "deal_won",
          message: `Deal won: ${row.title}${row.value ? ` — $${Number(row.value).toLocaleString()}` : ""}`,
          link: "/opportunities",
          owner: row.owner ?? actor,
          actor,
        });
      })().catch((err) => console.error("[notify] deal-won notification failed:", err));
    }

    // A meeting marked Completed automatically emails the client whatever
    // meeting detail/recording/minutes exist at that moment — no separate
    // click needed. Only fires on the actual transition into Completed (not
    // every resave while it's already Completed), and only once per meeting
    // (the manual "Send Minutes"/"Resend minutes" button still works any
    // time after, e.g. once real notes get typed in).
    if (
      req.params.table === "meetings" &&
      req.body?.status === "Completed" &&
      before?.status !== "Completed" &&
      row.client_email &&
      !row.minutes_sent
    ) {
      void (async () => {
        try {
          const company = await getRow("company_profile", "default");
          const { subject, html } = buildMeetingMinutesEmail(row, company);
          await sendMail({ to: row.client_email, subject, html });
          await updateRow("meetings", row.id, {
            minutes_sent: true,
            minutes_sent_at: new Date().toISOString(),
          });
        } catch (err) {
          console.error("[meetings] auto minutes-on-completion send failed:", err);
        }
      })();
    }

    const buildAssignMessage = ASSIGNMENT_NOTIFY_MESSAGE[req.params.table];
    if (buildAssignMessage && "owner" in (req.body ?? {})) {
      const newOwner = row.owner;
      const oldOwner = before?.owner ?? null;
      if (newOwner && newOwner !== oldOwner) {
        void (async () => {
          const actor = await resolveActorName(req.userId);
          if (actor === newOwner) return; // assigning it to yourself isn't news
          await notify({
            type: `${req.params.table}_assigned`,
            message: buildAssignMessage(row),
            link: ACTIVITY_NOTIFY_LINK[req.params.table] ?? `/${req.params.table}`,
            owner: newOwner,
            actor,
          });
        })().catch((err) => console.error("[notify] assignment notification failed:", err));
      }
    }
  } catch (err) {
    next(err);
  }
});

app.delete("/api/:table/:id", requireTable, requireAuth, async (req, res, next) => {
  try {
    if (req.userRole === "developer" && DEVELOPER_SCOPED_TABLES.has(req.params.table)) {
      const existing = await getRow(req.params.table, req.params.id);
      const scoped = existing
        ? await scopeRowsForDeveloper(req.params.table, [existing], req.userId)
        : [];
      if (scoped.length === 0) return res.status(404).json({ error: "Not found" });
    }
    const removed = await deleteRow(req.params.table, req.params.id);
    if (!removed) return res.status(404).json({ error: "Not found" });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// `npm run server` uses `node --watch`, which restarts this file on every
// save. On Windows, that restart force-kills the old process (no graceful
// SIGTERM delivery like on Linux/macOS), so the OS can take a few hundred ms
// to actually free the socket even after the old process is gone — the new
// process can lose that race and hit EADDRINUSE despite nothing genuinely
// still listening. Retrying with a short backoff rides that out instead of
// crashing; it only gives up (and tells you to stop the other instance
// yourself) if the port is still taken after several seconds — a sign
// something is actually still running, not just OS cleanup lag.
function listenWithRetry(app, port, attempt = 1) {
  const server = app.listen(port, () => {
    console.log(`API server listening on http://localhost:${port}`);
    console.log(`Tables: ${TABLES.join(", ")}`);
    const shutdown = () => {
      server.close(() => process.exit(0));
      // Force-exit if something (an open Mongo cursor, a pending cron job)
      // keeps the process alive past a graceful close.
      setTimeout(() => process.exit(0), 2000).unref();
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && attempt < 10) {
      const delay = 500 * attempt;
      console.warn(
        `Port ${port} still in use (attempt ${attempt}/10) — retrying in ${delay}ms…`,
      );
      setTimeout(() => listenWithRetry(app, port, attempt + 1), delay);
      return;
    }
    if (err.code === "EADDRINUSE") {
      console.error(
        `Port ${port} is still in use after several retries — another server instance is ` +
          `genuinely still running. Stop it first and try again.`,
      );
      process.exit(1);
    } else {
      throw err;
    }
  });
}

connectDB()
  .then(async () => {
    await initPmCollections();
    listenWithRetry(app, PORT);
    startJobs();
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });
