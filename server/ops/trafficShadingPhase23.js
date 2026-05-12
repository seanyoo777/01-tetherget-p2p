/**
 * Phase 23: 트래픽 쉐이딩(카나리·홀드아웃) 설정 — 게이트웨이·LB와 정합용 JSON.
 */

const KEY = "p2p.traffic_shading";

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

export function readTrafficShading(db) {
  return readJson(db);
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {object} body
 */
export function mergeTrafficShadingPatch(db, body) {
  const prev = readTrafficShading(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    const w = Number(body.canary_weight_bps);
    if (Number.isFinite(w) && w >= 0 && w <= 10_000) next.canary_weight_bps = Math.floor(w);
    if (Array.isArray(body.holdout_regions)) {
      next.holdout_regions = body.holdout_regions.map((x) => String(x).trim().toUpperCase().slice(0, 16)).filter(Boolean).slice(0, 32);
    }
    if (body.notes != null) next.notes = String(body.notes).slice(0, 2000);
  }
  writeJson(db, next);
  return readTrafficShading(db);
}
