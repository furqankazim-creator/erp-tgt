# Project Management — Status & Roadmap

Covers everything under the **Delivery → Project** area: Projects, Reports, Log Work, and the
Costing/Pricing work in Accounts that feeds into it. Written as a reference for what exists today,
what's manual vs. automatic, and what to build next.

---

## 1. What's built today

### 1.1 Projects (`/project`)
- **List** (`src/routes/_authenticated/project.index.tsx`): client (linked to real Accounts),
  project manager (`OwnerCombobox`), team (`TeamCombobox`, multi-select), status, progress, start
  date, deadline, budget, cost, revenue, scope, tags. KPI row: active projects, total budget/cost/
  revenue, margin.
- **Detail** (`project.$projectId.tsx`): at-a-glance side panel + tabs:
  - **Tasks** — kanban (To Do/In Progress/Review/Done), assignee scoped to the project's team.
  - **Milestones** / **Deliverables** — own tables, status-tracked.
  - **Finance** — budget/cost/revenue, utilization %, margin, live org cost-per-hour reference, a
    **New quote** shortcut into the Pricing calculator pre-filled for this project.
  - **Documents** — project-scoped view of the shared Documents table.
- **Agreements → Projects**: a signed Agreement gets a "Create project" action pre-filling client/
  budget from the agreement.

### 1.2 Costing & Pricing (`/accounts` → Costing / Pricing tabs)
- **Recurring cost engine**: `costs` table — vendor, amount, frequency (Monthly/Quarterly/Yearly/
  One-time), department, start/end date, status (Active/Paused/Ended). Only `Active` rows count.
- **Payroll integration**: HR `employees.salary` feeds the cost model directly — no re-entry.
- **Org cost-per-hour**: single source of truth in `src/lib/costing.ts`
  (`useOrgCostPerHour()`) — `(fixed costs + payroll) ÷ (active employees × working days × hours/day)`.
  Used by Costing, Pricing, and the Project Finance tab.
- **Budgets**: per-category monthly budget vs. actual, with over-budget flags.
- **Trend history**: `cost_snapshots` — a "Record this month" button snapshots the live rate;
  charted over time.
- **Pricing calculator**: `quotes` table + `QuoteCalculatorDialog` — hours × org rate × margin →
  suggested price, with a rate locked at creation (refreshable on demand, not silently).

### 1.3 Reports (`/reports`)
Built on real logged hours (`work_logs`), not fabricated numbers. Tabs:
- **Daily / Weekly / Monthly** — one shared `PeriodReportView`: KPIs, per-employee breakdown,
  a **recommendations engine** (overdue tasks, unblocked/blocked work, employees with no log,
  a positive callout), CSV export, PDF export (`jspdf`/`jspdf-autotable`), and **Send Report**
  (email with PDF attachment).
- **Employee** — hours-by-employee chart + breakdown table (Team, Total Hours, Days Logged,
  Days Missing, Avg/Day).
- **Project** — portfolio overview: Budget Hours (derived from `budget ÷ org rate`, not
  fabricated) vs. Progress %, a computed health status (On Track/Behind/At Risk/Completed —
  derived from progress vs. elapsed time-to-deadline), and a per-project deep-dive.
- **Hours** — bar charts, hours by employee / by project.
- **Activity** — chronological feed of logged work.
- **Report History** (persistent, all tabs) — every sent report logged with status, with
  Download (regenerate) and Resend actions.

### 1.4 Log Work (`/log-work`)
Time entries: employee, project, optional task, date, hours, notes, blocker flag + note. Feeds
every Reports tab and the Project Finance "loaded cost" figure.

### 1.5 Navigation
`Project` is an expandable sidebar parent (`src/components/app-shell.tsx`) with `Reports` and
`Log Work` nested under it.

### 1.6 Architecture notes
- Backend is schemaless Mongo + fully generic REST (`server/db.mjs`, `server/index.mjs`) — any
  key added to `server/seed-data.mjs`'s `SEED` object becomes a working table automatically.
  The **one** bespoke endpoint is `POST /api/reports/send` (Nodemailer/Gmail SMTP via
  `server/.env` — see `server/.env.example`), because email needs a server-side secret.
