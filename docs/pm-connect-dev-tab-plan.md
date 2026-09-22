# PM Connect — "Dev Activity" Project Tab: Plan

Status: **planning only** — nothing in this doc has been implemented yet.

## 1. What PM Connect is

PM Connect is a VS Code extension (publisher `time-global-tech`, v0.1.0) that tracks a
developer's work with zero manual effort and reports it to this CRM:

- **Commit tracking** — every git commit is logged (SHA, message, changed files).
- **Active coding time** — passively measured while VS Code is focused and the developer is
  editing (idle-gated, sampled every 30s, flushed every 60s).
- **Silent auto-match** — on first opening a project folder, the extension sends the
  developer's git email + folder name to the CRM, which matches them to an employee + project
  and hands back a scoped API token. No login screen, no manual config.
- **Sidebar UI in VS Code** — "My Tasks" and "Reports" panels, plus a status-bar connection
  indicator.

Admin setup (in this CRM) is two steps: give the employee a `git_email` that matches their
`git config user.email`, and make sure the project's name contains their workspace folder name
(or matches `repo_url`) and lists them on the team.

## 2. Current state — what already exists (verified, not assumed)

This is further along than a fresh integration — most of the hard part is already built and
working:

- **The extension is already built and installed** on this machine
  (`~/.vscode/extensions/time-global-tech.pm-connect-0.1.0`, packaged copy in
  `~/Downloads/pm-connect-0.1.0.vsix`), with its own README/SETUP/INTEGRATION docs, tests, and a
  mock server. It's a real, mature codebase — not a prototype.
- **The backend contract is already fully implemented** in this repo at
  [server/pmconnect.mjs](../server/pmconnect.mjs), mounted at `/api/pmconnect` in
  [server/index.mjs](../server/index.mjs):

  | Endpoint | Auth | Purpose |
  |---|---|---|
  | `POST /auto-match` | none | git email + folder name → employee/project match → scoped JWT |
  | `POST /project-start` | Bearer + `X-Project-Id` | idempotent "developer first opened this project" ping |
  | `POST /commits` | Bearer + `X-Project-Id` | log a commit (deduped by SHA), auto-updates `work_logs` notes |
  | `POST /heartbeat` | Bearer + `X-Project-Id` | accumulate active coding seconds, auto-updates `work_logs` hours |
  | `GET /my-rollups` | Bearer | week/month/30-day commit + active-time rollup per project |
  | `GET /tasks` | Bearer + `X-Project-Id` | tasks assigned to this developer on this project |

  I checked the extension's actual source
  (`src/providers/customProvider.js`, not just its `package.json` schema defaults, which looked
  stale) and its real `DEFAULT_PATHS` match this backend's routes exactly
  (`/auto-match`, `/project-start`, `/heartbeat`, `/my-rollups`, `/commits`, `/tasks`). The
  extension's default `baseUrl` is already `https://crm.tgailab.site/api/pmconnect`. **The
  extension and this backend are already correctly wired to each other.**
- **Data already lands in MongoDB collections** the app already relies on:
  - `pm_commits` — one row per commit (`project_id`, `commit_sha`, `commit_message`,
    `files_changed`, `employee`, `employee_id`, `created_at`), unique on
    `(project_id, commit_sha)`.
  - `pm_daily_log` — one row per `(project_id, employee, date)` with `commits_count` and
    `active_seconds`, unique on that triple.
  - `projects.started_at` is auto-set on first activity (self-healing: a commit sets it even if
    the initial ping was missed).
  - `work_logs` entries for today are auto-created/updated with hours (from heartbeat seconds)
    and commit notes — so existing Reports pages already benefit from this data without any
    further change.

So the plumbing works end-to-end already. **What's missing is entirely on the CRM's UI side.**

## 3. Gaps — what this CRM doesn't expose yet

1. **No `git_email` field in the HR (Employee) form.** The backend matches on
   `employee.git_email` (falling back to `employee.email`), but the Employee `RecordDialog`
   fields in [src/routes/_authenticated/hr.tsx](../src/routes/_authenticated/hr.tsx) don't
   include it — an admin can't set it today without going into Mongo directly.
2. **No `repo_url` field on the Project form.** The matcher also accepts an exact `repo_url`
   match as an alternative to the folder-name regex; Project's `RecordDialog` fields
   (`buildProjectFields` in [src/routes/_authenticated/project.tsx](../src/routes/_authenticated/project.tsx))
   don't expose it.
3. **No visibility into PM Connect activity anywhere in the app.** `pm_commits` and
   `pm_daily_log` are being written to right now, but nothing reads them back — there's no
   commit feed, no active-time chart, no "is this developer actually connected" indicator
   anywhere in the CRM.
4. **No download page.** The guide's Step 1 for developers is
   "go to `https://crm.tgailab.site/pm-connect/` and download the `.vsix`" — that route doesn't
   exist in this app yet (no matching entry in [nginx/](../nginx) or a Vite route).

