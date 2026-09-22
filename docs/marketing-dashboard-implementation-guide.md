# Marketing Dashboard — Implementation & Visual Specification Guide

Status: **Specification & Blueprint** — Built to match the exact visual design, layout architecture, and user flow of the **Time Global Tech CRM Platform** (as seen in the Developer Dashboard).

---

## 1. Executive Summary & Dashboard Concept

When a **Marketing Lead / Marketing Specialist** logs into the **Time Global Tech CRM Platform**, their dashboard provides a real-time command center for managing marketing campaigns, tracking inbound leads, coordinating content creation, tracking time/costs against campaign budgets, and measuring ROI.

It adopts the identical UI design system as the Developer Dashboard:
- **Theme & Colors**: Dark navy sidebar (`#111827` / `#0F172A`) with active teal indicator pill (`#0D9488` / `#14B8A6`), off-white main content background (`#F8FAFC`), rounded shadow cards (`surface-card`).
- **Header**: Global search bar, theme toggle, and profile dropdown (`M - marketing@timeglobal.tech`).
- **Layout**: Top KPI summary cards row, dual content panels (Active Campaigns + Marketing Tasks), dedicated Log Work view, Marketing Documents folder structure, and Campaign Detail view with multi-tab workflow.

---

## 2. Dashboard Layout Structure & Wireframe

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Time Global Tech  │ 🔍 Search campaigns, leads, content, deals... [⌘K]         🌙  (M) marketing@...│
│ CRM Platform      │                                                                              │
├───────────────────┼──────────────────────────────────────────────────────────────────────────────┤
│ ORGANIZATION      │ Dashboard                                                       [ + Log work ] │
│ 🟢 Dashboard     │ Your campaigns, leads and marketing tasks — Marketing Lead.                  │
│                   │                                                                              │
│ MARKETING         │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │
│ 📁 Campaigns      │ │ACTIVE CAMPAIG│ │LEADS THIS MON│ │MARKETING HOUR│ │TOTAL ASSIGNED│         │
│ 📣 Lead Funnel    │ │  3          ⚙│ │  128       📈│ │  34.5       ⏰│ │  8          🎯│         │
│ ✍️ Content & Assets│ │  across 2 client│ │  +18% vs last│ │  logged this │ │  across 3    │         │
│ ⏱️ Log Work       │ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘         │
│                   │                                                                              │
│ ANALYTICS         │ ┌──────────────────────────────┐ ┌─────────────────────────────────────────┐│
│ 📊 Reports & ROI  │ │ Your campaigns       View all│ │ Your marketing tasks           Log work ││
│                   │ │                              │ │ ┌───────────┐ ┌───────────┐ ┌──────────┐ ││
│ DOCUMENTS         │ │ Q4 SaaS Growth Campaign     │ │ │ TO DO (2) │ │IN PROGRESS│ │ DONE (4) │ ││
│ 📄 Documents      │ │ Harbor Media · Due 30 Oct 26 │ │ │           │ │  (2)      │ │          │ ││
│                   │ │ Status: [ Active ]           │ │ └───────────┘ └───────────┘ └──────────┘ ││
│                   │ └──────────────────────────────┘ └─────────────────────────────────────────┘│
└───────────────────┴──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Top Metrics Row (KPI Summary Cards)

The top section displays 4 interactive metric cards matching the 4-card grid layout:

| Metric Card | Icon | Value / Display | Subtext / Metric Indicator | Deep-Link Destination |
|---|---|---|---|---|
| **ACTIVE CAMPAIGNS** | 📣 Megaphone (Teal Circle) | **3** | across 2 client accounts | `/marketing/campaigns?status=active` |
| **LEADS THIS MONTH** | 🎯 Target / Funnel (Teal Circle) | **128** | `+18%` growth vs last month | `/marketing/leads` |
| **HOURS THIS WEEK** | ⏰ Clock (Teal Circle) | **34.5** | logged across campaigns | `/marketing/log-work` |
| **TOTAL ASSIGNED TASKS** | 📝 Task List (Teal Circle) | **8** | 2 urgent, 4 in progress | `/marketing/tasks` |

---

## 4. Main Dashboard Views & Modules

### 4.1 Home Overview (`/dashboard` for Marketing Role)