- Shared logic lives in hooks/components so numbers can't disagree: `useOrgCostPerHour()`
  (`src/lib/costing.ts`), `QuoteCalculatorDialog`, `RecordDialog` (generic CRUD forms used
  everywhere).

---

## 2. What's manual today (the automation gap)

| Action | Currently | Where |
|---|---|---|
| Sending Daily/Weekly/Monthly reports | Manual click, per report, per send | Reports page |
| Recording a cost snapshot | Manual "Record this month" click | Accounts → Costing |
| Noticing an employee hasn't logged work | Only visible if someone opens Reports and reads the recommendations list | Reports |
| Noticing an overdue task | Same — only surfaces in the recommendations list on demand | Reports |
| Noticing a budget category is over | Only visible if someone opens Accounts → Costing | Accounts |
| Ending a recurring cost past its `end_date` | Nothing — stays `Active` until someone edits it | Costing |
| Re-pricing a quote whose org rate has drifted | Manual "Use current rate" click | Pricing |

None of this is *broken* — it all works correctly when a person looks. The gap is that nothing
looks on its own.

---

## 3. Automation roadmap

The backend already runs as a long-lived Node/Express process (`server/index.mjs`), so the
natural mechanism is an in-process scheduler — **`node-cron`** — rather than relying on someone
opening the app. Proposed jobs, in priority order:

### 3.1 Scheduled report generation & sending (highest value)
- Add `node-cron` to `server/package.json`.
- New server module `server/jobs.mjs`, registered from `index.mjs` after `connectDB()`.
- Jobs:
  - **Daily**, e.g. `0 18 * * 1-5` (6pm weekdays) — build the Daily report for "today," email it
    to a configured recipient list, write a `report_history` row. Skip weekends.
  - **Weekly**, e.g. `0 9 * * 1` (Monday 9am) — last week's report.
  - **Monthly**, e.g. `0 9 1 * *` (1st of month, 9am) — last month's report.
- The report-building logic (`buildPeriodReport`, `buildReportHtml`, PDF generation) currently
  lives client-side in `reports.tsx` because it was built interactively. To automate sending, it
  needs a server-side (or headless-buildable) equivalent — two options:
  - **(a)** Port `buildPeriodReport`/CSV/HTML generation to a shared `.mjs` module the server can
    `import` directly (no PDF needed for the emailed body — HTML email is enough; keep PDF as a
    manual export from the UI).
  - **(b)** Keep generation client-side but add a tiny "trigger" endpoint the cron job calls
    internally — more complex, not recommended.
  - **(a)** is the pragmatic choice. Aggregation math (dates, hours, recommendations) is plain
    JS with no React dependency — it ports cleanly.
- Recipients: add a `report_subscriptions` table (`{ report_type, recipients, active }`) so this
  is configurable from the UI instead of hardcoded — small RecordDialog-based settings page.

### 3.2 Automatic monthly cost snapshot
- Cron: `0 1 1 * *` (1st of month, 1am) — computes the same totals as the "Record this month"
  button and upserts into `cost_snapshots`. The manual button stays as an on-demand override.

### 3.3 Missing work-log digest
- Cron: `0 17 * * 1-5` (5pm weekdays) — find `Active` employees with zero `work_logs` hours for
  today, email a single digest to managers (reuses the existing "no log" recommendation logic).

### 3.4 Budget threshold alerts
- Cron: daily — for each category, if actual > budget, email the account/finance owner. Avoid
  repeat spam by only firing on the day it *crosses* the threshold (compare against yesterday's
  snapshot).

### 3.5 Recurring cost lifecycle
- Cron: daily — any `costs` row with `end_date < today` and `status: "Active"` auto-flips to
  `"Ended"`. Prevents stale recurring costs from silently inflating the org rate forever.

