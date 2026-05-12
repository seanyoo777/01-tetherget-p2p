/**
 * Phase 17: 코호트 한도·요금 병합, 수익화 설정(JSON).
 */

import { resolveBetaLimits } from "./betaPhase14.js";

const KEY_COHORT_POLICIES = "p2p.beta_cohort_policies";
const KEY_MONETIZATION = "p2p.monetization";

function readSettingJson(db, key) {
  const row = db.prepare(`SELECT value_json FROM platform_settings WHERE setting_key = ?`).get(key);
  if (!row?.value_json) return {};
  try {
    return JSON.parse(String(row.value_json));
  } catch {
    return {};
  }
}

function writeSettingJson(db, key, obj) {
  db.prepare(`
    INSERT INTO platform_settings (setting_key, value_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
  `).run(key, JSON.stringify(obj));
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} userId
 */
export function listCohortSlugsForUser(db, userId) {
  const rows = db.prepare(`SELECT cohort_slug FROM beta_cohort_members WHERE user_id = ?`).all(userId);
  return rows.map((r) => String(r.cohort_slug)).filter(Boolean);
}

/**
 * 코호트 정책이 있으면 **더 빡센(작은)** 한도로 병합.
 * @param {ReturnType<typeof resolveBetaLimits>} base
 * @param {Record<string, object>} cohortPolicies
 * @param {string[]} slugs
 */
