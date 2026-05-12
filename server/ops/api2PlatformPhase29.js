/**
 * Phase 29: API 2.0 — gRPC/GraphQL GA 선언 + REST 1.0 폐기 일정(메타만, 실제 라우터는 게이트웨이).
 */

const KEY = "p2p.api_2_0_matrix";

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

export function readApi20MatrixAdmin(db) {
  const j = readJson(db);
  return {
    graphql_ga_url: String(j.graphql_ga_url || "").trim().slice(0, 500) || null,
    graphql_health_url: String(j.graphql_health_url || "").trim().slice(0, 500) || null,
    grpc_ga_endpoint: String(j.grpc_ga_endpoint || "").trim().slice(0, 500) || null,
    grpc_health_package: String(j.grpc_health_package || "").trim().slice(0, 200) || null,
    rest_1_0_deprecation_phase: String(j.rest_1_0_deprecation_phase || "notice").trim().slice(0, 32),
    rest_1_0_sunset_date: String(j.rest_1_0_sunset_date || "").trim().slice(0, 32) || null,
    deprecation_notice_url: String(j.deprecation_notice_url || "").trim().slice(0, 500) || null,
    notes: String(j.notes || "").slice(0, 8000),
    updated_at: j.updated_at != null ? String(j.updated_at).slice(0, 40) : null,
  };
}

export function mergeApi20MatrixPatch(db, body) {
  const prev = readJson(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    for (const k of [
      "graphql_ga_url",
      "graphql_health_url",
      "grpc_ga_endpoint",
      "grpc_health_package",
      "rest_1_0_deprecation_phase",
      "rest_1_0_sunset_date",
      "deprecation_notice_url",
    ]) {
      if (body[k] != null) next[k] = String(body[k]).slice(0, 500);
    }
    if (body.rest_1_0_deprecation_phase != null) next.rest_1_0_deprecation_phase = String(body.rest_1_0_deprecation_phase).trim().slice(0, 32);
    if (body.rest_1_0_sunset_date != null) next.rest_1_0_sunset_date = String(body.rest_1_0_sunset_date).trim().slice(0, 32);
    if (body.notes != null) next.notes = String(body.notes).slice(0, 8000);
  }
  writeJson(db, next);
  return readApi20MatrixAdmin(db);
}

export function getApi20PublicHints(db) {
  const m = readApi20MatrixAdmin(db);
  return {
    graphql_ga_url: m.graphql_ga_url,
    graphql_health_url: m.graphql_health_url,
    grpc_ga_endpoint: m.grpc_ga_endpoint,
    rest_1_0_deprecation_phase: m.rest_1_0_deprecation_phase,
    rest_1_0_sunset_date: m.rest_1_0_sunset_date,
    deprecation_notice_url: m.deprecation_notice_url,
    hints: [
      "REST /api/v1 은 deprecation_notice_url 일정에 따라 단계적으로 제거 — 클라이언트는 2.0 엔드포인트로 이전.",
      "GA 엔드포인트는 TLS·mTLS·별도 API 키 범위로 운영하세요.",
    ],
  };
}
