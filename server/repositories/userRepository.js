export function createUserRepository(db) {
  return {
    findByEmail(email) {
      return db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    },
    findPublicById(id) {
      return db.prepare("SELECT id, email, nickname, role, created_at FROM users WHERE id = ?").get(id);
    },
    create({ email, passwordHash, nickname, role = "일반회원" }) {
      const result = db.prepare(
        "INSERT INTO users (email, password_hash, nickname, role) VALUES (?, ?, ?, ?)"
      ).run(email, passwordHash, nickname, role);
      return this.findPublicById(result.lastInsertRowid);
    },
    listPublic() {
      return db.prepare("SELECT id, email, nickname, role, created_at FROM users ORDER BY id DESC").all();
    },
    updateRole(id, role) {
      db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
      return this.findPublicById(id);
    },
  };
}
