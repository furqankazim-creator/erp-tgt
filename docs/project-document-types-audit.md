# Project Document Types — What Actually Exists

You asked whether these 10 project-management document/record types are
already handled in this CRM. Checked against the real code (not guessed) —
here's the honest answer for each, then what's actually worth building.

## Summary

| # | Document type | Status | Where |
|---|---|---|---|
| 1 | Meeting minutes | ✅ Exists | Meetings — `notes` field |
| 2 | Project scope from client | ⚠️ Partial | Project — `description` field (plain text, no client sign-off) |
| 3 | Weekly progress reports | ✅ Exists | Reports page — Weekly tab |
| 4 | Monthly progress reports | ✅ Exists | Reports page — Monthly tab |
| 5 | Overall project progress report | ✅ Exists | Project detail + Reports → Project tab |
| 6 | Change of scope | ❌ Missing | Nothing — no concept of this anywhere |
| 7 | Project timesheets | ⚠️ Partial | Log Work (functionally a timesheet, not labeled/structured as one) |
| 8 | Work statements (SOW) | ❌ Missing | Agreements/Estimations have no scope-of-work field |
| 9 | Invoices | ❌ Missing | Nothing — Revenue is a manual number, not a billing ledger |
| 10 | Man hours | ✅ Exists | Log Work `hours`, aggregated in Reports |

**Bottom line: 4 fully exist, 2 exist but only partially, 4 don't exist at
all.** Details below, then what I'd actually recommend building.

---

## 1. Meeting minutes — exists

`src/routes/_authenticated/meeting.tsx` — the `Meeting` type has a real
`notes` field, exposed on the form as **"Agenda / notes"** (a textarea).
It's one combined field for agenda *and* minutes rather than a separate
structured record (no per-attendee notes, no distinct "decisions made" /
"action items" sub-fields) — but it's real, saved data, not something
you'd have to build from scratch.

## 2. Project scope from client — partial

`src/routes/_authenticated/project.tsx` has a **"Scope"** field
(`description`) on every Project record, shown on the project detail page.
It's a plain textarea — there's no concept of "the client submitted this
scope document and signed off on it," no version history, no linkage back
to the Inquiry or Agreement it came from. Good enough for "what's the scope
of this project," not good enough for "prove the client agreed to this
exact scope."

## 3 & 4. Weekly / Monthly progress reports — exist

Both are real, working tabs on the Reports page — not stubs. They generate
actual HTML/PDF/CSV reports with hours, tasks completed, blockers, commits,
active time, and (as of the work we just did) follow-ups due — and they
email automatically on schedule.

## 5. Overall project progress report — exists

Every project has a live progress percentage (`src/lib/project-progress.ts`,
done-tasks ÷ total-tasks — not a manually-typed number), shown on the
project card, the project detail header, a 30-day trend chart, and the
Reports page's dedicated **Project** tab.

## 6. Change of scope — doesn't exist

Searched the entire codebase — there is genuinely no "change order,"
"change request," or "scope change" concept anywhere. If a client's
requirements shift mid-project, there's currently no structured way to
record "here's what changed, here's the new price/timeline, here's who
approved it." This is a real gap, not an oversight in my search.

## 7. Project timesheets — partial

**Log Work** (`work_logs`) is functionally a timesheet — date, employee,
project, task, hours, notes, blocker flag. What it's missing to be a *real*
timesheet in the traditional sense: no weekly grouping/submission (it's
just a running list of daily entries), no approval workflow (a manager
signing off on a week's hours before it counts toward billing/payroll).

## 8. Work statements (SOW) — doesn't exist

Checked both Agreements and Estimations. Agreements only has
`title, client, status, value, signed_at, expires_at, notes` — no
deliverables or scope-of-work field. Estimations/Quotes have pricing fields
but nothing describing *what* is being delivered. If you need a formal SOW
document (deliverables, milestones, acceptance criteria, terms), there's
nowhere in the current schema that holds it.

## 9. Invoices — doesn't exist

This is the most significant gap. `revenue` is just a manually-typed number
on a Project or Deal — there's no invoice record (invoice number, line
items, amount due, due date, paid/unpaid status, linked payments). If
billing currently happens outside this CRM (e.g., in accounting software),
that's fine — but there's no invoice tracking *in* this system at all.

## 10. Man hours — exists

Same `work_logs.hours` field as timesheets, rolled up across Reports (Hours
tab, per-employee and per-project breakdowns) — this is already the "man
hours" concept, just under a different name.

---

## The Documents module itself — one more real gap

Both the standalone Documents page and each project's Documents tab
categorize uploads by **file format only** (`file_type`: pdf / xlsx / docx /
png / csv / zip) — there is no semantic document-type field. You can't
currently tag an uploaded file as "this is a Meeting Minutes doc" vs. "this
is an SOW" vs. "this is an Invoice" — a PDF is just a PDF. There's a
freeform `folder` text field, but it's user-typed with no fixed list, so it
doesn't give you reliable filtering by document type either.

---

## What I'd actually recommend building (in priority order)

1. **Add a `document_type` field to the Documents module**, with a fixed
   list matching your 10 categories (Meeting Minutes, Scope Document,
   Progress Report, Change Order, Timesheet, Work Statement, Invoice, etc.)
   — cheapest fix, immediately makes every existing upload filterable and
   reportable by type. No new module needed, just a new field + dropdown.
2. **Invoices** — genuinely missing and probably the highest business
   value: a real `invoices` table (number, project/client, line items,
   amount, due date, status) would let Revenue stop being a guess and
   start being backed by real records.
3. **Change of scope** — a lightweight `change_orders` table (project,
   description of change, price/timeline impact, approved by, date) tied
   to a project, similar in spirit to how Agreements already work.
4. **Work statements (SOW)** — could piggyback on Agreements by adding a
   `scope_of_work` / deliverables field, rather than building a whole new
   module.
5. **Timesheets as a real workflow** — turning Log Work's running list into
   weekly-grouped, submit-and-approve timesheets — only worth doing if you
   actually need sign-off/audit trail on hours, not just the raw log.

None of this is built yet — this is the assessment you asked for. Tell me
which of these (if any) you want built, and I'll do the same
plan-first-then-implement pattern as everything else in this session.
