/**
 * Phase 23: 다중 AZ·클러스터 식별 + 헬스/레디니스 메타(트래픽 쉐이딩 힌트).
 */

const KEY = "p2p.cluster_profile";

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
export function getClusterHealthExtra(db, env) {
  const j = readJson(db);
  const cluster = String(j.cluster_name || env.CLUSTER_NAME || env.K8S_CLUSTER_NAME || "").trim().slice(0, 64) || null;
  const az = String(j.availability_zone || env.AZ_NAME || env.AVAILABILITY_ZONE || "").trim().slice(0, 32) || null;
  const region = String(j.region_code || env.ACTIVE_REGION || env.PRIMARY_REGION || "").trim().slice(0, 16) || null;
  const trafficShadeBps = Math.min(
    10_000,
    Math.max(0, Math.floor(Number(j.traffic_shade_weight_bps ?? env.TRAFFIC_SHADE_WEIGHT_BPS ?? NaN) || 0)),
  );
  return {
    cluster,
    availability_zone: az,
    region_code: region,
    traffic_shade_weight_bps: trafficShadeBps || null,
  };
}

export function mergeClusterProfilePatch(db, body) {
  const prev = readJson(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    if (body.cluster_name != null) next.cluster_name = String(body.cluster_name).trim().slice(0, 64);
    if (body.availability_zone != null) next.availability_zone = String(body.availability_zone).trim().slice(0, 32);
    if (body.region_code != null) next.region_code = String(body.region_code).trim().toUpperCase().slice(0, 16);
    const w = Number(body.traffic_shade_weight_bps);
    if (Number.isFinite(w) && w >= 0 && w <= 10_000) next.traffic_shade_weight_bps = Math.floor(w);
  }
  db.prepare(`
    INSERT INTO platform_settings (setting_key, value_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
  `).run(KEY, JSON.stringify(next));
  return readJson(db);
}
