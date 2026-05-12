/**
 * League 매치 큐에서 2명씩 페어링 → 세션 참가자 등록 + 점수 0.
 * 체결 규칙: 세션 내 score_bump API로 점수 반영(베타 스텁).
 */
import { insertSession } from "./leagueSessionEngine.js";

export function runLeagueMatchTick(db) {
  const waiting = db
    .prepare(`SELECT id, user_id FROM league_match_queue WHERE status = 'queued' ORDER BY id ASC LIMIT 4`)
    .all();
  if (waiting.length < 2) return { paired: 0 };

  const u1 = waiting[0];
  let u2 = waiting.find((r) => r.user_id !== u1.user_id);
  if (!u2) return { paired: 0 };
  const sessionId = `lg-${Date.now()}-${u1.user_id}-${u2.user_id}`;
  insertSession(db, sessionId, { match_kind: "auto_pair", user_a: u1.user_id, user_b: u2.user_id });

  db.prepare(`UPDATE league_match_queue SET status = 'matched', session_id = ? WHERE id IN (?, ?)`).run(sessionId, u1.id, u2.id);

  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO league_session_participants (session_id, user_id, score, updated_at) VALUES (?, ?, 0, ?)`,
  ).run(sessionId, u1.user_id, now);
  db.prepare(
    `INSERT OR REPLACE INTO league_session_participants (session_id, user_id, score, updated_at) VALUES (?, ?, 0, ?)`,
  ).run(sessionId, u2.user_id, now);

  return { paired: 1, sessionId };
}

export function listRankings(db, sessionId) {
  return db
    .prepare(
      `SELECT user_id, score, updated_at FROM league_session_participants WHERE session_id = ? ORDER BY score DESC, user_id ASC`,
    )
    .all(sessionId);
}

export function bumpParticipantScore(db, sessionId, userId, delta) {
  const d = Number(delta);
  if (!Number.isFinite(d)) return { ok: false };
  const row = db.prepare(`SELECT 1 FROM league_session_participants WHERE session_id = ? AND user_id = ?`).get(sessionId, userId);
  if (!row) {
    db.prepare(
      `INSERT INTO league_session_participants (session_id, user_id, score, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
    ).run(sessionId, userId, d);
  } else {
    db.prepare(
      `UPDATE league_session_participants SET score = score + ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ? AND user_id = ?`,
    ).run(d, sessionId, userId);
  }
  return { ok: true };
}

export function startLeagueMatchWorker(db, pollMs = 20_000) {
  const timer = setInterval(() => {
    try {
      runLeagueMatchTick(db);
    } catch (e) {
      console.warn("[league-match]", e?.message || e);
    }
  }, pollMs);
  return () => clearInterval(timer);
}
