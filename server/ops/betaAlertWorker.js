/**
 * Phase 15: SLO 이탈 시 관리 웹훅 + (선택) Slack Incoming Webhook.
 */

import { computeBetaSloSnapshotEnrichedForRegion } from "./sloRegionalPhase21.js";

const DEDUPE_KEY = "p2p.beta_alert_dedupe";

function readDedupe(db) {
  const row = db.prepare(`SELECT value_json FROM platform_settings WHERE setting_key = ?`).get(DEDUPE_KEY);
  try {
    return row?.value_json ? JSON.parse(String(row.value_json)) : {};
  } catch {
    return {};
  }
}

function writeDedupe(db, patch) {
  const prev = readDedupe(db);
  const next = { ...prev, ...patch, updated_at: new Date().toISOString() };
  db.prepare(`
    INSERT INTO platform_settings (setting_key, value_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
  `).run(DEDUPE_KEY, JSON.stringify(next));
}

function breachSignature(snap) {
  return [
    snap.slo?.all_ok === false ? "bad" : "ok",
    snap.signals?.escrow_indexer_block_lag ?? "x",
    snap.signals?.push_outbound_failed ?? "x",
    snap.slo?.indexer_fresh_ok === false ? "stale" : "fresh",
  ].join("|");
}

export async function postSlackCompatibleWebhook(url, text, extra = {}) {
  const u = String(url || "").trim();
  if (!u) return;
  const body = Object.keys(extra).length ? { text, ...extra } : { text };
  try {
    const res = await fetch(u, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.warn("[beta-alert] slack webhook http", res.status);
  } catch (e) {
    console.warn("[beta-alert] slack webhook", e?.message || e);
  }
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 * @param {{ onBreach?: (snap: object) => void }} hooks
 */
export function startBetaAlertWorker(db, env, hooks = {}) {
  const enabled = String(env.BETA_SLO_ALERT_ENABLED || "0").trim() === "1";
  const repeatMs = Math.max(60_000, Number(env.BETA_SLO_ALERT_REPEAT_MS || 900_000));
  const pollMs = Math.max(25_000, Number(env.BETA_ALERT_POLL_MS || 60_000));
  const slackUrl = String(env.BETA_SLACK_INCOMING_WEBHOOK_URL || "").trim();

  if (!enabled) {
    return () => {};
  }

  const sloRegion = String(env.ACTIVE_REGION || env.BETA_SLO_ACTIVE_REGION || "GLOBAL").trim() || "GLOBAL";
  const tick = () => {
    try {
      const snap = computeBetaSloSnapshotEnrichedForRegion(db, env, sloRegion);
      if (snap.slo?.all_ok) {
        writeDedupe(db, { last_all_ok: true, last_sig: "", last_fire_at: null });
        return;
      }
      const sig = breachSignature(snap);
      const state = readDedupe(db);
      const now = Date.now();
      const lastFire = state.last_fire_at ? Date.parse(String(state.last_fire_at)) : NaN;
      const sameSig = state.last_sig === sig && state.last_all_ok === false;
      if (sameSig && Number.isFinite(lastFire) && now - lastFire < repeatMs) return;

      writeDedupe(db, { last_all_ok: false, last_sig: sig, last_fire_at: new Date().toISOString() });
      hooks.onBreach?.(snap);

      if (slackUrl) {
        const hintBlock = (snap.recovery_hints || []).length ? `\n${(snap.recovery_hints || []).map((h) => `• ${h}`).join("\n")}` : "";
        const lines = [
          `*Tetherget beta — SLO 비정상*`,
          `• indexer_lag: ${snap.signals?.escrow_indexer_block_lag ?? "—"} (max ${snap.thresholds?.indexer_lag_max_blocks})`,
          `• push_failed: ${snap.signals?.push_outbound_failed} (max ${snap.thresholds?.push_failed_max})`,
          `• indexer_fresh_ok: ${snap.slo?.indexer_fresh_ok}`,
          hintBlock,
        ].join("\n");
        void postSlackCompatibleWebhook(slackUrl, lines);
      }
    } catch (e) {
      console.warn("[beta-alert] tick", e?.message || e);
    }
  };

  const t = setInterval(tick, pollMs);
  setTimeout(tick, 8000);
  console.warn("[beta-alert] SLO 알림 워커 활성 (BETA_SLO_ALERT_ENABLED=1)");
  return () => clearInterval(t);
}
