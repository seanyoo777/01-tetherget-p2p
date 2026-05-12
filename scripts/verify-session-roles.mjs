/**
 * CI-friendly checks for session role helpers (no browser, no API).
 */
import assert from "node:assert/strict";
import {
  SESSION_ROLE,
  deriveSessionProfile,
  normalizeSessionRoleHint,
  isLoginTestAdminLike,
  isPrivilegedAdminSessionRole,
} from "@tetherget/core";

assert.equal(normalizeSessionRoleHint("super_admin"), SESSION_ROLE.HQ_OPS);
assert.equal(normalizeSessionRoleHint("OPS_ADMIN"), SESSION_ROLE.OPS_ADMIN);
assert.equal(normalizeSessionRoleHint("cs_admin"), SESSION_ROLE.CS_ADMIN);

assert.equal(isPrivilegedAdminSessionRole(SESSION_ROLE.SALES), true);
assert.equal(isPrivilegedAdminSessionRole(SESSION_ROLE.USER), false);

const pOps = deriveSessionProfile({ legacyRole: "회원", sessionRoleHint: "ops_admin" });
assert.equal(pOps.canAccessAdmin, true);
assert.equal(pOps.allowDestructiveAdminWrite, false);

const pHq = deriveSessionProfile({ legacyRole: "회원", sessionRoleHint: "hq_ops" });
assert.equal(pHq.canAccessAdmin, true);
assert.equal(pHq.allowDestructiveAdminWrite, true);

assert.equal(isLoginTestAdminLike({ role: "회원", session_role: "ops_admin" }), true);
assert.equal(isLoginTestAdminLike({ role: "회원", session_role: "user" }), false);
assert.equal(isLoginTestAdminLike({ role: "영업관리자 LEVEL 1", session_role: null }), true);

console.log("PASS sessionRoles invariants");
