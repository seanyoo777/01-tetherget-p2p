/**
 * 전역 League 랭킹 캐시 — platform_settings.league.leaderboard_public_cache JSON.
 */

const CACHE_KEY = "league.leaderboard_public_cache";

/**
 * @param {import("better-sqlite3").Database} db
 */
export function refreshLeagueLeaderboardCache(db) {
  const rows = db
    .prepare(
      `SELECT user_id, wins, points_total, prize_usdt_minor_total, sessions_played, updated_at
       FROM league_cumulative_stats
       ORDER BY points_total DESC, wins DESC
       LIMIT 200`,
    )
    .all();
  const payload = {
    updated_at: new Date().toISOString(),
    top: rows,
  };
  db.prepare(`
    INSERT INTO platform_settings (setting_key, value_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
  `).run(CACHE_KEY, JSON.stringify(payload));
  return { rows: rows.length };
}

/**
 * @returns {() => void}
 */
export function startLeagueLeaderboardCacheWorker(db, pollMs = 120_000) {
  const timer = setInterval(() => {
    try {
      refreshLeagueLeaderboardCache(db);
    } catch (e) {
      console.warn("[league-leaderboard-cache]", e?.message || e);
    }
  }, pollMs);
  try {
    refreshLeagueLeaderboardCache(db);
  } catch {
    /* ignore */
  }
  return () => clearInterval(timer);
}