#### Panel 1: Your Campaigns (Left Panel)
Displays cards for campaigns where the logged-in user is assigned as Marketing Lead or Team Member.
- **Card Fields**:
  - Campaign Name (e.g., *Q4 SaaS Growth Campaign*, *Social Media Rebranding*, *SEO Inbound Funnel*)
  - Client / Brand Name (e.g., *Harbor Media*, *Nimbus Logistics*, *Internal Tech Hub*)
  - Due Date / Target End Date
  - Status Tag (`Active` [Green], `Planning` [Orange], `In Progress` [Blue], `Completed` [Gray])
  - Mini Progress Bar (% of lead target or content deliverables completed)
  - Team Avatars & Budget indicator

#### Panel 2: Your Marketing Tasks (Right Panel)
Embedded Kanban view or task list filtered to tasks assigned to the logged-in Marketing person:
- Columns: **TO DO** | **IN PROGRESS** | **REVIEW** | **DONE**
- Card details: Task title, Campaign tag, Priority badge (`High`, `Medium`, `Low`), Due date, quick drag-and-drop or status change dropdown.
- Quick button: `+ Log work` for direct time tracking.

---

### 4.2 Campaigns List Page (`/marketing/campaigns`)

Matches the **Projects** view structure from Image 2:
- **Header**: "Campaigns — Your assigned marketing campaign(s), budget, leads and content board."
- **Summary Financial & Performance Bar**:
  1. `ACTIVE CAMPAIGNS`: **3**
  2. `TOTAL BUDGET`: **$25.0K**
  3. `SPENT TO DATE`: **$14.2K**
  4. `LEADS GENERATED`: **210**
  5. `AVG CAC (Cost Per Lead)`: **$67.61**
- **Search & Filter Bar**: `Search campaigns, channels, clients, managers...`
- **Grid Layout**: Campaign Cards showing:
  - Client & Campaign Lead
  - Deliverables progress bar (% completed)
  - Team members assigned
  - Target Deadline & Allocated Budget
  - `Edit` link & direct link to Campaign Workspace

---

### 4.3 Campaign Detail Workspace Page (`/marketing/campaigns/:campaignId`)

Matches the **Project Detail View** (Aurtisam project view in Image 5):

#### Top Header & Action Row:
- `< All campaigns`
- **Campaign Title**: `Q4 SaaS Growth Campaign`
- **Subtitle**: `Harbor Media · Marketing Manager: Sofia Almeida`
- **Status Pill**: `[ Active ]`
- **Action Button**: `Edit campaign` / `+ Add task`

#### Left Sidebar (Campaign Info & Key Targets):
- **Progress Bar**: `45%` of lead goal achieved
- **Target Leads**: `100 Leads` (45 captured to date)
- **Budget / Spend**: `$5,000 Budget` / `$3,200 Spent`
- **Team**: `Sofia Almeida`, `Furqan Kazim`, `Irtiza`
- **Client**: `Harbor Media`
- **Start Date**: `1 Sept 26` | **Deadline**: `31 Oct 26`
- **Counts**: Tasks (`12`), Content Pieces (`18`), Ad Creatives (`6`)

#### Top Module Navigation Tabs:
Matching the tab strip design of the project detail view:
1. **Tasks** (Kanban Board for marketing tasks)
2. **Content Calendar** (Blog posts, social media scheduled items)
3. **Lead Funnel** (Captured leads, conversion stages)
4. **Ad Creatives** (Banners, videos, copy variations)
5. **Social Posts** (LinkedIn, Twitter, Facebook schedules)
6. **Email Funnels** (Drip campaigns & newsletters)
7. **Budget & ROI** (Ad spend breakdown, CPL, CAC)
8. **Client Feedback** (Client comments on copy/design)
9. **Analytics & Traffic** (Google Analytics / Meta Ads metrics sync)
10. **Progress Report** (Weekly/monthly summary generator for client)
11. **Deliverables** (Final approved assets & campaign links)

---

### 4.4 Log Work Page (`/marketing/log-work`)

Matches the **Log Work** screen from Image 3:
- **Header**: "Log Work — Daily time entries against marketing campaigns & tasks."
- **Action**: Button `+ Log work` (opens modal to select Campaign, Task, Hours, Activity Type: *Content Writing, Graphic Design, Ad Setup, Strategy, Analytics Review*).
- **Summary Cards**:
  1. `TOTAL HOURS LOGGED`: **142.5 hrs**
  2. `HOURS TODAY`: **6.5 hrs**
  3. `CAMPAIGNS LOGGED TODAY`: **2**
  4. `OPEN BLOCKERS`: **0 (All clear)**
- **Filter**: Filter by campaign (`All campaigns`, `Q4 SaaS Growth Campaign`, `Social Media Rebranding`, etc.)
- **Logs Table**: Date | Marketing Member | Campaign | Task / Activity | Hours | Notes | Actions

