/**
 * Phase 22: OIDC `id_token` JWKS 서명 검증 (issuer discovery 또는 OIDC_JWKS_URI).
 */

import * as jose from "jose";

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} idToken
 * @returns {Promise<import("jose").JWTPayload | null>} JWKS 미구성 시 null → 호출부에서 decode 폴백
 */
export async function verifyOidcIdTokenWithJwks(env, idToken) {
  const token = String(idToken || "").trim();
  if (!token) return null;
  let jwksUri = String(env.OIDC_JWKS_URI || "").trim();
  const issuerHint = String(env.OIDC_ISSUER || "").trim().replace(/\/$/, "");
  let issuerVerify = issuerHint ? `${issuerHint}/` : "";
  if (!jwksUri && issuerHint) {
    const w = await fetch(`${issuerHint}/.well-known/openid-configuration`, {
      headers: { Accept: "application/json" },
    });
    if (!w.ok) throw new Error(`OIDC_DISCOVERY_FAILED:${w.status}`);
    const doc = await w.json();
    jwksUri = String(doc.jwks_uri || "").trim();
    const docIssuer = String(doc.issuer || "").trim();
    if (docIssuer) issuerVerify = docIssuer.endsWith("/") ? docIssuer : `${docIssuer}/`;
  }
  if (!jwksUri) return null;

  const JWKS = jose.createRemoteJWKSet(new URL(jwksUri));
  const audience = String(env.OIDC_AUDIENCE || env.OIDC_CLIENT_ID || "").trim();
  /** @type {import("jose").JWTVerifyOptions} */
  const opts = {};
  if (issuerVerify) opts.issuer = issuerVerify;
  if (audience) opts.audience = audience;
  const { payload } = await jose.jwtVerify(token, JWKS, opts);
  return payload;
}
