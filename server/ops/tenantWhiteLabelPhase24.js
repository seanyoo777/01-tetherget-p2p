/**
 * Phase 24: 다중 테넌트·화이트라벨 — 테넌트별 표시 메타(주문 platform_code 와 정합).
 */

const KEY = "p2p.tenant_registry";

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

/**
 * tenants: { "tetherget": { display_name, support_url, theme_primary } }
 */
export function readTenantRegistry(db) {
  const j = readJson(db);
  const tenants = j.tenants && typeof j.tenants === "object" ? j.tenants : {};
  return { tenants, updated_at: j.updated_at || null, enforce_header: Boolean(j.enforce_header) };
}

export function mergeTenantRegistryPatch(db, body) {
  const prev = readJson(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    if (typeof body.enforce_header === "boolean") next.enforce_header = body.enforce_header;
    if (body.tenants && typeof body.tenants === "object") {
      next.tenants = {};
      for (const [code, meta] of Object.entries(body.tenants)) {
        const c = String(code || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "")
          .slice(0, 48);
        if (!c || typeof meta !== "object" || meta == null) continue;
        next.tenants[c] = {
          display_name: String(meta.display_name || c).slice(0, 120),
          support_url: String(meta.support_url || "").slice(0, 500),
          theme_primary: String(meta.theme_primary || "").slice(0, 32),
        };
      }
    }
  }
  writeJson(db, next);
  return readTenantRegistry(db);
}

/**
 * @param {import("express").Request} req
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 */
export function listTenantPublicHints(db) {
  const { tenants } = readTenantRegistry(db);
  const out = [];
  for (const [code, meta] of Object.entries(tenants || {})) {
    if (!code) continue;
    out.push({
      code,
      display_name: String(meta?.display_name || code).slice(0, 120),
      support_url: String(meta?.support_url || "").trim().slice(0, 500) || null,
    });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

export function validateTenantHeaderOrFail(req, db, env) {
  if (String(env.TENANT_REGISTRY_ENFORCE || "").trim() !== "1") return { ok: true };
  const hdr = String(req.headers["x-tenant-platform-code"] || "").trim().toLowerCase();
  if (!hdr) {
    return { ok: false, message: "X-Tenant-Platform-Code 가 필요합니다.", status: 400 };
  }
  const { tenants } = readTenantRegistry(db);
  if (!tenants[hdr]) {
    return { ok: false, message: "등록되지 않은 테넌트 코드입니다.", status: 403 };
  }
  return { ok: true, tenant: hdr };
}
