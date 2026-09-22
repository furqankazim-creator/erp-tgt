# Inquiry Phase Workflow — What Actually Exists

You asked whether these 10 Inquiry Phase steps are already supported.
Checked against the real code — **most of this is not built yet.** Here's
the honest breakdown.

## Summary

| # | Step | Status | Where |
|---|---|---|---|
| 1 | Client Inquiry | ✅ Exists | Inquiries module, `New` stage |
| 2 | Initial Meeting | ⚠️ Partial | Meetings exist but not linked to a specific inquiry |
| 3 | Requirement Gathering | ❌ Missing | No structured field — only generic Description/Notes |
| 4 | Business Analysis | ❌ Missing | Nothing anywhere in the codebase |
| 5 | Feasibility Study | ❌ Missing | Nothing anywhere in the codebase |
| 6 | Scope Identification | ❌ Missing | No scope field on Inquiry (Projects have one, Inquiries don't) |
| 7 | Budget Discussion | ✅ Exists | `estimated_budget` field |
| 8 | Timeline Discussion | ⚠️ Partial | Only internal sales dates, not a client-facing delivery timeline |
| 9 | Proposal Preparation | ⚠️ Partial | "Proposal Sent" is just a status label, no linked proposal document |
| 10 | Client Approval | ❌ Missing | No sign-off field; Agreements exist but aren't linked back to the inquiry |

**Bottom line: 2 of 10 fully exist, 3 are partial, 5 don't exist at all.**
This phase is noticeably less built-out than the document-types area we
looked at earlier — worth knowing before you treat it as ready.

---

## 1. Client Inquiry — exists

The full pipeline: `New → In Review → Responded → Proposal Sent → Deal Done`
(plus `Lost`), with source tracking (Web Form, Referral, Cold Call, etc.).
This is genuinely solid — the same module the auto-email work earlier in
this session plugged into.

## 2. Initial Meeting — partial

Meetings are a real module, but the `client` field on a Meeting is **plain
free text**, not a link to a specific Inquiry record. You can schedule a
meeting and type a client's name, but there's no way to open an Inquiry and
see "here's the initial meeting that happened for this lead" — the two
records are disconnected.

## 3. Requirement Gathering — doesn't exist

An Inquiry has a `description` and a `notes` field — both freeform text.
There's no structured way to capture "here are the specific requirements
the client listed" (as a checklist, a list of items, or even a dedicated
labeled field). Whatever gets written ends up mixed into the same
paragraph as everything else.

## 4. Business Analysis — doesn't exist

No field, no stage, no concept of this anywhere in the app.

## 5. Feasibility Study — doesn't exist

Same — nothing in the codebase represents this step at all.

## 6. Scope Identification — doesn't exist (for inquiries specifically)

Interesting inconsistency: **Projects** have a proper "Scope" field. Once
an Inquiry converts to a Deal and eventually a Project, scope has
somewhere to live. But during the Inquiry phase itself — before you know
if the deal will close — there's nowhere to record "here's what we
tentatively agreed the scope would be."

## 7. Budget Discussion — exists

A real `estimated_budget` number field, shown and editable on the inquiry
form. Solid.

## 8. Timeline Discussion — partial

Two date fields exist — `expected_close_date` and `next_follow_up` — but
both are **internal sales-pipeline dates** ("when do we expect to close
this deal," "when do we follow up next"). Neither represents an actual
discussion with the client about *their* project timeline or delivery
expectations. If "Timeline Discussion" means capturing what you told the
client about delivery dates, that has nowhere to go right now.

## 9. Proposal Preparation — partial

"Proposal Sent" exists as a pipeline stage you can move an inquiry into —
but it's just a label. There's no actual proposal document attached to it.
The Estimations/Quotes module can build a real quote, but **quotes aren't
linked to inquiries at all** (a Quote links to a `project_id`, not an
`inquiry_id`) — so moving to "Proposal Sent" and actually generating a
proposal are two disconnected actions today.

## 10. Client Approval — doesn't exist

No field captures "the client approved this proposal." The only signal is
the inquiry's status eventually reaching `Deal Done` — which conflates
"client said yes" with "we converted the record," and loses the actual
approval moment (date, who confirmed it, how). Agreements do have a
`signed_at` field for formal sign-off, but Agreements aren't linked back to
the Inquiry that produced them either — so even that trail breaks.

---

## What does work well: the conversion itself

One genuinely solid piece: converting an Inquiry into a Deal
(`convertToDeal` in the Inquiries module) correctly carries forward the
account, budget (as deal value), owner, and expected close date, and marks
the inquiry as `Deal Done` with a link back via `deal_id`. The *end* of the
inquiry phase is handled well — it's the *middle* (requirements, analysis,
feasibility, scope, real timeline, real approval) that's thin or missing.

---

## Straight answer to "is this fit for inquiry management"

**Not yet, if you need to run the full 10-step process you described.** As
it stands today, the Inquiry module is really a **sales pipeline tracker**
(source → budget → stage → convert-to-deal) — good at that specific job —
not a **pre-sales workspace** that walks a team through requirement
gathering, feasibility, and formal client approval. Those middle steps
would need real work, not just relabeling existing fields.

If you want to close this gap, in priority order I'd suggest:
1. Link Meetings to a specific Inquiry (`inquiry_id`) — cheap, high value.
2. Add a real "Scope" field to Inquiries (mirroring what Projects already have).
3. Link Quotes/Estimations to an Inquiry (`inquiry_id`) so "Proposal Sent" means something concrete.
4. Add a Client Approval field (approved date + who confirmed) instead of relying on stage alone.
5. Requirement Gathering / Business Analysis / Feasibility Study — these are the least standardized industry-wide; worth discussing what specifically you need captured before building a generic "notes" field with a fancier name.

Nothing above is built — this is the assessment only. Tell me which pieces
matter enough to build, and I'll plan then implement the same way as
everything else this session.
