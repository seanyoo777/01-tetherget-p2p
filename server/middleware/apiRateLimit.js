/**
 * 경량 API 레이트 리밋 (인메모리). 소규모 운영용 — 대규모는 Redis/게이트웨이로 이전.
 */

function clientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (xf) return xf.slice(0, 128);
  return String(req.socket?.remoteAddress || req.ip || "").slice(0, 128);
}

function isExemptPath(path) {
  const p = String(path || "");
  return (
    p === "/api/health" ||
    p === "/api/ops/ready" ||
    p === "/api/ops/health" ||
    p.startsWith("/api/webhooks/")
  );
}

/**
 * @param {{ windowMs?: number; max?: number; keyPrefix?: string }} opts
 */
export function createApiRateLimiter(opts = {}) {
  const windowMs = Math.max(5000, Number(opts.windowMs || 60_000));
  const max = Math.max(20, Number(opts.max || 240));
  const keyPrefix = String(opts.keyPrefix || "rl");
  /** @type {Map<string, { n: number; resetAt: number }>} */
  const buckets = new Map();

  return function rateLimitMiddleware(req, res, next) {
    const path = String(req.originalUrl || req.url || "").split("?")[0];
    if (isExemptPath(path)) return next();

    const ip = clientIp(req);
    const key = `${keyPrefix}:${ip}:${req.method}:${path.split("/").slice(0, 5).join("/")}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now > b.resetAt) {
      b = { n: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.n += 1;
    if (b.n > max) {
      res.setHeader("Retry-After", String(Math.ceil((b.resetAt - now) / 1000)));
      return res.status(429).json({ message: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." });
    }
    if (buckets.size > 50_000) buckets.clear();
    next();
  };
}
