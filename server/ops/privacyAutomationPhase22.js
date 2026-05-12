/**
 * Phase 22: 승인된 삭제 요청 → 계정 익명화 + 요청 completed (자동화).
 */

import crypto from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * @param {import("better-sqlite3").Database} db
 * @param {{ maxBatch?: number }} opts
 */
export function runPrivacyDeletionAutomationBatch(db, { maxBatch = 15 } = {}) {
  const lim = Math.min(50, Math.max(1, Number(maxBatch) || 15));
  const rows = db
    .prepare(
      `SELECT * FROM privacy_deletion_requests WHERE status = 'approved' AND (automation_run_at IS NULL OR automation_run_at = '') ORDER BY id ASC LIMIT ?`,
    )
    .all(lim);
  const ids = [];
  let processed = 0;
  for (const r of rows) {
    const uid = Number(r.user_id);
    if (!Number.isFinite(uid) || uid <= 0) continue;
    try {
      db.transaction(() => {
        const delEmail = `deleted-${uid}-${crypto.randomBytes(6).toString("hex")}@anonymized.invalid`;
        const delNick = `deleted-${uid}-${crypto.randomBytes(4).toString("hex")}`;
        const delRef = `DEL-${uid}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
        const ph = bcrypt.hashSync(`!${crypto.randomBytes(16).toString("hex")}`, 8);
        db.prepare(`UPDATE users SET email = ?, password_hash = ?, nickname = ?, referral_code = ? WHERE id = ?`).run(
          delEmail,
          ph,
          delNick,
          delRef,
          uid,
        );
        db.prepare(`DELETE FROM refresh_tokens WHERE user_id = ?`).run(uid);
        db.prepare(
          `UPDATE privacy_deletion_requests SET status = 'completed', automation_run_at = CURRENT_TIMESTAMP,
           note_admin = RTRIM(COALESCE(note_admin, '')) || ' | automation_anonymized' WHERE id = ?`,
        ).run(r.id);
      })();
      ids.push(r.id);
      processed += 1;
    } catch {
      /* 다음 행 계속 */
    }
  }
  return { processed, request_ids: ids };
}
