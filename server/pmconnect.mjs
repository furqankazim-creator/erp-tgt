import { Router } from "express";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { getDB } from "./db.mjs";

import { JWT_SECRET } from "./auth-secret.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Today's date as YYYY-MM-DD in local time */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Auth middleware for PM Connect routes
// ---------------------------------------------------------------------------

function pmAuth(req, res, next) {
  const header = req.headers["authorization"];
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.employeeId = payload.sub;
    req.employeeName = payload.employeeName;
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  next();
}

// ---------------------------------------------------------------------------
// Collection-index bootstrap (call once on startup)
// ---------------------------------------------------------------------------

export async function initPmCollections() {
  const db = getDB();

  // pm_commits: unique on project_id + commit_sha
  await db.collection("pm_commits").createIndex(
    { project_id: 1, commit_sha: 1 },
    { unique: true },
  );

  // pm_daily_log: unique on project_id + employee + date
  await db.collection("pm_daily_log").createIndex(
    { project_id: 1, employee: 1, date: 1 },
    { unique: true },
  );

  console.log("PM Connect collections initialised (indexes ensured).");
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// ---- 1. POST /auto-match  (NO auth) ----
router.post("/auto-match", async (req, res, next) => {
  try {
    // Optional shared secret: set PMCONNECT_SHARED_SECRET and have the
    // extension send it as X-PMConnect-Secret so a stranger who only knows a
    // developer's email and a project name can't mint an API key.
    const shared = process.env.PMCONNECT_SHARED_SECRET;
    if (shared && req.headers["x-pmconnect-secret"] !== shared) {
      return res.status(401).json({ error: "Invalid PM Connect secret" });
    }
    const { gitEmail, machineUsername, workspaceFolderName, gitRemoteUrl } =
      req.body ?? {};

    const db = getDB();

    // --- find employee ---
    let employee = null;
    if (gitEmail) {
      const emailLower = gitEmail.toLowerCase();
      employee = await db.collection("employees").findOne({
        $or: [
          { git_email: { $regex: new RegExp(`^${escapeRegex(emailLower)}$`, "i") } },
          { email: { $regex: new RegExp(`^${escapeRegex(emailLower)}$`, "i") } },
        ],
      });
    }

    // --- find project ---
    // Gather candidates from the most precise signal to the loosest, then pick
    // the first one this employee is actually on. Two projects can share a name
    // (or one name can contain another), so taking the first database hit could
    // return a project the developer isn't a member of.
    const isMember = (proj) =>
      employee &&
      ((Array.isArray(proj.team) && proj.team.includes(employee.name)) ||
        proj.manager === employee.name);
    const candidates = [];
    if (gitRemoteUrl) {
      candidates.push(...(await db.collection("projects").find({ repo_url: gitRemoteUrl }).toArray()));
    }
    if (workspaceFolderName) {
      candidates.push(
        ...(await db
          .collection("projects")
          .find({ name: { $regex: new RegExp(`^${escapeRegex(workspaceFolderName)}$`, "i") } })
          .toArray()),
        ...(await db
          .collection("projects")
          .find({ name: { $regex: new RegExp(escapeRegex(workspaceFolderName), "i") } })
          .toArray()),
      );
    }
    const project = candidates.find((c) => !c.deleted_at && isMember(c)) ?? null;

    // --- validate match ---
    if (employee && project) {
      const apiKey = jwt.sign(
        { sub: employee.id, employeeName: employee.name },
        JWT_SECRET,
        { expiresIn: "30d" },
      );
      return res.json({ success: true, apiKey, projectId: project.id });
    }

    return res.json({ success: false });
  } catch (err) {
    next(err);
  }
});

// ---- 2. POST /project-start  (auth required) ----
router.post("/project-start", pmAuth, async (req, res, next) => {
  try {
    const projectId = req.headers["x-project-id"];
    if (!projectId) {
      return res.status(400).json({ error: "X-Project-Id header is required" });
    }

    const db = getDB();
    const project = await db.collection("projects").findOne({ id: projectId });
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (project.started_at) {
      return res.json({
        success: true,
        startedAt: project.started_at,
        alreadyStarted: true,
      });
    }

    const now = new Date().toISOString();
    await db
      .collection("projects")
      .updateOne({ id: projectId }, { $set: { started_at: now, updated_at: now } });

    return res.json({ success: true, startedAt: now, alreadyStarted: false });
  } catch (err) {
    next(err);
  }
});

// ---- 3. POST /commits  (auth required) ----
router.post("/commits", pmAuth, async (req, res, next) => {
  try {
    const projectId = req.headers["x-project-id"];
    if (!projectId) {
      return res.status(400).json({ error: "X-Project-Id header is required" });
    }

    const { commitSha, commitMessage, filesChanged } = req.body ?? {};
    if (!commitSha) {
      return res.status(400).json({ error: "commitSha is required" });
    }

    const db = getDB();
    const now = new Date().toISOString();
    const today = todayStr();

    // Upsert commit (dedup by project_id + commit_sha)
    const commitResult = await db.collection("pm_commits").updateOne(
      { project_id: projectId, commit_sha: commitSha },
      {
        $setOnInsert: {
          id: randomUUID(),
          project_id: projectId,
          commit_sha: commitSha,
          commit_message: commitMessage || "",
          files_changed: filesChanged || [],
          employee: req.employeeName,
          employee_id: req.employeeId,
          created_at: now,
        },
      },
      { upsert: true },
    );

    const duplicate = commitResult.upsertedCount === 0;

    if (!duplicate) {
      // Increment daily log commits count
      await db.collection("pm_daily_log").updateOne(
        { project_id: projectId, employee: req.employeeName, date: today },
        {
          $inc: { commits_count: 1 },
          $setOnInsert: {
            id: randomUUID(),
            project_id: projectId,
            employee: req.employeeName,
            employee_id: req.employeeId,
            date: today,
            active_seconds: 0,
            created_at: now,
          },
          $set: { updated_at: now },
        },
        { upsert: true },
      );

      // Auto-create / update work_logs entry for today
      await upsertWorkLog(db, {
        employeeName: req.employeeName,
        projectId,
        date: today,
        now,
        notesAppend: `Commit: ${commitSha.slice(0, 8)} - ${commitMessage || ""}`,
      });
    }

    // Self-heal: if project has no started_at, set it now
    await db.collection("projects").updateOne(
      { id: projectId, started_at: { $in: [null, undefined] } },
      { $set: { started_at: now, updated_at: now } },
    );

    return res.json({ success: true, duplicate });
  } catch (err) {
    next(err);
  }
});

// ---- 4. POST /heartbeat  (auth required) ----
router.post("/heartbeat", pmAuth, async (req, res, next) => {
  try {
    const projectId = req.headers["x-project-id"];
    if (!projectId) {
      return res.status(400).json({ error: "X-Project-Id header is required" });
    }

    let { seconds, activeFiles } = req.body ?? {};
    seconds = Math.min(Math.max(Number(seconds) || 0, 0), 900); // clamp 0..900

    const db = getDB();
    const now = new Date().toISOString();
    const today = todayStr();

    // Upsert daily log: increment active_seconds
    await db.collection("pm_daily_log").updateOne(
      { project_id: projectId, employee: req.employeeName, date: today },
      {
        $inc: { active_seconds: seconds },
        $setOnInsert: {
          id: randomUUID(),
          project_id: projectId,
          employee: req.employeeName,
          employee_id: req.employeeId,
          date: today,
          commits_count: 0,
          created_at: now,
        },
        $set: { updated_at: now, last_active_files: activeFiles || [] },
      },
      { upsert: true },
    );

    // Fetch updated total so we can sync work_logs hours
    const log = await db.collection("pm_daily_log").findOne({
      project_id: projectId,
      employee: req.employeeName,
      date: today,
    });

    const totalHours = log
      ? Math.round(((log.active_seconds || 0) / 3600) * 100) / 100
      : 0;

    // Update work_logs entry for today
    await upsertWorkLog(db, {
      employeeName: req.employeeName,
      projectId,
      date: today,
      now,
      hours: totalHours,
    });

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ---- 5. GET /my-rollups  (auth required) ----
router.get("/my-rollups", pmAuth, async (req, res, next) => {
  try {
    const db = getDB();

    // All daily logs for this employee
    const logs = await db
      .collection("pm_daily_log")
      .find({ employee: req.employeeName })
      .sort({ date: -1 })
      .toArray();

    // Group by project_id
    const byProject = {};
    for (const log of logs) {
      if (!byProject[log.project_id]) byProject[log.project_id] = [];
      byProject[log.project_id].push(log);
    }

    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 30);

    const weekStr = toDateStr(weekAgo);
    const monthStr = toDateStr(monthAgo);

    const projects = [];

    for (const [projectId, entries] of Object.entries(byProject)) {
      // Fetch project details
      const project = await db
        .collection("projects")
        .findOne({ id: projectId }, { projection: { _id: 0 } });

      // Week stats
      const weekEntries = entries.filter((e) => e.date >= weekStr);
      const weekCommits = weekEntries.reduce(
        (sum, e) => sum + (e.commits_count || 0),
        0,
      );
      const weekActiveMinutes = Math.round(
        weekEntries.reduce((sum, e) => sum + (e.active_seconds || 0), 0) / 60,
      );

      // Month stats
      const monthEntries = entries.filter((e) => e.date >= monthStr);
      const monthCommits = monthEntries.reduce(
        (sum, e) => sum + (e.commits_count || 0),
        0,
      );
      const monthActiveMinutes = Math.round(
        monthEntries.reduce((sum, e) => sum + (e.active_seconds || 0), 0) / 60,
      );

      // 30-day daily breakdown
      const dailyBreakdown = monthEntries.map((e) => ({
        date: e.date,
        commits: e.commits_count || 0,
        activeMinutes: Math.round((e.active_seconds || 0) / 60),
      }));

      // Compute daysTaken if project has started_at
      let daysTaken = null;
      if (project?.started_at) {
        const start = new Date(project.started_at);
        const end = project.completed_at
          ? new Date(project.completed_at)
          : new Date();
        daysTaken = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      }

      projects.push({
        project: {
          id: projectId,
          name: project?.name || "Unknown",
          startedAt: project?.started_at || null,
          completedAt: project?.completed_at || null,
          daysTaken,
        },
        week: { commits: weekCommits, activeMinutes: weekActiveMinutes },
        month: { commits: monthCommits, activeMinutes: monthActiveMinutes },
        dailyBreakdown,
      });
    }

    return res.json({ projects });
  } catch (err) {
    next(err);
  }
});

// ---- 6. GET /tasks  (auth required) ----
router.get("/tasks", pmAuth, async (req, res, next) => {
  try {
    const projectId = req.headers["x-project-id"];
    if (!projectId) {
      return res.status(400).json({ error: "X-Project-Id header is required" });
    }

    const db = getDB();
    const tasks = await db
      .collection("tasks")
      .find(
        { project_id: projectId, assignee: req.employeeName },
        {
          projection: {
            _id: 0,
            id: 1,
            title: 1,
            status: 1,
            priority: 1,
            due_date: 1,
            description: 1,
          },
        },
      )
      .toArray();

    return res.json(tasks);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Escape special regex characters in a string */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Format a Date to YYYY-MM-DD */
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Create or update a work_logs entry for today so existing CRM reports
 * automatically pick up PM Connect activity.
 */
async function upsertWorkLog(db, { employeeName, projectId, date, now, hours, notesAppend }) {
  const filter = {
    employee: employeeName,
    project_id: projectId,
    date,
  };

  const setOnInsert = {
    id: randomUUID(),
    employee: employeeName,
    project_id: projectId,
    date,
    notes: "",
    blocker: "",
    created_at: now,
  };
  const set = { updated_at: now };

  // `hours` must not appear in both $setOnInsert and $set on the same update —
  // MongoDB rejects that as a path conflict. Route it to whichever applies.
  if (hours !== undefined) {
    set.hours = hours;
  } else {
    setOnInsert.hours = 0;
  }

  // First ensure the document exists
  await db.collection("work_logs").updateOne(
    filter,
    { $setOnInsert: setOnInsert, $set: set },
    { upsert: true },
  );

  // If we need to append notes (commit messages)
  if (notesAppend) {
    const existing = await db.collection("work_logs").findOne(filter);
    const currentNotes = existing?.notes || "";
    const separator = currentNotes ? "\n" : "";
    await db.collection("work_logs").updateOne(filter, {
      $set: { notes: currentNotes + separator + notesAppend, updated_at: now },
    });
  }
}

export default router;
