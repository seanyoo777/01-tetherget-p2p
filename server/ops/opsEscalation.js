/**
 * 온콜·SLO 에스컬레이션 정책 (platform_settings JSON).
 */

const KEY = "p2p.ops_escalation";

function readSettingJson(db, key) {
  const row = db.prepare(`SELECT value_json FROM platform_settings WHERE setting_key = ?`).get(key);
  if (!row?.value_json) return {};
  try {
    return JSON.parse(String(row.value_json));
  } catch {
    return {};
  }
}

function writeSettingJson(db, key, obj) {
  db.prepare(`
    INSERT INTO platform_settings (setting_key, value_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
  `).run(key, JSON.stringify(obj));
}

/**
 * @param {import("better-sqlite3").Database} db
 */
export function readOpsEscalation(db) {
  const j = readSettingJson(db, KEY);
  return {
    oncall_roster: Array.isArray(j.oncall_roster) ? j.oncall_roster.slice(0, 24) : [],
    runbook_url: String(j.runbook_url || "").slice(0, 500),
    slo_escalation_note: String(j.slo_escalation_note || "").slice(0, 4000),
    updated_at: j.updated_at || null,
  };
}

const PATCH_KEYS = new Set(["oncall_roster", "runbook_url", "slo_escalation_note"]);

/**
 * @param {import("better-sqlite3").Database} db
 * @param {object} body
 */
export function mergeOpsEscalationPatch(db, body) {
  const prev = readSettingJson(db, KEY);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    for (const [k, v] of Object.entries(body)) {
      if (!PATCH_KEYS.has(k)) continue;
      if (k === "oncall_roster" && Array.isArray(v)) {
        next.oncall_roster = v
          .map((o) => ({
            label: String(o.label || "").slice(0, 120),
            contact: String(o.contact || "").slice(0, 200),
            shift_hint: String(o.shift_hint || "").slice(0, 120),
          }))
          .slice(0, 24);
      } else if (typeof v === "string") {
        next[k] = v.slice(0, k === "runbook_url" ? 500 : 4000);
      } else if (v == null) {
        delete next[k];
      }
    }
  }
  writeSettingJson(db, KEY, next);
  return readOpsEscalation(db);
}
