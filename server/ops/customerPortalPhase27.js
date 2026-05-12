/**
 * Phase 27: 고객 포털 통합 메타 + usage 미터링 스냅샷(집계만).
 */

const KEY = "p2p.customer_portal_unified";

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

export function readCustomerPortalAdmin(db) {
  const j = readJson(db);
  return {
    self_serve_checkout_url: String(j.self_serve_checkout_url || "").trim().slice(0, 500) || null,
    usage_dashboard_url: String(j.usage_dashboard_url || "").trim().slice(0, 500) || null,
    sla_credit_policy_url: String(j.sla_credit_policy_url || "").trim().slice(0, 500) || null,
    metering_enabled: Boolean(j.metering_enabled),
    billing_portal_deep_link: String(j.billing_portal_deep_link || "").trim().slice(0, 500) || null,
    notes: String(j.notes || "").slice(0, 4000),
    updated_at: j.updated_at != null ? String(j.updated_at).slice(0, 40) : null,
  };
}

export function mergeCustomerPortalPatch(db, body) {
  const prev = readJson(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    if (body.self_serve_checkout_url != null) next.self_serve_checkout_url = String(body.self_serve_checkout_url).slice(0, 500);
    if (body.usage_dashboard_url != null) next.usage_dashboard_url = String(body.usage_dashboard_url).slice(0, 500);
    if (body.sla_credit_policy_url != null) next.sla_credit_policy_url = String(body.sla_credit_policy_url).slice(0, 500);
    if (typeof body.metering_enabled === "boolean") next.metering_enabled = body.metering_enabled;
    if (body.billing_portal_deep_link != null) next.billing_portal_deep_link = String(body.billing_portal_deep_link).slice(0, 500);
    if (body.notes != null) next.notes = String(body.notes).slice(0, 4000);
  }
  writeJson(db, next);
  return readCustomerPortalAdmin(db);
}

export function getCustomerPortalPublicHints(db) {
  const c = readCustomerPortalAdmin(db);
  return {
    self_serve_checkout_url: c.self_serve_checkout_url,
    usage_dashboard_url: c.usage_dashboard_url,
    sla_credit_policy_url: c.sla_credit_policy_url,
    metering_enabled: c.metering_enabled,
    hints: ["과금·크레딧 세부는 로그인 후 빌링 포털에서 확인합니다."],
  };
}

/**
 * @param {import("better-sqlite3").Database} db
 */
export function buildUsageMeteringSnapshot(db) {
  const o30 = db.prepare(`SELECT COUNT(*) as c FROM p2p_orders WHERE created_at >= datetime('now', '-30 days')`).get();
  const m30 = db
    .prepare(
      `SELECT COUNT(*) as c FROM p2p_orders WHERE status = 'matched' AND matched_at >= datetime('now', '-30 days')`,
    )
    .get();
  const fee30 = db
    .prepare(
      `SELECT COALESCE(SUM(fee_minor),0) as s, COUNT(*) as n FROM p2p_platform_fee_ledger WHERE created_at >= datetime('now', '-30 days')`,
    )
    .get();
  return {
    window: "30d",
    p2p_orders_created: Number(o30?.c ?? 0) || 0,
    p2p_orders_matched: Number(m30?.c ?? 0) || 0,
    platform_fee_ledger_minor_sum: Number(fee30?.s ?? 0) || 0,
    platform_fee_ledger_rows: Number(fee30?.n ?? 0) || 0,
  };
}
