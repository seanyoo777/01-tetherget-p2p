import crypto from "node:crypto";

export function createUserRepository(db) {
  return {
    findByEmail(email) {
      return db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    },
    findByNickname(nickname) {
      return db.prepare("SELECT * FROM users WHERE nickname = ? COLLATE NOCASE").get(nickname);
    },
    findPublicById(id) {
      return db
        .prepare(
          "SELECT id, email, nickname, role, session_role, sales_level, referral_code, referred_by_user_id, referred_by_code, stage_label, parent_user_ref, admin_assigned, created_at FROM users WHERE id = ?"
        )
        .get(id);
    },
    findByReferralCode(referralCode) {
      return db.prepare("SELECT * FROM users WHERE referral_code = ?").get(referralCode);
    },
    create({ email, passwordHash, nickname, role = "회원", session_role = "user", sales_level = null } = {}) {
      const sl = sales_level == null || sales_level === "" ? null : Number(sales_level);
      const insert = db.prepare(
        "INSERT INTO users (email, password_hash, nickname, role, session_role, sales_level) VALUES (?, ?, ?, ?, ?, ?)"
      );
      const setReferral = db.prepare("UPDATE users SET referral_code = ? WHERE id = ?");
      const run = db.transaction(() => {
        const result = insert.run(email, passwordHash, nickname, role, session_role, Number.isFinite(sl) ? sl : null);
        const id = Number(result.lastInsertRowid);
        let code = `TG-${String(id).padStart(6, "0")}`;
        const taken = db.prepare("SELECT id FROM users WHERE referral_code = ?").get(code);
        if (taken && Number(taken.id) !== id) {
          code = `TG-${String(id).padStart(6, "0")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        }
        setReferral.run(code, id);
        return id;
      });
      const newId = run();
      return this.findPublicById(newId);
    },
    listPublic() {
      return db
        .prepare(
          "SELECT id, email, nickname, role, session_role, sales_level, referral_code, referred_by_user_id, referred_by_code, stage_label, parent_user_ref, admin_assigned, created_at FROM users ORDER BY id DESC"
        )
        .all();
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
