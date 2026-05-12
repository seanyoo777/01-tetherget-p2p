/**
 * Phase 28: usage tier 후보 + in-app 크레딧 grant 기록(잔고 반영은 호출 측에서 수행 가능).
 */

import { normalizeCohortSlug } from "./betaPhase16.js";

const KEY = "p2p.customer_growth_automation";

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

export function readCustomerGrowthAutomationAdmin(db) {
  const j = readJson(db);
  return {
    tier_min_matched_orders_30d: Math.min(1_000_000, Math.max(1, Math.floor(Number(j.tier_min_matched_orders_30d) || 20))),
    target_cohort_slug: normalizeCohortSlug(j.target_cohort_slug) || "growth_tier_plus",
    credit_max_minor_per_grant: Math.min(1e15, Math.max(1, Math.floor(Number(j.credit_max_minor_per_grant) || 10_000_000_000))),
    notes: String(j.notes || "").slice(0, 4000),
    updated_at: j.updated_at != null ? String(j.updated_at).slice(0, 40) : null,
  };
}

export function mergeCustomerGrowthAutomationPatch(db, body) {
  const prev = readJson(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    const m = Number(body.tier_min_matched_orders_30d);
    if (Number.isFinite(m)) next.tier_min_matched_orders_30d = Math.min(1_000_000, Math.max(1, Math.floor(m)));
    if (body.target_cohort_slug != null) next.target_cohort_slug = normalizeCohortSlug(body.target_cohort_slug) || "growth_tier_plus";
    const c = Number(body.credit_max_minor_per_grant);
    if (Number.isFinite(c)) next.credit_max_minor_per_grant = Math.min(1e15, Math.max(1, Math.floor(c)));
    if (body.notes != null) next.notes = String(body.notes).slice(0, 4000);
  }
  writeJson(db, next);
  return readCustomerGrowthAutomationAdmin(db);
}

/**
 * 최근 30일 matched 주문 수 기준 판매자 후보(이미 대상 코호트에 있으면 제외).
 * @param {import("better-sqlite3").Database} db
 */
export function listUsageTierUpgradeCandidates(db) {
  const cfg = readCustomerGrowthAutomationAdmin(db);
  const slug = cfg.target_cohort_slug;
  return db
    .prepare(
      `SELECT o.seller_user_id as user_id, COUNT(*) as matched_30d
       FROM p2p_orders o
       WHERE o.status = 'matched'
         AND o.matched_at >= datetime('now', '-30 days')
         AND o.seller_user_id NOT IN (
           SELECT user_id FROM beta_cohort_members WHERE cohort_slug = ?
         )
       GROUP BY o.seller_user_id
       HAVING matched_30d >= ?
       ORDER BY matched_30d DESC
       LIMIT 500`,
    )
    .all(slug, cfg.tier_min_matched_orders_30d);
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number[]} userIds
 * @param {string} cohortSlug
 * @param {string} note
 */
export function applyTierUpgradeMembershipBatch(db, userIds, cohortSlug, note) {
  const slug = normalizeCohortSlug(cohortSlug);
  if (!slug) throw new Error("INVALID_COHORT");
  const n = String(note || "phase28_auto_tier").slice(0, 500);
  let applied = 0;
  for (const uid of userIds) {
    const id = Math.floor(Number(uid) || 0);
    if (id <= 0) continue;
    const u = db.prepare(`SELECT id FROM users WHERE id = ?`).get(id);
    if (!u) continue;
    db.prepare(
      `INSERT INTO beta_cohort_members (cohort_slug, user_id, note) VALUES (?, ?, ?)
       ON CONFLICT(cohort_slug, user_id) DO UPDATE SET note = excluded.note`,
    ).run(slug, id, n);
    applied += 1;
  }
  return { cohort_slug: slug, applied };
}

export function insertInAppCreditGrantRow(db, { userId, amountMinor, reason, createdByUserId }) {
  const uid = Math.floor(Number(userId) || 0);
  const amt = Math.trunc(Number(amountMinor) || 0);
  if (uid <= 0 || amt <= 0) throw new Error("INVALID_CREDIT");
  const ins = db
    .prepare(
      `INSERT INTO p2p_in_app_credit_grants (user_id, amount_minor, reason, created_by_user_id, created_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    )
    .run(uid, amt, String(reason || "").slice(0, 500), createdByUserId ?? null);
  return db.prepare(`SELECT * FROM p2p_in_app_credit_grants WHERE id = ?`).get(Number(ins.lastInsertRowid));
}

export function listInAppCreditGrants(db, limit = 80) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 80));
  return db.prepare(`SELECT * FROM p2p_in_app_credit_grants ORDER BY id DESC LIMIT ?`).all(lim);
}

export function getCustomerGrowthPublicHints(db) {
  const c = readCustomerGrowthAutomationAdmin(db);
  return {
    target_cohort_slug: c.target_cohort_slug,
    tier_min_matched_orders_30d: c.tier_min_matched_orders_30d,
    hints: ["자동 승급은 관리자 확인 후 배치 적용 — POST .../usage-tier-apply-batch"],
  };
}