### 3.6 Stale quote follow-up
- Cron: daily — `quotes` with `status: "Sent"` and no update in 7+ days get flagged (a
  `stale: true` computed field, surfaced as a Pricing-tab banner) or trigger a reminder email to
  the account owner.

**Implementation cost is small relative to value**: `node-cron` is a few lines to wire up, and
every job above reuses aggregation logic that already exists — this is mostly "run the existing
computation on a timer and call `sendMail`/`saveRow` instead of waiting for a click."

---

## 4. Feature roadmap (beyond automation)

### Projects
- Task time estimates vs. actuals (currently tasks have no estimate field to compare against
  logged hours).
- Dependency tracking between tasks/milestones (blocked-by relationships).
- A timeline/Gantt view using `start_date`/`deadline` + milestones.

### Costing / Pricing
- Multi-currency support (everything is USD today).
- Vendor/contract renewal reminders (a cost's `end_date` approaching = renewal decision point).
- Quote → invoice conversion once a quote is `Accepted`.
- CapEx vs. OpEx split for fixed costs (affects how "cost per hour" should really be modeled for
  larger equipment purchases — currently `One-time` costs are excluded entirely, which is
  correct for opex but not for amortized capital spend).

### Reports
- Per-user saved report subscriptions (who gets which report, on what cadence) — needed for
  §3.1 anyway, and useful as a self-service UI once it exists.
- Drill-down links from report rows to the underlying project/task/employee record.
- Report branding (logo, color) in the PDF export.
- A comparison view (this period vs. last period) for the Daily/Weekly/Monthly reports.

### Log Work
- Start/stop timer instead of manually typing hours after the fact.
- Calendar/meeting integration to pre-fill likely time entries.
- Bulk/quick-log ("same as yesterday") for repetitive entries.

### Cross-cutting
- **Real auth-to-employee mapping.** Today there's one demo login (`demo@globaltech.io`) used to
  administer data for *all* employees — Log Work, task assignment, etc. all work by picking a
  name from a list rather than "you are logged in as you." Multi-user auth with per-employee
  accounts is the prerequisite for self-service logging, permissions, and personalized report
  subscriptions.
- Role-based permissions (who can edit budgets, send reports, delete records).
- A notification center in-app (bell icon already exists in the header — currently static demo
  data) wired to the same events driving §3's email jobs, so alerts don't require email at all
  for people who'd rather check in-app.
- Audit log (who changed what, when) — valuable once multi-user auth exists.

---

## 5. Suggested near-term order

1. **§3.1 Scheduled report sending** — highest leverage, directly automates the thing you asked
   for, and forces the report-generation logic to be portable (pays off for §3.2–3.6 too).
2. **§3.2 Auto cost snapshot** — trivial once §3.1's cron infra exists.
3. **§3.3 Missing-log digest** — same infra, immediate visibility win.
4. **Report subscriptions UI** (from §4/Reports) — makes §3.1 configurable instead of hardcoded.
5. **§3.5 Recurring cost lifecycle** — small, prevents data drift.
6. Everything else, roughly in the order listed above, as it becomes relevant.

---

## 6. File map

| Area | Frontend | Server data |
|---|---|---|
| Projects | `src/routes/_authenticated/project*.tsx` | `projects`, `tasks`, `milestones`, `deliverables` |
| Costing/Pricing | `src/routes/_authenticated/accounts.index.tsx`, `src/lib/costing.ts`, `src/components/quote-calculator-dialog.tsx` | `costs`, `budgets`, `cost_snapshots`, `quotes`, `org_settings` |
| Reports | `src/routes/_authenticated/reports.tsx` | `work_logs`, `report_history` (reads `employees`/`projects`/`tasks`) |
| Log Work | `src/routes/_authenticated/log-work.tsx` | `work_logs` |
| Email | `server/index.mjs` (`POST /api/reports/send`) | n/a (Nodemailer, `server/.env`) |
| Seed data | `server/seed-data.mjs` | all of the above |
