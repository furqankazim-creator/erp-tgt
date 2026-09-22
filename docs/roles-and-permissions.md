# Roles & Permissions — Global Tech CRM

This document defines three access roles for the ERP: **Super Admin**, **Admin**,
and **Project Management**. It maps each role to every module currently in the
app's navigation.

> **Current status:** the app does not yet enforce any of this — every logged-in
> user currently has full access to every module (there is one shared login
> flow, and the `role` field on an employee record is just a job title like
> "Software Developer", not a permission level). This document is the
> specification to build against. See **§5 What it takes to implement this**
> for what changes that requires.

---

## 0. Who actually holds each role right now

Cross-checked against the real employee records (the ones with real Gmail
addresses, not the seeded `@globaltech.io` demo employees) and their actual
project assignments in the database:

| Person | Email | Current title | Real projects (PM on) | Assigned role |
|---|---|---|---|---|
| — (you) | timeglobaltech@gmail.com | Owner | — | **Super Admin** |
| Zahoor | zahoorjamali32@gmail.com | Software Developer | Test-ERP, testpm, Signature -41, Premium Car Marketplace Design | **Project Management** |
| Furqan | furqankazimworking@gmail.com | Software Developer | Connect | **Project Management** |
| Hasnain | hasnian345@gmail.com | MERN STACK | *(none yet — still Onboarding)* | **Developer** (not yet a manager on any project) |

Notes:

- **Zahoor and Furqan** get the **Project Management** access level (§2's
  Delivery-group full-access-but-own-projects-only rules) scoped to exactly
  the projects listed above — nothing else. If either is later added as team
  (not manager) on someone else's project, their access to *that* project
  should follow the same team-member rule as any assignee, not full PM rights.
- **Hasnain** doesn't fit Project Management yet since he isn't the manager of
  any real project — he's a plain team member for now. Once he's handed a
  project (or added to Zahoor's/Furqan's team), give him either
  **Project Management** (if he becomes a PM) or team-member-level access to
  that one project (view + log work, no delete rights) — whichever matches
  what he's actually doing.
- **No one currently holds Admin.** All company-wide, non-Finance-editing
  operational access (§4) is unassigned — every real person here is either
  Super Admin (you) or scoped to their own project(s). Assign Admin to
  whoever ends up running day-to-day ops across all projects, if/when that
  role exists.
- Every other employee in the system (Amara Okafor, Priya Nair, Sofia
  Almeida, Lena Hoffmann, Ahmed Masror, Marcus Bell, etc.) is seed/demo data
  with placeholder `@globaltech.io` addresses — not real people, so they
  don't get a role assignment here.

---

## 1. The three roles, in one line each

| Role | Who it's for | Scope |
|---|---|---|
| **Super Admin** | Founders / IT owner | Everything, including user management and system config |
| **Admin** | Ops / senior management | Full day-to-day business operation, excluding system-level config and user management |
| **Project Management** | Project managers / team leads | Their own assigned projects and the info needed to run them — nothing company-wide |

---

## 2. Permission matrix

Legend: **Full** = view, create, edit, delete · **Edit** = view, create, edit (no delete) ·
**View** = read-only · **Own only** = same as the level shown, but limited to records
the user is assigned to (e.g. a PM only sees their own projects) · **—** = no access,
module hidden from nav entirely.

### Organization

