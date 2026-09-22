import { createRow } from "./db.mjs";

/**
 * One row = one notification. `owner` is whose personal feed it belongs to
 * (a Salesman only ever sees notifications where owner === their own name) —
 * Admin/Super Admin see every notification regardless of owner, so this
 * field is purely a Salesman-visibility filter, not an access grant.
 * `read_by` is a list of viewer identifiers (email) who've dismissed it —
 * a list rather than a boolean because Admin and the owning Salesman can
 * both see the same row and read it independently.
 */
export async function notify({ type, message, link, owner = null, actor = null }) {
  await createRow("notifications", { type, message, link, owner, actor, read_by: [] });
}
