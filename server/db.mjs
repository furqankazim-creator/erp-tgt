import { MongoClient } from "mongodb";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

import { SEED } from "./seed-data.mjs";

export const TABLES = Object.keys(SEED);

const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.MONGO_DB || "global_tech_crm";

export const DEMO_EMAIL = "demo@globaltech.io";
export const DEMO_PASSWORD = "demo1234";
export const DEMO_FULL_NAME = "Demo User";

const client = new MongoClient(MONGO_URL);
let db;

export async function connectDB() {
  await client.connect();
  db = client.db(DB_NAME);

  for (const table of TABLES) {
    const col = db.collection(table);
    await col.createIndex({ id: 1 }, { unique: true });
    const count = await col.countDocuments();
    if (count === 0 && SEED[table]?.length) {
      await col.insertMany(SEED[table]);
    }
  }

  const users = db.collection("users");
  await users.createIndex({ id: 1 }, { unique: true });
  await users.createIndex({ email: 1 }, { unique: true });
  const userCount = await users.countDocuments({ email: DEMO_EMAIL });
  if (userCount === 0) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(DEMO_PASSWORD, salt);
    await users.insertOne({
      id: randomUUID(),
      email: DEMO_EMAIL,
      full_name: DEMO_FULL_NAME,
      password_hash: hash,
      access_role: "super_admin",
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // Migration: only the one true owner account (the demo login every prior
  // session actually used) gets upgraded to super_admin automatically — any
  // *other* pre-existing account (e.g. one created through the old public
  // sign-up page, before accounts became admin-gated) defaults to the
  // lowest-privilege role instead, so a stray old sign-up can't end up with
  // full system access.
  await users.updateMany(
    { email: DEMO_EMAIL, access_role: { $exists: false } },
    { $set: { access_role: "super_admin", active: true } },
  );
  await users.updateMany(
    { email: { $ne: DEMO_EMAIL }, access_role: { $exists: false } },
    { $set: { access_role: "developer", active: true } },
  );

  // Backfill fields added after this DB was first seeded — `insertMany` above
  // only runs on an empty collection, so a live database never picks up new
  // seed fields on its own. Each of these is additive/nullable, safe to
  // default onto existing rows.
  await db
    .collection("projects")
    .updateMany({ scope: { $exists: false } }, { $set: { scope: null } });
  await db
    .collection("projects")
    .updateMany({ inquiry_id: { $exists: false } }, { $set: { inquiry_id: null } });
  await db
    .collection("tickets")
    .updateMany({ project_id: { $exists: false } }, { $set: { project_id: null } });
  await db
    .collection("tasks")
    .updateMany({ sprint_id: { $exists: false } }, { $set: { sprint_id: null } });
  await db
    .collection("meetings")
    .updateMany({ project_id: { $exists: false } }, { $set: { project_id: null } });

  console.log(`Connected to MongoDB at ${MONGO_URL} (db "${DB_NAME}")`);
}

export function getDB() {
  return db;
}

const NO_ID = { projection: { _id: 0 } };
const NO_PASSWORD = { projection: { _id: 0, password_hash: 0 } };

export async function listRows(table, { column = "created_at", ascending = false } = {}) {
  return db
    .collection(table)
    .find({}, NO_ID)
    .sort({ [column]: ascending ? 1 : -1 })
    .toArray();
}

export async function getRow(table, id) {
  return db.collection(table).findOne({ id }, NO_ID);
}

export async function createRow(table, values) {
  const now = new Date().toISOString();
  const row = { id: randomUUID(), ...values, created_at: now, updated_at: now };
  await db.collection(table).insertOne({ ...row });
  return row;
}

export async function updateRow(table, id, patch) {
  const now = new Date().toISOString();
  const result = await db
    .collection(table)
    .findOneAndUpdate(
      { id },
      { $set: { ...patch, updated_at: now } },
      { returnDocument: "after", projection: { _id: 0 } },
    );
  return result;
}

// A real fix for a real race: appending to activity_log by reading the
// array, spreading in a new entry, and writing the whole array back is only
// safe if nothing else can touch that same record between the read and the
// write. Several independent background triggers (auto-response sends, the
// follow-up/proposal stage-advance hooks) can legitimately fire on the same
// inquiry within moments of each other, and a plain updateRow-based append
// lets the second writer's stale read silently clobber the first writer's
// entry. $push is atomic at the database level — no read, no race,
// regardless of how many callers append at once.
export async function appendActivityLog(table, id, entryOrEntries) {
  const now = new Date().toISOString();
  const entries = Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries];
  const result = await db
    .collection(table)
    .findOneAndUpdate(
      { id },
      { $push: { activity_log: { $each: entries } }, $set: { updated_at: now } },
      { returnDocument: "after", projection: { _id: 0 } },
    );
  return result;
}

export async function deleteRow(table, id) {
  const result = await db.collection(table).deleteOne({ id });
  return result.deletedCount > 0;
}

// Human-readable record numbers (INQ-2026-00001, DEAL-2026-00001, ...) — a
// MongoDB atomic $inc on a small counters collection, so two people creating
// a record in the same second still get distinct sequential numbers instead
// of a race. Resets per calendar year, matching the format your boss's spec
// shows.
export async function nextDisplayId(prefix) {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const result = await db
    .collection("counters")
    .findOneAndUpdate(
      { _id: key },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
  return `${prefix}-${year}-${String(result.seq).padStart(5, "0")}`;
}

export async function findUserByEmail(email) {
  return db.collection("users").findOne({ email: email.trim().toLowerCase() }, NO_PASSWORD);
}

export async function findUserByEmailWithPassword(email) {
  return db.collection("users").findOne({ email: email.trim().toLowerCase() });
}

export async function findUserById(id) {
  return db.collection("users").findOne({ id }, NO_PASSWORD);
}

export async function createUser({ email, password, full_name, access_role = "developer" }) {
  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(password, salt);
  const now = new Date().toISOString();
  const user = {
    id: randomUUID(),
    email: email.trim().toLowerCase(),
    full_name: full_name || undefined,
    password_hash,
    access_role,
    active: true,
    created_at: now,
    updated_at: now,
  };
  await db.collection("users").insertOne({ ...user });
  const { password_hash: _ph, ...publicUser } = user;
  return publicUser;
}

export async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.password_hash);
}

export async function listUsers() {
  return db.collection("users").find({}, NO_PASSWORD).sort({ created_at: -1 }).toArray();
}

export async function updateUserAccount(id, patch) {
  const now = new Date().toISOString();
  return db
    .collection("users")
    .findOneAndUpdate(
      { id },
      { $set: { ...patch, updated_at: now } },
      { returnDocument: "after", projection: { _id: 0, password_hash: 0 } },
    );
}
