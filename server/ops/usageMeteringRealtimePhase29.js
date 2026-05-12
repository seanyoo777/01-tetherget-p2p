/**
 * Phase 29: usage 기반 시간 버킷 미터링(플랫폼 fee ledger + 주문 카운트 집계).
 */

/**
 * 직전 완료 UTC 시각 구간 [start, end) 기준으로 집계 후 버킷 upsert.
 * @param {import("better-sqlite3").Database} db
 */
export function rollupUsageMeterPreviousHour(db) {
  const startRow = db.prepare(`SELECT datetime('now', 'start of hour', '-1 hour') as s, datetime('now', 'start of hour') as e`).get();
  const bucketStart = String(startRow?.s || "").trim();
  if (!bucketStart) return { ok: false, reason: "no_bucket" };
  const feeAgg = db
    .prepare(
      `SELECT COUNT(*) as c, COALESCE(SUM(fee_minor), 0) as f
       FROM p2p_platform_fee_ledger
       WHERE created_at >= ? AND created_at < ?`,
    )
    .get(bucketStart, startRow.e);
  const ordAgg = db
    .prepare(
      `SELECT COUNT(*) as c
       FROM p2p_orders
       WHERE status = 'matched' AND matched_at >= ? AND matched_at < ?`,
    )
    .get(bucketStart, startRow.e);
  const ordersDelta = Math.max(0, Math.floor(Number(ordAgg?.c) || 0));
  const feeMinorDelta = Math.max(0, Math.trunc(Number(feeAgg?.f) || 0));
  db.prepare(
    `INSERT INTO p2p_usage_meter_buckets (bucket_start, region, orders_delta, fee_minor_delta, created_at)
     VALUES (?, 'GLOBAL', ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(bucket_start, region) DO UPDATE SET
       orders_delta = excluded.orders_delta,
       fee_minor_delta = excluded.fee_minor_delta,
       created_at = CURRENT_TIMESTAMP`,
  ).run(bucketStart, ordersDelta, feeMinorDelta);
  const row = db.prepare(`SELECT * FROM p2p_usage_meter_buckets WHERE bucket_start = ? AND region = 'GLOBAL'`).get(bucketStart);
  return { ok: true, bucket: row, window: { start: bucketStart, end: String(startRow.e) } };
}

export function ingestUsageMeterDelta(db, { bucketStart, region, ordersDelta, feeMinorDelta }) {
  const bs = String(bucketStart || "").trim().slice(0, 40);
  const reg = String(region || "GLOBAL").trim().slice(0, 32) || "GLOBAL";
  if (!bs) throw new Error("INVALID_BUCKET");
  const od = Math.trunc(Number(ordersDelta) || 0);
  const fm = Math.trunc(Number(feeMinorDelta) || 0);
  db.prepare(
    `INSERT INTO p2p_usage_meter_buckets (bucket_start, region, orders_delta, fee_minor_delta, created_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(bucket_start, region) DO UPDATE SET
       orders_delta = p2p_usage_meter_buckets.orders_delta + excluded.orders_delta,
       fee_minor_delta = p2p_usage_meter_buckets.fee_minor_delta + excluded.fee_minor_delta,
       created_at = CURRENT_TIMESTAMP`,
  ).run(bs, reg, od, fm);
  return db.prepare(`SELECT * FROM p2p_usage_meter_buckets WHERE bucket_start = ? AND region = ?`).get(bs, reg);
}

export function listRecentUsageMeterBuckets(db, limit = 48) {
  const lim = Math.min(500, Math.max(1, Number(limit) || 48));
  return db.prepare(`SELECT * FROM p2p_usage_meter_buckets ORDER BY bucket_start DESC, region ASC LIMIT ?`).all(lim);
}

export function getRealtimeUsagePublicHints(db) {
  const rows = db
    .prepare(
      `SELECT COALESCE(SUM(orders_delta),0) as orders_24h, COALESCE(SUM(fee_minor_delta),0) as fee_minor_24h, COUNT(*) as buckets
       FROM p2p_usage_meter_buckets
       WHERE bucket_start >= datetime('now', '-24 hours')`,
    )
    .get();
  const last = db.prepare(`SELECT bucket_start, orders_delta, fee_minor_delta, region FROM p2p_usage_meter_buckets ORDER BY bucket_start DESC LIMIT 1`).get();
  return {
    rollup_window: "UTC hourly buckets; GLOBAL region 기본",
    last_24h_orders_rollup: Math.floor(Number(rows?.orders_24h) || 0),
    last_24h_fee_minor_rollup: Math.trunc(Number(rows?.fee_minor_24h) || 0),
    bucket_count_24h: Math.floor(Number(rows?.buckets) || 0),
    latest_bucket: last || null,
    hints: ["실시간 청구 연동 시 외부 미터링 파이프라인과 bucket_start 정렬을 맞추세요."],
  };
}
