/**
 * KYC 관리자 스위치 SSE — 폴링 보완용. access_token 쿼리(JWT)로 구독 인증.
 */
import jwt from "jsonwebtoken";

export function createKycSseRouter({ jwtSecret, loadSwitchesPayload }) {
  const clients = new Set();

  function attachGetStream(app) {
    app.get("/api/platform/kyc-admin-switches/stream", (req, res) => {
      const tok = req.query.access_token || req.query.token;
      if (!tok) {
        res.status(401).end();
        return;
      }
      try {
        jwt.verify(String(tok), jwtSecret);
      } catch {
        res.status(401).end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      clients.add(res);
      try {
        const snap = loadSwitchesPayload();
        res.write(`data: ${JSON.stringify({ type: "snapshot", switches: snap })}\n\n`);
      } catch (e) {
        res.write(`data: ${JSON.stringify({ type: "error", message: String(e?.message || e) })}\n\n`);
      }
      const ping = setInterval(() => {
        try {
          res.write(": ping\n\n");
        } catch {
          clearInterval(ping);
        }
      }, 25_000);
      req.on("close", () => {
        clearInterval(ping);
        clients.delete(res);
      });
    });
  }

  function broadcastUpdate(switchesPayload) {
    const line = `data: ${JSON.stringify({ type: "update", switches: switchesPayload })}\n\n`;
    for (const r of clients) {
      try {
        r.write(line);
      } catch {
        clients.delete(r);
      }
    }
  }

  return { attachGetStream, broadcastUpdate };
}
