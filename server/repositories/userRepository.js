export function createUserRepository(db) {
  return {
    findByEmail(email) {
      return db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    },
    findByNickname(nickname) {
      return db.prepare("SELECT * FROM users WHERE nickname = ? COLLATE NOCASE").get(nickname);
    },
    findPublicById(id) {
      return db.prepare("SELECT id, email, nickname, role, referral_code, referred_by_user_id, referred_by_code, stage_label, parent_user_ref, admin_assigned, created_at FROM users WHERE id = ?").get(id);
    },
    findByReferralCode(referralCode) {
      return db.prepare("SELECT * FROM users WHERE referral_code = ?").get(referralCode);
    },
    create({ email, passwordHash, nickname, role = "일반회원" }) {
      const result = db.prepare(
        "INSERT INTO users (email, password_hash, nickname, role) VALUES (?, ?, ?, ?)"
      ).run(email, passwordHash, nickname, role);
      return this.findPublicById(result.lastInsertRowid);
    },
    listPublic() {
      return db.prepare("SELECT id, email, nickname, role, referral_code, referred_by_user_id, referred_by_code, stage_label, parent_user_ref, admin_assigned, created_at FROM users ORDER BY id DESC").all();
    },
    updateRole(id, role) {
      db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
      return this.findPublicById(id);
    },
    updateReferralCode(id, referralCode) {
      db.prepare("UPDATE users SET referral_code = ? WHERE id = ?").run(referralCode, id);
      return this.findPublicById(id);
    },
    updateNickname(id, nickname) {
      db.prepare("UPDATE users SET nickname = ? WHERE id = ?").run(nickname, id);
      return this.findPublicById(id);
    },
    updateAdminProfile(id, { stageLabel = "", parentUserRef = "", adminAssigned = false }) {
      db.prepare("UPDATE users SET stage_label = ?, parent_user_ref = ?, admin_assigned = ? WHERE id = ?").run(
        String(stageLabel || ""),
        String(parentUserRef || ""),
        adminAssigned ? 1 : 0,
        id
      );
      return this.findPublicById(id);
    },
  };
}
