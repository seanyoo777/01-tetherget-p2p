import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MOCK_ADMIN_EMAIL,
  MOCK_ADMIN_PASSWORD,
  isMockAdminEmail,
  shouldApplyAuthUserRoleSync,
} from "../mockAdminAccount.js";
import { verifyLocalEmailPassword } from "../../testAccountRegistry.js";
import { canAccessAdminSafe } from "../../admin/canAccessAdminSafe.js";

describe("mock admin account", () => {
  it("verifies fixed local credentials", () => {
    const user = verifyLocalEmailPassword(MOCK_ADMIN_EMAIL, MOCK_ADMIN_PASSWORD);
    assert.ok(user);
    assert.equal(user.session_role, "hq_ops");
  });

  it("does not ping-pong super_admin vs Korean admin display role", () => {
    assert.equal(shouldApplyAuthUserRoleSync("super_admin", "슈퍼페이지 관리자"), false);
    assert.equal(shouldApplyAuthUserRoleSync("슈퍼페이지 관리자", "super_admin"), false);
    assert.equal(shouldApplyAuthUserRoleSync("super_admin", "super_admin"), false);
    assert.equal(shouldApplyAuthUserRoleSync("회원", "슈퍼페이지 관리자"), true);
  });

  it("allows admin UI for mock admin email", () => {
    assert.ok(isMockAdminEmail(MOCK_ADMIN_EMAIL));
    assert.ok(
      canAccessAdminSafe({
        email: MOCK_ADMIN_EMAIL,
        role: "슈퍼페이지 관리자",
        session_role: "hq_ops",
      }),
    );
  });
});
