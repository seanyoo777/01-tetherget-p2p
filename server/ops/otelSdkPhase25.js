/**
 * Phase 25: OpenTelemetry Node SDK (선택) — ParentBased + 비율 샘플링, OTLP HTTP exporter.
 */

import { createRequire } from "node:module";
import { context, propagation, trace, SpanKind } from "@opentelemetry/api";

const require = createRequire(import.meta.url);

let providerRef = null;
let initMeta = { enabled: false };

function parseRatio(env) {
  const r = Number(env.OTEL_TRACES_SAMPLER_RATIO ?? env.OTEL_TRACES_SAMPLER_ARG ?? 0.1);
  if (!Number.isFinite(r)) return 0.1;
  return Math.min(1, Math.max(0, r));
}

/**
 * @param {NodeJS.ProcessEnv} env
 */
export function initOtelPhase25Sync(env) {
  if (String(env.OTEL_SDK_ENABLED || "0").trim() !== "1") {
    initMeta = { enabled: false, reason: "OTEL_SDK_ENABLED not 1" };
    return initMeta;
  }
  const endpoint =
    String(env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || env.OTEL_EXPORTER_OTLP_ENDPOINT || "").trim() || null;
  if (!endpoint) {
    initMeta = { enabled: false, reason: "OTEL_EXPORTER_OTLP_ENDPOINT (or TRACES) unset" };
    return initMeta;
  }
  try {
    const {
      NodeTracerProvider,
      BatchSpanProcessor,
      ParentBasedSampler,
      TraceIdRatioBasedSampler,
    } = require("@opentelemetry/sdk-trace-node");
    const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
    const { Resource } = require("@opentelemetry/resources");
    const { ATTR_SERVICE_NAME } = require("@opentelemetry/semantic-conventions");

    const serviceName = String(env.OTEL_SERVICE_NAME || env.SERVICE_NAME || "tetherget-mvp-api").trim().slice(0, 128);
    const ratio = parseRatio(env);
    const sampler = new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(ratio) });
    const resource = new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
    });
    const exporter = new OTLPTraceExporter();
    const provider = new NodeTracerProvider({ resource, sampler });
    provider.addSpanProcessor(new BatchSpanProcessor(exporter));
    provider.register();
    providerRef = provider;
    initMeta = { enabled: true, service_name: serviceName, sampler_ratio: ratio, otlp_configured: true };
    return initMeta;
  } catch (e) {
    initMeta = { enabled: false, reason: String(e?.message || e) };
    console.warn("[otel] init failed:", initMeta.reason);
    return initMeta;
  }
}

export function getOtelPhase25Status() {
  return { ...initMeta };
}

export async function shutdownOtelPhase25() {
  if (!providerRef) return;
  try {
    await providerRef.shutdown();
  } catch (e) {
    console.warn("[otel] shutdown:", e?.message || e);
  }
  providerRef = null;
}

const TRACER_NAME = "tetherget-mvp-api";

/** traceparent 헤더 기반 추출 후 HTTP 서버 스팬 */
export function otelHttpSpanMiddleware() {
  return (req, res, next) => {
    if (!String(req.path || "").startsWith("/api/")) return next();
    if (!initMeta.enabled) return next();
    const tracer = trace.getTracer(TRACER_NAME);
    const carrier = req.headers || {};
    const extracted = propagation.extract(context.active(), carrier);
    context.with(extracted, () => {
      const name = `HTTP ${String(req.method || "GET").toUpperCase()} ${String(req.path || "")}`;
      tracer.startActiveSpan(
        name,
        { kind: SpanKind.SERVER, attributes: { "http.method": String(req.method || "GET"), "http.route": String(req.path || "") } },
        (span) => {
          let ended = false;
          const end = () => {
            if (ended) return;
            ended = true;
            try {
              span.setAttribute("http.status_code", res.statusCode);
            } catch {
              /* ignore */
            }
            span.end();
          };
          res.once("finish", end);
          res.once("close", end);
          try {
            next();
          } catch (e) {
            try {
              span.recordException(e);
            } catch {
              /* ignore */
            }
            end();
            throw e;
          }
        },
      );
    });
  };
}
