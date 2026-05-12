/**
 * Phase 22: 파트너 정산 라인(수동 적재·조회) — 대규모 정산 파이프라인의 최소 스키마.
 */

/**
 * @param {import("better-sqlite3").Database} db
 * @param {{ partner_slug: string; period_yyyymm: string; amount_minor: number; currency?: string; note?: string; created_by_user_id?: number }} p
 */
export function appendPartnerSettlementLine(db, p) {
  const slug = String(p.partner_slug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 48);
  const period = String(p.period_yyyymm || "")
    .trim()
    .replace(/\D/g, "")
    .slice(0, 6);
  const amount = Math.floor(Number(p.amount_minor) || 0);
  const currency = String(p.currency || "USDT").trim().toUpperCase().slice(0, 12) || "USDT";
  const note = String(p.note || "").slice(0, 2000);
  const actor = Number(p.created_by_user_id) || null;
  if (!slug || period.length !== 6) throw new Error("INVALID_PARTNER_OR_PERIOD");
  const ins = db
    .prepare(
      `INSERT INTO p2p_partner_settlement_lines (partner_slug, period_yyyymm, amount_minor, currency, status, note, created_by_user_id, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP)`,
    )
    .run(slug, period, amount, currency, note, actor);
  return db.prepare(`SELECT * FROM p2p_partner_settlement_lines WHERE id = ?`).get(Number(ins.lastInsertRowid));
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {{ partner_slug?: string; period_yyyymm?: string; limit?: number }} q
 */
export function listPartnerSettlementLines(db, q = {}) {
  const lim = Math.min(200, Math.max(1, Number(q.limit) || 80));
  const slug = String(q.partner_slug || "").trim().toLowerCase();
  const period = String(q.period_yyyymm || "").trim().replace(/\D/g, "").slice(0, 6);
  if (slug && period) {
    return db
      .prepare(
        `SELECT * FROM p2p_partner_settlement_lines WHERE partner_slug = ? AND period_yyyymm = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(slug, period, lim);
  }
  if (slug) {
    return db.prepare(`SELECT * FROM p2p_partner_settlement_lines WHERE partner_slug = ? ORDER BY id DESC LIMIT ?`).all(slug, lim);
  }
  return db.prepare(`SELECT * FROM p2p_partner_settlement_lines ORDER BY id DESC LIMIT ?`).all(lim);
}
