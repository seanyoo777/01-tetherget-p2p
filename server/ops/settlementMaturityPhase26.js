/**
 * Phase 26: 정산 성숙 — 대시보드 flags 기반 차이 티켓(오픈·승인·해결).
 */

import { buildRevenuePartnerDashboard } from "./revenueReconciliationPhase25.js";

const TICKETABLE = new Set(["ledger_invoice_fee_mismatch", "sparse_daily_reconciliation"]);

function severityForFlag(code) {
  if (code === "ledger_invoice_fee_mismatch") return "high";
  if (code === "sparse_daily_reconciliation") return "med";
  return "low";
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {string} yyyymm
 */
export function syncVarianceTicketsFromDashboard(db, yyyymm) {
  const ym = String(yyyymm || "").replace(/\D/g, "").slice(0, 6);
  if (ym.length !== 6) throw new Error("INVALID_YYYYMM");
  const dash = buildRevenuePartnerDashboard(db, ym);
  if (!dash) throw new Error("INVALID_YYYYMM");
  let created = 0;
  for (const flag of dash.flags || []) {
    const code = String(flag.code || "");
    if (!TICKETABLE.has(code)) continue;
    const sev = severityForFlag(code);
    const payload = JSON.stringify(flag).slice(0, 12_000);
    const r = db
      .prepare(
        `INSERT OR IGNORE INTO p2p_settlement_variance_tickets (yyyymm, flag_code, severity, payload_json, status, assignee_note, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'open', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .run(ym, code, sev, payload);
    created += Number(r.changes || 0);
  }
  return { yyyymm: ym, inserted: created, flags_scanned: (dash.flags || []).length };
}

export function listSettlementVarianceTickets(db, q = {}) {
  const lim = Math.min(200, Math.max(1, Number(q.limit) || 80));
  const ym = String(q.yyyymm || "").replace(/\D/g, "").slice(0, 6);
  const st = String(q.status || "").trim().toLowerCase();
  if (ym.length === 6 && st) {
    return db
      .prepare(`SELECT * FROM p2p_settlement_variance_tickets WHERE yyyymm = ? AND status = ? ORDER BY id DESC LIMIT ?`)
      .all(ym, st, lim);
  }
  if (ym.length === 6) {
    return db.prepare(`SELECT * FROM p2p_settlement_variance_tickets WHERE yyyymm = ? ORDER BY id DESC LIMIT ?`).all(ym, lim);
  }
  if (st) {
    return db.prepare(`SELECT * FROM p2p_settlement_variance_tickets WHERE status = ? ORDER BY id DESC LIMIT ?`).all(st, lim);
  }
  return db.prepare(`SELECT * FROM p2p_settlement_variance_tickets ORDER BY id DESC LIMIT ?`).all(lim);
}

export function countOpenSettlementVarianceTickets(db, yyyymm) {
  const ym = String(yyyymm || "").replace(/\D/g, "").slice(0, 6);
  if (ym.length !== 6) {
    const r = db.prepare(`SELECT COUNT(*) as c FROM p2p_settlement_variance_tickets WHERE status = 'open'`).get();
    return Number(r?.c ?? 0) || 0;
  }
  const r = db
    .prepare(`SELECT COUNT(*) as c FROM p2p_settlement_variance_tickets WHERE status = 'open' AND yyyymm = ?`)
    .get(ym);
  return Number(r?.c ?? 0) || 0;
}

export function patchSettlementVarianceTicket(db, id, body) {
  const rid = Math.floor(Number(id) || 0);
  if (rid <= 0) return null;
  const row = db.prepare(`SELECT * FROM p2p_settlement_variance_tickets WHERE id = ?`).get(rid);
  if (!row) return null;
  const status = String(body?.status || "").trim().toLowerCase();
  const allowed = new Set(["open", "ack", "resolved"]);
  if (!allowed.has(status)) throw new Error("INVALID_STATUS");
  const note = String(body?.assignee_note ?? row.assignee_note).slice(0, 4000);
  db.prepare(
    `UPDATE p2p_settlement_variance_tickets SET status = ?, assignee_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  ).run(status, note, rid);
  return db.prepare(`SELECT * FROM p2p_settlement_variance_tickets WHERE id = ?`).get(rid);
}
