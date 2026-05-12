/**
 * Phase 28: 규제·감사 export 스케줄 메타(비밀·버킷 자격증명 없음).
 */

const KEY_REG = "p2p.regulatory_pack";
const KEY_AUD = "p2p.audit_export_schedule";

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

export function readRegulatoryPackAdmin(db) {
  const j = readJson(db, KEY_REG);
  const countries =
    j.disclosures_by_country && typeof j.disclosures_by_country === "object" ? { ...j.disclosures_by_country } : {};
  return {
    disclosures_by_country: countries,
    default_country: String(j.default_country || "GLOBAL").trim().toUpperCase().slice(0, 8),
    notes: String(j.notes || "").slice(0, 8000),
    updated_at: j.updated_at != null ? String(j.updated_at).slice(0, 40) : null,
  };
}

export function mergeRegulatoryPackPatch(db, body) {
  const prev = readJson(db, KEY_REG);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    if (body.disclosures_by_country && typeof body.disclosures_by_country === "object") {
      next.disclosures_by_country = { ...(prev.disclosures_by_country || {}), ...body.disclosures_by_country };
    }
    if (body.default_country != null) next.default_country = String(body.default_country).toUpperCase().slice(0, 8);
    if (body.notes != null) next.notes = String(body.notes).slice(0, 8000);
  }
  writeJson(db, KEY_REG, next);
  return readRegulatoryPackAdmin(db);
}

export function readAuditExportScheduleAdmin(db) {
  const j = readJson(db, KEY_AUD);
  return {
    cron_cronexpr_utc: String(j.cron_cronexpr_utc || "0 4 * * SUN").trim().slice(0, 64),
    destination_kind: String(j.destination_kind || "signed_url_workflow").trim().slice(0, 64),
    last_run_at: j.last_run_at != null ? String(j.last_run_at).slice(0, 40) : null,
    notes: String(j.notes || "").slice(0, 4000),
    updated_at: j.updated_at != null ? String(j.updated_at).slice(0, 40) : null,
  };
}

export function mergeAuditExportSchedulePatch(db, body) {
  const prev = readJson(db, KEY_AUD);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    if (body.cron_cronexpr_utc != null) next.cron_cronexpr_utc = String(body.cron_cronexpr_utc).slice(0, 64);
    if (body.destination_kind != null) next.destination_kind = String(body.destination_kind).slice(0, 64);
    if (body.notes != null) next.notes = String(body.notes).slice(0, 4000);
  }
  writeJson(db, KEY_AUD, next);
  return readAuditExportScheduleAdmin(db);
}

export function stampAuditExportLastRun(db) {
  const prev = readJson(db, KEY_AUD);
  const next = { ...prev, last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  writeJson(db, KEY_AUD, next);
  return readAuditExportScheduleAdmin(db);
}

export function getRegulatoryPublicHints(db, country) {
  const p = readRegulatoryPackAdmin(db);
  const cc = String(country || p.default_country || "GLOBAL")
    .trim()
    .toUpperCase()
    .slice(0, 8);
  const row = p.disclosures_by_country?.[cc] || p.disclosures_by_country?.[p.default_country] || null;
  const sched = readAuditExportScheduleAdmin(db);
  return {
    country: cc,
    disclosure: row && typeof row === "object" ? { version: row.version, url: row.url } : null,
    audit_export_cron_utc: sched.cron_cronexpr_utc,
    hints: ["감사 로그 bulk export는 기존 GET /api/admin/audit/replay-export 등과 병행해 오프라인 보관."],
  };
}
