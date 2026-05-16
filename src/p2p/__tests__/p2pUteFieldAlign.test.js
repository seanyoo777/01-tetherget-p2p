import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAdminMockTradeRow,
  mapUteSurfaceOrderToAdminRow,
  getAdminMockRowsFromUteSurface,
  pickAdminRowDisplayStatus,
  pickAdminRowEscrowLifecycle,
} from "../p2pUteFieldAlign.js";
import { MOCK_UTE_SURFACE_SNAPSHOT, MOCK_ADMIN_P2P_TRADES } from "../../mock/p2pTradeFlowMock.js";

describe("p2pUteFieldAlign", () => {
  it("keeps legacy seller/buyer/escrow when ute fields present", () => {
    const row = normalizeAdminMockTradeRow({
      id: "X1",
      db_status: "payment_sent",
      escrow_lifecycle: "release_pending",
      seller_user_id: 10,
      buyer_user_id: 20,
    });
    assert.equal(row.status, "payment_sent");
    assert.equal(row.seller, 10);
    assert.equal(row.buyer, 20);
    assert.equal(row.escrow, "release_pending");
  });

  it("maps legacy-only row to escrow_lifecycle", () => {
    const row = normalizeAdminMockTradeRow({
      id: "X2",
      status: "matched",
      escrow: "waiting_release",
      seller: "s1",
      buyer: "b1",
    });
    assert.equal(row.escrow_lifecycle, "release_pending");
    assert.equal(row.db_status, "matched");
  });

  it("builds admin rows from ute-surface snapshot", () => {
    const rows = getAdminMockRowsFromUteSurface(MOCK_UTE_SURFACE_SNAPSHOT, []);
    assert.ok(rows.length >= 4);
    assert.equal(pickAdminRowDisplayStatus(rows[0]), rows[0].db_status);
  });

  it("falls back to static mock when surface has no orders", () => {
    const rows = getAdminMockRowsFromUteSurface(null, MOCK_ADMIN_P2P_TRADES);
    assert.equal(rows.length, MOCK_ADMIN_P2P_TRADES.length);
  });

  it("mapUteSurfaceOrderToAdminRow aligns dispute_linked", () => {
    const row = mapUteSurfaceOrderToAdminRow({
      id: "O1",
      db_status: "matched",
      escrow_lifecycle: "locked",
      lifecycle: "waiting_payment",
      dispute_linked: { lifecycle: "open", db_status: "분쟁접수" },
    });
    assert.equal(pickAdminRowEscrowLifecycle(row), "locked");
    assert.ok(row.dispute);
  });
});
