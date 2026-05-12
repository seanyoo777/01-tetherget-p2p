/**
 * Phase 25: SRE 스냅샷 burn ratio가 임계 초과 시 SLO 알림 웹훅(쿨다운).
 */

import { computeSreSnapshot } from "./srePhase23.js";
import { readSloAlertPolicyAdmin } from "./slaCustomerPhase24.js";

const CURSOR_KEY = "p2p.slo_burn_webhook_state";

function readCursor(db) {
  const row = db.prepare(`SELECT value_json FROM platform_settings WHERE setting_key = ?`).get(CURSOR_KEY);
  try {
    return row?.value_json ? JSON.parse(String(row.value_json)) : {};
  } catch {
    return {};
  }
}

function writeCursor(db, obj) {
  db.prepare(
    `
    INSERT INTO platform_settings (setting_key, value_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
  `,
  ).run(CURSOR_KEY, JSON.stringify(obj));
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 * @param {number} intervalMs
 */
export function startSloBurnWebhookWorker(db, env, intervalMs = 60_000) {
  const url = String(env.SLO_ALERT_WEBHOOK_URL || "").trim();
  if (!url) return () => {};

  const tick = async () => {
    try {
      const snap = computeSreSnapshot(db, env);
      const policy = readSloAlertPolicyAdmin(db);
      const thr = Number(policy.slo_burn_ratio_webhook_threshold);
      const threshold = Number.isFinite(thr) && thr > 0 ? thr : Number(env.SLO_ALERT_BURN_THRESHOLD_DEFAULT || 1.25);
      if (snap.burn_ratio_vs_monthly_budget < threshold) return;

      const coolMin = Number(policy.slo_alert_webhook_cooldown_minutes);
      const cooldownMs =
        (Number.isFinite(coolMin) && coolMin > 0 ? coolMin : Number(env.SLO_ALERT_WEBHOOK_COOLDOWN_MINUTES_DEFAULT || 30)) *
        60_000;
      const cur = readCursor(db);
      const last = cur.last_fired_at ? Date.parse(String(cur.last_fired_at)) : 0;
      if (Number.isFinite(last) && Date.now() - last < cooldownMs) return;

      const body = JSON.stringify({
        event: "slo.burn_ratio_threshold",
        at: new Date().toISOString(),
        threshold,
        snapshot: snap,
      }).slice(0, 48_000);

      const headers = { "content-type": "application/json" };
      const secret = String(env.SLO_ALERT_WEBHOOK_SECRET || "").trim();
      if (secret) headers["x-tetherget-slo-secret"] = secret;

      const r = await fetch(url, { method: "POST", headers, body });
      writeCursor(db, { ...cur, last_fired_at: new Date().toISOString(), last_status: r.status });
      if (!r.ok) console.warn("[slo-webhook] non-ok", r.status);
    } catch (e) {
      console.warn("[slo-webhook] tick", e?.message || e);
    }
  };

  const ms = Math.max(20_000, Math.floor(Number(intervalMs) || 60_000));
  const t = setInterval(() => void tick(), ms);
  return () => clearInterval(t);
}
