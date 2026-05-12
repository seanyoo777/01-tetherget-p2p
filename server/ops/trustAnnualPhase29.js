/**
 * Phase 29: 연간 SOC2·침투 자동화 메타(캘린더·웹훅 힌트 — 비밀 미저장).
 */

const KEY = "p2p.trust_annual_automation";

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

export function readTrustAnnualAutomationAdmin(db) {
  const j = readJson(db);
  return {
    soc2_annual_window_utc: String(j.soc2_annual_window_utc || "Q1").trim().slice(0, 32),
    soc2_evidence_bundle_url: String(j.soc2_evidence_bundle_url || "").trim().slice(0, 500) || null,
    pentest_automation_cron_utc: String(j.pentest_automation_cron_utc || "0 5 1 * *").trim().slice(0, 64),
    pentest_scheduler_webhook_configured: Boolean(j.pentest_scheduler_webhook_configured),
    next_soc2_self_review_at: j.next_soc2_self_review_at != null ? String(j.next_soc2_self_review_at).slice(0, 40) : null,
    next_pentest_slot_at: j.next_pentest_slot_at != null ? String(j.next_pentest_slot_at).slice(0, 40) : null,
    notes: String(j.notes || "").slice(0, 8000),
    updated_at: j.updated_at != null ? String(j.updated_at).slice(0, 40) : null,
  };
}

export function mergeTrustAnnualAutomationPatch(db, body) {
  const prev = readJson(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    if (body.soc2_annual_window_utc != null) next.soc2_annual_window_utc = String(body.soc2_annual_window_utc).slice(0, 32);
    if (body.soc2_evidence_bundle_url != null) next.soc2_evidence_bundle_url = String(body.soc2_evidence_bundle_url).slice(0, 500);
    if (body.pentest_automation_cron_utc != null) next.pentest_automation_cron_utc = String(body.pentest_automation_cron_utc).slice(0, 64);
    if (typeof body.pentest_scheduler_webhook_configured === "boolean") next.pentest_scheduler_webhook_configured = body.pentest_scheduler_webhook_configured;
    if (body.next_soc2_self_review_at != null) next.next_soc2_self_review_at = String(body.next_soc2_self_review_at).slice(0, 40);
    if (body.next_pentest_slot_at != null) next.next_pentest_slot_at = String(body.next_pentest_slot_at).slice(0, 40);
    if (body.notes != null) next.notes = String(body.notes).slice(0, 8000);
  }
  writeJson(db, next);
  return readTrustAnnualAutomationAdmin(db);
}

export function getTrustAnnualPublicHints(db) {
  const t = readTrustAnnualAutomationAdmin(db);
  return {
    soc2_annual_window_utc: t.soc2_annual_window_utc,
    pentest_automation_cron_utc: t.pentest_automation_cron_utc,
    next_soc2_self_review_at: t.next_soc2_self_review_at,
    next_pentest_slot_at: t.next_pentest_slot_at,
    hints: ["스케줄러 웹훅 URL·시크릿은 환경변수로만 보관 — 이 JSON에는 구성 여부 플래그만."],
  };
}
