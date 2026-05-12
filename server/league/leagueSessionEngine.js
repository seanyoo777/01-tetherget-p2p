/**
 * League 10분 경기 — 세션 윈도·시세 스냅샷 저장 (SQLite).
 * 코어 상수 LEAGUE_MATCH_WINDOW_SECONDS 와 정합.
 */
import {
  LEAGUE_MATCH_WINDOW_SECONDS,
  LEAGUE_PRICE_SNAPSHOT_MAX_AGE_SECONDS,
  isLeaguePriceSnapshotStale,
} from "@tetherget/core";

export function sessionWindowFromNowIso(nowMs = Date.now()) {
  const start = nowMs;
  const end = nowMs + LEAGUE_MATCH_WINDOW_SECONDS * 1000;
  return {
    window_started_at: new Date(start).toISOString(),
    window_ends_at: new Date(end).toISOString(),
    window_seconds: LEAGUE_MATCH_WINDOW_SECONDS,
  };
}

export function insertSession(db, sessionId, meta = {}) {
  const w = sessionWindowFromNowIso();
  db.prepare(
    `
    INSERT INTO league_sessions (id, status, window_started_at, window_ends_at, metadata_json, created_at)
    VALUES (?, 'open', ?, ?, ?, CURRENT_TIMESTAMP)
  `,
  ).run(sessionId, w.window_started_at, w.window_ends_at, JSON.stringify(meta));
  return { id: sessionId, ...w, metadata_json: meta };
}

export function insertPriceSnapshot(db, { sessionId, assetCode, price, capturedAtMs, source }) {
  db.prepare(
    `
    INSERT INTO league_price_snapshots (session_id, asset_code, price, captured_at_ms, source)
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run(sessionId, assetCode, Number(price), Number(capturedAtMs), String(source || "manual"));

  const row = db
    .prepare(`SELECT id, captured_at_ms FROM league_price_snapshots WHERE session_id = ? ORDER BY id DESC LIMIT 1`)
    .get(sessionId);
  const stale = isLeaguePriceSnapshotStale(Date.now(), {
    capturedAtMs: Number(row?.captured_at_ms ?? capturedAtMs),
    price: Number(price),
  });
  return { snapshotId: row?.id, stale, maxAgeSeconds: LEAGUE_PRICE_SNAPSHOT_MAX_AGE_SECONDS };
}

export function listSnapshotsForSession(db, sessionId) {
  return db
    .prepare(
      `SELECT id, asset_code, price, captured_at_ms, source, created_at FROM league_price_snapshots WHERE session_id = ? ORDER BY id ASC`,
    )
    .all(sessionId);
}
