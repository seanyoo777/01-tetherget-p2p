/**
 * Phase 22: 다중 리전 쓰기 게이트 + 샤딩 힌트(유저 ID 모듈로 샤드 ID 산출).
 */

const KEY_MR = "p2p.multi_region_writes";
const KEY_SHARD = "p2p.shard_routing";

function readJson(db, key) {
  const row = db.prepare(`SELECT value_json FROM platform_settings WHERE setting_key = ?`).get(key);
  try {
    return row?.value_json ? JSON.parse(String(row.value_json)) : {};
  } catch {
    return {};
  }
}

function writeJson(db, key, obj) {
  db.prepare(`
    INSERT INTO platform_settings (setting_key, value_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
  `).run(key, JSON.stringify(obj));
}

/**
 * @param {import("better-sqlite3").Database} db
 */
export function readMultiRegionWrites(db) {
  return readJson(db, KEY_MR);
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {object} body
 */
export function mergeMultiRegionWritesPatch(db, body) {
  const prev = readMultiRegionWrites(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    if (typeof body.enforce === "boolean") next.enforce = body.enforce;
    if (body.primary_write_region != null) {
      next.primary_write_region = String(body.primary_write_region).trim().toUpperCase().slice(0, 16);
    }
    if (Array.isArray(body.allowed_shadow_regions)) {
      next.allowed_shadow_regions = body.allowed_shadow_regions
        .map((x) => String(x).trim().toUpperCase().slice(0, 16))
        .filter(Boolean)
        .slice(0, 24);
    }
  }
  writeJson(db, KEY_MR, next);
  return readMultiRegionWrites(db);
}

/**
 * `p2p.multi_region_writes.enforce` 가 true일 때만 `X-Write-Region` 검사.
 * @param {import("express").Request} req
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 */
export function validateMultiRegionWriteOrFail(req, db, env) {
  const cfg = readMultiRegionWrites(db);
  if (!cfg.enforce) return { ok: true };
  const expected = String(cfg.primary_write_region || env.ACTIVE_REGION || "").trim().toUpperCase();
  if (!expected) return { ok: true };
  const hdr = String(req.headers["x-write-region"] || "").trim().toUpperCase();
  if (hdr !== expected) {
    return {
      ok: false,
      message: "쓰기 리전이 이 API 인스턴스와 일치하지 않습니다.",
      hint: `X-Write-Region: ${expected}`,
    };
  }
  return { ok: true };
}

export function readShardRouting(db) {
  return readJson(db, KEY_SHARD);
}

/**
 * @param {number} userId
 * @param {object} cfg readShardRouting 결과
 */
export function resolveShardIdForUserId(userId, cfg) {
  const n = Math.max(1, Math.min(256, Math.floor(Number(cfg.shard_count || 1))));
  const uid = Math.floor(Number(userId) || 0);
  if (uid <= 0) return 0;
  return uid % n;
}

export function mergeShardRoutingPatch(db, body) {
  const prev = readShardRouting(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    const sc = Number(body.shard_count);
    if (Number.isFinite(sc) && sc >= 1 && sc <= 256) next.shard_count = Math.floor(sc);
    if (body.notes != null) next.notes = String(body.notes).slice(0, 500);
  }
  writeJson(db, KEY_SHARD, next);
  return readShardRouting(db);
}
