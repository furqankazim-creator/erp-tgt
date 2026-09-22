# Link Uptime Monitoring — Detailed Implementation Plan

> **Project**: Global Tech Hub CRM  
> **Created**: 2026-08-19  
> **Scope**: Add automated uptime monitoring for Project & Demo links with email alerts, scheduled checks, and UI status badges.

---

## 1. Investigation Summary (What I Found)

### 1.1 Backend Stack
- **Framework**: Express 4.21 on Node.js (ES modules / `.mjs`)
- **Database**: MongoDB (native `mongodb` driver, no Mongoose) — schema-less collections
- **Auth**: JWT (`jsonwebtoken` + `bcryptjs`)
- **Entry point**: `server/index.mjs` (listens on port 4000, proxied from Vite via `/api`)
- **Tables/collections** are driven dynamically by `server/db.mjs` using keys from `SEED` in `server/seed-data.mjs`

### 1.2 Existing Project Model (`projects` collection)
Current fields (from `seed-data.mjs` lines 387–443 and `project.tsx` type definition):

| Field | Type | Notes |
|---|---|---|
| `id` | string | UUID |
| `name` | string | Project name |
| `client` | string \| null | Client/account name |
| `status` | string | Planning / In Progress / On Hold / Done *(note: clashes with uptime `status` — we will namespace the uptime field)* |
| `progress` | number | 0–100 |
| `lead` | string \| null | Owner name |
| `deadline` | string \| null | ISO date |
| `budget` | number | USD |
| `description` | string \| null | |
| `image_url` | string \| null | |
| `tags` | string[] | |
| `created_at` | ISO string | |
| `updated_at` | ISO string | |

