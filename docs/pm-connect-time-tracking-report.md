# PM Connect — How Time Tracking Works

This report explains how the PM Connect VS Code extension tracks a developer's
work on a project, how that data reaches the CRM, and how idle time is
handled (including the "5 minutes of no movement stops the clock" rule).

Extension source: `time-global-tech.pm-connect-0.1.0`
(installed at `~/.vscode/extensions/time-global-tech.pm-connect-0.1.0`,
distributed copy at [public/pm-connect/pm-connect-0.1.0.vsix](../public/pm-connect/pm-connect-0.1.0.vsix)).

---

## 1. What gets tracked, and by what signal

The extension does **not** use a manual Start/Stop timer. It passively watches
VS Code for four kinds of activity while a workspace folder is open:

| Signal | VS Code event |
|---|---|
| Window gains focus | `onDidChangeWindowState` |
| Cursor/selection moves | `onDidChangeTextEditorSelection` |
| Switching tabs/files | `onDidChangeActiveTextEditor` |
| Typing / editing a file | `onDidChangeTextDocument` |

Any one of these updates a `lastActivitySignalAt` timestamp. As long as that
timestamp is recent, the developer counts as "active."

Source: [activityTracker.js:30-52](../../.vscode/extensions/time-global-tech.pm-connect-0.1.0/src/activityTracker.js)

## 2. The idle rule — exactly what you asked about

**Yes, this logic already exists and is already shipped.** It works exactly
as you described:

- Every **30 seconds**, the extension "ticks" and asks: has it been
  **5+ minutes** since the last activity signal?
- If yes → the developer is **idle**. That tick contributes **0 seconds**
  to the time buffer. The clock is effectively stopped.
- If no (there was a keystroke, cursor move, tab switch, or focus change in
  the last 5 minutes) **and** the VS Code window is focused → that tick adds
  **30 seconds** to the buffer. The clock is running.
- The moment you type again, `lastActivitySignalAt` resets immediately, so
  the very next 30-second tick counts as active again — tracking **resumes**
  as soon as you start writing code, with at most a 30s delay.

```js
// trackerUtils.js
function computeIdleGate(lastActivityAt, now, idleThresholdMs) {
  if (!lastActivityAt) return true;
  return now - lastActivityAt >= idleThresholdMs;   // true = idle
}

function accumulateSeconds(windowFocused, isIdle, tickSeconds) {
  return windowFocused && !isIdle ? tickSeconds : 0; // 0 while idle/unfocused
}
```

The 5-minute threshold is not hardcoded — it's a real setting:

```json
"pmConnect.activity.idleThresholdMinutes": {
  "type": "number",
  "default": 5,
  "description": "Minutes of no editor activity before automatic
                   active-time tracking treats you as idle and stops counting."
}
```

A team lead (or the developer) can change this per-workspace in
`.vscode/settings.json` if 5 minutes is too strict or too lenient, e.g.:

```json
{ "pmConnect.activity.idleThresholdMinutes": 10 }
```

Also note: **losing window focus counts the same as being idle.** If you
switch to Slack or a browser, tracking pauses immediately regardless of the
5-minute window — you don't get credited for time spent outside the editor.

## 3. From local buffer to the CRM database

Time isn't sent to the server every 30 seconds — that would be wasteful and
noisy. Instead:

1. Every 30s tick adds (or doesn't add) seconds to an in-memory
   `pendingSeconds` buffer, capped at 600s (10 min) so a long offline stretch
   can't balloon into a huge single report.
2. Every **60 seconds**, a separate flush timer sends whatever is buffered to
   the backend as a **heartbeat**, then clears the buffer:

   ```
   POST /api/pmconnect/heartbeat
   Headers: X-Project-Id: <project id>
   Body: { seconds: 47, activeFiles: ["src/app.tsx", "src/db.ts"] }
   ```

3. If the request fails (offline, backend down), the buffer is **not**
   cleared — it keeps accumulating (up to the 600s cap) and retries on the
   next flush, so short network blips don't lose time.
4. On VS Code shutdown, a best-effort final flush fires, though the extension
   host has no guaranteed "before exit" hook — up to ~60s can be lost on an
   ungraceful close (e.g. force-quitting the app).

Source: [activityTracker.js:54-85](../../.vscode/extensions/time-global-tech.pm-connect-0.1.0/src/activityTracker.js)

## 4. What the backend does with a heartbeat

`POST /api/pmconnect/heartbeat` ([server/pmconnect.mjs:241-298](../server/pmconnect.mjs#L241-L298)):

1. Clamps the reported `seconds` to `0..900` (defense against a bad/malicious
   payload claiming more than 15 minutes in one beat).
2. Adds it to `pm_daily_log.active_seconds` for
   `{ employee, project_id, date: today }` (creates the row on first beat of
   the day).
3. Converts the day's running total to hours:
   `activeMinutes = active_seconds / 60`, `hours = round(active_seconds / 3600, 2)`.
4. **Auto-syncs that into `work_logs.hours`** for the same employee/project/day
   via `upsertWorkLog()` — this is what makes PM Connect's automatic time show
   up in the same "Hours logged" figure as manually-typed entries from the
   **Log Work** page, with no double-entry needed.

## 5. Commits are tracked the same way, separately

`POST /api/pmconnect/commits` fires when the extension's git watcher detects
a new commit. It's independent of the heartbeat/idle logic — a commit is
logged whenever it happens, even outside "active" tracking windows — and it:

- Records the commit (deduplicated by `commit_sha`) in `pm_commits`.
- Increments `pm_daily_log.commits_count` for that day.
- Appends the commit message into that day's `work_logs.notes`
  (e.g. `Commit: a1b2c3d4 - fix login bug`).
- Self-heals the project's `started_at` if it was never set.

## 6. End-to-end summary

```
 VS Code activity (typing / cursor / tabs / focus)
          │  resets lastActivitySignalAt
          ▼
 30s tick: idle for 5+ min OR window unfocused?  ──yes──▶ add 0s
          │ no
          ▼
      add 30s to pendingSeconds buffer (cap 600s)
          │
          ▼  every 60s
   POST /heartbeat { seconds, activeFiles }
          │
          ▼
 pm_daily_log.active_seconds += seconds
          │
          ├─▶ work_logs.hours  (auto-synced — feeds Daily Report, Reports page,
          │                     emailed digests, same table as manual entries)
          └─▶ "Active time" KPI (raw measured time, shown separately)

 git commit ──▶ POST /commits ──▶ pm_commits + pm_daily_log.commits_count
                                   + note appended to work_logs
```

## 7. Where this shows up in the CRM

- **Project detail page → Daily Report tab**: per-day Hours logged, Active
  time, Commits, Progress-to-date, per-person breakdown, 30-day trend.
- **Project detail page → VS Dev Activity tab**: raw commit/activity feed.
- **Reports page** (Daily/Weekly/Monthly, CSV/PDF/email): commits and active
  time appear as extra columns/KPIs alongside logged hours, for every
  employee who has `git_email` set and has used the extension.

## 8. Practical takeaway

No code changes were needed for the "stop after 5 minutes idle, resume on
next keystroke" behavior — it's already live in the shipped extension
(`pmConnect.activity.idleThresholdMinutes`, default 5). If you want a
different idle window for a specific project or team, set
`pmConnect.activity.idleThresholdMinutes` in that project's
`.vscode/settings.json`.
