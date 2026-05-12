/**
 * Atlassian Statuspage — 인시던트 생성 (API 키는 서버 env만).
 * @see https://developer.statuspage.io/
 */

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {{ name: string; body: string; componentId?: string | null }} incident
 * @returns {Promise<{ ok: boolean; skipped?: boolean; status?: number; error?: string }>}
 */
export async function createStatuspageIncident(env, incident) {
  const pageId = String(env.STATUSPAGE_PAGE_ID || "").trim();
  const apiKey = String(env.STATUSPAGE_API_KEY || "").trim();
  if (!pageId || !apiKey) {
    return { ok: false, skipped: true };
  }
  const url = `https://api.statuspage.io/v1/pages/${encodeURIComponent(pageId)}/incidents.json`;
  const payload = {
    incident: {
      name: String(incident.name || "SLO breach").slice(0, 100),
      status: "investigating",
      body: String(incident.body || "").slice(0, 25_000),
    },
  };
  if (incident.componentId) {
    payload.incident.components = [String(incident.componentId)];
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: t.slice(0, 500) };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}
