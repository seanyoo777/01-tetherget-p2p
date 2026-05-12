/**
 * Phase 23: SRE 힌트 — 에러 버짓·웹훅 실패율·카오스 프로브 기록.
 */

const KEY = "p2p.sre_config";

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

export function readSreConfig(db) {
  const j = readJson(db);
  const budgetPct = Number(j.error_budget_monthly_pct);
  return {
    error_budget_monthly_pct: Number.isFinite(budgetPct) && budgetPct > 0 ? Math.min(5, budgetPct) : 0.1,
    burn_window_hours: Math.min(168, Math.max(1, Math.floor(Number(j.burn_window_hours) || 24))),
    chaos_last_run_at: j.chaos_last_run_at != null ? String(j.chaos_last_run_at) : null,
    notes: String(j.notes || "").slice(0, 2000),
  };
}

export function mergeSreConfigPatch(db, body) {
  const raw = readJson(db);
  const next = { ...raw, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    const b = Number(body.error_budget_monthly_pct);
    if (Number.isFinite(b) && b > 0) next.error_budget_monthly_pct = Math.min(5, b);
    const h = Number(body.burn_window_hours);
    if (Number.isFinite(h) && h > 0) next.burn_window_hours = Math.min(168, Math.floor(h));
    if (body.notes != null) next.notes = String(body.notes).slice(0, 2000);
  }
  writeJson(db, next);
  return readSreConfig(db);
}

export function recordChaosProbeRun(db) {
  const prev = readJson(db);
  const next = { ...prev, chaos_last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  writeJson(db, next);
  return next.chaos_last_run_at;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 */
export function computeSreSnapshot(db, env) {
  const cfg = readSreConfig(db);
  const wh = Math.min(168, Math.max(1, cfg.burn_window_hours));
  const win = `-${wh} hours`;
  const failed = db
    .prepare(
      `SELECT COUNT(*) as c FROM admin_webhook_events WHERE status = 'failed' AND occurred_at >= datetime('now', ?)`,
    )
    .get(win);
  const total = db
    .prepare(`SELECT COUNT(*) as c FROM admin_webhook_events WHERE occurred_at >= datetime('now', ?)`)
    .get(win);
  const inboundDlq = db.prepare(`SELECT COUNT(*) as c FROM p2p_inbound_webhook_inbox WHERE status = 'dlq'`).get();
  const deadBill = db.prepare(`SELECT COUNT(*) as c FROM p2p_billing_webhook_outbox WHERE status = 'dead'`).get();
  const deadAdm = db.prepare(`SELECT COUNT(*) as c FROM p2p_outbound_admin_webhooks WHERE status = 'dead'`).get();
  const outboundDead = Number(deadBill?.c ?? 0) + Number(deadAdm?.c ?? 0);
  const fc = Number(failed?.c ?? 0);
  const tc = Number(total?.c ?? 0) || 1;
  const failRate = fc / tc;
  const budget = cfg.error_budget_monthly_pct / 100;
  const burn_ratio = budget > 0 ? failRate / budget : failRate;
  return {
    config: cfg,
    window_hours: wh,
    admin_webhook_events_failed: fc,
    admin_webhook_events_total: tc,
    fail_rate: Math.round(failRate * 1e6) / 1e6,
    error_budget_monthly_pct: cfg.error_budget_monthly_pct,
    burn_ratio_vs_monthly_budget: Math.round(burn_ratio * 1000) / 1000,
    inbound_webhook_dlq: Number(inboundDlq?.c ?? 0),
    outbound_webhook_dead_letters: Number(outboundDead ?? 0),
    env: {
      cluster: String(env.CLUSTER_NAME || env.K8S_CLUSTER_NAME || "").trim() || null,
    },
  };
}
