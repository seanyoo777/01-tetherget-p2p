/**
 * Phase 24: 고객 대면 SLA/SLO 요약 + 알림 정책(내부 설정 JSON).
 */

const KEY_CONTRACT = "p2p.sla_customer_contract";
const KEY_ALERT = "p2p.slo_alert_policy";

function readJson(db, key) {
  const row = db.prepare(`SELECT value_json FROM platform_settings WHERE setting_key = ?`).get(key);
  try {
    return row?.value_json ? JSON.parse(String(row.value_json)) : {};
  } catch {
    return {};
  }
}

function writeJson(db, key, obj) {
  db.prepare(`
    INSERT INTO platform_settings (setting_key, value_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
  `).run(key, JSON.stringify(obj));
}

/** 공개용 — URL·퍼센트·텍스트만, 시크릿·웹훅 없음 */
export function getSlaCustomerSummaryPublic(db, env) {
  const c = readJson(db, KEY_CONTRACT);
  const target = Number(c.target_monthly_availability_pct);
  const p2pSlaMin = Number(env.P2P_MATCH_SLA_MINUTES || 30);
  return {
    product: String(env.SERVICE_LINE || "p2p").trim() || "p2p",
    target_monthly_availability_pct: Number.isFinite(target) && target > 0 ? Math.min(99.999, target) : null,
    support_url: String(c.support_url || env.BETA_PUBLIC_SUPPORT_URL || "").trim().slice(0, 500) || null,
    status_page_url: String(c.status_page_url || env.STATUSPAGE_PUBLIC_URL || "").trim().slice(0, 500) || null,
    p2p_match_sla_minutes: Number.isFinite(p2pSlaMin) ? Math.min(180, Math.max(5, Math.floor(p2pSlaMin))) : 30,
    customer_facing_notes: String(c.customer_facing_notes || "").slice(0, 2000),
  };
}

export function readSlaCustomerContractAdmin(db) {
  return readJson(db, KEY_CONTRACT);
}

export function mergeSlaCustomerContractPatch(db, body) {
  const prev = readJson(db, KEY_CONTRACT);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    const t = Number(body.target_monthly_availability_pct);
    if (Number.isFinite(t) && t > 0) next.target_monthly_availability_pct = Math.min(99.999, t);
    for (const k of ["support_url", "status_page_url", "customer_facing_notes"]) {
      if (body[k] != null) next[k] = String(body[k]).slice(0, 2000);
    }
  }
  writeJson(db, KEY_CONTRACT, next);
  return readJson(db, KEY_CONTRACT);
}

export function readSloAlertPolicyAdmin(db) {
  return readJson(db, KEY_ALERT);
}

export function mergeSloAlertPolicyPatch(db, body) {
  const prev = readJson(db, KEY_ALERT);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    const esc = Number(body.escalation_minutes_p1);
    if (Number.isFinite(esc) && esc >= 1) next.escalation_minutes_p1 = Math.min(240, Math.floor(esc));
    const esc2 = Number(body.escalation_minutes_p2);
    if (Number.isFinite(esc2) && esc2 >= 1) next.escalation_minutes_p2 = Math.min(480, Math.floor(esc2));
    if (Array.isArray(body.notify_channels)) {
      next.notify_channels = body.notify_channels.map((x) => String(x).trim().toLowerCase().slice(0, 32)).filter(Boolean).slice(0, 12);
    }
    if (body.runbook_url != null) next.runbook_url = String(body.runbook_url).slice(0, 500);
    const thrBurn = Number(body.slo_burn_ratio_webhook_threshold);
    if (Number.isFinite(thrBurn) && thrBurn >= 0.1) next.slo_burn_ratio_webhook_threshold = Math.min(20, thrBurn);
    const cool = Number(body.slo_alert_webhook_cooldown_minutes);
    if (Number.isFinite(cool) && cool >= 1) next.slo_alert_webhook_cooldown_minutes = Math.min(1440, Math.floor(cool));
  }
  writeJson(db, KEY_ALERT, next);
  return readJson(db, KEY_ALERT);
}
