/**
 * League 세션 창 종료 후 자동 정산: 승자 결정, 상금, 누적 랭킹·보상 통계, 감사 로그.
 * 세션당 트랜잭션으로 정산 레이스를 줄임.
 */
import { listRankings } from "./leagueMatchWorker.js";
import { refreshLeagueLeaderboardCache } from "./leagueLeaderboardCache.js";

function parseMeta(raw) {
  try {
    return JSON.parse(String(raw || "{}"));
  } catch {
    return {};
  }
}

/**
 * @param {import("better-sqlite3").Database} db
 */
function bumpLeagueCumulativeStats(db, rows, winnerId, prizeMinor) {
  for (const r of rows) {
    const uid = Number(r.user_id);
    if (!Number.isFinite(uid) || uid <= 0) continue;
    const sc = Number(r.score) || 0;
    db.prepare(`INSERT OR IGNORE INTO league_cumulative_stats (user_id) VALUES (?)`).run(uid);
    db.prepare(
      `UPDATE league_cumulative_stats SET points_total = points_total + ?, sessions_played = sessions_played + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
    ).run(sc, uid);
  }
  if (Number.isFinite(winnerId) && winnerId > 0 && prizeMinor > 0) {
    db.prepare(`INSERT OR IGNORE INTO league_cumulative_stats (user_id) VALUES (?)`).run(winnerId);
    db.prepare(
      `UPDATE league_cumulative_stats SET wins = wins + 1, prize_usdt_minor_total = prize_usdt_minor_total + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
    ).run(prizeMinor, winnerId);
  } else if (Number.isFinite(winnerId) && winnerId > 0) {
    db.prepare(`INSERT OR IGNORE INTO league_cumulative_stats (user_id) VALUES (?)`).run(winnerId);
    db.prepare(`UPDATE league_cumulative_stats SET wins = wins + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`).run(winnerId);
  }
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {{ appendPlatformAuditSystem: (o: { eventType: string, payload?: object }) => void }} hooks
 */
export function runLeagueSettlementTick(db, hooks) {
  const nowIso = new Date().toISOString();
  const due = db
    .prepare(`SELECT * FROM league_sessions WHERE status = 'open' AND window_ends_at < ? ORDER BY window_ends_at ASC LIMIT 20`)
    .all(nowIso);
  let settled = 0;
  for (const session of due) {
    const sid = String(session.id);
    try {
      const auditPayload = db.transaction(() => {
        const live = db.prepare(`SELECT * FROM league_sessions WHERE id = ? AND status = 'open'`).get(sid);
        if (!live) return null;

        const rows = listRankings(db, sid);
        if (rows.length === 0) {
          const u = db
            .prepare(`UPDATE league_sessions SET status = 'settled', settled_at = ?, settlement_json = ?, winner_user_id = NULL WHERE id = ? AND status = 'open'`)
            .run(nowIso, JSON.stringify({ reason: "no_participants" }), sid);
          if (u.changes === 1) settled += 1;
          return { sessionId: sid, winnerUserId: null, prizeMinor: 0 };
        }

        const sorted = [...rows].sort((a, b) => Number(b.score) - Number(a.score) || Number(a.user_id) - Number(b.user_id));
        const winner = sorted[0];
        const winnerId = Number(winner.user_id);
        const meta = parseMeta(live.metadata_json);
        const prizeMinor = Math.max(0, Math.floor(Number(meta.prize_usdt_minor ?? meta.prizeMinor ?? 0)));

        if (Number.isFinite(winnerId) && winnerId > 0 && prizeMinor > 0) {
          db.prepare(`INSERT OR IGNORE INTO user_financial_accounts (user_id) VALUES (?)`).run(winnerId);
          db.prepare(
            `UPDATE user_financial_accounts SET available_balance_minor = available_balance_minor + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
          ).run(prizeMinor, winnerId);
        }

        bumpLeagueCumulativeStats(db, rows, winnerId, prizeMinor);

        const settlement = {
          winner_user_id: winnerId,
          rankings: rows.map((r) => ({ user_id: r.user_id, score: r.score })),
          prize_usdt_minor: prizeMinor,
          settled_at: nowIso,
        };
        const u = db
          .prepare(`UPDATE league_sessions SET status = 'settled', settled_at = ?, winner_user_id = ?, settlement_json = ? WHERE id = ? AND status = 'open'`)
          .run(nowIso, Number.isFinite(winnerId) ? winnerId : null, JSON.stringify(settlement), sid);
        if (u.changes === 1) settled += 1;
        return { sessionId: sid, winnerUserId: Number.isFinite(winnerId) ? winnerId : null, prizeMinor };
      })();
      if (auditPayload) {
        hooks.appendPlatformAuditSystem?.({
          eventType: "league.session_settled",
          payload: auditPayload,
        });
      }
    } catch (e) {
      console.warn("[league-settlement] session", sid, e?.message || e);
    }
  }
  if (settled > 0) {
    try {
      refreshLeagueLeaderboardCache(db);
    } catch (e) {
      console.warn("[league-settlement] leaderboard cache", e?.message || e);
    }
  }
  return { settled };
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {{ appendPlatformAuditSystem: (o: { eventType: string, payload?: object }) => void }} hooks
 * @param {number} [pollMs]
 */
export function startLeagueSettlementWorker(db, hooks, pollMs = 45_000) {
  const timer = setInterval(() => {
    try {
      runLeagueSettlementTick(db, hooks);
    } catch (e) {
      console.warn("[league-settlement]", e?.message || e);
    }
  }, pollMs);
  return () => clearInterval(timer);
}
