import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MOCK_ADMIN_EMAIL } from "../../auth/mockAdminAccount.js";
import {
  buildAdminGateUser,
  normalizeStoredMainScreen,
  resolveAdminUiAccess,
} from "../resolveAdminUiAccess.js";

describe("resolveAdminUiAccess", () => {
  it("allows mock admin email via gate user", () => {
    const user = buildAdminGateUser({
      linkedGoogle: MOCK_ADMIN_EMAIL,
      currentRole: "슈퍼페이지 관리자",
      sessionRoleHint: "hq_ops",
    });
    assert.ok(resolveAdminUiAccess(user));
  });

  it("denies plain member role", () => {
    const user = buildAdminGateUser({
      linkedGoogle: "member@example.com",
      currentRole: "회원",
      sessionRoleHint: "user",
    });
    assert.equal(resolveAdminUiAccess(user), false);
  });

  it("uses sessionRoleHint when meAuthUser has no session_role", () => {
    const user = buildAdminGateUser({
      linkedGoogle: "sales@tetherget.test",
      currentRole: "영업 LEVEL 1",
      sessionRoleHint: "sales",
    });
    assert.ok(resolveAdminUiAccess(user));
  });

  it("normalizeStoredMainScreen maps denied and blocked admin to trade", () => {
    assert.equal(normalizeStoredMainScreen("admin-denied", false), "trade");
    assert.equal(normalizeStoredMainScreen("admin", false), "trade");
    assert.equal(normalizeStoredMainScreen("admin-denied", true), "admin");
    assert.equal(normalizeStoredMainScreen("admin", true), "admin");
    assert.equal(normalizeStoredMainScreen("trade", false), "trade");
  });
});
