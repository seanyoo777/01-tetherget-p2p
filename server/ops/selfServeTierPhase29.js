/**
 * Phase 29: self-serve 코호트 티어 변경 요청(승인은 관리자).
 */

import { normalizeCohortSlug } from "./betaPhase16.js";
import { applyTierUpgradeMembershipBatch } from "./customerGrowthPhase28.js";

const KEY = "p2p.self_serve_tier_policy";

function readJson(db) {
  const row = db.prepare(`SELECT value_json FROM platform_settings WHERE setting_key = ?`).get(KEY);
  try {
    return row?.value_json ? JSON.parse(String(row.value_json)) : {};
  } catch {
    return {};
  }
}

function writeJson(db, obj) {
  db.prepare(`
    INSERT INTO platform_settings (setting_key, value_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
  `).run(KEY, JSON.stringify(obj));
}

export function readSelfServeTierPolicyAdmin(db) {
  const j = readJson(db);
  const raw = Array.isArray(j.allowed_target_slugs) ? j.allowed_target_slugs : ["growth_tier_plus", "growth_tier_pro"];
  const allowed_target_slugs = [...new Set(raw.map((s) => normalizeCohortSlug(s)).filter(Boolean))];
  return {
    allowed_target_slugs: allowed_target_slugs.length ? allowed_target_slugs : ["growth_tier_plus"],
    min_matched_orders_30d: Math.min(1_000_000, Math.max(1, Math.floor(Number(j.min_matched_orders_30d) || 15))),
    notes: String(j.notes || "").slice(0, 4000),
    updated_at: j.updated_at != null ? String(j.updated_at).slice(0, 40) : null,
  };
}

export function mergeSelfServeTierPolicyPatch(db, body) {
  const prev = readJson(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    if (Array.isArray(body.allowed_target_slugs)) {
      next.allowed_target_slugs = body.allowed_target_slugs.map((s) => normalizeCohortSlug(s)).filter(Boolean);
    }
    const m = Number(body.min_matched_orders_30d);
    if (Number.isFinite(m)) next.min_matched_orders_30d = Math.min(1_000_000, Math.max(1, Math.floor(m)));
    if (body.notes != null) next.notes = String(body.notes).slice(0, 4000);
  }
  writeJson(db, next);
  return readSelfServeTierPolicyAdmin(db);
}

function userPrimaryCohortSlug(db, userId) {
  const row = db
    .prepare(`SELECT cohort_slug FROM beta_cohort_members WHERE user_id = ? ORDER BY cohort_slug ASC LIMIT 1`)
    .get(userId);
  return row?.cohort_slug != null ? String(row.cohort_slug) : "";
}

export function submitTierChangeRequest(db, userId, toSlugRaw) {
  const uid = Math.floor(Number(userId) || 0);
  if (uid <= 0) throw new Error("INVALID_USER");
  const pol = readSelfServeTierPolicyAdmin(db);
  const toSlug = normalizeCohortSlug(toSlugRaw);
  if (!toSlug || !pol.allowed_target_slugs.includes(toSlug)) throw new Error("INVALID_TARGET");
  const inCohort = db.prepare(`SELECT 1 FROM beta_cohort_members WHERE user_id = ? AND cohort_slug = ?`).get(uid, toSlug);
  if (inCohort) throw new Error("ALREADY_IN_COHORT");
  const pending = db
    .prepare(`SELECT id FROM p2p_tier_change_requests WHERE user_id = ? AND status = 'pending' LIMIT 1`)
    .get(uid);
  if (pending) throw new Error("PENDING_EXISTS");
  const cnt = db
    .prepare(
      `SELECT COUNT(*) as c FROM p2p_orders
       WHERE seller_user_id = ? AND status = 'matched' AND matched_at >= datetime('now', '-30 days')`,
    )
    .get(uid);
  if (Math.floor(Number(cnt?.c) || 0) < pol.min_matched_orders_30d) throw new Error("THRESHOLD_NOT_MET");
  const fromSlug = userPrimaryCohortSlug(db, uid);
  const ins = db
    .prepare(
      `INSERT INTO p2p_tier_change_requests (user_id, from_cohort_slug, to_cohort_slug, status, payload_json, created_at)
       VALUES (?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP)`,
    )
    .run(uid, fromSlug, toSlug, JSON.stringify({ min_required: pol.min_matched_orders_30d, matched_30d: cnt.c }).slice(0, 4000));
  return db.prepare(`SELECT * FROM p2p_tier_change_requests WHERE id = ?`).get(Number(ins.lastInsertRowid));
}

export function listTierChangeRequestsForUser(db, userId, limit = 20) {
  const uid = Math.floor(Number(userId) || 0);
  const lim = Math.min(100, Math.max(1, Number(limit) || 20));
  return db.prepare(`SELECT * FROM p2p_tier_change_requests WHERE user_id = ? ORDER BY id DESC LIMIT ?`).all(uid, lim);
}

export function listTierChangeRequestsAdmin(db, q = {}) {
  const lim = Math.min(200, Math.max(1, Number(q.limit) || 80));
  const st = String(q.status || "").trim().toLowerCase();
  if (st) {
    return db.prepare(`SELECT * FROM p2p_tier_change_requests WHERE status = ? ORDER BY id DESC LIMIT ?`).all(st, lim);
  }
  return db.prepare(`SELECT * FROM p2p_tier_change_requests ORDER BY id DESC LIMIT ?`).all(lim);
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number|string} id
 * @param {{ status: string, resolution_note?: string, resolved_by_user_id: number }} body
 */
export function patchTierChangeRequestAdmin(db, id, body) {
  const rid = Math.floor(Number(id) || 0);
  if (rid <= 0) return null;
  const row = db.prepare(`SELECT * FROM p2p_tier_change_requests WHERE id = ?`).get(rid);
  if (!row) return null;
  const status = String(body?.status || "").trim().toLowerCase();
  if (!["approved", "rejected"].includes(status)) throw new Error("INVALID_STATUS");
  if (String(row.status) !== "pending") throw new Error("NOT_PENDING");
  const resolver = Math.floor(Number(body?.resolved_by_user_id) || 0);
  const note = String(body?.resolution_note || "").slice(0, 500);
  if (status === "approved") {
    applyTierUpgradeMembershipBatch(db, [Number(row.user_id)], String(row.to_cohort_slug), "phase29_self_serve_approved");
  }
  db.prepare(
    `UPDATE p2p_tier_change_requests SET status = ?, resolved_at = CURRENT_TIMESTAMP, resolved_by_user_id = ?, resolution_note = ? WHERE id = ?`,
  ).run(status, resolver > 0 ? resolver : null, note, rid);
  return db.prepare(`SELECT * FROM p2p_tier_change_requests WHERE id = ?`).get(rid);
}

export function getSelfServeTierPublicHints(db) {
  const p = readSelfServeTierPolicyAdmin(db);
  return {
    self_serve_enabled: p.allowed_target_slugs.length > 0,
    allowed_target_slugs: p.allowed_target_slugs,
    min_matched_orders_30d: p.min_matched_orders_30d,
    hints: ["승인 전까지 코호트는 변경되지 않습니다.", "POST /api/me/tier-change-request 로 요청."],
  };
}
