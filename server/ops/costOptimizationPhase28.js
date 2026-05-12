/**
 * Phase 28: 비용·쿼리 힌트 — 샤드/리전 단가·상위 N 슬로우 쿼리 참조(실제 과금은 빌링 엔진).
 */

const KEY = "p2p.cost_optimization";

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

export function readCostOptimizationAdmin(db) {
  const j = readJson(db);
  const shard = j.shard_unit_cost_hint && typeof j.shard_unit_cost_hint === "object" ? { ...j.shard_unit_cost_hint } : {};
  const region = j.region_unit_cost_hint && typeof j.region_unit_cost_hint === "object" ? { ...j.region_unit_cost_hint } : {};
  return {
    shard_unit_cost_hint: shard,
    region_unit_cost_hint: region,
    slow_query_top_n: Math.min(500, Math.max(1, Math.floor(Number(j.slow_query_top_n) || 20))),
    telemetry_docs_urls: Array.isArray(j.telemetry_docs_urls)
      ? j.telemetry_docs_urls.map((u) => String(u).trim().slice(0, 500)).filter(Boolean).slice(0, 12)
      : [],
    notes: String(j.notes || "").slice(0, 8000),
    updated_at: j.updated_at != null ? String(j.updated_at).slice(0, 40) : null,
  };
}

export function mergeCostOptimizationPatch(db, body) {
  const prev = readJson(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    if (body.shard_unit_cost_hint && typeof body.shard_unit_cost_hint === "object") {
      next.shard_unit_cost_hint = { ...(prev.shard_unit_cost_hint || {}), ...body.shard_unit_cost_hint };
    }
    if (body.region_unit_cost_hint && typeof body.region_unit_cost_hint === "object") {
      next.region_unit_cost_hint = { ...(prev.region_unit_cost_hint || {}), ...body.region_unit_cost_hint };
    }
    const n = Number(body.slow_query_top_n);
    if (Number.isFinite(n)) next.slow_query_top_n = Math.min(500, Math.max(1, Math.floor(n)));
    if (Array.isArray(body.telemetry_docs_urls)) {
      next.telemetry_docs_urls = body.telemetry_docs_urls.map((u) => String(u).trim().slice(0, 500)).filter(Boolean).slice(0, 12);
    }
    if (body.notes != null) next.notes = String(body.notes).slice(0, 8000);
  }
  writeJson(db, next);
  return readCostOptimizationAdmin(db);
}

export function getCostOptimizationPublicHints(db, env) {
  const c = readCostOptimizationAdmin(db);
  return {
    slow_query_top_n: c.slow_query_top_n,
    telemetry_doc_count: c.telemetry_docs_urls.length,
    query_log_env_hint: String(env.QUERY_SLOW_LOG_TOP_N || "").trim() || null,
    hints: ["샤드/리전 단가는 참고용 JSON — 실제 인보이스·클라우드 청구와 대사하세요."],
  };
}