| Module | Super Admin | Admin | Project Management |
|---|---|---|---|
| Dashboard | Full | Full | View (own projects' data only) |
| Strategy | Full | Full | — |
| Planning | Full | Full | View (own projects' timelines only) |

### People

| Module | Super Admin | Admin | Project Management |
|---|---|---|---|
| HR | Full | Full | — |
| Teams | Full | Edit | View (own project team only) |
| Training | Full | Full | View |

### Marketing

| Module | Super Admin | Admin | Project Management |
|---|---|---|---|
| Company Profile | Full | Edit | — |
| Products & Services | Full | Edit | View |
| Sales Literature | Full | Edit | — |
| Certifications | Full | Edit | — |
| Portfolio | Full | Edit | View |
| Campaigns | Full | Full | — |

### CRM

| Module | Super Admin | Admin | Project Management |
|---|---|---|---|
| Enquiries | Full | Full | — |
| Leads & Contacts | Full | Full | View (contacts tied to own project's account) |
| Meetings | Full | Full | Own only |
| Demos | Full | Full | — |

### Sales

| Module | Super Admin | Admin | Project Management |
|---|---|---|---|
| Opportunities | Full | Full | View (the deal that became their project) |
| Estimations | Full | Full | View |
| Agreements | Full | Edit | View (their own project's agreement) |

### Finance

| Module | Super Admin | Admin | Project Management |
|---|---|---|---|
| Accounts | Full | Edit | — |
| Costing | Full | View | — |
| Revenue | Full | View | — |

Finance stays the most locked-down group outside Super Admin — an Admin can see
the numbers to do their job but shouldn't be able to silently rewrite cost
rates or revenue figures that feed payroll-adjacent calculations
(`org_settings`, cost-per-hour, etc. — see [[pm-connect-time-tracking-report]]
for how those numbers get used downstream in reports).

### Delivery

| Module | Super Admin | Admin | Project Management |
|---|---|---|---|
| Projects | Full | Full | **Full — own projects only** |
| — Reports | Full | Full | Own projects only |
| — Log Work | Full | Full | Own only (can log for their team on their project) |
| Execution | Full | Full | Own only |
| Operations | Full | Full | View |
| After Sales | Full | Full | Own only (if tied to their project) |

This is the one group where Project Management gets real create/edit/delete
power — just scoped to projects where they're the assigned manager or on the
team, not the whole company's delivery pipeline.

### Documents

| Module | Super Admin | Admin | Project Management |
|---|---|---|---|
| Documents | Full | Full | Own project's documents only |

---

## 3. What "Project Management" can never do, regardless of project

- Cannot see another PM's projects, even read-only.
- Cannot see company-wide Finance (Costing, Revenue, Accounts) or HR.
- Cannot create/edit Marketing content, Campaigns, Enquiries, or Demos.
- Cannot manage users, roles, or system settings (SMTP, PM Connect base URL,
  cron schedules, org cost-per-hour settings).
- Cannot delete a project — only Admin/Super Admin can (prevents an
  under-pressure PM from making a project disappear along with its history).

## 4. What separates Admin from Super Admin

Admin can run the business day-to-day, but three things stay Super-Admin-only:

1. **User & role management** — creating accounts, assigning who is Admin vs.
   Project Management, deactivating accounts.
2. **System configuration** — SMTP credentials, `org_settings`
   (working days/hours, cost-per-hour basis), PM Connect backend URL, cron
   schedule changes, database/integration settings.
3. **Full Finance edit rights** — Admin can view Costing/Revenue to do their
   job, but changing the numbers that feed cost-per-hour and payroll-adjacent
   reporting is Super-Admin-only, so no single operational account can quietly
   skew those figures.

## 5. What it takes to implement this

None of the above is enforced today. To make it real:

1. **Data model** — add a real `access_role` field to the employee/user record
   (`super_admin` / `admin` / `project_management`), separate from the
   existing free-text `role` (job title) field so "Software Developer" and
   "Project Management" can coexist without collision.
2. **Backend** — an auth middleware that reads the caller's `access_role` from
   their JWT and checks it against a permission table (module → allowed
   roles) before every request; for "own only" rules, also check the record's
   `project_id`/`manager`/`team` against the caller's identity.
3. **Frontend** — `src/lib/nav.ts` filters which modules render based on
   `access_role`; each route also enforces its own guard (not just hiding the
   nav link) so a Project Management user can't reach a Finance page by typing
   the URL directly.
4. **Migration** — every existing seeded/real employee needs an `access_role`
   assigned before enforcement turns on, or they'd suddenly lose access.

This is a meaningful build, not a config toggle — worth scoping as its own
piece of work when you're ready to implement it, rather than half-enforcing it
module by module.
