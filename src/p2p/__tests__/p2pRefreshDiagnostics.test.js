import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  runP2pAdminRefreshSelfTest,
  getLastP2pAdminRefreshValidation,
  clearP2pAdminRefreshValidation,
  getP2pDevDiagnostics,
  resolveShowP2pDevDiagnostics,
} from "../p2pDevDiagnostics.js";
import { clearP2pAdminAuditCache, syncP2pAdminAuditCache } from "../p2pAdminAuditSurface.js";
import {
  MOCK_ADMIN_SMOKE_JWT,
  getMockAdminSmokeAuthResponse,
  isMockAdminSmokeToken,
  buildMockAdminSmokeAuthHeaders,
} from "../p2pSmokeJwtFixture.js";

describe("runP2pAdminRefreshSelfTest", () => {
  beforeEach(() => {
    clearP2pAdminAuditCache();
    clearP2pAdminRefreshValidation();
  });

  it("stores validation after refresh-shaped sync", () => {
    syncP2pAdminAuditCache({
      orders: [
        {
          id: "REF-1",
          coin: "USDT",
          amount: 10,
          escrow_lifecycle: "locked",
          db_status: "matched",
          seller_user_id: 1,
          buyer_user_id: 2,
        },
      ],
    });
    const result = runP2pAdminRefreshSelfTest();
    assert.equal(result.ok, true);
    assert.equal(result.issueCount, 0);
    assert.ok(result.ranAt);
    assert.equal(getLastP2pAdminRefreshValidation()?.trigger, "refreshAdminPlatformSurface");
  });

  it("getP2pDevDiagnostics exposes issue count from last refresh", () => {
    runP2pAdminRefreshSelfTest({ orders: [{ coin: "X" }] });
    const diag = getP2pDevDiagnostics();
    assert.ok(diag.issueCount > 0);
    assert.equal(diag.validationOk, false);
    assert.equal(diag.refreshSelfTestRan, true);
  });
});

describe("resolveShowP2pDevDiagnostics (legacy re-export)", () => {
  it("delegates to env-based staging flag", () => {
    assert.equal(resolveShowP2pDevDiagnostics(true, { DEV: false }), true);
    assert.equal(resolveShowP2pDevDiagnostics(false, { DEV: true }), false);
  });
});

describe("p2pSmokeJwtFixture", () => {
  it("provides mock admin auth without real verification", () => {
    const res = getMockAdminSmokeAuthResponse();
    assert.equal(res.token, MOCK_ADMIN_SMOKE_JWT);
    assert.equal(res.user.role, "admin");
    assert.ok(isMockAdminSmokeToken(res.token));
    assert.match(buildMockAdminSmokeAuthHeaders().Authorization, /Bearer/);
  });
});
