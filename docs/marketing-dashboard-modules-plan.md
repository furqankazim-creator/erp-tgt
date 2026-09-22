# Marketing Dashboard — Extended Modules: Plan

Status: **Planning & Architecture Blueprint** — Companion doc to [marketing-dashboard-implementation-guide.md](marketing-dashboard-implementation-guide.md).

This document outlines the module mapping, database schema reuse vs new collections, navigation integration, and security scoping for the **Marketing Dashboard** in the Time Global Tech CRM Platform.

---

## 1. Module Mapping: Reuse vs. New Build

| Requested Module | Equivalent in Current App | Build Requirement |
|---|---|---|
| **Active & Upcoming Campaigns** | Reuses `projects` table (`type: "marketing"`) or new `campaigns` table | Split existing list into Active (`In Progress`) and Upcoming (`Planning`) |
| **Lead Funnel & Inquiries** | Reuses `inquiries` & `deals` tables | Scoped read/write for marketing-attributed lead sources |
| **Content Calendar & Tasks** | Reuses `tasks` table with category tags (`content`, `social`, `ads`) | Filtered Kanban & List views |
| **Ad Creatives & Media Assets** | Reuses `documents` table (`folder: "Marketing"`) | Integrated asset preview & upload modal |
| **Time Tracking / Log Work** | Reuses `work_logs` table | Filtered by marketing project IDs |
| **ROI & Analytics** | New UI widget over `campaign_budgets` & lead conversion data | Campaign metrics aggregation endpoint |

---

## 2. Nav & Access Scope

- Group: **MARKETING & CAMPAIGNS**
- Role gating: Accessible by `marketing_manager`, `marketing_specialist`, `admin`, `super_admin`.
- Server-side guard: Requests scoped by `MARKETING_SCOPED_TABLES` (campaigns, marketing_tasks, lead_funnels, content_assets).

---

## 3. Database & API Schema Requirements

1. **Campaigns (`projects` extension or `campaigns` table)**:
   - `id`, `name`, `client_id`, `marketing_lead_id`, `status` (`Planning`, `Active`, `Completed`, `Paused`)
   - `target_leads`, `current_leads`, `budget`, `spend`, `start_date`, `end_date`

2. **Content Items (`content_items` or tagged `tasks`)**:
   - `id`, `campaign_id`, `title`, `channel` (`Blog`, `LinkedIn`, `Facebook`, `Email`, `Ad`), `status` (`Idea`, `Drafting`, `Review`, `Scheduled`, `Published`), `publish_date`

3. **Work Logs (`work_logs`)**:
   - Uses existing table structure with `project_id` pointing to the marketing campaign.

---
*Created for Time Global Tech CRM Platform documentation repository.*
