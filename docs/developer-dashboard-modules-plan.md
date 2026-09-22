# Developer Dashboard — Extended Modules: Plan

Status: **planning only** — nothing in this doc has been implemented yet.

Requested modules (as given): Ongoing Projects → Upcoming Projects, Inquiry Access, Estimation,
Program Management, Scope, Sprint Planning, Sprint, Q&A / Bugs Response, Audit Report, Client
Feedback, Repositories, Progress Report, Client Feedback Statement, Send Invoice.

This doc maps each one onto what already exists in the codebase (reuse) vs what needs to be built
(new table / new UI / new route), so nothing gets rebuilt from scratch by accident. It also flags
a role-and-security question the current dashboard scoping work (see [dashboard.tsx](../src/routes/_authenticated/dashboard.tsx)
and the `DEVELOPER_SCOPED_TABLES` guard in [server/index.mjs](../server/index.mjs)) needs answered
before most of these ship, since several of these modules currently belong to Sales/Admin, not
Developer.

## 0. The cross-cutting question: how much should a Developer actually see?

Several of the requested modules (Inquiry Access, Estimation, Send Invoice) are currently
Sales/Admin-only in the nav (`SALES` role group in `src/lib/nav.ts`) and are **not scoped
per-user** server-side — the recent hardening only locked down `projects`, `tasks`, `work_logs`,
`notifications` for the `developer` role. Before building UI for these, decide:

- **Read-only project context** (recommended default): a developer sees the inquiry/estimate/
  invoice that belongs to *their own* project, so they understand what was sold and what's been
  billed — but cannot edit pricing, resend proposals, or send invoices themselves.
- **Full access**: developer gets the same CRUD Sales/Admin has, just filtered to their projects.

The plan below assumes **read-only, project-scoped** access for anything financial/sales-facing
(Inquiry, Estimation, Send Invoice), and full interactive access for anything delivery-facing
(Sprint, Q&A/Bugs, Progress Report, Client Feedback). Flag if that split is wrong.

## 1. Ongoing Projects → Upcoming Projects

**Exists, needs no new data.** `projects.status` already has `Planning`, `In Progress`,
`On Hold`, `Done` (`server/seed-data.mjs:1152-1237`). Split the existing "My projects" list into
two sections:

- **Ongoing** = `status === "In Progress" || status === "On Hold"`
- **Upcoming** = `status === "Planning"`

No backend change. Frontend: split the single grid in `DeveloperDashboard` (dashboard.tsx) into
two `surface-card` sections, same card markup, different filter predicate.

## 2. Inquiry access

**Doesn't exist for developers today** — gated out of nav (`src/lib/nav.ts:120`, `SALES` group
only) and not server-scoped at all (any authenticated user can already hit `/api/inquiries`
directly — a pre-existing gap, unrelated to developer scoping).

Proposed: a **read-only "Client brief" card** on the project detail page (or a dashboard widget)
showing the originating inquiry for that project (`inquiries` row where its converted deal/project
matches) — client's original ask, description, budget — so the developer has the "why" without
opening full Sales tooling. Needs:
- A link from `projects` back to its source `inquiry_id` (check whether the inquiry→deal→project
  conversion already carries this; if not, add `projects.inquiry_id`).
- Server-side: extend `DEVELOPER_SCOPED_TABLES` to include `inquiries`, scoped by "does this
  inquiry's linked project belong to me" (mirrors the existing `tasks` scoping logic).
- No new nav entry — surfaced inline on the project page, not as a standalone "Enquiries" link.

## 3. Estimation

**Exists fully** (`quotes` collection, `estimations.index.tsx` / `estimations.$quoteId.tsx`,
`server/auto-estimate.mjs`) but Sales/Admin-only in nav and unscoped server-side.

Proposed: read-only **"Estimate" tab or card** on the project detail page showing the accepted
quote for that project (`estimated_hours`, `suggested_price`, `status`) — tells the developer the
time budget they're working against. Needs:
- Add `quotes` to `DEVELOPER_SCOPED_TABLES`, scoped by `quotes.project_id` in the developer's
  project set.
- No edit rights, no calculator access — just the accepted numbers.

## 4. Program management

**Doesn't exist as an entity** — no grouping above `projects`. Two options:

- **A. Skip it** — if "program" here just means "manage my projects", that's already the
  dashboard's job (My projects, Today's focus, etc.) and needs no new concept.
- **B. Build it** — a new `programs` collection (`{id, name, client, project_ids: []}`) that
  groups multiple projects under one client initiative, with its own rolled-up progress. Bigger
  change — new collection, new nav entry, new page. Only worth it if you actually have
  multi-project client engagements today that need a combined view.

Recommend confirming which of these you mean before building anything here.

## 5. Scope

**Doesn't exist as a field.** No `scope` field on `projects`, `deliverables`, or `documents`.

Proposed: add a `scope` text/rich-text field to `projects` (what's in/out of scope for this
engagement — the thing a PM and client agreed to before work started). Shown as a read-only panel
on the project detail page. Small, additive change — one new field, one new panel, no new
collection.

## 6. Sprint planning / Sprint

**Confirmed absent** — no date-boxed iteration concept anywhere; `tasks` and `milestones` are the
closest primitives (Tasks/kanban tab and Milestones tab on `project.$projectId.tsx`).

This is the biggest net-new piece requested. Proposed minimal version:
- New `sprints` collection: `{id, project_id, name, start_date, end_date, goal, status: Planned/Active/Completed}`.
- Add `tasks.sprint_id` (nullable) — a task can optionally belong to a sprint, same pattern as
  `tasks.project_id`.
- New **Sprint** tab on the project page: current sprint's date range + goal, its tasks in a
  kanban filtered to `sprint_id`, and a burndown-style progress bar (done tasks / sprint tasks,
  same math as `computeProjectProgress`).
