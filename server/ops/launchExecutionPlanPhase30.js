/**
 * Phase 30: 대규모 론칭 실행 계획 — 카나리·마케팅·초기 코호트 메타.
 */

const KEY = "p2p.launch_execution_plan";

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

export function readLaunchExecutionPlanAdmin(db) {
  const j = readJson(db);
  return {
    canary_traffic_pct_bps: Math.min(10_000, Math.max(0, Math.floor(Number(j.canary_traffic_pct_bps) || 50))),
    marketing_wave_label: String(j.marketing_wave_label || "T0_waitlist").trim().slice(0, 120),
    initial_cohort_slug: String(j.initial_cohort_slug || "launch_cohort_v1").trim().slice(0, 64),
    go_live_window_utc_start: j.go_live_window_utc_start != null ? String(j.go_live_window_utc_start).slice(0, 40) : null,
    go_live_window_utc_end: j.go_live_window_utc_end != null ? String(j.go_live_window_utc_end).slice(0, 40) : null,
    statusboard_url: String(j.statusboard_url || "").trim().slice(0, 500) || null,
    comms_owner_role: String(j.comms_owner_role || "product_ops").trim().slice(0, 64),
    rollback_owner_role: String(j.rollback_owner_role || "hq_ops").trim().slice(0, 64),
    notes: String(j.notes || "").slice(0, 12_000),
    updated_at: j.updated_at != null ? String(j.updated_at).slice(0, 40) : null,
  };
}

export function mergeLaunchExecutionPlanPatch(db, body) {
  const prev = readJson(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    const bps = Number(body.canary_traffic_pct_bps);
    if (Number.isFinite(bps)) next.canary_traffic_pct_bps = Math.min(10_000, Math.max(0, Math.floor(bps)));
    if (body.marketing_wave_label != null) next.marketing_wave_label = String(body.marketing_wave_label).slice(0, 120);
    if (body.initial_cohort_slug != null) next.initial_cohort_slug = String(body.initial_cohort_slug).slice(0, 64);
    if (body.go_live_window_utc_start != null) next.go_live_window_utc_start = String(body.go_live_window_utc_start).slice(0, 40);
    if (body.go_live_window_utc_end != null) next.go_live_window_utc_end = String(body.go_live_window_utc_end).slice(0, 40);
    if (body.statusboard_url != null) next.statusboard_url = String(body.statusboard_url).slice(0, 500);
    if (body.comms_owner_role != null) next.comms_owner_role = String(body.comms_owner_role).slice(0, 64);
    if (body.rollback_owner_role != null) next.rollback_owner_role = String(body.rollback_owner_role).slice(0, 64);
    if (body.notes != null) next.notes = String(body.notes).slice(0, 12_000);
  }
  writeJson(db, next);
  return readLaunchExecutionPlanAdmin(db);
}

export function getLaunchExecutionPublicHints(db) {
  const p = readLaunchExecutionPlanAdmin(db);
  return {
    canary_traffic_pct_bps: p.canary_traffic_pct_bps,
    marketing_wave_label: p.marketing_wave_label,
    initial_cohort_slug: p.initial_cohort_slug,
    go_live_window_utc_start: p.go_live_window_utc_start,
    go_live_window_utc_end: p.go_live_window_utc_end,
    statusboard_url: p.statusboard_url,
    hints: ["카나리는 launch-gate·traffic-shading과 함께 단계 상향.", "초기 코호트는 beta_cohort_members 와 정합."],
  };
}
