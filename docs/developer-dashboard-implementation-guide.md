# Developer Dashboard — Implementation & Working Guide

Status: **specification for implementation** — companion to
[developer-dashboard-modules-plan.md](developer-dashboard-modules-plan.md), which decides *what*
gets built and in what order. This doc explains **how the finished dashboard works**: layout,
navigation, data flow per module, states, and role rules — so it can be built directly from this
file without re-deriving decisions already made in the modules plan.

Read the modules plan first for the reuse-vs-new-build decision on each module. This doc assumes
those decisions and describes the resulting system.

---

## 1. Overall structure

```
┌─────────────────────────────────────────────────────────────┐
│ Top navbar: logo · search · quick actions · notifications · avatar │
├───────────┬───────────────────────────────────────────────────┤
│           │  Main content area                                │
│  Sidebar  │  (route-driven, one panel per nav item)            │
│  (nav)    │                                                    │
│           │                                                    │
└───────────┴───────────────────────────────────────────────────┘
```

- **Shell**: one persistent layout component (sidebar + navbar) wrapping a router outlet, same
  pattern as the existing `_authenticated` layout. Each sidebar item is a route; the main area
  swaps per route. No full page reload between sections.
- **Sidebar**: collapsible to icon-only on tablet, becomes a bottom sheet / hamburger drawer on
  mobile. Active route highlighted. Section grouping: Overview → Projects → Delivery → Quality →
  Reporting → Billing (grouping only, not literal headers unless it helps scanning).
- **Navbar**: global search (projects/tasks/tickets by keyword), quick actions (New Task, Log
  Work, Report Bug — configurable per role), notification bell with unread badge, profile menu
  (settings, logout).
- **State ownership**: dashboard-level data (projects, KPIs) fetched once at shell mount and
  passed down / cached; each module fetches its own detail data on route entry so no module blocks
  another's load.

## 2. Data flow, in one sentence per layer

