/**
 * Phase 24: 요청 상관 ID(W3C traceparent 형식) + 관측 힌트(OTLP·대시보드 URL — 비밀 미노출).
 */

import crypto from "node:crypto";

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString("hex");
}

/** RFC / W3C: 00-{trace-id}-{parent-id}-01 */
export function buildTraceparent(traceId32, spanId16) {
  const tid = String(traceId32 || "").replace(/[^a-f0-9]/gi, "").slice(0, 32).padStart(32, "0");
  const sid = String(spanId16 || "").replace(/[^a-f0-9]/gi, "").slice(0, 16).padStart(16, "0");
  return `00-${tid}-${sid}-01`;
}

export function parseTraceparent(h) {
  const s = String(h || "").trim();
  const parts = s.split("-");
  if (parts.length !== 4 || parts[0] !== "00") return null;
  const trace_id = parts[1]?.length === 32 ? parts[1] : null;
  const parent_id = parts[2]?.length === 16 ? parts[2] : null;
  if (!trace_id || !parent_id) return null;
  return { trace_id, parent_id, traceparent: s };
}

/**
 * Express 미들웨어: `req.traceContext`, 응답 `X-Trace-Id`, `traceparent`
 */
export function traceContextMiddleware() {
  return (req, res, next) => {
    if (!String(req.path || "").startsWith("/api/")) return next();
    const incoming = parseTraceparent(req.headers.traceparent);
    let trace_id;
    let span_id;
    if (incoming) {
      trace_id = incoming.trace_id;
      span_id = randomHex(8);
    } else {
      trace_id = randomHex(16);
      span_id = randomHex(8);
    }
    const traceparent = buildTraceparent(trace_id, span_id);
    req.traceContext = { trace_id, span_id, traceparent };
    res.setHeader("X-Trace-Id", trace_id);
    res.setHeader("traceparent", traceparent);
    next();
  };
}

/**
 * @param {NodeJS.ProcessEnv} env
 */
export function getObservabilityHints(env) {
  const otlp = String(env.OTEL_EXPORTER_OTLP_ENDPOINT || "").trim();
  const grafana = String(env.GRAFANA_DASHBOARD_BASE_URL || "").trim();
  const loki = String(env.LOKI_QUERY_BASE_URL || "").trim();
  return {
    otlp_endpoint_configured: Boolean(otlp),
    grafana_dashboard_base_configured: Boolean(grafana),
    loki_query_base_configured: Boolean(loki),
    service_name: String(env.OTEL_SERVICE_NAME || env.SERVICE_NAME || "tetherget-mvp-api").trim().slice(0, 128),
    hints: [
      "Node SDK: @opentelemetry/sdk-node + auto-instrumentations — 이 레포는 traceparent·X-Trace-Id 상관용 훅만 기본 포함.",
      "로그 JSON: STRUCTURED_LOG_JSON=1 권장 시 payload에 _trace_id 병합.",
    ],
  };
}
