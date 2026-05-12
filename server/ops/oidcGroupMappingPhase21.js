/**
 * Phase 21: OIDC IdP groups → session_role / admin_regions_json (첫 매칭 우선).
 */

const KEY = "p2p.oidc_group_mappings";

function readMappings(db) {
  const row = db.prepare(`SELECT value_json FROM platform_settings WHERE setting_key = ?`).get(KEY);
  try {
    return row?.value_json ? JSON.parse(String(row.value_json)) : {};
  } catch {
    return {};
  }
}

/**
 * mappings: { rules: [ { match: "group-name", session_role?: "ops_admin", admin_regions?: ["APAC"] } ] } }
 * @param {import("better-sqlite3").Database} db
 * @param {number} userId
 * @param {string[]} groups
 * @returns {{ updated: boolean; applied?: object }}
 */
export function applyOidcGroupMappingsToUser(db, userId, groups) {
  const arr = Array.isArray(groups) ? groups.map((g) => String(g).trim()).filter(Boolean) : [];
  const cfg = readMappings(db);
  const rules = Array.isArray(cfg.rules) ? cfg.rules : [];
  let applied = null;
  for (const rule of rules) {
    const m = String(rule?.match || "").trim();
    if (!m || !arr.includes(m)) continue;
    applied = {
      match: m,
      session_role: rule.session_role != null ? String(rule.session_role).trim().slice(0, 32) : null,
      admin_regions: Array.isArray(rule.admin_regions)
        ? rule.admin_regions.map((x) => String(x).trim().toUpperCase().slice(0, 16)).filter(Boolean).slice(0, 12)
        : null,
    };
    break;
  }
  if (!applied) return { updated: false };
  const row = db.prepare(`SELECT id, role, session_role, admin_regions_json FROM users WHERE id = ?`).get(userId);
  if (!row) return { updated: false };
  const nextSr = applied.session_role || row.session_role || "user";
  const nextRegions =
    applied.admin_regions && applied.admin_regions.length
      ? JSON.stringify(applied.admin_regions)
      : String(row.admin_regions_json || '["GLOBAL"]');
  db.prepare(`UPDATE users SET session_role = ?, admin_regions_json = ? WHERE id = ?`).run(nextSr, nextRegions, userId);
  return { updated: true, applied };
}

/**
 * @param {import("better-sqlite3").Database} db
 */
export function readOidcGroupMappingsAdmin(db) {
  return readMappings(db);
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {object} body
 */
export function mergeOidcGroupMappingsPatch(db, body) {
  const prev = readMappings(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object" && Array.isArray(body.rules)) {
    next.rules = body.rules
      .map((r) => ({
        match: String(r?.match || "").trim().slice(0, 128),
        session_role: r?.session_role != null ? String(r.session_role).trim().slice(0, 32) : null,
        admin_regions: Array.isArray(r?.admin_regions)
          ? r.admin_regions.map((x) => String(x).trim().toUpperCase().slice(0, 16)).filter(Boolean).slice(0, 12)
          : null,
      }))
      .filter((r) => r.match)
      .slice(0, 48);
  }
  db.prepare(
    `INSERT INTO platform_settings (setting_key, value_json, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`,
  ).run(KEY, JSON.stringify(next));
  return readMappings(db);
}
