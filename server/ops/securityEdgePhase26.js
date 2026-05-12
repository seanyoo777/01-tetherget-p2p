/**
 * Phase 26: WAF·봇 방어·화이트라벨 SSL(ACME) — 엣지 정책 메타(실제 WAF는 CDN/ingress에서 적용).
 */

const KEY = "p2p.security_edge_pack";

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

const WAF = new Set(["off", "monitor", "block"]);
const BOT = new Set(["off", "light", "strict"]);

export function readSecurityEdgePackAdmin(db) {
  const j = readJson(db);
  const waf = WAF.has(String(j.waf_mode || "").toLowerCase()) ? String(j.waf_mode).toLowerCase() : "off";
  const bot = BOT.has(String(j.bot_defense_tier || "").toLowerCase()) ? String(j.bot_defense_tier).toLowerCase() : "off";
  return {
    waf_mode: waf,
    bot_defense_tier: bot,
    acme_whitelabel_ssl: Boolean(j.acme_whitelabel_ssl),
    challenge_provider_hint: String(j.challenge_provider_hint || "").trim().slice(0, 64) || null,
    notes: String(j.notes || "").slice(0, 4000),
    updated_at: j.updated_at != null ? String(j.updated_at).slice(0, 40) : null,
  };
}

export function mergeSecurityEdgePackPatch(db, body) {
  const prev = readJson(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    const w = String(body.waf_mode || "").trim().toLowerCase();
    if (WAF.has(w)) next.waf_mode = w;
    const b = String(body.bot_defense_tier || "").trim().toLowerCase();
    if (BOT.has(b)) next.bot_defense_tier = b;
    if (typeof body.acme_whitelabel_ssl === "boolean") next.acme_whitelabel_ssl = body.acme_whitelabel_ssl;
    if (body.challenge_provider_hint != null) next.challenge_provider_hint = String(body.challenge_provider_hint).slice(0, 64);
    if (body.notes != null) next.notes = String(body.notes).slice(0, 4000);
  }
  writeJson(db, next);
  return readSecurityEdgePackAdmin(db);
}

/** 공개 — 모드만 */
export function getSecurityEdgePublicHints(db, env) {
  const p = readSecurityEdgePackAdmin(db);
  return {
    waf_mode: p.waf_mode,
    bot_defense_tier: p.bot_defense_tier,
    acme_whitelabel_ssl_enabled: p.acme_whitelabel_ssl,
    edge_enforce_header: String(env.SECURITY_EDGE_ENFORCE_MODE || "").trim().toLowerCase() || null,
    hints: [
      "WAF/봇/SSL은 Cloudflare·AWS WAF·cert-manager 등 엣지에서 이 JSON과 env SECURITY_EDGE_* 과 동기화하세요.",
    ],
  };
}
