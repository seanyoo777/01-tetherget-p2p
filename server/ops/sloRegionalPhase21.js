/**
 * Phase 21: 리전별 SLO 임계·Statuspage 컴포넌트 매핑.
 */

import { computeBetaSloSnapshot } from "./betaPhase14.js";
import { enrichSloSnapshotWithRecovery } from "./betaPhase16.js";

const KEY_PROFILES = "p2p.slo_regional_profiles";
const KEY_COMPONENTS = "p2p.statuspage_component_by_region";

function readJson(db, key) {
  const row = db.prepare(`SELECT value_json FROM platform_settings WHERE setting_key = ?`).get(key);
  try {
    return row?.value_json ? JSON.parse(String(row.value_json)) : {};
  } catch {
    return {};
  }
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 * @param {string} region
 */
export function mergeEnvWithRegionalSloProfile(db, env, region) {
  const r = String(region || "").trim().toUpperCase() || "GLOBAL";
  const profiles = readJson(db, KEY_PROFILES);
  const prof = profiles[r] || profiles.DEFAULT || profiles.default || profiles.GLOBAL || {};
  const out = { ...env };
  for (const [k, v] of Object.entries(prof)) {
    if (v == null) continue;
    out[String(k)] = String(v);
  }
  return out;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {string} region
 */
export function resolveStatuspageComponentIdForRegion(db, env, region) {
  const r = String(region || "").trim().toUpperCase() || "GLOBAL";
  const map = readJson(db, KEY_COMPONENTS);
  const fromDb = map[r] || map.DEFAULT || map.default || map.GLOBAL || null;
  if (fromDb) return String(fromDb).trim();
  const fromEnv = String(env.STATUSPAGE_COMPONENT_MAP_JSON || "").trim();
  if (fromEnv) {
    try {
      const j = JSON.parse(fromEnv);
      const v = j[r] || j.DEFAULT || j.GLOBAL;
      if (v) return String(v).trim();
    } catch {
      /* ignore */
    }
  }
  return String(env.STATUSPAGE_COMPONENT_ID || "").trim() || null;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 * @param {string} region
 */
export function computeBetaSloSnapshotEnrichedForRegion(db, env, region) {
  const r = String(region || "").trim().toUpperCase() || "GLOBAL";
  const mergedEnv = mergeEnvWithRegionalSloProfile(db, env, r);
  const snap = computeBetaSloSnapshot(db, mergedEnv);
  const enriched = enrichSloSnapshotWithRecovery(snap, env);
  const componentId = resolveStatuspageComponentIdForRegion(db, env, r);
  if (enriched.statuspage?.suggested_incident && componentId) {
    enriched.statuspage.suggested_incident.statuspage_component_id = componentId;
  }
  return { ...enriched, active_region: r };
}