- **Sprint planning** is the create/edit UI for a `sprints` row plus a "assign tasks to this
  sprint" picker — reuses the existing task list, just adds a sprint-assignment control.
- Dashboard surfacing: a "Current sprint" KPI card + mini task list, same shape as "Today's focus".

## 7. Q&A / Bugs response

**`tickets` exists but isn't linked to projects or developers** (`server/seed-data.mjs:1573-1622`
— `assignee` is a free-text name, no `project_id`, no developer id).

Proposed:
- Add `tickets.project_id` (nullable) so a bug/question can be tied to the project it came from.
- Add `tickets` to `DEVELOPER_SCOPED_TABLES`, scoped the same way as `tasks` (via `project_id` in
  the developer's project set) — plus/or by `assignee === myName` for tickets assigned directly to
  them regardless of project.
- Dashboard: a "Bugs & questions" KPI + list (open tickets assigned to me or on my projects),
  mirroring the "For review" tasks pattern already built.
- No new collection — `tickets` already has `priority`, `status`, `sla_due_at`, which is most of
  what's needed; just needs the relational link.

## 8. Audit report

**Doesn't exist as a feature** — only planning docs use the word "audit", there's no audit-log
collection or UI.

This is a genuinely new feature, and worth scoping down before building:
- **If it means "activity trail"**: an `audit_log` collection recording who changed what and when
  across key tables (task status changes, work log edits, invoice sends) — a generic
  `{table, row_id, actor, field, old_value, new_value, at}` row, written from the existing generic
  PUT/POST/DELETE handlers in `server/index.mjs` (one small hook, reused everywhere).
- **If it means "a compliance/QA report on a project"**: that's closer to a manually-authored
  document, best modeled as a `documents` row of a new type (`documents` already exists — check
  `project-document-types-audit.md` for the type taxonomy it already tracks) rather than a new
  collection.
Recommend clarifying which meaning is intended — the two are very different builds.

## 9. Client feedback / Client feedback statement

**No dedicated collection.** Only proxies today: `tickets.satisfaction` (1-5 rating) and
`inquiries.activity_log` (timeline, not sentiment).

Proposed: new `client_feedback` collection: `{id, project_id, client_name, rating, comment,
submitted_at}`. Two related pieces:
- **Client feedback** (the dashboard module) = a list/summary of feedback rows for the
  developer's projects — read-only, shown as a card with average rating + recent comments.
- **Client feedback statement** = a generated summary/export (PDF or shareable text) of a
  project's feedback over a period — reuse the existing `reports-lib.mjs` PDF-building pattern
  (already used for period reports) rather than inventing new export logic.
- Needs a submission path too (client-facing form or PM-entered-on-client's-behalf) — out of
  scope for the developer dashboard itself, but the collection should exist before the dashboard
  can read from it.

## 10. Repositories

**Partially exists** — `projects.repo_url` is a single string field; `pm_commits`/`pm_daily_log`
already track git activity per project (the existing "VS Dev Activity" tab).

If "Repositories" means *the developer's list of repos across all their projects* (not just one
project's tab), this is mostly a **dashboard rollup**, not new data:
- A "My repositories" card listing each project's `repo_url` + that project's latest commit
  (from `pm_commits`, already scoped) + this-week commit count — i.e. a condensed, multi-project
  version of the existing per-project VS Dev Activity tab.
- No schema change needed unless you want multiple repos per project (currently one
  `repo_url` per project) — flag if that's actually needed.

## 11. Progress report

**Exists at the company level** (`reports.tsx`, 7 tabs including a `"project"` tab,
`POST /api/reports/send`) but is `STAFF`-only in nav, and there's no per-project progress view
*inside* `project.$projectId.tsx` itself.

Proposed: a **"Progress" tab or dashboard card** scoped to the developer's own project(s) —
reuses `computeProjectProgress` (already used everywhere) plotted over time. This directly
overlaps with the "Daily Report" feature already scoped in
[project-management-enhancements-plan.md](project-management-enhancements-plan.md) §3 — build
that once, surface it in both places (project page tab + dashboard card) rather than building it
twice.

## 12. Send invoice

**`invoices` collection exists; no send-email route exists.** Pattern to copy already exists
three times (`/api/inquiries/:id/send-confirmation`, `/api/meetings/:id/send-minutes`,
`/api/proposals/:id/send` in `server/index.mjs`).

Proposed:
- New `POST /api/invoices/:id/send` route, same shape as the proposal-send route: build an email
  (subject/html) from the invoice, `sendMail`, log the send into an activity trail, return the
  updated row.
- Whether a **developer** should be able to trigger this is the open question from §0 above — my
  recommendation is **no**: developer dashboard shows invoice status (Draft/Sent/Paid) for their
  project read-only, and the actual "Send" button stays Admin/Salesman-only, same as Proposals.

## Suggested build order

1. **Free** (reuse existing fields, dashboard-only changes): §1 Ongoing/Upcoming split, §11
   Progress card (once the Daily Report groundwork lands), §10 Repositories rollup.
2. **Small additive fields** (one new field, no new collection): §5 Scope, §2 Inquiry link,
   §7 Tickets↔project link.
3. **New collections, moderate scope**: §6 Sprints, §9 Client feedback.
4. **New collections, needs a decision first**: §4 Program management, §8 Audit report — confirm
   intended meaning before scoping further.
5. **New backend route, access-policy decision required**: §12 Send invoice, §3 read-only
   Estimation surfacing.

Nothing here should be built simultaneously — recommend picking one numbered item at a time,
starting from the "Free" tier, so each lands as a reviewable, working slice rather than one large
change.
