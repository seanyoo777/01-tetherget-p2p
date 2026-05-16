import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  syncP2pAdminAuditCache,
  clearP2pAdminAuditCache,
  getP2pAdminAuditRows,
  computeAdminAuditKpi,
  isP2pAdminAuditCacheSynced,
} from "../p2pAdminAuditSurface.js";

describe("p2pAdminAuditSurface cache bridge", () => {
  beforeEach(() => {
    clearP2pAdminAuditCache();
  });

  it("starts unsynced with mock_fallback KPI source", () => {
    assert.equal(isP2pAdminAuditCacheSynced(), false);
    const kpi = computeAdminAuditKpi();
    assert.equal(kpi.cacheSource, "mock_fallback");
    assert.ok(kpi.tradeCount > 0);
  });

  it("synced surface drives rows and ute_surface_sync source", () => {
    syncP2pAdminAuditCache({
      schemaVersion: 1,
      mock_only: true,
      orders: [
        {
          id: "P2P-SYNC-1",
          coin: "USDT",
          amount: 100,
          lifecycle: "waiting_payment",
          escrow_lifecycle: "locked",
          db_status: "matched",
          seller_user_id: 1,
          buyer_user_id: 2,
          created_at: "2026-05-15 10:00:00",
          updated_at: "2026-05-15 10:00:00",
        },
      ],
    });
    assert.equal(isP2pAdminAuditCacheSynced(), true);
    const rows = getP2pAdminAuditRows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "P2P-SYNC-1");
    const kpi = computeAdminAuditKpi(rows);
    assert.equal(kpi.cacheSource, "ute_surface_sync");
    assert.equal(kpi.tradeCount, 1);
  });

  it("clear cache returns to unsynced fallback rows", () => {
    syncP2pAdminAuditCache({ orders: [{ id: "X", db_status: "matched", coin: "USDT", amount: 1 }] });
    clearP2pAdminAuditCache();
    assert.equal(isP2pAdminAuditCacheSynced(), false);
    assert.ok(getP2pAdminAuditRows().length > 1);
  });

  it("KPI includes extended operational fields", () => {
    const kpi = computeAdminAuditKpi();
    assert.ok("completedCount" in kpi);
    assert.ok("avgMockReleaseDelayMin" in kpi);
    assert.ok(kpi.cacheAgeMs != null);
  });
});
