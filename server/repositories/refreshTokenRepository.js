import bcrypt from "bcryptjs";

export function createRefreshTokenRepository(db) {
  return {
    create({ userId, refreshToken, expiresAt }) {
      const tokenHash = bcrypt.hashSync(refreshToken, 10);
      return db
        .prepare("INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)")
        .run(userId, tokenHash, expiresAt);
    },
    findMatchingByUser(userId, refreshToken) {
      const rows = db
        .prepare("SELECT id, token_hash, user_id, expires_at FROM refresh_tokens WHERE user_id = ?")
        .all(userId);
      return rows.find((row) => bcrypt.compareSync(refreshToken, row.token_hash)) || null;
    },
    deleteById(id) {
      db.prepare("DELETE FROM refresh_tokens WHERE id = ?").run(id);
    },
    deleteByUserId(userId) {
      db.prepare("DELETE FROM refresh_tokens WHERE user_id = ?").run(userId);
    },
    findMatchingAny(refreshToken) {
      const rows = db.prepare("SELECT id, token_hash FROM refresh_tokens").all();
      return rows.find((row) => bcrypt.compareSync(refreshToken, row.token_hash)) || null;
    },
  };
}
