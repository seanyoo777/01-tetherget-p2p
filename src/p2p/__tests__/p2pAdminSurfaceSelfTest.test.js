import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  validateP2pAdminSurface,
  mockReleaseDelayMinutes,
} from "../p2pAdminSurfaceSelfTest.js";
import { clearP2pAdminAuditCache, syncP2pAdminAuditCache, computeAdminAuditKpi } from "../p2pAdminAuditSurface.js";
import { MOCK_UTE_SURFACE_SNAPSHOT } from "../../mock/p2pTradeFlowMock.js";

describe("validateP2pAdminSurface", () => {
  beforeEach(() => clearP2pAdminAuditCache());

  it("passes for mock UTE snapshot", () => {
    const result = validateP2pAdminSurface(MOCK_UTE_SURFACE_SNAPSHOT);
    assert.equal(result.ok, true);
    assert.ok(result.orderCount > 0);
    assert.equal(result.cacheConsistent, true);
  });

  it("fails when surface missing", () => {
    const result = validateP2pAdminSurface(null);
    assert.equal(result.ok, false);
    assert.ok(result.issues.includes("surface_missing"));
  });

  it("flags missing order id", () => {
    const result = validateP2pAdminSurface({
      orders: [{ coin: "USDT", amount: 1, escrow_lifecycle: "locked", db_status: "matched" }],
    });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((x) => x === "order_missing_id"));
  });

  it("mockReleaseDelayMinutes is deterministic", () => {
    const a = mockReleaseDelayMinutes({ id: "P2P-TEST-1" });
    const b = mockReleaseDelayMinutes({ id: "P2P-TEST-1" });
    assert.equal(a, b);
    assert.ok(a >= 15);
  });
});

describe("computeAdminAuditKpi extended fields", () => {
  beforeEach(() => clearP2pAdminAuditCache());

  it("includes completed, disputed, avg delay, cache age", () => {
    const kpi = computeAdminAuditKpi();
    assert.ok("completedCount" in kpi);
    assert.ok("disputedOrdersCount" in kpi);
    assert.ok(typeof kpi.avgMockReleaseDelayMin === "number");
    assert.ok(kpi.cacheAgeMs != null);
  });

  it("sync updates cache source and age meta", () => {
    syncP2pAdminAuditCache({
      orders: [
        {
          id: "KPI-1",
          coin: "USDT",
          amount: 50,
          escrow_lifecycle: "release_pending",
          db_status: "payment_sent",
          seller_user_id: 1,
          buyer_user_id: 2,
        },
      ],
    });
    const kpi = computeAdminAuditKpi();
    assert.equal(kpi.cacheSource, "ute_surface_sync");
    assert.ok(kpi.delayedReleaseCount >= 1);
  });
});
