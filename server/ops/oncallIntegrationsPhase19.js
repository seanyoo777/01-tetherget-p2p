/**
 * Phase 19: PagerDuty / Opsgenie 연동 준비 + SLO 트리거.
 */

const KEY = "p2p.oncall_integrations";

function readJson(db) {
  const row = db.prepare(`SELECT value_json FROM platform_settings WHERE setting_key = ?`).get(KEY);
  try {
    return row?.value_json ? JSON.parse(String(row.value_json)) : {};
  } catch {
    return {};
  }
}

function writeJson(db, obj) {
  db.prepare(
    `INSERT INTO platform_settings (setting_key, value_json, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`,
  ).run(KEY, JSON.stringify(obj));
}

function maskKey(s) {
  const t = String(s || "");
  if (t.length <= 4) return t ? "****" : "";
  return `***${t.slice(-4)}`;
}

/**
 * @param {import("better-sqlite3").Database} db
 */
export function readOncallIntegrationsAdmin(db) {
  const j = readJson(db);
  return {
    pagerduty_enabled: Boolean(j.pagerduty_enabled),
    pagerduty_routing_key_masked: maskKey(j.pagerduty_routing_key),
    opsgenie_enabled: Boolean(j.opsgenie_enabled),
    opsgenie_api_key_masked: maskKey(j.opsgenie_api_key),
    opsgenie_responders: Array.isArray(j.opsgenie_responders) ? j.opsgenie_responders : [],
    updated_at: j.updated_at || null,
  };
}

const PATCH_KEYS = new Set([
  "pagerduty_enabled",
  "pagerduty_routing_key",
  "opsgenie_enabled",
  "opsgenie_api_key",
  "opsgenie_responders",
]);

/**
 * @param {import("better-sqlite3").Database} db
 * @param {object} body
 */
export function mergeOncallIntegrationsPatch(db, body) {
  const prev = readJson(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    for (const [k, v] of Object.entries(body)) {
      if (!PATCH_KEYS.has(k)) continue;
      if (k === "pagerduty_routing_key" && typeof v === "string") {
        next.pagerduty_routing_key = v.trim().slice(0, 200);
      } else if (k === "opsgenie_api_key" && typeof v === "string") {
        next.opsgenie_api_key = v.trim().slice(0, 200);
      } else if (k === "opsgenie_responders" && Array.isArray(v)) {
        next.opsgenie_responders = v
          .map((x) => ({
            name: String(x?.name || "").slice(0, 120),
            type: String(x?.type || "team").slice(0, 32),
          }))
          .slice(0, 8);
      } else if (typeof v === "boolean") {
        next[k] = v;
      }
    }
  }
  writeJson(db, next);
  return readOncallIntegrationsAdmin(db);
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 * @param {object} snap SLO snapshot
 */
export async function notifySloBreachOncall(db, env, snap) {
  const j = readJson(db);
  const results = { pagerduty: { skipped: true }, opsgenie: { skipped: true } };

  if (j.pagerduty_enabled && String(j.pagerduty_routing_key || "").trim()) {
    const rk = String(j.pagerduty_routing_key).trim();
    try {
      const res = await fetch("https://events.pagerduty.com/v2/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routing_key: rk,
          event_action: "trigger",
          payload: {
            summary: "Tetherget P2P: SLO breach",
            source: "tetherget-p2p",
            severity: "error",
            custom_details: {
              slo: snap?.slo,
              signals: snap?.signals,
              thresholds: snap?.thresholds,
            },
          },
        }),
      });
      results.pagerduty = { ok: res.ok, status: res.status };
      if (!res.ok) results.pagerduty.text = (await res.text().catch(() => "")).slice(0, 200);
    } catch (e) {
      results.pagerduty = { ok: false, error: String(e?.message || e) };
    }
  }

  if (j.opsgenie_enabled && String(j.opsgenie_api_key || "").trim()) {
    const key = String(j.opsgenie_api_key).trim();
    try {
      const res = await fetch("https://api.opsgenie.com/v2/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `GenieKey ${key}` },
        body: JSON.stringify({
          message: "Tetherget P2P: SLO breach",
          description: JSON.stringify({ signals: snap?.signals, slo: snap?.slo }).slice(0, 8000),
          responders: Array.isArray(j.opsgenie_responders) && j.opsgenie_responders.length ? j.opsgenie_responders : undefined,
        }),
      });
      results.opsgenie = { ok: res.ok, status: res.status };
      if (!res.ok) results.opsgenie.text = (await res.text().catch(() => "")).slice(0, 200);
    } catch (e) {
      results.opsgenie = { ok: false, error: String(e?.message || e) };
    }
  }

  if (results.pagerduty.ok === false || results.opsgenie.ok === false) {
    console.warn("[oncall-slo]", results);
  }
  return results;
}
