/**
 * Phase 28: GraphQL/gRPC 실험 트랙 + REST 1.0 병행 기간 메타.
 */

const KEY = "p2p.api_experiment_track";

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

export function readApiExperimentTrackAdmin(db) {
  const j = readJson(db);
  return {
    graphql_playground_url: String(j.graphql_playground_url || "").trim().slice(0, 500) || null,
    graphql_schema_sdl_url: String(j.graphql_schema_sdl_url || "").trim().slice(0, 500) || null,
    grpc_reflect_endpoint_hint: String(j.grpc_reflect_endpoint_hint || "").trim().slice(0, 500) || null,
    rest_1_0_parallel_until: String(j.rest_1_0_parallel_until || "").trim().slice(0, 32) || null,
    experiment_status: String(j.experiment_status || "internal_only").trim().slice(0, 32),
    notes: String(j.notes || "").slice(0, 8000),
    updated_at: j.updated_at != null ? String(j.updated_at).slice(0, 40) : null,
  };
}

export function mergeApiExperimentTrackPatch(db, body) {
  const prev = readJson(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    const urlKeys = ["graphql_playground_url", "graphql_schema_sdl_url", "grpc_reflect_endpoint_hint", "rest_1_0_parallel_until"];
    for (const k of urlKeys) {
      if (body[k] != null) next[k] = String(body[k]).slice(0, 500);
    }
    if (body.experiment_status != null) next.experiment_status = String(body.experiment_status).trim().slice(0, 32);
    if (body.notes != null) next.notes = String(body.notes).slice(0, 8000);
  }
  writeJson(db, next);
  return readApiExperimentTrackAdmin(db);
}

export function getApiExperimentPublicHints(db) {
  const t = readApiExperimentTrackAdmin(db);
  return {
    graphql_playground_url: t.graphql_playground_url,
    graphql_schema_sdl_url: t.graphql_schema_sdl_url,
    grpc_reflect_endpoint_hint: t.grpc_reflect_endpoint_hint,
    rest_1_0_parallel_until: t.rest_1_0_parallel_until,
    experiment_status: t.experiment_status,
    hints: ["실험 엔드포인트는 별도 호스트·토큰 범위로 격리하고 REST 1.0과 병행 종료일을 공지하세요."],
  };
}
