import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getP2pDevDiagnostics,
  formatP2pCacheAgeLabel,
  runP2pAdminRefreshSelfTest,
  clearP2pAdminRefreshValidation,
  runMockDiagnostics,
} from "../p2pDevDiagnostics.js";
import { clearP2pDiagnosticsSnapshotCache } from "../p2pDiagnosticsSnapshot.js";
import {
  clearP2pAdminAuditCache,
  syncP2pAdminAuditCache,
} from "../p2pAdminAuditSurface.js";
import { P2P_TEST_IDS } from "../p2pTestIds.js";
import { P2P_ESCROW_LEGEND_ENTRIES } from "../p2pEscrowLifecycleLegend.js";

describe("getP2pDevDiagnostics", () => {
  beforeEach(() => {
    clearP2pAdminAuditCache();
    clearP2pAdminRefreshValidation();
    clearP2pDiagnosticsSnapshotCache();
  });

  it("returns mock-only diagnostics snapshot", () => {
    const diag = getP2pDevDiagnostics();
    assert.equal(diag.mockOnly, true);
    assert.equal(diag.cacheSource, "mock_fallback");
    assert.ok(diag.orderCount > 0);
    assert.ok(typeof diag.disputeRatio === "number");
    assert.ok(diag.validation);
  });

  it("includes issueCount after refresh self-test", () => {
    syncP2pAdminAuditCache({
      orders: [{ id: "D-2", coin: "USDT", amount: 1, escrow_lifecycle: "locked", db_status: "matched", seller_user_id: 1, buyer_user_id: 2 }],
    });
    runP2pAdminRefreshSelfTest();
    const diag = getP2pDevDiagnostics();
    assert.equal(diag.issueCount, 0);
    assert.equal(diag.validationOk, true);
    assert.equal(diag.alignedCount, 1);
  });

  it("reflects synced cache", () => {
    syncP2pAdminAuditCache({
      orders: [
        {
          id: "D-1",
          coin: "USDT",
          amount: 1,
          escrow_lifecycle: "locked",
          db_status: "matched",
          seller_user_id: 1,
          buyer_user_id: 2,
        },
      ],
    });
    const diag = getP2pDevDiagnostics();
    assert.equal(diag.cacheSynced, true);
    assert.equal(diag.cacheSource, "ute_surface_sync");
    assert.equal(diag.orderCount, 1);
  });
});

describe("formatP2pCacheAgeLabel", () => {
  it("formats seconds and mock_static", () => {
    assert.equal(formatP2pCacheAgeLabel(null), "mock_static");
    assert.match(formatP2pCacheAgeLabel(45_000), /s$/);
  });
});

describe("P2P escrow legend entries", () => {
  it("covers release_pending through disputed", () => {
    const keys = P2P_ESCROW_LEGEND_ENTRIES.map((e) => e.key);
    assert.ok(keys.includes("release_pending"));
    assert.ok(keys.includes("waiting_release"));
    assert.ok(keys.includes("released"));
    assert.ok(keys.includes("refunded"));
    assert.ok(keys.includes("disputed"));
  });
});

describe("runMockDiagnostics snapshot", () => {
  beforeEach(() => {
    clearP2pAdminAuditCache();
    clearP2pDiagnosticsSnapshotCache();
  });

  it("refreshes memoized snapshot without render-phase writes", () => {
    const a = runMockDiagnostics();
    const b = getP2pDevDiagnostics();
    assert.equal(a.revision, b.revision);
    assert.equal(a.mockOnly, true);
  });
});

describe("P2P_TEST_IDS diagnostics selectors", () => {
  it("exports new smoke testids", () => {
    assert.equal(P2P_TEST_IDS.devDiagnostics, "p2p-dev-diagnostics");
    assert.equal(P2P_TEST_IDS.adminCacheState, "p2p-admin-cache-state");
    assert.equal(P2P_TEST_IDS.escrowLegend, "p2p-escrow-legend");
    assert.equal(P2P_TEST_IDS.adminAuditKpiCard, "p2p-admin-audit-kpi-card");
  });
});
