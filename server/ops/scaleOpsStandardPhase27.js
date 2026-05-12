/**
 * Phase 27: 규모 운영 표준 — 샤드 SLO 힌트·용량 헤드룸·주간 카오스 리허설 메타.
 */

const KEY = "p2p.scale_ops_standard";

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

export function readScaleOpsStandardAdmin(db) {
  const j = readJson(db);
  return {
    shard_error_budget_monthly_pct: Math.min(5, Math.max(0.01, Number(j.shard_error_budget_monthly_pct) || 0.2)),
    shard_latency_p99_target_ms: Math.min(30_000, Math.max(10, Math.floor(Number(j.shard_latency_p99_target_ms) || 800))),
    capacity_headroom_pct: Math.min(90, Math.max(5, Math.floor(Number(j.capacity_headroom_pct) || 35))),
    weekly_chaos_rehearsal_dow_utc: String(j.weekly_chaos_rehearsal_dow_utc || "WED")
      .trim()
      .toUpperCase()
      .slice(0, 3),
    weekly_chaos_window_utc: String(j.weekly_chaos_window_utc || "02:00").trim().slice(0, 8),
    capacity_plan_notes: String(j.capacity_plan_notes || "").slice(0, 8000),
    updated_at: j.updated_at != null ? String(j.updated_at).slice(0, 40) : null,
  };
}

export function mergeScaleOpsStandardPatch(db, body) {
  const prev = readJson(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    const e = Number(body.shard_error_budget_monthly_pct);
    if (Number.isFinite(e)) next.shard_error_budget_monthly_pct = Math.min(5, Math.max(0.01, e));
    const l = Number(body.shard_latency_p99_target_ms);
    if (Number.isFinite(l)) next.shard_latency_p99_target_ms = Math.min(30_000, Math.max(10, Math.floor(l)));
    const h = Number(body.capacity_headroom_pct);
    if (Number.isFinite(h)) next.capacity_headroom_pct = Math.min(90, Math.max(5, Math.floor(h)));
    if (body.weekly_chaos_rehearsal_dow_utc != null) next.weekly_chaos_rehearsal_dow_utc = String(body.weekly_chaos_rehearsal_dow_utc).toUpperCase().slice(0, 3);
    if (body.weekly_chaos_window_utc != null) next.weekly_chaos_window_utc = String(body.weekly_chaos_window_utc).slice(0, 8);
    if (body.capacity_plan_notes != null) next.capacity_plan_notes = String(body.capacity_plan_notes).slice(0, 8000);
  }
  writeJson(db, next);
  return readScaleOpsStandardAdmin(db);
}

export function getScaleOpsPublicHints(db) {
  const s = readScaleOpsStandardAdmin(db);
  return {
    shard_error_budget_monthly_pct: s.shard_error_budget_monthly_pct,
    shard_latency_p99_target_ms: s.shard_latency_p99_target_ms,
    capacity_headroom_pct: s.capacity_headroom_pct,
    weekly_chaos_rehearsal_dow_utc: s.weekly_chaos_rehearsal_dow_utc,
    weekly_chaos_window_utc: s.weekly_chaos_window_utc,
    hints: ["샤드별 SLO는 게이트웨이·APM에서 이 목표와 대조하세요.", "카오스는 POST /api/admin/ops/sre/chaos-automation/run 과 스테이징 롤백 훈련과 병행."],
  };
}