---

### 4.5 Marketing Documents Repository (`/marketing/documents`)

Matches the **Documents** view from Image 4:
- **Header**: "Documents — Marketing file repository, organised by campaign & folder."
- **Action**: Button `Upload file`
- **Metric Cards**:
  1. `TOTAL FILES`: **14**
  2. `FOLDERS`: **5**
  3. `STORAGE USED`: **45.2 MB**
- **Sidebar Folders**:
  - 📁 `All files` (14)
  - 📁 `Marketing` *(Default highlighted active folder)*
  - 📁 `Brand Guidelines` (3)
  - 📁 `Ad Creatives & Banners` (5)
  - 📁 `Sales & Pitch Decks` (4)
  - 📁 `Campaign Reports` (2)
- **Documents Table**:
  - `NAME`: e.g. `Harbor_Media_Brand_Kit_2026.pdf`, `Q4_Ad_Banner_1080x1080.png`, `SaaS_Growth_Strategy_v2.docx`
  - `FOLDER`: `Marketing`, `Brand Guidelines`, `Ad Creatives`
  - `SIZE`: `4.2 MB`, `850 KB`, `1.2 MB`
  - `OWNER`: `Sofia Almeida`, `Furqan Kazim`
  - `CAMPAIGN`: `Q4 SaaS Growth Campaign`
  - `ACTIONS`: View project/campaign, Download icon, Edit icon, Delete icon.

---

## 5. Nav & Sidebar Definition for Marketing Role

```typescript
// Sidebar Navigation mapping for Marketing User Role
export const MARKETING_NAV_ITEMS = [
  {
    group: "ORGANIZATION",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" }
    ]
  },
  {
    group: "MARKETING & CAMPAIGNS",
    items: [
      { label: "Campaigns", href: "/marketing/campaigns", icon: "Megaphone" },
      { label: "Lead Funnel", href: "/marketing/leads", icon: "Filter" },
      { label: "Content & Assets", href: "/marketing/content", icon: "FileText" },
      { label: "Log Work", href: "/marketing/log-work", icon: "Clock" }
    ]
  },
  {
    group: "ANALYTICS",
    items: [
      { label: "Reports & ROI", href: "/marketing/reports", icon: "BarChart3" }
    ]
  },
  {
    group: "DOCUMENTS",
    items: [
      { label: "Documents", href: "/marketing/documents", icon: "FileFolder" }
    ]
  }
];
```

---

## 6. Permissions & Role Scoping

To ensure database security and proper access control (extending `roles-and-permissions.md`):

| Resource / Module | Marketing Specialist Access | Marketing Manager Access | Scoping Rule |
|---|---|---|---|
| **Campaigns** | Read & Edit Assigned Campaigns | Full CRUD on All Marketing Campaigns | Scoped to assigned campaign IDs for Specialists |
| **Marketing Tasks** | Create, Edit Status, Log Work | Full CRUD & Reassign Tasks | Scoped to assigned tasks / campaigns |
| **Lead Funnel** | View Inbound Leads, Add Notes | Assign Leads, Update Pipeline Stage | Scoped to marketing source inquiries |
| **Content & Creatives** | Create, Upload, Edit Content | Approve Content & Publish | Scoped to campaign deliverables |
| **Log Work** | Create & Edit Own Time Logs | View All Team Time Logs | Scoped to user's logged work |
| **Budgets & ROI** | View Campaign Spend | Edit Budget Allocation & Ad Spend | Read-only for Specialists, Edit for Managers |

---

## 7. Comparison Summary: Developer vs. Marketing Dashboard

| Feature / UI Element | Developer Dashboard | Marketing Dashboard |
|---|---|---|
| **Primary Focus** | Code deliverables, bug fixes, sprints & dev tasks | Campaigns, lead acquisition, content calendar & ad spend |
| **Main Metric 1** | Active Projects | Active Campaigns |
| **Main Metric 2** | Open Tasks / Bugs | Leads Generated (This Month) |
| **Main Metric 3** | Hours Logged This Week | Marketing Hours Logged |
| **Main Metric 4** | Assigned Sprint Tasks | Total Assigned Marketing Tasks |
| **Workspace Tabs** | Tasks, Sprint Planning, Repos, Bugs, Scope, QA | Tasks, Content Calendar, Lead Funnel, Creatives, ROI, Analytics |
| **Document Folders** | Engineering, Contracts, Specifications | Marketing, Brand Guidelines, Ad Creatives, Pitch Decks |

---
*Created for Time Global Tech CRM Platform documentation repository.*
