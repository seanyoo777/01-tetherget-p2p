/**
 * Phase 27: API 1.0 버저닝 — 호환성 매트릭스·폐기 일정(platform_settings).
 * 실제 `/api/v1/*` 라우팅은 index 미들웨어에서 `/api/*`로 rewrite.
 */

const KEY = "p2p.api_1_0_matrix";

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

export function readApi10MatrixAdmin(db) {
  const j = readJson(db);
  return {
    supported_versions: Array.isArray(j.supported_versions)
      ? j.supported_versions.map((x) => String(x).trim().slice(0, 16)).filter(Boolean).slice(0, 8)
      : ["1.0"],
    default_version: String(j.default_version || "1.0").trim().slice(0, 16) || "1.0",
    deprecation_schedule: Array.isArray(j.deprecation_schedule)
      ? j.deprecation_schedule
          .map((row) => ({
            path_pattern: String(row?.path_pattern || "").trim().slice(0, 200),
            sunset_date: String(row?.sunset_date || "").trim().slice(0, 32),
            replacement_hint: String(row?.replacement_hint || "").trim().slice(0, 500),
          }))
          .filter((row) => row.path_pattern)
          .slice(0, 40)
      : [],
    compatibility_notes: String(j.compatibility_notes || "").slice(0, 8000),
    updated_at: j.updated_at != null ? String(j.updated_at).slice(0, 40) : null,
  };
}

export function mergeApi10MatrixPatch(db, body) {
  const prev = readJson(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    if (Array.isArray(body.supported_versions)) {
      next.supported_versions = body.supported_versions.map((x) => String(x).trim().slice(0, 16)).filter(Boolean).slice(0, 8);
    }
    if (body.default_version != null) next.default_version = String(body.default_version).trim().slice(0, 16);
    if (Array.isArray(body.deprecation_schedule)) {
      next.deprecation_schedule = body.deprecation_schedule
        .map((row) => ({
          path_pattern: String(row?.path_pattern || "").trim().slice(0, 200),
          sunset_date: String(row?.sunset_date || "").trim().slice(0, 32),
          replacement_hint: String(row?.replacement_hint || "").trim().slice(0, 500),
        }))
        .filter((row) => row.path_pattern)
        .slice(0, 40);
    }
    if (body.compatibility_notes != null) next.compatibility_notes = String(body.compatibility_notes).slice(0, 8000);
  }
  writeJson(db, next);
  return readApi10MatrixAdmin(db);
}

/** 공개 — 시크릿 없음 */
export function getPublicApi10Policy(db) {
  const m = readApi10MatrixAdmin(db);
  return {
    supported_versions: m.supported_versions,
    default_version: m.default_version,
    deprecation_schedule: m.deprecation_schedule,
    versioned_base_path: "/api/v1",
    hints: [
      "클라이언트는 Accept-Version 또는 URL prefix /api/v1 사용 가능(서버가 동일 핸들러로 rewrite).",
      "폐기 일정은 관리자가 PATCH /api/admin/ops/api-1-0-matrix 로 유지합니다.",
    ],
  };
}
