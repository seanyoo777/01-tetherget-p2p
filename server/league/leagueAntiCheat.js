/**
 * League 점수 bump — 과도한 변화·호출 빈도 제한 (소규모 베타용).
 */

/** @type {Map<string, { n: number; resetAt: number }>} */
const bumpWindow = new Map();

/**
 * @param {string} sessionId
 * @param {number} userId
 * @param {number} delta
 * @param {{ maxAbsDelta?: number; maxPerMinute?: number }} [opts]
 */
export function assertLeagueScoreBumpAllowed(sessionId, userId, delta, opts = {}) {
  const maxAbs = Math.max(1, Number(opts.maxAbsDelta ?? Number(process.env.LEAGUE_SCORE_BUMP_MAX_ABS || 500)));
  const maxPerMin = Math.max(1, Number(opts.maxPerMinute ?? Number(process.env.LEAGUE_SCORE_BUMP_MAX_PER_MIN || 40)));
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, message: "유효한 delta 가 필요합니다." };
  }
  if (Math.abs(delta) > maxAbs) {
    return { ok: false, message: `점수 변화는 ±${maxAbs} 이내여야 합니다.` };
  }
  const key = `${sessionId}:${userId}`;
  const now = Date.now();
  let b = bumpWindow.get(key);
  if (!b || now > b.resetAt) {
    b = { n: 0, resetAt: now + 60_000 };
  }
  if (b.n >= maxPerMin) {
    return { ok: false, message: "점수 갱신 호출이 너무 잦습니다. 잠시 후 다시 시도하세요." };
  }
  b.n += 1;
  bumpWindow.set(key, b);
  if (bumpWindow.size > 50_000) bumpWindow.clear();
  return { ok: true };
}
