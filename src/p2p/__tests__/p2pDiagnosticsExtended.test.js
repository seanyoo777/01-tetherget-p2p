import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  formatP2pRefreshValidationNotify,
  resolveP2pDiagnosticsMode,
  runP2pAdminRefreshSelfTest,
  clearP2pAdminRefreshValidation,
} from "../p2pDevDiagnostics.js";
import { clearP2pAdminAuditCache, syncP2pAdminAuditCache } from "../p2pAdminAuditSurface.js";
import { isSimpleAdminSmokePath } from "../p2pSmokeJwtFixture.js";
import { P2P_TEST_IDS } from "../p2pTestIds.js";

describe("formatP2pRefreshValidationNotify", () => {
  it("summarizes ok validation with mock prefix", () => {
    const msg = formatP2pRefreshValidationNotify({
      ok: true,
      issueCount: 0,
      alignedCount: 3,
      orderCount: 3,
    });
    assert.match(msg, /\[MOCK\]/);
    assert.match(msg, /OK/);
    assert.match(msg, /issues 0/);
  });

  it("summarizes fail validation with issue count", () => {
    const msg = formatP2pRefreshValidationNotify({
      ok: false,
      issueCount: 2,
      alignedCount: 0,
      orderCount: 1,
    });
    assert.match(msg, /FAIL/);
    assert.match(msg, /issues 2/);
  });
});

describe("resolveP2pDiagnosticsMode", () => {
  it("normalizes compact modes", () => {
    assert.equal(resolveP2pDiagnosticsMode("strip"), "strip");
    assert.equal(resolveP2pDiagnosticsMode("badge-only"), "badge-only");
    assert.equal(resolveP2pDiagnosticsMode("invalid"), "full");
  });
});

describe("refresh notify payload", () => {
  beforeEach(() => {
    clearP2pAdminAuditCache();
    clearP2pAdminRefreshValidation();
  });

  it("refresh self-test feeds notify formatter", () => {
    syncP2pAdminAuditCache({
      orders: [
        {
          id: "N-1",
          coin: "USDT",
          amount: 1,
          escrow_lifecycle: "locked",
          db_status: "matched",
          seller_user_id: 1,
          buyer_user_id: 2,
        },
      ],
    });
    const validation = runP2pAdminRefreshSelfTest();
    const msg = formatP2pRefreshValidationNotify(validation);
    assert.equal(validation.ok, true);
    assert.match(msg, /\[MOCK\].*OK/);
  });
});

describe("SimpleAdmin smoke route", () => {
  it("detects smoke pathname", () => {
    assert.equal(isSimpleAdminSmokePath("/smoke/simple-admin"), true);
    assert.equal(isSimpleAdminSmokePath("/"), false);
  });

  it("exports UTE diagnostics testids", () => {
    assert.equal(P2P_TEST_IDS.uteSurfaceTab, "p2p-ute-surface-tab");
    assert.equal(P2P_TEST_IDS.uteSurfacePanel, "p2p-ute-surface-panel");
    assert.equal(P2P_TEST_IDS.devDiagnosticsCompact, "p2p-dev-diagnostics-compact");
    assert.equal(P2P_TEST_IDS.simpleAdminSmokeRoot, "p2p-simple-admin-smoke-root");
  });
});
