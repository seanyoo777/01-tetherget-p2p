/**
 * P2P 타임라인 이벤트 정규화 (mock·표시).
 */

/** @typedef {'info'|'success'|'warning'|'critical'} TimelineSeverity */
/** @typedef {'system'|'user'|'admin'} TimelineSource */

const ACTION_META = {
  ORDER_CREATED: { source: "system", severity: "info", actor: "system" },
  ORDER_MATCHED: { source: "system", severity: "info", actor: "matcher" },
  BUYER_PAYMENT_STARTED: { source: "user", severity: "warning", actor: "buyer" },
  PAYMENT_SENT_MARKED: { source: "user", severity: "success", actor: "buyer" },
  ORDER_COMPLETED_MOCK_RELEASE: { source: "user", severity: "success", actor: "seller" },
  PAYMENT_CONFIRMED_MOCK: { source: "user", severity: "success", actor: "buyer" },
  DISPUTE_OPEN: { source: "admin", severity: "critical", actor: "admin_ops" },
  DISPUTE_REVIEWING: { source: "admin", severity: "warning", actor: "admin_ops" },
  DISPUTE_WAITING_EVIDENCE: { source: "admin", severity: "warning", actor: "admin_ops" },
  DISPUTE_ESCALATED: { source: "admin", severity: "critical", actor: "admin_escalation" },
};

/**
 * ISO·레거시 문자열 → `YYYY-MM-DD HH:mm:ss` (UI 통일).
 * @param {string|number|Date|null|undefined} raw
 */
export function formatP2pTimestamp(raw) {
  if (raw == null || raw === "" || raw === "—") return "—";
  const d = raw instanceof Date ? raw : new Date(raw);
  if (!Number.isFinite(d.getTime())) {
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.length >= 19 ? s.slice(0, 19).replace("T", " ") : s;
    return s || "—";
  }
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * @param {string} action
 */
function inferMeta(action) {
  const key = String(action || "").toUpperCase();
  if (ACTION_META[key]) return ACTION_META[key];
  if (key.startsWith("DISPUTE_")) {
    return { source: "admin", severity: "critical", actor: "admin_ops" };
  }
  if (key.includes("ADMIN")) return { source: "admin", severity: "warning", actor: "admin_ops" };
  if (key.includes("BUYER") || key.includes("PAYMENT")) return { source: "user", severity: "info", actor: "buyer" };
  if (key.includes("SELLER") || key.includes("RELEASE") || key.includes("COMPLETE")) {
    return { source: "user", severity: "info", actor: "seller" };
  }
  return { source: "system", severity: "info", actor: "system" };
}

/**
 * @param {object} ev
 * @param {{ role?: string|null }} [ctx]
 */
export function normalizeTimelineEvent(ev, ctx = {}) {
  const action = String(ev?.action || "UNKNOWN");
  const meta = inferMeta(action);
  let actor = ev?.actor ?? meta.actor;
  if (ev?.actor_user_id != null) actor = `user_${ev.actor_user_id}`;
  else if (ctx.role && meta.actor === "buyer" && ctx.role === "buyer") actor = "buyer (you)";
  else if (ctx.role && meta.actor === "seller" && ctx.role === "seller") actor = "seller (you)";

  return {
    ...ev,
    action,
    created_at: formatP2pTimestamp(ev?.created_at),
    actor,
    source: ev?.source ?? meta.source,
    severity: ev?.severity ?? meta.severity,
    _normalized: true,
  };
}

/**
 * @param {object[]} events
 * @param {{ role?: string|null }} [ctx]
 */
export function sortTimelineEvents(events, ctx = {}) {
  const list = (Array.isArray(events) ? events : []).map((e) => normalizeTimelineEvent(e, ctx));
  return list.sort((a, b) => {
    const ta = a.created_at === "—" ? "" : a.created_at;
    const tb = b.created_at === "—" ? "" : b.created_at;
    return ta.localeCompare(tb);
  });
}

/**
 * @param {string} severity
 */
export function severityTone(severity) {
  if (severity === "critical") return "rose";
  if (severity === "warning") return "amber";
  if (severity === "success") return "emerald";
  return "slate";
}