## 4. Proposed feature: a "Dev Activity" tab on the Project detail page

This directly answers "add that in your project tab": the Project detail page
([src/routes/_authenticated/project.$projectId.tsx](../src/routes/_authenticated/project.$projectId.tsx))
already has a `Tabs` with 5 tabs — **Tasks, Milestones, Deliverables, Finance, Documents**
(around line 708). Add a 6th:

```
<TabsTrigger value="dev">Dev Activity</TabsTrigger>
```

**No new database table.** Everything renders from `pm_commits` and `pm_daily_log`, both already
being written to by the (already-working) extension, filtered by `project_id` = this project.

Proposed sections inside the new tab:

- **Connection status row** — for each team member (from `project.team` / `manager`), show
  whether their employee record has a `git_email` set, and whether any `pm_daily_log`/
  `pm_commits` rows exist for them on this project ("Connected — last active 2h ago" vs.
  "Not connected yet").
- **KPI cards** — commits this week/month, active hours this week/month, days since project
  started (`projects.started_at`, already tracked) — same shape as the extension's own
  `GET /my-rollups`, just queried server-side scoped to this one project instead of "my
  projects."
- **Active-time chart** — daily active minutes over the last 30 days (bar or area chart,
  `pm_daily_log.active_seconds` grouped by date), reusing the existing recharts patterns already
  used elsewhere in the app (e.g. the cost-per-hour trend chart in
  [src/routes/_authenticated/costing.tsx](../src/routes/_authenticated/costing.tsx)).
- **Recent commits feed** — latest N rows from `pm_commits` for this project, showing SHA
  (short), message, author, changed-file count, timestamp.
- **Download CTA** — a button/link to the `.vsix` download page (see below), for onboarding a
  new developer onto this specific project.

This needs one small backend addition: a scoped read endpoint (or reuse of the generic
`GET /api/pm_commits?...` / `GET /api/pm_daily_log?...` — those aren't in the generic `TABLES`
CRUD list today, so either add them there, or add two small dedicated routes in
`pmconnect.mjs`, e.g. `GET /api/pmconnect/project/:projectId/activity`, auth-gated the same way
as the rest of the app). This is the only backend change this plan calls for — everything else
is additive UI reading existing data.

## 5. Supporting changes

- **HR form**: add a `git_email` field to the Employee `RecordDialog` fields (simple text
  input, same pattern as every other field there). Optionally show a small "PM Connect" status
  chip on the employee row/detail once this exists.
- **Project form**: add an optional `repo_url` field to `buildProjectFields`.
- **Download page**: a static route (e.g. `/pm-connect`) with a page that mirrors the guide's
  content (what it is, how it works, download button for the `.vsix`, admin setup steps, dev
  setup steps, troubleshooting) — this is a content page, not a data page, and can be built as
  a plain route with the `.vsix` served as a static asset. In production this needs an actual
  copy of the `.vsix` file hosted somewhere (this repo's `public/` folder, or object storage) —
  worth deciding where that file's source of truth lives (the extension has its own GitHub repo
  per its `package.json`: `https://github.com/time-global-tech/pm-connect.git`, so the release
  `.vsix` likely belongs there, with this CRM just linking to the latest release asset instead
  of vendoring a copy).

## 6. What does *not* need to change

- The VS Code extension itself — it's already built, already installed, already talking to the
  right backend contract. No extension code changes are in scope here.
- `server/pmconnect.mjs`'s existing 6 endpoints — they're correct and already in production use.
  The only backend addition is the new scoped read endpoint for the project tab (§4).
- No new MongoDB collections or seed data — this plan is entirely additive UI + one small read
  endpoint over data that's already being written.

## 7. Suggested implementation order

1. Add `git_email` to the Employee form, `repo_url` to the Project form (small, low-risk).
2. Add the scoped activity read endpoint in `pmconnect.mjs`.
3. Build the "Dev Activity" tab in `project.$projectId.tsx` (KPIs → commit feed → chart →
   connection status, roughly in that order of effort).
4. Build the `/pm-connect` download/info page.
5. Decide and wire up where the `.vsix` file is actually hosted from.

## 8. Open questions (need your call before implementing)

- Should the scoped activity endpoint live in `pmconnect.mjs` (recommended — keeps PM Connect
  logic together) or should `pm_commits`/`pm_daily_log` just be added to the generic `TABLES`
  list in `server/seed-data.mjs`/`db.mjs` so the existing generic CRUD + `useRows()` hook can
  read them directly from the frontend? The generic route is less code but leaks the "this
  should be scoped and read-only-ish" intent that a dedicated route makes explicit.
- Where should the `.vsix` actually be downloaded from in production — vendored in this repo's
  `public/`, or linked to the extension's own GitHub releases?
- Do you want the "Dev Activity" tab visible to everyone who can see a project, or only to
  admins/managers?
