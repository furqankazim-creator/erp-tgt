# Inquiry Pipeline & Email Funnel — Complete Work

This documents everything built against your boss's pipeline workflow diagram
(Inquiry Form → Auto Response/templates → Recorded Meeting & Minutes →
Estimation of Man Hours and Tech Stack → Customized Proposal → Sales: Deals).
Every item below was built for real and verified live against the actual
database and a real SMTP send — not guessed, not simulated.

This is a direct follow-up to two earlier documents from this project:
`docs/inquiry-professional-erp-audit.md` (the 33-section spec audit) and the
in-chat "email funnel" status report — read together, those three documents
are the full paper trail of this build.

---

## 1. Inquiry Form — ✅ done

Every field on the diagram's left column exists and is wired: B2B/B2C,
system-generated ID (`INQ-2026-00001`), Source + Source Medium, Reference,
Title, Details, Screenshots (attachments), Customer New/Existing, Email, the
Send Auto Response toggle, Follow-Up Frequency, Follow-Up Details with
multi-record history, Expected Deal Closure, and Final Status. The form is
organized into five numbered sections matching the structure specified this
session: Inquiry Information, Customer Information, Requirement Details,
Qualification & Follow-Up, Auto Response.

The one soft spot, unchanged from the earlier audit: "pull inquiry from
different mediums" still means the Source field *records* where an inquiry
came from — there's no live ingestion from WhatsApp/phone/social channels.
Manual entry and the public website form are the two real intake paths.

## 2. Auto Response, templates — ✅ done, all three branches real

The diagram shows three parallel template branches. All three now send real
email, dispatched from one endpoint (`POST /api/inquiries/:id/send-confirmation`
with a `template` field) and selectable from the Auto Response section's
Response Template dropdown:

| Diagram branch | Template | Status |
|---|---|---|
| Thank you + links + process + meeting CTA + refund policy + basic quote teaser | **Inquiry Received** | ✅ Sent automatically on creation (if the toggle is ON) and manually via Send Response |
| $10/$20/$30 tiered quote based on complexity | **Basic Quotation** | ✅ New — reads the inquiry's Complexity (Simple/Medium/Complex) and the matching rate from Company Profile |
| Request for meeting | **Meeting Request** | ✅ New — links to the Company Profile meeting-booking link, or asks the client to reply with times |

Every one of these pulls real data instead of hardcoded text — the inquiry
number, and, where configured, links to your portfolio/services/legal docs,
a process overview, a refund policy and the basic-quote rate tiers. All of
that content lives in a new **Response Email Settings** card on the Company
Profile page — nothing renders until you actually fill it in there, so
there's no fabricated content in a client's inbox.

A `Complexity` field (Simple / Medium / Complex) was added to the Qualification
section of the Inquiry form specifically to drive the Basic Quotation rate.

**Still open:** the "Other" option in the dropdown has no template behind it
— the Send button is disabled for it rather than silently failing, and the
UI says so.

## 3. Recorded Meeting & Minutes email — ✅ done

Meetings now carry a Recording link and three structured minutes fields
(Discussion, Decisions, Action Items) plus a Client Email. A new **Send
Minutes** button appears on any meeting that has at least one minutes field
filled in, calling `POST /api/meetings/:id/send-minutes` — this sends the
recording link (if any) and the structured minutes to the client, and
records `minutes_sent`/`minutes_sent_at` on the meeting. Verified live: a
real email went out with the recording link and all three sections
correctly rendered.

## 4. Estimation of Man Hours and Tech Stack — ✅ done

This was the single largest remaining gap. Every item on the diagram's
estimation column now exists as a real, saveable structure on the quote
record, in a new **Detailed estimation** page reachable from any quote in
Estimations (or from an inquiry's linked quotes):

- **Initial Scope** — free text
- **Tech Stack** — an add/remove tag list
- **Deliverables List** — repeatable rows (name + hours), auto-summed into a total
- **Cost Slab** — Simple/Medium/Complex, priced off the same rate tiers configured for the Basic Quotation email (so the two features share one source of truth for pricing)
- **Timeline** — weeks, plus a **Milestones** list (name, due date, description)
- The existing hours × rate × margin math still drives the final Suggested Price, now fed by the deliverable total and the cost-slab rate instead of manual entry

The original quick "New quote" dialog is untouched and still the fast path
for a rough number — the detailed page is where that estimate grows into a
real breakdown once the inquiry is worth the extra work. This mirrors your
boss's "Simple vs Complex inquiry" fork: quick calculator first, structured
estimation only when it's warranted.

## 5. Customized Proposal — ✅ done (built earlier this session)

Template picker, a draft composed from the real inquiry/quote/company data,
a Request Correction workflow, version history (v1/v2/v3…), and Send to
Client with a real PDF attachment. Worth restating precisely: "Proposal by
ai" is a deterministic server-side composition from your actual data, not a
live generative model call — every field is still fully editable before
sending.

## 6. Sales : Deals — ✅ done (bugs fixed earlier this session)

Convert-to-Deal carries the real accepted-quote value, starts at the
correct pipeline stage (Proposal, not Lead), and uses the currently
on-screen owner rather than stale server data.

---

## What's genuinely still open

- **Multi-channel intake** — no automatic ingestion from WhatsApp/phone/social; Source records the channel, it doesn't pull from it.
- **"Other" response template** — intentionally disabled rather than faked.
- **Live AI drafting** — the Proposal draft is a real composition from your data, not a model call; upgrading it to an actual LLM call is a separate, bounded piece of work if you want it.
- **Business-rule guardrails** — nothing currently blocks marking a Deal "Won" without an accepted proposal, or creating a Project with no scope.

## What was verified, and how

Every item above was tested against the real MongoDB Atlas database this
session: test inquiries/meetings/quotes were created with realistic data,
every new endpoint was called directly, all three response-template emails
and the meeting-minutes email were sent through the real SMTP transport, the
structured estimation math was checked by hand against the saved numbers,
and all test records, test notifications, and temporary Company Profile
values were deleted/reverted afterward. `tsc --noEmit`, `eslint`, and a
production `vite build` all pass clean.