- **Server** exposes scoped REST endpoints (existing generic CRUD + a few purpose-built ones, per
  the modules plan's §1–§12 route notes) — a developer's requests are filtered server-side by
  `DEVELOPER_SCOPED_TABLES`, never trusted from client-side filtering alone.
- **Client** fetches per-module data through the existing API client, caches with the app's
  existing data-fetching pattern (React Query / equivalent already in the codebase), and renders
  from that cache — no module invents its own fetch layer.
- **Mutations** (task status change, bug comment, sprint task move) go through existing PUT/POST
  routes and invalidate the relevant cache key so the dashboard reflects the change immediately.

## 3. Module-by-module: how it behaves

### 3.1 Dashboard (home)

- KPI row: Active Projects, Upcoming Projects, Tasks Due This Week, Open Bugs, Sprint Progress %,
  Pending Client Feedback — each a number pulled from a single aggregate fetch, not one call per
  card.
- Sections below the fold: Project Progress chart, My Tasks (status-editable inline), Upcoming
  Deadlines (sorted ascending, urgent = red badge if ≤2 days), Recent Activity timeline.
- Clicking any KPI card deep-links to the matching sidebar module pre-filtered (e.g. "Open Bugs"
  → Q&A/Bugs module filtered to `status != Closed`).

### 3.2 Ongoing Projects / Upcoming Projects

- One shared project list underneath, split into two views: `status ∈ {In Progress, On Hold}` vs
  `status = Planning`, per modules-plan §1.
- Ongoing view: filter chips (All / Active / At Risk / Delayed / Completed) computed client-side
  from `status` + a derived "at risk" flag (e.g. progress% behind expected pace for elapsed time).
- Upcoming view: same cards plus a calendar/timeline strip showing planned start dates across the
  next quarter; clicking a date scrolls to matching cards.
- No new backend for either — pure filter/derive over existing `projects` rows already scoped to
  the developer.

### 3.3 Enquiry Access

- Read-only card, either inline on a project's detail page or as a filtered list view reachable
  from the sidebar — shows the `inquiries` row linked via `projects.inquiry_id` for each of the
  developer's projects (modules-plan §2).
- No edit affordances anywhere in this view — the absence of edit controls *is* the permission
  boundary, enforced again server-side since `inquiries` will be added to
  `DEVELOPER_SCOPED_TABLES` read-only.

### 3.4 Estimation

- Read-only summary card per project: accepted quote's `estimated_hours`, `suggested_price`,
  status, plus a computed "Estimated vs Actual" bar (actual = summed `work_logs` hours for that
  project) — no calculator, no recalculation UI exposed to developers (modules-plan §3, §0).

### 3.5 Program Management

- Build only if modules-plan §4 option B is chosen. If built: a list of `programs`, each expandable
  to its member projects with a rolled-up progress bar (average of member `computeProjectProgress`
  values) and a simple dependency/risk list (free-text fields, not a full dependency graph engine).

### 3.6 Scope

- One panel per project: read-only rendering of the `projects.scope` field (rich text) split into
  sub-sections (Objectives, Requirements, In-scope, Out-of-scope, Assumptions, Constraints) via
  markdown headings within the single field — no need for six separate DB columns.
- **Scope Change Requests** sub-section: a simple list with status badges
  (Pending/Under Review/Approved/Rejected/Implemented). Developers can view all; only PM/Admin
  roles get an approve/reject control (hidden entirely from developer role, not just disabled).

### 3.7 Sprint Planning

- Form/modal to create a `sprints` row: name, goal, start/end date, capacity, member picker (from
  the project's assigned developers), task picker (assigns `tasks.sprint_id`).
- Summary view per sprint: planned vs completed vs remaining story points, computed by summing
  `tasks.story_points` grouped by `tasks.status` for that `sprint_id` — no separate points ledger.

### 3.8 Sprints (board)

- Kanban with fixed columns: Backlog, To Do, In Progress, Code Review, QA Testing, Done — backed
  by `tasks.status` enum extended to include the new column values.
- Cards show id, title, assignee avatar, priority badge, story points, due date, labels; drag
  between columns fires the existing task-update PUT, optimistic-updates the board, rolls back on
  failure with a toast.
- Filtering by sprint (`sprint_id`) switches which tasks populate the board; a "Backlog" toggle
  shows tasks with `sprint_id = null`.

### 3.9 Q&A / Bugs / Response

- Two tabs in one module (shared filters: project, status, severity/priority):
  - **Bugs**: table over `tickets` (extended with `project_id` per modules-plan §7), sortable by
    severity/due date, status badges matching the defined bug-status enum, click-through to a
    detail drawer with description, comments, attachments.
  - **Q&A**: same `tickets` table filtered to a `type = question` discriminator (or a lightweight
    parallel structure if question/bug need materially different fields) with a response thread.
- Status changes and responses go through the existing generic PUT + a comment/append endpoint,
  same pattern as task comments if one already exists.

### 3.10 Audit Report

- Searchable/filterable table over the new `audit_log` rows (or scoped to a project's `documents`
  entry, depending on which meaning is confirmed per modules-plan §8): columns for actor, action,
  entity, before/after, timestamp; filters for date range, actor, entity type.
- Purely additive and read-only — no write path from the developer dashboard itself.

### 3.11 Client Feedback / Client Feedback Statement

- **Client Feedback**: list of `client_feedback` rows for the developer's projects, each with
  rating, comment, status badge, and (if permitted) a response box that PUTs the developer's reply
  back onto the row.
- **Client Feedback Statement**: a derived, read-only rollup per project — average rating,
  categorized comments (positive / issues / requested improvements via simple keyword or manual
  tagging), resolution status — rendered as a summary card, optionally exported via the existing
  `reports-lib.mjs` PDF path (modules-plan §9).

### 3.12 Repositories

- Card grid, one per project: repo name/provider parsed or stored alongside `repo_url`, last
  commit + this-week commit count pulled from existing `pm_commits`, action buttons that just
  `window.open` the provider URLs for repo/branches/commits/PRs — no token or credential ever
  rendered client-side (modules-plan §10).

### 3.13 Progress Report

- Per-project report view: progress %, task breakdown (done/in-progress/pending), sprint points,
  bug counts (resolved/open), blockers/risks (free text), upcoming tasks — all computed from
  existing `computeProjectProgress` + task/ticket aggregates, no duplicate calculation logic.
- Actions: Generate (snapshot current numbers into a stored report row so history isn't lost),
  Preview, Export PDF (reuse `reports-lib.mjs`), Share with PM (sends existing notification or
  email, not a new channel).

### 3.14 Invoice

- Read-only table: id, project, client, dates, amount, tax, total, payment-status badge. "View"
  and "Download" available to developers; **"Send Invoice" button hidden for the developer role**
  entirely (not just disabled) per modules-plan §12 recommendation — the send route itself also
  checks role server-side so hiding the button is UX, not the security boundary.

## 4. Notifications

Single notification center fed by one endpoint returning a unified, chronologically sorted feed
across: task assigned, bug assigned, client feedback received, sprint started, sprint deadline
approaching, scope change request, project deadline approaching, Q&A response, report request.
Each notification type carries a `link` field so clicking it deep-links into the right module —
avoid one bespoke notification renderer per type; use one card component keyed by `type` for icon
and color only.

## 5. Role / permission enforcement (do this in two places, always)

1. **Server**: `DEVELOPER_SCOPED_TABLES` (and equivalent role checks on purpose-built routes like
   invoice-send) is the actual security boundary. Every module above must have its server route
   scoped before the UI ships — a hidden button is not a permission.
2. **Client**: hide/disable controls the developer's role shouldn't see (edit scope approval,
   send invoice, edit invoice amounts, user management, system settings) so the UI never implies
   an action that would 403. Treat client-side hiding as UX polish only.

## 6. Visual/interaction conventions (apply everywhere, don't reinvent per module)

- Status badges: one shared badge component, color mapped by a single status→color lookup table
  per domain (project status, bug status, feedback status, invoice status, scope-change status)
  so colors stay consistent across modules.
- Progress bars: one shared component, used for project progress, sprint burndown, program rollup.
- Tables: one shared data-table component with built-in filter row, search box, and pagination —
  every module's table (bugs, audit log, invoices, feedback) is a configuration of it, not a new
  table implementation.
- Empty/loading/error states: every module renders the same three shared states (skeleton loader,
  empty-state illustration + copy, retry-on-error) rather than ad hoc spinners per module.
- Responsive rule: cards reflow to single column below ~768px; tables switch to a stacked
  card-per-row layout below ~600px rather than horizontal scrolling.

## 7. Build sequencing

Follow the modules plan's suggested build order (§"Suggested build order"): free/reuse modules
first (Ongoing/Upcoming split, Repositories rollup), then small additive-field modules (Scope,
Enquiry link, Tickets↔project link), then new-collection modules (Sprints, Client Feedback), then
the two modules needing a scoping decision (Program Management, Audit Report), then the
access-policy-gated modules (Send Invoice, Estimation surfacing) last. Building the shell (sidebar
+ navbar + routing) can happen in parallel with the first tier since it has no data dependency
beyond the dashboard KPI aggregate.
