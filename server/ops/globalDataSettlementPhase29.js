/**
 * Phase 29: 글로벌 데이터 상주·정산 다중화 힌트(실제 샤딩·클러스터는 인프라).
 */

const KEY = "p2p.global_settlement_mesh";

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

export function readGlobalSettlementMeshAdmin(db) {
  const j = readJson(db);
  return {
    data_residency_pins:
      j.data_residency_pins && typeof j.data_residency_pins === "object" ? { ...j.data_residency_pins } : {},
    settlement_home_by_region:
      j.settlement_home_by_region && typeof j.settlement_home_by_region === "object"
        ? { ...j.settlement_home_by_region }
        : {},
    multi_region_settlement_enabled: Boolean(j.multi_region_settlement_enabled),
    cross_border_ruleset_version: String(j.cross_border_ruleset_version || "").trim().slice(0, 64) || null,
    notes: String(j.notes || "").slice(0, 8000),
    updated_at: j.updated_at != null ? String(j.updated_at).slice(0, 40) : null,
  };
}

export function mergeGlobalSettlementMeshPatch(db, body) {
  const prev = readJson(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    if (body.data_residency_pins && typeof body.data_residency_pins === "object") {
      next.data_residency_pins = { ...(prev.data_residency_pins || {}), ...body.data_residency_pins };
    }
    if (body.settlement_home_by_region && typeof body.settlement_home_by_region === "object") {
      next.settlement_home_by_region = { ...(prev.settlement_home_by_region || {}), ...body.settlement_home_by_region };
    }
    if (typeof body.multi_region_settlement_enabled === "boolean") next.multi_region_settlement_enabled = body.multi_region_settlement_enabled;
    if (body.cross_border_ruleset_version != null) next.cross_border_ruleset_version = String(body.cross_border_ruleset_version).slice(0, 64);
    if (body.notes != null) next.notes = String(body.notes).slice(0, 8000);
  }
  writeJson(db, next);
  return readGlobalSettlementMeshAdmin(db);
}

export function getGlobalSettlementPublicHints(db) {
  const m = readGlobalSettlementMeshAdmin(db);
  return {
    multi_region_settlement_enabled: m.multi_region_settlement_enabled,
    cross_border_ruleset_version: m.cross_border_ruleset_version,
    pinned_region_count: Object.keys(m.data_residency_pins || {}).length,
    hints: ["정산 홈 리전은 월간 close·파트너 라인과 함께 회계 정책으로 검증합니다."],
  };
}
