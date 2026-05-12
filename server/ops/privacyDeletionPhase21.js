/**
 * Phase 21: 삭제 요청 워크플로 (규제 대응).
 */

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} userId
 * @param {string} note
 */
export function createPrivacyDeletionRequest(db, userId, note) {
  const ins = db
    .prepare(
      `INSERT INTO privacy_deletion_requests (user_id, status, note_user, created_at) VALUES (?, 'pending', ?, CURRENT_TIMESTAMP)`,
    )
    .run(userId, String(note || "").slice(0, 2000));
  return db.prepare(`SELECT * FROM privacy_deletion_requests WHERE id = ?`).get(Number(ins.lastInsertRowid));
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} limit
 */
export function listPrivacyDeletionRequests(db, limit = 80) {
  const lim = Math.min(200, Math.max(1, limit));
  return db.prepare(`SELECT * FROM privacy_deletion_requests ORDER BY id DESC LIMIT ?`).all(lim);
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} id
 * @param {{ status: string; note_admin?: string }} patch
 */
export function updatePrivacyDeletionRequest(db, id, patch) {
  const st = String(patch?.status || "").trim();
  if (!["approved", "rejected", "completed"].includes(st)) throw new Error("INVALID_STATUS");
  const note = String(patch?.note_admin || "").slice(0, 2000);
  const r = db
    .prepare(
      `UPDATE privacy_deletion_requests SET status = ?, note_admin = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'`,
    )
    .run(st, note, id);
  if (!r.changes) return null;
  return db.prepare(`SELECT * FROM privacy_deletion_requests WHERE id = ?`).get(id);
}
