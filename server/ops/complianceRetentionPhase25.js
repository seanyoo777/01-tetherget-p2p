/**
 * Phase 25: SOC2/ISO 증적 메타 + 데이터 보존 기간(정책 JSON).
 */

const KEY = "p2p.compliance_pack";

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

const DEFAULT_RETENTION = {
  platform_audit_logs: 365,
  p2p_orders: 730,
  billing_invoices: 2555,
  privacy_deletion_requests: 180,
};

export function readCompliancePackAdmin(db) {
  const j = readJson(db);
  return {
    soc2_control_refs: Array.isArray(j.soc2_control_refs)
      ? j.soc2_control_refs.map((x) => String(x).trim().slice(0, 64)).filter(Boolean).slice(0, 80)
      : [],
    iso27001_annex_refs: Array.isArray(j.iso27001_annex_refs)
      ? j.iso27001_annex_refs.map((x) => String(x).trim().slice(0, 64)).filter(Boolean).slice(0, 80)
      : [],
    data_retention_days: { ...DEFAULT_RETENTION, ...(typeof j.data_retention_days === "object" && j.data_retention_days ? j.data_retention_days : {}) },
    evidence_export_last_at: j.evidence_export_last_at != null ? String(j.evidence_export_last_at).slice(0, 40) : null,
    notes: String(j.notes || "").slice(0, 4000),
    updated_at: j.updated_at != null ? String(j.updated_at).slice(0, 40) : null,
  };
}

export function mergeCompliancePackPatch(db, body) {
  const prev = readJson(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    if (Array.isArray(body.soc2_control_refs)) {
      next.soc2_control_refs = body.soc2_control_refs.map((x) => String(x).trim().slice(0, 64)).filter(Boolean).slice(0, 80);
    }
    if (Array.isArray(body.iso27001_annex_refs)) {
      next.iso27001_annex_refs = body.iso27001_annex_refs.map((x) => String(x).trim().slice(0, 64)).filter(Boolean).slice(0, 80);
    }
    if (body.data_retention_days && typeof body.data_retention_days === "object") {
      next.data_retention_days = { ...DEFAULT_RETENTION, ...prev.data_retention_days, ...body.data_retention_days };
      for (const k of Object.keys(next.data_retention_days)) {
        const n = Math.floor(Number(next.data_retention_days[k]) || 0);
        next.data_retention_days[k] = Math.min(10_000, Math.max(1, n || 30));
      }
    }
    if (body.evidence_export_last_at != null) next.evidence_export_last_at = String(body.evidence_export_last_at).slice(0, 40);
    if (body.notes != null) next.notes = String(body.notes).slice(0, 4000);
  }
  writeJson(db, next);
  return readCompliancePackAdmin(db);
}

/** 공개 — 카테고리·일수만 */
export function getCompliancePublicHints(db) {
  const p = readCompliancePackAdmin(db);
  return {
    data_retention_days: p.data_retention_days,
    soc2_control_count: p.soc2_control_refs.length,
    iso27001_annex_ref_count: p.iso27001_annex_refs.length,
    hints: ["증적 본문·감사 로그 export는 관리자 전용 엔드포인트 및 오프라인 보관 정책을 따릅니다."],
  };
}