> **⚠ Important**: The existing field `status` on `projects` is already used for project workflow state. We will use `uptime_status` for the monitoring status to avoid collisions. (The user's spec said `status` but this field already exists — namespacing is safer and more explicit.)

### 1.3 Existing Demo/Meeting Model (`meetings` collection)
Current fields (from `seed-data.mjs` lines 515–593 and `demos.tsx`):

| Field | Type | Notes |
|---|---|---|
| `id` | string | UUID |
| `title` | string | Demo/meeting title |
| `attendees` | string \| null | Comma-separated |
| `starts_at` | string \| null | ISO datetime |
| `duration_minutes` | number \| null | |
| `link` | string \| null | **Existing link field** — perfect default for `monitorUrl` |
| `notes` | string \| null | |
| `status` | string | Scheduled / Completed / Cancelled / No Show *(already used — will use `uptime_status` for monitoring)* |
| `kind` | string \| null | Demo / Meeting / Workshop / Discovery |
| `client` | string \| null | |
| `created_at` | ISO string | |
| `updated_at` | ISO string | |

### 1.4 Email Service
- **NOT FOUND** — No existing email infrastructure (no `nodemailer`, `sendgrid`, `mailgun`, `emailService`, or `mailer` files anywhere in `server/`).
- **Plan**: Add `nodemailer` with Gmail SMTP (App Password auth). Free tier, no paid API required.

### 1.5 Scheduler / Cron
- **NOT FOUND** — No existing `node-cron`, `agenda`, `bull`, or scheduling pattern in the backend.
- **Plan**: Add `node-cron` and wire it into `server/index.mjs` after `connectDB()`. Runs every 4 hours.

### 1.6 Frontend Stack
- React 19 + TypeScript + Vite
- Routing: TanStack Router (file-based in `src/routes/_authenticated/`)
- Data fetching: TanStack Query via `src/lib/db.ts`
- UI: shadcn/ui Radix components + TailwindCSS v4 (custom design tokens)
- Project UI files:
  - List: `src/routes/_authenticated/project.index.tsx`
  - Detail: `src/routes/_authenticated/project.$projectId.tsx`
  - Layout type: `src/routes/_authenticated/project.tsx`
- Demos/Meetings UI:
  - Combined list + detail (Sheet): `src/routes/_authenticated/demos.tsx`

---

## 2. Files to Create / Modify

### 2.1 Backend — New Files (3)

| # | File | Purpose |
|---|---|---|
| 1 | `server/email-service.mjs` | Nodemailer Gmail transport + HTML template builder for up/down alerts |
| 2 | `server/uptime-checker.mjs` | Core checker: fetches enabled records, pings URLs with retry, updates DB, triggers email on status change |
| 3 | `server/.env.example` (optional add to root `.env`) | New env var documentation |

### 2.2 Backend — Modified Files (3)

| # | File | What changes |
|---|---|---|
| 1 | `server/package.json` | Add dependencies: `nodemailer`, `node-cron` |
| 2 | `server/index.mjs` | Import uptime checker + cron; schedule every 4h; add 3 new API endpoints (`POST /api/uptime/check`, `POST /api/uptime/check/:table/:id`, `GET /api/uptime/stats`) |
| 3 | `server/seed-data.mjs` | Add new monitoring fields to each seed record in `projects` and `meetings` arrays (so demo data boots with defaults) |

### 2.3 Frontend — New Files (1)

| # | File | Purpose |
|---|---|---|
| 1 | `src/components/uptime-status.tsx` | Reusable `<UptimeBadge>` component + helper functions (compute uptime %, format last checked) |

### 2.4 Frontend — Modified Files (6)

| # | File | What changes |
|---|---|---|
| 1 | `src/routes/_authenticated/project.tsx` | Extend `Project` TypeScript type with 9 new uptime fields |
| 2 | `src/routes/_authenticated/project.index.tsx` | Add `UptimeBadge`, uptime %, "Check now" button to each project card; extend `FIELDS` with `monitorUrl` + `monitoringEnabled` |
| 3 | `src/routes/_authenticated/project.$projectId.tsx` | Add uptime status card in sidebar + "Check now" button with optimistic invalidation |
| 4 | `src/routes/_authenticated/demos.tsx` | Extend `Demo` type with uptime fields; add badge to list cards and detail sheet; extend `FIELDS` with `monitorUrl` + `monitoringEnabled` |
| 5 | `src/lib/db.ts` | Add typed API helpers: `useCheckUptimeNow`, `useCheckUptimeOne`, `fetchUptimeStats` + extend `TableName` union if needed |
| 6 | `.env` (root) | Add placeholder comments for `ADMIN_EMAIL`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` |

---

## 3. Field Naming & Namespacing (Critical)

Because both `projects` and `meetings` already have a `status` field with different meanings, the uptime monitoring fields will be **namespaced** to avoid ambiguity:

| User-spec field | Actual field name | Type | Default |
|---|---|---|---|
| `monitorUrl` | `monitorUrl` | string | For projects: `null` (user fills in). For meetings/demos: seed-initialized from existing `link` field |
| `monitoringEnabled` | `monitoringEnabled` | boolean | `true` |
| `status` | `uptime_status` | `"up" \| "down" \| "unknown"` | `"unknown"` (avoids clash with project.status / meetings.status) |
| `lastCheckedAt` | `uptime_lastCheckedAt` | ISO string \| null | `null` |
| `lastResponseTimeMs` | `uptime_responseMs` | number \| null | `null` |
| `lastStatusCode` | `uptime_statusCode` | number \| null | `null` |
| `lastError` | `uptime_lastError` | string \| null | `null` |
| `totalChecks` | `uptime_totalChecks` | number | `0` |
| `totalUp` | `uptime_totalUp` | number | `0` |

**Rationale**: MongoDB is schema-less, so no migration is needed — but namespacing with `uptime_` keeps existing queries safe and makes intent explicit in UI code.

---

## 4. Detailed Backend Execution Steps

### Step 4.1 Install Dependencies
```bash
cd server
npm install nodemailer node-cron
```

### Step 4.2 Create `server/email-service.mjs`
```
Exports:
  - sendUptimeAlert({ recordType, record, wasUp, isNowUp, checkResult })
  - buildEmailHtml({ ... })  (inline-styles HTML — safe for email clients)
  - getTransporter()  (lazy init, Gmail SMTP with GMAIL_USER + GMAIL_APP_PASSWORD)

Subjects:
  - Going DOWN:  "🔴 DOWN: {project.name | meeting.title}"
  - Coming UP:   "✅ RECOVERED: {project.name | meeting.title}"

Body includes (as required):
  • Project/client name
  • Monitored URL (clickable <a>)
  • What happened (timeout / HTTP status / connection error message)
  • Timestamp of detection (formatted local + UTC)
  • Response time (if available, N/A if down)
  • CRM deep-link:
      - Projects: `${FRONTEND_URL}/project/${id}`  (FRONTEND_URL from env, default http://localhost:5173)
      - Meetings/Demos: `${FRONTEND_URL}/demos`  (demos opens sheet via state — link URL is stable enough)

Recipient: process.env.ADMIN_EMAIL
```

### Step 4.3 Create `server/uptime-checker.mjs`
```
Exports:
  - checkAllEnabled()        → { checked, changed, errors }   (for cron + POST /api/uptime/check)
  - checkOne(table, id)      → Promise<{ record, wasUp, isNowUp, result }>  (for single-record "check now")

Internal:
  - fetchEnabledRecords()    → returns [...projects with monitoringEnabled=true, ...meetings where kind=Demo/Meeting and monitoringEnabled=true]
  - pingOnce(url)            → AbortController 10s timeout, GET request, returns { ok, statusCode, responseMs, error }
  - pingWithRetry(url)       → retry 3x with 5s delay between; final result = worst of retries (any success = up, else down)
  - updateRecordStats(table, id, record, checkResult)  → increments uptime_totalChecks, uptime_totalUp, sets all uptime_* fields via updateRow()
  - detectAndNotifyChange(record, wasUptimeStatus, newUptimeStatus, result) → calls sendUptimeAlert only on up↔down edges

Important edge handling:
  • Skip records where monitorUrl is null/empty/whitespace
  • If URL has no scheme, prepend "https://"
  • Retry on: network errors, timeouts, 5xx, 0 status
  • Don't retry on: 2xx-4xx (deterministic HTTP response)
  • Status "unknown" → on first check:
      - If it goes UP → no email (was never "known" up)
      - If it goes DOWN → send initial alert (treat as change from baseline)
```

### Step 4.4 Modify `server/index.mjs` — Add 3 API Endpoints + Cron
```
After connectDB().then(() => {

  // 1. Cron — every 4 hours (0, 4, 8, 12, 16, 20)
  import cron from "node-cron";
  cron.schedule("0 */4 * * *", () => {
    console.log(`[CRON] Running uptime check at ${new Date().toISOString()}`);
    checkAllEnabled().then(r => console.log(`[CRON] Uptime check done: ${JSON.stringify(r)}`))
                     .catch(e => console.error(`[CRON] Uptime check FAILED:`, e));
  });

  // 2. Manual "check all now" (auth required)
  app.post("/api/uptime/check", requireAuth, async (req, res, next) => { ... });

  // 3. Manual "check one" (auth required)
  app.post("/api/uptime/check/:table/:id", requireAuth, requireTableUptime, async (req, res, next) => { ... });
    // requireTableUptime: allow only "projects" or "meetings"

  // 4. Stats endpoint (optional — for dashboard summary)
  app.get("/api/uptime/stats", requireAuth, async (req, res, next) => {
    returns { projects: { total, up, down, unknown }, demos: { total, up, down, unknown } }
  });

});
```

### Step 4.5 Modify `server/seed-data.mjs` — Add Defaults
For **every** record in `projects` array (5 projects) and `meetings` array (7 meetings):
```js
monitorUrl: record.link || null,  // meetings already have `link`; projects: null (user fills in)
monitoringEnabled: true,
uptime_status: "unknown",
uptime_lastCheckedAt: null,
uptime_responseMs: null,
uptime_statusCode: null,
uptime_lastError: null,
uptime_totalChecks: 0,
uptime_totalUp: 0,
```

---

## 5. Detailed Frontend Execution Steps

### Step 5.1 Create `src/components/uptime-status.tsx`
```tsx
// Exports:
export function UptimeBadge({ status, size = "sm" }: { status: "up"|"down"|"unknown"; size?: "sm"|"md" })
//   up    → green bg-success/15 text-success border-success/30
//   down  → red   bg-destructive/15 text-destructive border-destructive/30
//   unknown → gray bg-muted text-muted-foreground border-border
//   Shows dot + label: ● UP / ● DOWN / ● UNKNOWN

export function formatLastChecked(iso: string | null): string
//   Returns: "2 min ago", "3 h ago", "Never", using date-fns if available (it is)

export function uptimePercent(totalUp: number, totalChecks: number): string
//   Returns: "99.2%" or "—"

export function useCheckUptimeOne(table: "projects"|"meetings", id: string)
//   Mutation wrapping POST /api/uptime/check/:table/:id → invalidates [table] queryKey
```

### Step 5.2 Extend `src/routes/_authenticated/project.tsx` type
```tsx
export type Project = {
  // existing fields...
  monitorUrl: string | null;
  monitoringEnabled: boolean;
  uptime_status: "up" | "down" | "unknown";
  uptime_lastCheckedAt: string | null;
  uptime_responseMs: number | null;
  uptime_statusCode: number | null;
  uptime_lastError: string | null;
  uptime_totalChecks: number;
  uptime_totalUp: number;
};
```

### Step 5.3 Modify `project.index.tsx` (Project list / cards)
**Add to `FIELDS` array** (appears in RecordDialog create/edit):
```ts
{ name: "monitorUrl", label: "Monitor URL", type: "text", full: false },
{ name: "monitoringEnabled", label: "Monitoring enabled", type: "switch" },
```

**Add to each project card (below Progress, above tags):**
```
Row layout:
  ┌─────────────────────────────────────────────────┐
  │ [UP BADGE]  98.4% uptime  ·  Last check: 2h ago │
  │                                 [ Check now → ] │
  └─────────────────────────────────────────────────┘
```
- `Check now` → calls `useCheckUptimeOne` mutation → shows toast, invalidates cache

### Step 5.4 Modify `project.$projectId.tsx` (Project detail)
**Add inside the sidebar card (`lg:col-span-1`), below tags section:**
```
┌─ Uptime Monitoring ──────────────────────────────┐
│                                                    │
│   [● UP]   status badge (large)                    │
│                                                    │
│   Uptime:        98.4%                             │
│   Last check:    2 hours ago                       │
│   Response time: 142 ms                            │
│   HTTP status:   200                               │
│   URL:           https://... (clickable)           │
│                                                    │
│   [ ◉ Monitoring enabled ]   [ Check now → ]       │
└────────────────────────────────────────────────────┘
```
- If `uptime_lastError` is set → show it in a warning-style callout

### Step 5.5 Modify `demos.tsx` (Demos & Meetings)
**Extend `Demo` type** with same 9 uptime fields.

**Add to `FIELDS` array**:
```ts
{ name: "monitorUrl", label: "Monitor URL", type: "text" },
{ name: "monitoringEnabled", label: "Monitoring enabled", type: "switch" },
```
*(For new records, default monitorUrl = the same value as `link` if user enters one, via RecordDialog defaults. Or backend can auto-sync on create — simplest: default in form.)*

**Add to list cards** (in "upcoming" and "all" views, next to StatusBadge):
```
[STATUS]  [● UP 99%]    ...or...    [STATUS]  [● DOWN 62%]
```

**Add to detail Sheet** (below Session metadata section, above Edit/Join/Delete grid):
```
┌─ Link Uptime ──────────────────────────────┐
│  Status:       [● RECOVERED]                │
│  URL:          https://meet.globaltech...   │
│  Last check:   14 min ago                   │
│  Uptime:       94.1%                        │
│  Response:     812 ms / 200                 │
│  Error:        (last error if any)          │
│                                              │
│  [ Monitoring: ON ]   [ Check now → ]       │
└──────────────────────────────────────────────┘
```

### Step 5.6 Extend `src/lib/db.ts`
Add after `useDeleteRow`:
```ts
export type UptimeTable = "projects" | "meetings";

export async function checkUptimeNow(): Promise<{ checked: number; changed: number }> {
  return apiFetch("/uptime/check", { method: "POST" }) as Promise<any>;
}

export async function checkUptimeOne(table: UptimeTable, id: string): Promise<any> {
  return apiFetch(`/uptime/check/${table}/${id}`, { method: "POST" });
}

export function useCheckUptimeOne(table: UptimeTable, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => checkUptimeOne(table, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [table] });
      void qc.invalidateQueries({ queryKey: [table, "single", id] });
      toast.success("Uptime check initiated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
```

### Step 5.7 Update Root `.env`
Append commented placeholders:
```env
# ── Uptime Monitoring (copy these to server/.env or set system-wide) ──
# ADMIN_EMAIL="admin@yourcompany.com"           # who receives up/down alerts
# GMAIL_USER="alerts@yourcompany.com"           # Gmail sender account
# GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"      # 16-char App Password (2FA required)
# FRONTEND_URL="https://crm.yourcompany.com"    # used in email deep-links
```

---

## 6. Database Migration Strategy

MongoDB is schema-less, so no ALTER TABLE is needed. We have 2 paths:

| Strategy | What | When |
|---|---|---|
| **Seed defaults** | Fields added to `seed-data.mjs` | Works only on fresh DB (empty collections) — which is fine for demo |
| **Backfill on first cron run** | `uptime-checker.mjs` handles missing fields as falsy → treated as `monitoringEnabled=false` for records that predate migration; records created via UI dialog will have fields set explicitly | Always works |

**Extra safety**: In the checker, we treat any record where field `monitoringEnabled` is not explicitly `true` (e.g. undefined because the record is old) as disabled, so legacy records are not spammed with checks.

---

## 7. Email Content Spec (Exact)

### Subject lines
```
🔴 DOWN: Nimbus Fleet Portal
✅ RECOVERED: Nimbus Fleet Portal
```

### HTML Body (Gmail SMTP safe, inline CSS)
```html
<div style="font-family:system-ui,Arial;max-width:600px;margin:0 auto;padding:24px;">
  <div style="background:#fee2e2;padding:16px;border-radius:12px;margin-bottom:24px;">
    <h1 style="margin:0;color:#991b1b;font-size:20px;">🔴 Site is DOWN</h1>
    <p style="margin:8px 0 0;color:#7f1d1d;font-size:14px;">Detected at Wed, Aug 19 2026 · 14:32 UTC</p>
  </div>

  <h2 style="font-size:16px;margin:0 0 12px;">Nimbus Fleet Portal</h2>
  <p style="color:#475569;margin:0 0 4px;">Client: <strong>Nimbus Logistics</strong></p>

  <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#f8fafc;border-radius:8px;">
    <tr><td style="padding:10px 14px;color:#64748b;width:40%;">Monitored URL</td>
        <td style="padding:10px 14px;"><a href="https://nimbus.example.com" style="color:#2563eb;">https://nimbus.example.com</a></td></tr>
    <tr><td style="padding:10px 14px;color:#64748b;">Error</td>
        <td style="padding:10px 14px;color:#991b1b;"><strong>Request timeout after 10s</strong></td></tr>
    <tr><td style="padding:10px 14px;color:#64748b;">HTTP status</td>
        <td style="padding:10px 14px;">—</td></tr>
    <tr><td style="padding:10px 14px;color:#64748b;">Response time</td>
        <td style="padding:10px 14px;">Timed out</td></tr>
    <tr><td style="padding:10px 14px;color:#64748b;">Detection time</td>
        <td style="padding:10px 14px;">2026-08-19T14:32:18Z</td></tr>
  </table>

  <a href="https://ourcrm.com/projects/proj-1"
     style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">
    Open in CRM →
  </a>

  <p style="color:#94a3b8;font-size:12px;margin-top:32px;border-top:1px solid #e2e8f0;padding-top:16px;">
    This is an automated uptime alert from Global Tech CRM.
  </p>
</div>
```

---

## 8. UI Component Style Conventions

Following existing CRM conventions per project memory:

- **Form labels**: `text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/85`
- **Form controls**: soft tints — `bg-primary/[0.07]` + `border-primary/20`
- **Section pills within dialogs/sheets**: uppercase headers in `bg-primary/10` with gradient dividers
- **Dialogs**: `max-h-[calc(100vh-2rem)]` on `DialogContent`
- **Scroll area inside RecordDialog**: `sidebar-scroll` utility
- **Grid forms**: `sm:max-w-4xl`, 2-column layout for complex forms
- **Button for Check now**: same style as Edit/Delete in card footer rows — `Button variant="ghost" size="sm" h-7 px-2 text-xs` with a `RefreshCw` icon from `lucide-react` (already installed)
- **Color tokens used**: `--success`, `--destructive`, `--muted` (already set up — match `StatusBadge` style)

---

## 9. Constraints & Safety Checklist

✅ **No paid services**: Gmail SMTP is free (Gmail account + App Password)  
✅ **No new design system**: Reuse shadcn + existing tailwind design tokens  
✅ **No unrelated field changes**: All new fields are `uptime_` prefixed  
✅ **No hardcoded credentials**: All secrets from env vars  
✅ **No spam emails**: Edge-triggered only (status changes); 3 retries with 5s gap to avoid false positives  
✅ **No breaking existing queries**: `status` on projects/meetings untouched (we use `uptime_status`)  

---

## 10. End-to-End Test Procedure (After Implementation)

1. **Start the stack**: `npm run dev:all` (root dir — spins Vite + Express)
2. **Seed DB with defaults**: Confirm new fields exist via `GET /api/projects`
3. **Edit a Project** → set `monitorUrl=https://httpstat.us/500` → save
4. **Click "Check now"** on project card → confirm:
   - First run: status → `down`, alert email sent (check Mailhog/admin inbox)
   - Click "Check now" 2x more: no additional emails (status unchanged)
5. **Edit URL to `https://httpstat.us/200`** → "Check now" →:
   - Status → `up`, recovery email sent
6. **Cron fires at next 4h boundary** → logs visible in server console with `[CRON] Uptime check done: ...`
7. **Uptime % calc**: After 10 checks (8 up + 2 down) → display shows "80.0%"
8. **Test timeout**: Use `https://httpstat.us/200?sleep=15000` → triggers 10s abort → after 3 retries → DOWN email

---

## 11. File Summary Table (Recap)

### Created
| File | Lines (est.) |
|---|---|
| `server/email-service.mjs` | ~160 |
| `server/uptime-checker.mjs` | ~220 |
| `src/components/uptime-status.tsx` | ~90 |

### Modified
| File | Changes |
|---|---|
| `server/package.json` | +2 deps in `dependencies` |
| `server/index.mjs` | +cron import +3 endpoints + wire-up (~60 lines) |
| `server/seed-data.mjs` | +9 fields to 5 project + 7 meeting seed records |
| `.env` (root) | +4 commented env vars |
| `src/routes/_authenticated/project.tsx` | +9 fields to Project type |
| `src/routes/_authenticated/project.index.tsx` | +2 FIELDS + uptime row per card |
| `src/routes/_authenticated/project.$projectId.tsx` | +Uptime sidebar section + Check now |
| `src/routes/_authenticated/demos.tsx` | +type fields +2 FIELDS + badge in cards/details |
| `src/lib/db.ts` | +uptime mutations & helpers |
