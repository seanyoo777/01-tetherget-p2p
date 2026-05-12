/**
 * Phase 26: 멀티 리전 데이터 플레인 힌트 — 테넌트별 쓰기 샤드·홈 리전 라우팅(게이트웨이·프록시와 정합).
 */

import { readShardRouting, resolveShardIdForUserId } from "./shardRoutingPhase22.js";
import { readTenantRegistry } from "./tenantWhiteLabelPhase24.js";

const KEY = "p2p.data_plane_routing";

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

function normalize(doc) {
  const tenant_shard_map =
    doc.tenant_shard_map && typeof doc.tenant_shard_map === "object" && !Array.isArray(doc.tenant_shard_map)
      ? { ...doc.tenant_shard_map }
      : {};
  const def = Math.max(0, Math.min(255, Math.floor(Number(doc.default_write_shard_id) || 0)));
  return {
    version: 1,
    default_write_shard_id: def,
    automate_from_user_shard: Boolean(doc.automate_from_user_shard),
    tenant_shard_map,
    notes: String(doc.notes || "").slice(0, 2000),
    updated_at: doc.updated_at || null,
  };
}

export function readDataPlaneRoutingAdmin(db) {
  return normalize(readJson(db));
}

export function mergeDataPlaneRoutingPatch(db, body) {
  const prev = normalize(readJson(db));
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    const d = Number(body.default_write_shard_id);
    if (Number.isFinite(d)) next.default_write_shard_id = Math.max(0, Math.min(255, Math.floor(d)));
    if (typeof body.automate_from_user_shard === "boolean") next.automate_from_user_shard = body.automate_from_user_shard;
    if (body.tenant_shard_map && typeof body.tenant_shard_map === "object") {
      for (const [code, rule] of Object.entries(body.tenant_shard_map)) {
        const c = String(code || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "")
          .slice(0, 48);
        if (!c) continue;
        if (rule === null) {
          delete next.tenant_shard_map[c];
          continue;
        }
        if (rule && typeof rule === "object") {
          const sid = Math.max(0, Math.min(255, Math.floor(Number(rule.write_shard_id) || 0)));
          next.tenant_shard_map[c] = {
            write_shard_id: sid,
            home_region: String(rule.home_region || "")
              .trim()
              .toUpperCase()
              .slice(0, 16),
            catalog: String(rule.catalog || "primary")
              .trim()
              .toLowerCase()
              .slice(0, 32),
            notes: String(rule.notes || "").slice(0, 500),
          };
        }
      }
    }
    if (body.notes != null) next.notes = String(body.notes).slice(0, 2000);
  }
  writeJson(db, next);
  return normalize(readJson(db));
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {object} p
 * @param {string} [p.tenantCode]
 * @param {number} [p.userId]
 */
export function resolveWriteRoute(db, p = {}) {
  const doc = normalize(readJson(db));
  const shardCfg = readShardRouting(db);
  const tc = String(p.tenantCode || "")
    .trim()
    .toLowerCase()
    .slice(0, 48);
  const uid = Math.floor(Number(p.userId) || 0);
  const mapped = tc ? doc.tenant_shard_map[tc] : null;
  if (mapped) {
    return {
      write_shard_id: mapped.write_shard_id,
      home_region: mapped.home_region || null,
      catalog: mapped.catalog || "primary",
      source: "tenant_shard_map",
    };
  }
  if (doc.automate_from_user_shard && uid > 0) {
    const sid = resolveShardIdForUserId(uid, shardCfg);
    return {
      write_shard_id: sid,
      home_region: null,
      catalog: "primary",
      source: "user_shard_modulo",
    };
  }
  return {
    write_shard_id: doc.default_write_shard_id,
    home_region: null,
    catalog: "primary",
    source: "default_write_shard_id",
  };
}

export function getDataPlanePublicHints(db) {
  const doc = normalize(readJson(db));
  return {
    default_write_shard_id: doc.default_write_shard_id,
    automate_from_user_shard: doc.automate_from_user_shard,
    tenant_routed_count: Object.keys(doc.tenant_shard_map).length,
    hints: [
      "실제 DB 분기는 앱 외부 게이트웨이/커넥션 풀에서 수행 — 이 API는 샤드·리전 라우팅 힌트만 제공합니다.",
      "GET /api/admin/ops/write-route-preview 로 테넌트·유저 조합 미리보기.",
    ],
  };
}
