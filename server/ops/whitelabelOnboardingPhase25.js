/**
 * Phase 25: self-serve 화이트라벨 온보딩 요청 큐.
 */

const STATUSES = new Set(["submitted", "in_review", "approved", "rejected"]);

/**
 * @param {import("better-sqlite3").Database} db
 * @param {object} p
 */
export function submitWhitelabelOnboardingRequest(db, p) {
  const tenant = String(p.tenant_code_suggestion || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 48);
  const email = String(p.contact_email || "")
    .trim()
    .toLowerCase()
    .slice(0, 320);
  const brand = String(p.brand_label || "").trim().slice(0, 200);
  if (!tenant || !email || !email.includes("@")) throw new Error("INVALID_ONBOARD_FIELDS");
  const extra =
    p.payload && typeof p.payload === "object"
      ? JSON.stringify(p.payload).slice(0, 8000)
      : "{}";
  const ins = db
    .prepare(
      `INSERT INTO p2p_whitelabel_onboarding_requests (tenant_code_suggestion, contact_email, brand_label, status, payload_json, created_at)
       VALUES (?, ?, ?, 'submitted', ?, CURRENT_TIMESTAMP)`,
    )
    .run(tenant, email, brand, extra);
  return db.prepare(`SELECT * FROM p2p_whitelabel_onboarding_requests WHERE id = ?`).get(Number(ins.lastInsertRowid));
}

export function listWhitelabelOnboardingRequests(db, q = {}) {
  const lim = Math.min(200, Math.max(1, Number(q.limit) || 60));
  const st = String(q.status || "").trim().toLowerCase();
  if (st && STATUSES.has(st)) {
    return db
      .prepare(`SELECT * FROM p2p_whitelabel_onboarding_requests WHERE status = ? ORDER BY id DESC LIMIT ?`)
      .all(st, lim);
  }
  return db.prepare(`SELECT * FROM p2p_whitelabel_onboarding_requests ORDER BY id DESC LIMIT ?`).all(lim);
}

export function patchWhitelabelOnboardingRequest(db, id, body, reviewerUserId) {
  const rid = Math.floor(Number(id) || 0);
  if (rid <= 0) return null;
  const row = db.prepare(`SELECT * FROM p2p_whitelabel_onboarding_requests WHERE id = ?`).get(rid);
  if (!row) return null;
  const status = String(body?.status || "").trim().toLowerCase();
  if (!STATUSES.has(status)) throw new Error("INVALID_STATUS");
  const note = String(body?.review_note || "").slice(0, 2000);
  db.prepare(
    `UPDATE p2p_whitelabel_onboarding_requests
     SET status = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by_user_id = ?
     WHERE id = ?`,
  ).run(status, note, reviewerUserId, rid);
  return db.prepare(`SELECT * FROM p2p_whitelabel_onboarding_requests WHERE id = ?`).get(rid);
}
