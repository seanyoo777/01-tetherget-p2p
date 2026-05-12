/**
 * Phase 20: 다중 리전 운영 힌트(설정 + env) — SQLite 단일 노드에서도 운영 문서·게이트웨이와 정합.
 */

const KEY = "p2p.multi_region_profile";

function readJson(db) {
  const row = db.prepare(`SELECT value_json FROM platform_settings WHERE setting_key = ?`).get(KEY);
  try {
    return row?.value_json ? JSON.parse(String(row.value_json)) : {};
  } catch {
    return {};
  }
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 */
export function getRegionCapabilities(db, env) {
  const j = readJson(db);
  const primary = String(j.primary_region || env.ACTIVE_REGION || "GLOBAL").trim().slice(0, 16) || "GLOBAL";
  const replicaLagMs = Number(env.READ_REPLICA_LAG_MS ?? j.read_replica_lag_ms_hint ?? NaN);
  return {
    primary_region: primary,
    supported_regions: Array.isArray(j.supported_regions)
      ? j.supported_regions.map((r) => String(r).trim().toUpperCase().slice(0, 16)).filter(Boolean)
      : [primary],
    read_replica_configured: Boolean(
      String(env.READ_REPLICA_DATABASE_URL || env.READ_REPLICA_URL || env.READ_REPLICA_DATABASE_PATH || "").trim(),
    ),
    read_replica_lag_ms_hint: Number.isFinite(replicaLagMs) ? replicaLagMs : null,
    audit_export_batch_default: Math.min(5000, Math.max(100, Number(j.audit_export_batch_default) || 800)),
    notes: String(j.operator_notes || "").slice(0, 2000),
  };
}
