# Project Management — Daily Report (Hours + Progress) & Further Enhancements: Plan

Status: **planning only** — nothing in this doc has been implemented yet.

## 1. Current state — what already exists (don't rebuild)

- **Reports page** (`src/routes/_authenticated/reports.tsx`) — Daily/Weekly/Monthly tabs (all
  built on `work_logs`), plus Employee/Project/Hours/Activity tabs. Already shows **hours** per
  employee and per project. As of this session, Daily/Weekly/Monthly also show **commits and
  active coding time from PM Connect** (`pm_commits`/`pm_daily_log`), mirrored into the automated
  emailed reports (`server/reports-lib.mjs` + `server/jobs.mjs`).
- **Task & Deadline Alerts** — automated weekday email digest of overdue tasks, tasks due within
  2 days, and at-risk projects (`runTaskDeadlineAlerts` in `server/jobs.mjs`).
- **Project detail page** (`src/routes/_authenticated/project.$projectId.tsx`) — 6 tabs: Tasks
  (kanban), Milestones, Deliverables, Finance (budget/cost/revenue, margin, quote calculator),
  Documents, and **VS Dev Activity** (PM Connect commits/active-time/connection-status for that
  one project — confirmed working live in your screenshot: 3 commits this week, 1 day since
  start, team connection status, 30-day activity chart, recent commits feed).
- **Projects portfolio** (`project.index.tsx`) — card grid with a manually-set `progress` field
  (0-100%), budget/cost/revenue KPIs.

## 2. The gap: "Progress" has no history, and there's no per-project daily rollup

Right now `projects.progress` is a single number the PM types into a form — there's no record of
what it was yesterday, last week, or on any given day. Meanwhile `hours` (from `work_logs`) and
`active time`/`commits` (from PM Connect) **are** naturally date-stamped, so a "daily report"
combining them with progress currently has nothing to combine progress *with* on a per-day basis.

**Two ways to fix this — pick one:**

| Approach | What it needs | Trade-off |
|---|---|---|
| **A. Derive progress from tasks (recommended)** | Nothing new to store. For any given day, progress = `(tasks with status "Done" and updated_at ≤ that day) / (total tasks)`. Computed on the fly from data that already exists (`tasks.status`, `tasks.updated_at`). | Free, no new table, always consistent with the Tasks tab. Slightly indirect if a PM wants to report progress as a subjective %, not strictly task-completion-based. |
| **B. Track progress as its own daily log** | New `project_progress_log` collection: `{project_id, date, progress, note}`, populated by a PM manually logging today's % (or captured automatically whenever `projects.progress` changes, via a small hook in the generic PUT route). | Lets a PM report a subjective/negotiated % (common in client-facing status), not just task-math. Needs a new table + a bit of UI to log it. |

My recommendation: **do A now** (zero-cost, immediately useful), and treat **B as optional** if
you specifically want PMs to be able to log a "this is what I'm telling the client" percentage
that doesn't have to match task completion exactly.

## 3. Proposed feature: "Daily Report" per project (hours + active time + progress)

Add a **Daily** view inside the Project detail page (new tab, or a section inside the existing
**Finance** tab — whichever reads better; I'd lean toward a new **"Daily Report"** tab since it's
a distinct concern from Finance) showing, for a date-pickable day (default: today):

- **Hours logged** that day (`work_logs` filtered to this project + date)
- **Active coding time + commits** that day (`pm_daily_log` / `pm_commits` filtered to this
  project + date — same data already powering VS Dev Activity, just re-sliced to a single day)
- **Progress as of that day** (Approach A: % of tasks done by that date) plotted as a small trend
  line so you can see the project's completion curve over its lifetime, not just today's snapshot
- **Per-person breakdown** for that day: who logged hours, who committed code, who touched which
  task — essentially a condensed version of the existing Reports "Daily" tab, but scoped to one
  project instead of the whole company (which is what the *global* Daily report already gives
  you). This is the natural project-level counterpart to the company-wide Daily report you
  already have.
- **Export**: reuse the existing `buildPeriodPdf`/CSV pattern from `reports.tsx`, scoped to one
  project — this is mostly a filter, not new export logic.

This sits naturally as a 7th tab on the project detail page, right next to VS Dev Activity, and
reuses almost entirely existing data and existing chart/export code — the main net-new piece is
the task-completion-over-time trend line (Approach A) and the "for one project only" filtering.

## 4. Menu of further Project Management enhancements

These are independent of each other — pick any subset. Roughly ordered by effort (low → high):

1. **Auto-progress from tasks** (Approach A above) — also usable to *replace* the manual
   `progress` field entirely on the Projects portfolio page, so PMs stop having to remember to
   update it (currently a stale-data risk: nothing keeps `projects.progress` honest).
2. **Burndown / task-completion chart** — a line chart of open-vs-closed tasks over the project's
   lifetime, on the project detail page. Directly reuses the same task-history math as #1.
3. **Per-task time tracking rollup** — `work_logs` already has an optional `task_id`; currently
   nothing surfaces "hours spent per task." A small addition to the Tasks tab (or a new column)
   showing logged hours per task would close that gap cheaply.
4. **Risk register per project** — Strategy page already has a company-wide Risk Register for
   objectives; projects don't have an equivalent. Could add a lightweight `risks` field/table
   scoped to `project_id` (Low/Medium/High, description, mitigation, owner).
5. **Milestone-based Gantt/timeline view** — Milestones tab currently lists milestones with due
   dates but no visual timeline. A horizontal timeline (start date → deadline, milestones plotted
   on it) would give an at-a-glance schedule view — moderate effort (a new chart component, no
   new data needed since `milestones.due_date` + `projects.start_date`/`deadline` already exist).
6. **Task dependencies** — "Task B can't start until Task A is done." Needs a new field on
   `tasks` (`depends_on: string[]`) and UI to set/visualize it. Higher effort, real value mainly
   for complex multi-phase projects.
7. **Client-facing status page** — a read-only, shareable summary (progress, timeline, recent
   milestones, no internal financials) for external stakeholders. Bigger scope: needs its own
   public route + a decision on what's safe to expose externally.
8. **Capacity/resource planning tie-in** — the existing **Planning** page already shows team
   workload; linking it more tightly to per-project task assignment (e.g. "this project needs 2
   more engineers based on remaining task count vs. deadline") is a natural but nontrivial
   follow-on.

## 5. Suggested order

1. Auto-progress from tasks (#1) — cheap, immediately removes a stale-data problem.
2. Daily Report tab on the project page (§3) — the thing you explicitly asked for.
3. Burndown chart (#2) — nearly free once #1 exists.
4. Per-task hours rollup (#3) — small, useful.
5. Everything else (#4–#8) — pick based on what you actually need next; each is independent.

## 6. Open questions

- For the Daily Report tab: do you want it scoped **per project** (as described above, matching
  "in this" from your message — i.e. inside `project.$projectId.tsx`), or do you also want a
  **per-project filter added to the existing company-wide Reports page** (Reports → Project tab
  already exists but doesn't do day-by-day — could add a date picker there instead of/alongside a
  new project-page tab)? These aren't mutually exclusive, but which one first?
- Should the manual `progress` field be **replaced** by task-derived progress, or kept as a
  separate "PM's stated %" alongside an automatically computed one (so a PM can still say "90%"
  even if task-completion math says 75%, when there's a good reason)?
- Any of the "menu" items in §4 you want prioritized ahead of what's in §5's suggested order?
