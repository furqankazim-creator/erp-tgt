# The Inquiry System — Complete Guide

How an inquiry moves through the CRM end to end, exactly how and when
every email fires, and where everything lives in the code. Written against
the real, current implementation — every claim below is either something
you can click through in the app or something verified live against the
real database this build session.

## Contents

1. [Overview](#1-overview)
2. [The Inquiry Form](#2-the-inquiry-form)
3. [The Email System](#3-the-email-system)
4. [The Automated Drip Sequence](#4-the-automated-drip-sequence)
5. [Estimation & Tech Stack](#5-estimation--tech-stack)
6. [The Proposal System](#6-the-proposal-system)
7. [Converting to a Deal](#7-converting-to-a-deal)
8. [Roles & Permissions](#8-roles--permissions)
9. [Notifications](#9-notifications)
10. [Technical Reference](#10-technical-reference)
11. [What's Not Automated Yet](#11-whats-not-automated-yet)

---

## 1. Overview

The pipeline is: **Inquiry → (Auto response emails) → Estimation → Proposal
→ Deal**. One record (the Inquiry) is the anchor — everything downstream
links back to it by a real ID, nothing gets copy-pasted between stages.

```
Inquiry Form → Auto Response emails → Estimation (Tech Stack/Deliverables)
    → Proposal (drafted from the Estimation) → Send to client → Deal
```

Every inquiry gets a human-readable ID the moment it's saved:
`INQ-2026-00001` — sequential, per year, assigned server-side
(`nextDisplayId` in `server/db.mjs`).

---

## 2. The Inquiry Form

Five numbered sections, in order:

| # | Section | Key fields |
|---|---|---|
| 1 | **Inquiry Information** | Customer Type (B2B/B2C), Inquiry Source, Source Medium, Reference, Priority, Date Received |
| 2 | **Customer Information** | New/Existing toggle + search, Contact/Customer Name, Company, Designation & Website (B2B only), Email, Phone, WhatsApp, Preferred Contact Method, Country, City, Address, linked CRM account |
| 3 | **Requirement Details** | Inquiry Title, Service/Product (from your catalog), Industry, Requirement Details (the main description), Customer Budget (bracket dropdown + Custom), Expected Deal Closure, Tags, Notes |
| 4 | **Qualification & Follow-Up** | 5 Yes/No qualification checks, Potential Value, **Complexity** (Simple/Medium/Complex — drives the Basic Quotation rate), Assigned To, Follow-Up Frequency, Next Follow-Up |
| 5 | **Auto Response** | ON/OFF toggle, Response Template picker, Preview, Send Response, and a live status readout of the automated sequence |

Below those five, still on the same page: **Status Pipeline** (New → In
Review → Responded → Proposal Sent → Deal Done, or Lost), a **Follow-Ups**
log (every call/email logged as its own dated record, not overwritten),
**Related Records** (linked Meetings, Quotes/Estimates, Proposal
Documents), and **Attachments**. There's no separate "Client Approval"
checkbox or manual "Linked CRM account" picker on this form anymore —
converting to a Deal now happens from the Proposal itself (see
[Section 7](#7-converting-to-a-deal)), and the account link is set
automatically when you search for and pick an existing client.

The record header shows the ID, status/priority badges, the assigned
owner, and **Created By** / **Last Updated** — set server-side, never
client-editable.

---

## 3. The Email System

Five distinct emails exist. All of them render through one shared visual
shell (`server/email-shell.mjs`) — dark header with a thin accent bar, a
hidden preheader (the inbox preview snippet), boxed info cards, one
consistent button style — so they read as one product, not five different
one-off templates.

| Email | Fires | Built by | Content |
|---|---|---|---|
| **Thank You** | Instantly on save, if the toggle is ON | `buildInquiryThankYouEmail` | Deliberately bare — greeting, inquiry number, a data table of what they sent (reference/company/industry/message), a plain-text phone and email. **Zero links, zero buttons** — reads as a receipt, not a pitch. Everything persuasive lives in the next email. |
| **Internal Alert** | Instantly on save, always (not gated by the toggle) | `buildInternalAlertEmail` | Full detail dump of the new inquiry to your own team inbox — this is for you, not the client |
| **Basic Quotation** | Automatically 30 minutes after creation, or manually any time via "Send Response" | `buildBasicQuotationEmail` | This is the "links and detail" email: process overview, a tiered $/hr ballpark rate (picked by the inquiry's **Complexity** field, read from Company Profile's Simple/Medium/Complex rates), a real Terms & Conditions box, a **Track your inquiry** link, a "Request a meeting" button, links to your portfolio/services/legal docs, and the refund policy — every section conditional on Company Profile actually having that field set |
| **Meeting Request** | Automatically 60 minutes after creation (30 min after the quotation), or manually | `buildMeetingRequestEmail` | Invites a call — a real button to your Company Profile meeting-booking link if one's set, otherwise asks them to reply with times |
| **Confirmation ("Inquiry Received")** | Manually, via "Send Response" | `buildInquiryConfirmationEmail` | A fuller detail summary once the record has more on it than at creation, includes the assigned owner as point of contact, plus the tracking link |
| **Meeting Minutes** | **Automatically** the moment a meeting's status is set to Completed (if a client email is on file), or manually any time via "Send/Resend detail" | `buildMeetingMinutesEmail` | Meeting title/time/attendees always; recording link and structured Discussion/Decisions/Action Items only if filled in yet — degrades gracefully to a plain recap otherwise |
| **Proposal Sent** | Manually, "Send to client" on a Proposal | `buildProposalSentEmail` (proposal-lib.mjs) | Summary of scope/tech stack/deliverables/timeline, an investment callout, the full PDF attached |

**Where the content actually comes from:** every "About Us" link, the
process overview, refund policy, quotation terms, meeting link, and the
three complexity rates live in a **Response Email Settings** panel on the
Company Profile page (`/company-profile`). Nothing is hardcoded — if a
field there is empty, that section of the email simply doesn't render
(the Terms & Conditions box is the one exception — it always renders,
falling back to a sensible generic default if you haven't set your own).

**The "Track your inquiry" link** is a real, no-login public status page
(`/track/:id`, keyed by the inquiry's internal id — unguessable, not the
sequential display_id) showing the client their reference number, a
simple pipeline stepper (New → In Review → Responded → Proposal Sent →
Deal Done, or a Lost badge), received/expected-closure dates, and how to
reach you. It exposes nothing sensitive — no notes, budget, owner, or
contact details beyond the client's own.

**Every send is logged** in the inquiry's own activity timeline —
`{ type: "email", message: "...", at: "..." }` on success, `email_failed`
on failure — so there's a real audit trail of who/what got sent and when.

---

## 4. The Automated Drip Sequence

This is the timed automation behind the "Auto Response, templates" box in
the workflow diagram:

```
T+0        Thank You            — fires instantly (if toggle is ON), no links
T+30 min   Basic Quotation      — fires automatically, all the links + detail
T+60 min   Meeting Request      — fires automatically, another 30-min gap
```

All three land inside the first hour, each thirty minutes apart — a
deliberate pace: a bare receipt first, then substance once the client's
had a moment to actually want it, then the ask for a call.

**How it's actually scheduled:** the moment an inquiry is created (with an
email and the toggle ON), two timestamps are stamped onto the record:
`auto_quotation_send_at` (now + 30 min) and `auto_meeting_send_at` (now +
60 min). A background job — `runAutoResponseSequence` in `server/jobs.mjs`,
on a 5-minute cron (`*/5 * * * *`) — scans for inquiries whose due-time has
passed and haven't been sent yet, and fires them.

**Safety rules, all verified live:**
- **Closed inquiries are skipped** — if status is `Lost` or `Deal Done`
  before the due time, nothing sends.
- **No double-send** — if a human manually sends that same template first
  (via "Send Response"), the exact same `auto_quotation_sent` /
  `auto_meeting_sent` flag the cron job checks gets set, so the automated
  step never fires again for that inquiry.
- **Idempotent** — the job only touches records that are actually due and
  unsent; running it twice back-to-back sends nothing the second time.
- **Failures don't retry forever** — a failed send is marked sent anyway
  (with an `email_failed` log entry) rather than looping.

The Inquiry form's Auto Response section shows a live **"Automated
sequence"** readout — Thank You (sent on save), Basic Quotation
(sent / scheduled for [time] / not scheduled), Meeting Request (same) — so
this isn't invisible magic, you can see exactly where each inquiry stands.

---

## 5. Estimation & Tech Stack

Two tiers, matching the "Simple vs Complex inquiry" fork the workflow is
built around:

**Fast path — the quick calculator** (`QuoteCalculatorDialog`): title,
hours, margin %, rate — computes cost basis and suggested price instantly.
Reachable from an inquiry's Related Records ("Create proposal" — the label
is a holdover, it makes a Quote) or the Estimations page ("New quote").

**Detailed path — the Estimation page** (`/estimations/$quoteId`): opened
via "Detailed estimate" from any quote row. Sections:
- **Initial Scope** — free text
- **Tech Stack** — an add/remove tag list
- **Deliverables** — a real table (name + hours per row), auto-totaled
- **Cost Slab** — Simple/Medium/Complex, priced off the *same* rate tiers
  configured for the Basic Quotation email — one source of truth for
  pricing across both features
- **Timeline** — weeks
- **Milestones** — a numbered list (name, due date, description)

Saving computes the real `suggested_price` shown at the top of the page,
and this is exactly the data the Proposal draft pulls from next.

---

## 6. The Proposal System

**Draft generation** (`buildProposalDraft`, `server/proposal-lib.mjs`)
composes every section from real data — **not** a live AI call, a
deterministic server-side composition, but genuinely built from what's on
file, not placeholder text:

| Section | Sourced from |
|---|---|
| Executive Summary | Company Profile + Inquiry description |
| Client Requirements | Inquiry description |
| Proposed Solution / Scope of Work | The linked Estimation's **Initial Scope** (falls back to the inquiry description if no estimation exists yet) |
| Technology Stack | The linked Estimation's **Tech Stack** tags |
| **Deliverables** | The linked Estimation's **Deliverables** list, itemized with hours |
| Project Timeline | The Estimation's **Timeline (weeks)** and total hours |
| Milestones | The Estimation's **Milestones** list |
| Cost | The Estimation's **Suggested Price** (or the inquiry's budget guess if no estimation exists) |
| Payment Terms / T&Cs / Assumptions / Exclusions | Standard boilerplate — always editable |

**The editor** (`/proposals/$proposalId`): shows the record ID
(`PROP-2026-00001`), version, status; every section as an editable
textarea; **Regenerate draft** to re-pull fresh Estimation data; **Save**;
**Download PDF** any time.

**Sending**: "Send to client" validates cost > 0 and Scope of Work is
filled, emails the branded summary + attaches the full PDF, flips status
to **Sent**, records who/when/to whom, fires a notification.

**Correction & versioning**: Admin/Super Admin can **Request correction**
(status → `Correction Required`, with comments the owner sees). **New
version** creates `v2` as a fresh Draft — `v1` isn't overwritten, it stays
in the Version History list on the editor.

**List page** (`/proposals`): every proposal, filterable by role, with a
KPI strip (total / sent / needing correction / pipeline value).

---

## 7. Converting to a Deal

There is exactly one place this happens now: the Proposal editor. Once a
proposal's status is **Sent**, a green **"Client Accepted — Create Deal"**
button appears right there on the same page — no separate approval
checkbox, no switching to the Inquiry. Clicking it creates a real Deal
record:
- **Stage: Proposal** (not "Lead" — the client has already seen a
  proposal by this point, so the deal doesn't restart the pipeline)
- **Probability: 75%** (matching the Proposal stage, not a cold lead)
- **Value**: the exact price on the proposal the client just accepted
- **Owner**: the proposal's owner (falling back to the inquiry's owner)
- Links back to the inquiry (`inquiry_id`) and the account (`account_id`)
  by ID — no customer data is duplicated

Behind the scenes it also updates the Inquiry: status flips to **Deal
Done**, and it's marked approved — so both records agree, even though
you only clicked one button on one page. The shared logic behind this
lives in `src/lib/convert-to-deal.ts`, used only by the Proposal editor.

---

## 8. Roles & Permissions

Four roles: `super_admin`, `admin`, `developer`, `salesman`.

- **Salesman** sees only inquiries/deals/contacts/accounts/meetings/
  estimates/proposals/agreements they own (matched by their logged-in
  email against the Employees table) — "fail closed": if their name can't
  be resolved, they see nothing rather than everything.
- **Salesman and Admin/Super Admin** can both send response emails and
  meeting minutes.
- **Only Admin/Super Admin** can request a proposal correction.
- Every "New X" action on a scoped page defaults the owner field to the
  logged-in salesman automatically.

---

## 9. Notifications

An in-app bell with a sound alert (polled every 4 seconds). Admin/Super
Admin see everything; a Salesman sees only their own. Fires on: record
creation (inquiry/contact/deal/account/meeting/quote/agreement),
assignment changes (owner field changing on an existing record), deal
won, proposal sent, follow-up due, and stale/pending inquiries.

---

## 10. Technical Reference

**Backend**
| File | Responsibility |
|---|---|
| `server/index.mjs` | All routes — generic CRUD, the dedicated `/api/inquiries/:id/send-confirmation`, `/api/proposals/*`, `/api/meetings/:id/send-minutes` |
| `server/inquiry-mail.mjs` | Thank You, Basic Quotation, Meeting Request, Confirmation, Internal Alert, Meeting Minutes builders |
| `server/proposal-lib.mjs` | Proposal draft composition, PDF export, sent-email builder |
| `server/email-shell.mjs` | Shared visual chrome every email renders through |
| `server/jobs.mjs` | All cron jobs, including `runAutoResponseSequence` |
| `server/db.mjs` | `nextDisplayId`, generic CRUD helpers |

**Frontend**
| File | Responsibility |
|---|---|
| `src/components/inquiry-form.tsx` | The full Inquiry create/edit page |
| `src/components/estimation-detail.tsx` | The Detailed Estimation editor |
| `src/components/proposal-editor.tsx` | The Proposal editor + `useCreateProposal` hook |
| `src/routes/_authenticated/inquiries*.tsx` | Inquiry list, board, new, edit routes |
| `src/routes/_authenticated/estimations.tsx` + `estimations.index.tsx` + `estimations.$quoteId.tsx` | Estimations list + detail (layout/index split — see note below) |
| `src/routes/_authenticated/proposals.tsx` + `proposals.index.tsx` + `proposals.$proposalId.tsx` | Proposals list + detail (same split) |
| `src/routes/_authenticated/company-profile.tsx` | Response Email Settings + company identity |
| `src/routes/track.$inquiryId.tsx` | Public, no-login inquiry status page (top-level route, not under `_authenticated`) |

*Routing note:* Estimations and Proposals each use three files — a bare
`X.tsx` layout with `<Outlet />`, `X.index.tsx` for the list, and
`X.$id.tsx` for the detail page. This split is required by TanStack
Router's file-based convention whenever a list page and a detail page
share a path prefix — without it, the detail page silently never renders
(this was a real bug, found and fixed this session).

**Cron schedule** (`server/jobs.mjs`, 12 jobs, `Asia/Karachi`): daily
report 17:30 weekdays, weekly report Monday 09:00, monthly report 1st
09:00, cost snapshot monthly, missing-log digest 17:00 weekdays, budget
alerts daily 08:00, task/deadline alerts 07:00 weekdays, cost lifecycle
daily 02:00, stale quotes daily 03:00, **follow-up reminders every 2h
08:00–18:00, Monday–Saturday**, live link check 04:00 & 16:00, **auto
response sequence every 5 minutes, all day, every day**.

---

## 11. What's Not Automated Yet

Stated plainly, not hidden:

- **Multi-channel intake** — only the manual form and the public website
  widget create inquiries automatically. WhatsApp/phone/social inquiries
  still need a person to type them in.
- **The "Other" response template** — no content behind it; the Send
  button is disabled for it rather than sending something fake.
- **Live AI drafting** — the Proposal draft is a real composition from
  your data, not a call to a language model.
- **Business-rule guardrails** — nothing currently blocks marking a Deal
  "Won" without an accepted proposal, or creating a Project with no scope.
- **No automated post-Deal-Won email** — a Deal won only fires an internal
  notification today, no client-facing "welcome, here's what's next"
  email exists yet.
- **A Deal can now only be created from a Proposal.** The old Inquiry-side
  "Client Approval" checkbox (a shortcut for simple Basic-Quotation-only
  inquiries with no formal Proposal involved) was removed at the user's
  request. Any inquiry — simple or complex — now needs a Proposal record
  before it can become a Deal.

Everything else described in this document was tested against the real
database and, for every email, a real SMTP send — not simulated.
