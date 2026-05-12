/**
 * Phase 20: 직원용 OIDC (Authorization Code) — 내부 콘솔이 IdP 로그인 후 API JWT 발급.
 * env: OIDC_AUTHORIZATION_ENDPOINT, OIDC_TOKEN_ENDPOINT, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET,
 *      OIDC_REDIRECT_URI, OIDC_SCOPES (default "openid email profile")
 */

import crypto from "node:crypto";
import jwt from "jsonwebtoken";

export function oidcStaffConfigured(env) {
  return Boolean(requiredEnv(env));
}

function requiredEnv(env) {
  const a = String(env.OIDC_AUTHORIZATION_ENDPOINT || "").trim();
  const t = String(env.OIDC_TOKEN_ENDPOINT || "").trim();
  const c = String(env.OIDC_CLIENT_ID || "").trim();
  const s = String(env.OIDC_CLIENT_SECRET || "").trim();
  const r = String(env.OIDC_REDIRECT_URI || "").trim();
  if (!a || !t || !c || !s || !r) return null;
  return { authorizationEndpoint: a, tokenEndpoint: t, clientId: c, clientSecret: s, redirectUri: r };
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} jwtSecret
 */
export function buildOidcStaffAuthorizeUrl(env, jwtSecret) {
  const cfg = requiredEnv(env);
  if (!cfg) return null;
  const scopes = String(env.OIDC_SCOPES || "openid email profile").trim();
  const state = jwt.sign({ typ: "oidc_staff", t: Date.now() }, jwtSecret, { expiresIn: "10m" });
  const u = new URL(cfg.authorizationEndpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("scope", scopes);
  u.searchParams.set("state", state);
  u.searchParams.set("nonce", crypto.randomBytes(8).toString("hex"));
  return { url: u.toString(), state };
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} code
 * @param {string} redirectUri
 */
export async function exchangeOidcStaffCode(env, code, redirectUri) {
  const cfg = requiredEnv(env);
  if (!cfg) throw new Error("OIDC_NOT_CONFIGURED");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: String(code || ""),
    redirect_uri: redirectUri || cfg.redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  const res = await fetch(cfg.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const txt = await res.text();
  let json;
  try {
    json = JSON.parse(txt);
  } catch {
    json = { raw: txt.slice(0, 500) };
  }
  if (!res.ok) {
    const err = new Error("OIDC_TOKEN_FAILED");
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

/**
 * JWT access_token에서 OIDC userinfo (optional).
 * @param {NodeJS.ProcessEnv} env
 * @param {string} accessToken
 */
export async function fetchOidcUserInfo(env, accessToken) {
  const url = String(env.OIDC_USERINFO_ENDPOINT || "").trim();
  if (!url) return null;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}
