/**
 * FCM HTTP v1 (Firebase Cloud Messaging) — 서비스 계정 JWT.
 * FCM_SERVICE_ACCOUNT_PATH 또는 FCM_SERVICE_ACCOUNT_JSON (raw JSON) 필요.
 */
import fs from "node:fs";
import { JWT } from "google-auth-library";

/**
 * @returns {object | null}
 */
export function loadFcmServiceAccount(env = process.env) {
  try {
    const p = String(env.FCM_SERVICE_ACCOUNT_PATH || "").trim();
    if (p && fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    }
    const raw = String(env.FCM_SERVICE_ACCOUNT_JSON || "").trim();
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("[fcm-v1] service account parse failed:", e?.message || e);
  }
  return null;
}

let cachedToken = { token: "", exp: 0 };

/**
 * @param {object} sa — Firebase service account JSON (client_email, private_key, project_id)
 */
async function getMessagingAccessToken(sa) {
  const now = Date.now() / 1000;
  if (cachedToken.token && cachedToken.exp > now + 60) return cachedToken.token;

  const client = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });
  const res = await client.getAccessToken();
  const tok = res?.token || "";
  if (!tok) throw new Error("fcm_v1_no_access_token");
  cachedToken = { token: tok, exp: now + 3500 };
  return tok;
}

/**
 * @param {object} sa
 * @param {string} deviceToken
 * @param {string} title
 * @param {string} body
 * @param {Record<string, string>} dataStr
 * @param {{ analyticsLabel?: string }} [opts]
 */
export async function sendFcmV1Message(sa, deviceToken, title, body, dataStr, opts = {}) {
  const access = await getMessagingAccessToken(sa);
  const projectId = String(sa.project_id || "").trim();
  if (!projectId) return { ok: false, messageId: "", error: "missing_project_id", delivery: null };

  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const message = {
    token: deviceToken,
    notification: { title: String(title || ""), body: String(body || "") },
    data: dataStr && typeof dataStr === "object" ? dataStr : {},
    fcm_options: opts.analyticsLabel ? { analytics_label: String(opts.analyticsLabel).slice(0, 50) } : undefined,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  const name = json.name || "";
  const ok = res.ok && Boolean(name);
  const err = json.error?.message || json.error?.status || (!ok ? `http_${res.status}` : "");
  /** 배달 리포트용: v1 응답 name + 전체 error 객체(실패 시) */
  const delivery = ok ? { state: "accepted", name } : { state: "rejected", status: res.status, error: json.error || err };
  return { ok, messageId: name, error: err, delivery };
}
