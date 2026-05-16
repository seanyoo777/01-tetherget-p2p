import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { P2P_TEST_IDS } from "../p2pTestIds.js";

describe("P2P_TEST_IDS smoke selectors", () => {
  it("exports stable kebab-case ids for Playwright", () => {
    for (const value of Object.values(P2P_TEST_IDS)) {
      assert.match(value, /^p2p-[a-z0-9-]+$/);
    }
    assert.equal(P2P_TEST_IDS.tradeList, "p2p-trade-list");
    assert.equal(P2P_TEST_IDS.adminAudit, "p2p-admin-audit");
    assert.equal(P2P_TEST_IDS.escrowPanel, "p2p-escrow-panel");
    assert.equal(P2P_TEST_IDS.devDiagnostics, "p2p-dev-diagnostics");
    assert.equal(P2P_TEST_IDS.adminCacheState, "p2p-admin-cache-state");
    assert.equal(P2P_TEST_IDS.escrowLegend, "p2p-escrow-legend");
    assert.equal(P2P_TEST_IDS.adminAuditKpiCard, "p2p-admin-audit-kpi-card");
    assert.equal(P2P_TEST_IDS.validationBadge, "p2p-validation-badge");
    assert.equal(P2P_TEST_IDS.adminAuditTab, "p2p-admin-audit-tab");
  });
});