export function mergeLimitsWithCohorts(base, cohortPolicies, slugs) {
  let maxListed = base.maxListed;
  let maxActive = base.maxActive;
  let maxDaily = base.maxDaily;
  for (const slug of slugs) {
    const p = cohortPolicies[slug];
    if (!p || typeof p !== "object") continue;
    const ml = Number(p.max_listed_orders_per_user);
    const ma = Number(p.max_active_trades_per_user);
    const md = Number(p.max_new_listings_per_user_per_day);
    if (Number.isFinite(ml) && ml > 0) {
      maxListed = maxListed > 0 ? Math.min(maxListed, ml) : ml;
    }
    if (Number.isFinite(ma) && ma > 0) {
      maxActive = maxActive > 0 ? Math.min(maxActive, ma) : ma;
    }
    if (Number.isFinite(md) && md > 0) {
      maxDaily = maxDaily > 0 ? Math.min(maxDaily, md) : md;
    }
  }
  const enforced = maxListed > 0 || maxActive > 0 || maxDaily > 0;
  return { maxListed, maxActive, maxDaily, enforced };
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 * @param {number} userId
 */
export function resolveBetaLimitsForUser(db, env, userId) {
  const base = resolveBetaLimits(db, env);
  const slugs = listCohortSlugsForUser(db, userId);
  if (!slugs.length) return { ...base, cohort_slugs: [] };
  const policies = readSettingJson(db, KEY_COHORT_POLICIES);
  const merged = mergeLimitsWithCohorts(base, policies, slugs);
  return { ...merged, cohort_slugs: slugs };
}

/**
 * 판매자 수수료 bps 스냅샷 (실제 정산 차감은 별도 원장 연동 시).
 * 글로벌 기본값과 코호트 seller_fee_bps 중 **큰 값** (플랫폼 수익 상한 500bps).
 */
export function resolveEffectiveFeeBpsForSeller(db, env, sellerUserId) {
  const m = readSettingJson(db, KEY_MONETIZATION);
  const envDef = Number(env.P2P_DEFAULT_SELLER_FEE_BPS ?? NaN);
  let bps = Number.isFinite(envDef) ? envDef : Number(m.default_seller_fee_bps ?? 0);
  if (!Number.isFinite(bps) || bps < 0) bps = 0;
  bps = Math.min(500, bps);
  const policies = readSettingJson(db, KEY_COHORT_POLICIES);
  const slugs = listCohortSlugsForUser(db, sellerUserId);
  let maxCohort = 0;
  for (const slug of slugs) {
    const f = Number(policies[slug]?.seller_fee_bps);
    if (Number.isFinite(f) && f > 0) maxCohort = Math.max(maxCohort, Math.min(500, f));
  }
  let out = Math.min(500, Math.max(bps, maxCohort));
  const u = db.prepare(`SELECT data_residency_region FROM users WHERE id = ?`).get(sellerUserId);
  const reg = String(u?.data_residency_region || "").trim().toUpperCase();
  const bumps =
    m.dynamic_fee_bumps_by_residency && typeof m.dynamic_fee_bumps_by_residency === "object"
      ? m.dynamic_fee_bumps_by_residency
      : {};
  const bump = reg ? Number(bumps[reg] ?? bumps.DEFAULT ?? bumps.GLOBAL ?? 0) : 0;
  if (Number.isFinite(bump) && bump > 0) out = Math.min(500, out + Math.floor(bump));
  return out;
}

export function countUserCompletedP2pOrders(db, userId) {
  const r = db
    .prepare(
      `SELECT COUNT(*) as c FROM p2p_orders WHERE status = 'completed' AND (seller_user_id = ? OR buyer_user_id = ?)`,
    )
    .get(userId, userId);
  return Number(r?.c ?? 0);
}

export function getMonetizationPublic(db, env) {
  const m = readSettingJson(db, KEY_MONETIZATION);
  const minOrders = Number(m.beta_graduation_min_completed_orders ?? env.BETA_GRADUATION_MIN_COMPLETED_ORDERS ?? NaN);
  const tiers = Array.isArray(m.fee_tier_labels) ? m.fee_tier_labels.map((s) => String(s).slice(0, 80)).slice(0, 8) : [];
  const portal = String(m.billing_portal_url || env.BILLING_PORTAL_URL || "").trim().slice(0, 500);
  const subTiers = Array.isArray(m.subscription_tiers)
    ? m.subscription_tiers
        .map((t) => ({
          slug: String(t?.slug || "").trim().toLowerCase().slice(0, 32),
          label: String(t?.label || "").trim().slice(0, 80),
          seller_fee_bps: Math.min(500, Math.max(0, Math.floor(Number(t?.seller_fee_bps) || 0))),
        }))
        .filter((t) => t.slug)
        .slice(0, 12)
    : [];
  const bumps =
    m.dynamic_fee_bumps_by_residency && typeof m.dynamic_fee_bumps_by_residency === "object"
      ? m.dynamic_fee_bumps_by_residency
      : {};
  const pr = Number(m.partner_revshare_bps);
  return {
    beta_graduation_min_completed_orders: Number.isFinite(minOrders) && minOrders > 0 ? Math.floor(minOrders) : null,
    fee_tier_labels: tiers,
    billing_portal_url: portal || null,
    subscription_tiers: subTiers,
    dynamic_fee_bumps_by_residency: bumps,
    partner_revshare_bps: Number.isFinite(pr) && pr >= 0 ? Math.min(500, Math.floor(pr)) : null,
  };
}

export function readMonetizationAdmin(db, env) {
  const m = readSettingJson(db, KEY_MONETIZATION);
  const stored = { ...m };
  delete stored.billing_webhook_secret;
  const secretOk = Boolean(String(m.billing_webhook_secret || env.BILLING_WEBHOOK_SECRET || "").trim());
  return {
    stored,
    public_projection: getMonetizationPublic(db, env),
    billing_webhook_url_configured: Boolean(String(m.billing_webhook_url || env.BILLING_WEBHOOK_URL || "").trim()),
    billing_webhook_secret_configured: secretOk,
  };
}

const MONETIZATION_KEYS = new Set([
  "default_seller_fee_bps",
  "beta_graduation_min_completed_orders",
  "fee_tier_labels",
  "billing_portal_url",
  "billing_webhook_url",
  "billing_webhook_secret",
  "subscription_tiers",
  "dynamic_fee_bumps_by_residency",
  "partner_revshare_bps",
]);

export function mergeMonetizationPatch(db, body) {
  const prev = readSettingJson(db, KEY_MONETIZATION);
  const next = { ...prev };
  if (body && typeof body === "object") {
    for (const [k, v] of Object.entries(body)) {
      if (!MONETIZATION_KEYS.has(k)) continue;
      if (k === "fee_tier_labels" && Array.isArray(v)) {
        next.fee_tier_labels = v.map((s) => String(s).slice(0, 80)).slice(0, 8);
      } else if (k === "subscription_tiers" && Array.isArray(v)) {
        next.subscription_tiers = v
          .map((t) => ({
            slug: String(t?.slug || "").trim().toLowerCase().slice(0, 32),
            label: String(t?.label || "").trim().slice(0, 80),
            seller_fee_bps: Math.min(500, Math.max(0, Math.floor(Number(t?.seller_fee_bps) || 0))),
          }))
          .filter((t) => t.slug)
          .slice(0, 12);
      } else if (k === "dynamic_fee_bumps_by_residency" && typeof v === "object" && v != null) {
        next.dynamic_fee_bumps_by_residency = {};
        for (const [rk, rv] of Object.entries(v)) {
          const key = String(rk).trim().toUpperCase().slice(0, 16);
          const n = Math.min(200, Math.max(0, Math.floor(Number(rv) || 0)));
          if (key) next.dynamic_fee_bumps_by_residency[key] = n;
        }
      } else if (k === "partner_revshare_bps") {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0 && n <= 500) next.partner_revshare_bps = Math.floor(n);
      } else if (k === "default_seller_fee_bps" || k === "beta_graduation_min_completed_orders") {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) next[k] = k === "default_seller_fee_bps" ? Math.min(500, Math.floor(n)) : Math.floor(n);
      } else if (typeof v === "string") {
        next[k] = k === "billing_webhook_secret" ? v.slice(0, 512) : v.slice(0, 2000);
      } else if (v == null) {
        delete next[k];
      }
    }
  }
  writeSettingJson(db, KEY_MONETIZATION, next);
  return next;
}

