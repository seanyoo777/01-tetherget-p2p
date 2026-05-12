/**
 * Phase 20: 인입 billing 웹훅 Ed25519 검증 + kid 로테이션.
 */

import nacl from "tweetnacl";

const KEY = "p2p.inbound_billing_keys";

function readJson(db) {
  const row = db.prepare(`SELECT value_json FROM platform_settings WHERE setting_key = ?`).get(KEY);
  try {
    return row?.value_json ? JSON.parse(String(row.value_json)) : { keys: [] };
  } catch {
    return { keys: [] };
  }
}

function writeJson(db, obj) {
  db.prepare(
    `INSERT INTO platform_settings (setting_key, value_json, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`,
  ).run(KEY, JSON.stringify(obj));
}

/**
 * @param {import("better-sqlite3").Database} db
 */
export function listInboundBillingKeysAdmin(db) {
  const j = readJson(db);
  const keys = Array.isArray(j.keys) ? j.keys : [];
  return {
    keys: keys.map((k) => ({
      kid: String(k.kid || "").slice(0, 64),
      algo: String(k.algo || "ed25519"),
      public_key_preview: previewB64(String(k.public_key_base64 || "")),
      created_at: k.created_at || null,
      revoked_at: k.revoked_at || null,
    })),
  };
}

function previewB64(b64) {
  const t = String(b64).replace(/\s/g, "");
  if (t.length < 12) return t ? "****" : "";
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {{ kid: string; public_key_base64: string }} body
 */
export function addInboundBillingPublicKey(db, body) {
  const kid = String(body?.kid || "").trim().slice(0, 64);
  const publicKeyB64 = String(body?.public_key_base64 || "").trim().replace(/\s/g, "");
  if (!kid || !publicKeyB64) throw new Error("MISSING_KID_OR_KEY");
  let pub;
  try {
    pub = Buffer.from(publicKeyB64, "base64");
  } catch {
    throw new Error("BAD_KEY_B64");
  }
  if (pub.length !== 32) throw new Error("ED25519_PUB_LEN");
  const j = readJson(db);
  const keys = Array.isArray(j.keys) ? j.keys.slice() : [];
  if (keys.some((x) => String(x.kid) === kid)) throw new Error("KID_EXISTS");
  keys.push({
    kid,
    algo: "ed25519",
    public_key_base64: publicKeyB64,
    created_at: new Date().toISOString(),
    revoked_at: null,
  });
  writeJson(db, { keys });
  return listInboundBillingKeysAdmin(db);
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {string} kid
 */
export function revokeInboundBillingKey(db, kid) {
  const k = String(kid || "").trim();
  const j = readJson(db);
  const keys = Array.isArray(j.keys) ? j.keys.slice() : [];
  let hit = false;
  for (const row of keys) {
    if (String(row.kid) === k && !row.revoked_at) {
      row.revoked_at = new Date().toISOString();
      hit = true;
      break;
    }
  }
  if (!hit) throw new Error("NOT_FOUND");
  writeJson(db, { keys });
  return listInboundBillingKeysAdmin(db);
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {Buffer} rawBody
 * @param {string} kid
 * @param {string} signatureB64
 */
export function verifyInboundBillingSignature(db, rawBody, kid, signatureB64) {
  const j = readJson(db);
  const keys = Array.isArray(j.keys) ? j.keys : [];
  const row = keys.find((x) => String(x.kid) === kid && !x.revoked_at);
  if (!row) return { ok: false, reason: "unknown_or_revoked_kid" };
  let pub;
  let sig;
  try {
    pub = Buffer.from(String(row.public_key_base64).replace(/\s/g, ""), "base64");
    sig = Buffer.from(String(signatureB64).replace(/\s/g, ""), "base64");
  } catch {
    return { ok: false, reason: "bad_encoding" };
  }
  if (pub.length !== 32 || sig.length !== 64) return { ok: false, reason: "bad_lengths" };
  const ok = nacl.sign.detached.verify(new Uint8Array(rawBody), new Uint8Array(sig), new Uint8Array(pub));
  return { ok, reason: ok ? "" : "verify_failed" };
}
