/**
 * Graceful shutdown: 워커 타이머 정리 후 HTTP 종료, DB close.
 * @param {{ server: import("http").Server; stopFns: Array<() => void>; db?: { close?: () => void }; timeoutMs?: number }} opts
 */
export function registerGracefulShutdown(opts) {
  const { server, stopFns, db, timeoutMs = 20_000 } = opts;
  let done = false;

  function shutdown(signal) {
    if (done) return;
    done = true;
    console.warn(`[tetherget-api] shutdown: ${signal}`);
    for (const fn of stopFns) {
      try {
        fn();
      } catch (e) {
        console.warn("[shutdown] stop fn", e?.message || e);
      }
    }
    const killTimer = setTimeout(() => {
      console.warn("[tetherget-api] shutdown: force exit");
      try {
        db?.close?.();
      } catch {
        /* ignore */
      }
      process.exit(1);
    }, timeoutMs);

    server.close(() => {
      clearTimeout(killTimer);
      try {
        db?.close?.();
      } catch {
        /* ignore */
      }
      console.warn("[tetherget-api] shutdown: http closed");
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