export function readCohortPolicies(db) {
  return readSettingJson(db, KEY_COHORT_POLICIES);
}

/**
 * body: { "cohort-slug": { max_listed_orders_per_user?, seller_fee_bps?, ... } } 부분 병합.
 */
export function mergeCohortPoliciesPatch(db, body) {
  const prev = readCohortPolicies(db);
  const next = { ...prev };
  if (body && typeof body === "object") {
    for (const [slugRaw, patch] of Object.entries(body)) {
      const slug = String(slugRaw || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 64);
      if (!slug || typeof patch !== "object" || patch == null) continue;
      const cur = typeof next[slug] === "object" && next[slug] != null ? { ...next[slug] } : {};
      for (const [pk, pv] of Object.entries(patch)) {
        if (!["max_listed_orders_per_user", "max_active_trades_per_user", "max_new_listings_per_user_per_day", "seller_fee_bps"].includes(pk)) {
          continue;
        }
        const n = Number(pv);
        if (Number.isFinite(n) && n >= 0) {
          cur[pk] = pk === "seller_fee_bps" ? Math.min(500, Math.floor(n)) : Math.floor(n);
        }
      }
      next[slug] = cur;
    }
  }
  writeSettingJson(db, KEY_COHORT_POLICIES, next);
  return next;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 */
export function getBillingWebhookUrl(db, env) {
  const m = readSettingJson(db, KEY_MONETIZATION);
  return String(m.billing_webhook_url || env.BILLING_WEBHOOK_URL || "").trim();
}

/**
 * Billing 웹훅 HMAC 서명용. 운영에서는 env 우선 권장.
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 */
export function getBillingWebhookSecret(db, env) {
  const m = readSettingJson(db, KEY_MONETIZATION);
  return String(m.billing_webhook_secret || env.BILLING_WEBHOOK_SECRET || "").trim();
}
