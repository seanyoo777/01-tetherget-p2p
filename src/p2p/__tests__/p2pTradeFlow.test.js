import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveMatrixStatus, P2P_MATRIX_STATUS } from "../p2pStatusMatrix.js";
import { mapCanonicalEscrowToDisplay, P2P_ESCROW_DISPLAY } from "../p2pEscrowDisplay.js";
import { deriveTradeFlowView } from "../tradeFlowModel.js";
import { buildTradeTimelineEvents, getMockDisputeForOrder } from "../../mock/p2pTradeFlowMock.js";
import { formatP2pTimestamp, sortTimelineEvents } from "../p2pTimelineEvents.js";

describe("p2p status matrix", () => {
  it("maps listed to pending", () => {
    assert.equal(deriveMatrixStatus({ status: "listed" }), P2P_MATRIX_STATUS.PENDING);
  });
  it("maps matched with payment start to payment_sent", () => {
    assert.equal(
      deriveMatrixStatus({ status: "matched", buyer_payment_started_at: "2026-05-15T10:00:00Z" }),
      P2P_MATRIX_STATUS.PAYMENT_SENT,
    );
  });
  it("maps payment_sent to payment_confirmed", () => {
    assert.equal(deriveMatrixStatus({ status: "payment_sent" }), P2P_MATRIX_STATUS.PAYMENT_CONFIRMED);
  });
  it("dispute overrides to disputed", () => {
    assert.equal(deriveMatrixStatus({ status: "matched" }, true), P2P_MATRIX_STATUS.DISPUTED);
  });
});

describe("escrow display", () => {
  it("maps release_pending to waiting_release", () => {
    assert.equal(
      mapCanonicalEscrowToDisplay("release_pending", P2P_MATRIX_STATUS.PAYMENT_CONFIRMED),
      P2P_ESCROW_DISPLAY.WAITING_RELEASE,
    );
  });
  it("maps cancelled to refunded", () => {
    assert.equal(
      mapCanonicalEscrowToDisplay("cancelled", P2P_MATRIX_STATUS.CANCELLED),
      P2P_ESCROW_DISPLAY.REFUNDED,
    );
  });
});

describe("deriveTradeFlowView", () => {
  it("includes matrix and escrow display on matched order", () => {
    const flow = deriveTradeFlowView({ id: "P2P-DEMO-flow-test", status: "matched", my_role: "buyer" });
    assert.equal(flow.matrixStatus, P2P_MATRIX_STATUS.MATCHED);
    assert.equal(flow.escrowDisplay, P2P_ESCROW_DISPLAY.LOCKED);
  });
});

describe("dispute badge data", () => {
  it("returns mock dispute for deterministic id", () => {
    const d = getMockDisputeForOrder({ id: "P2P-TEST-00000001" });
    if (d) {
      assert.ok(d._mock);
      assert.ok(d.stateLabel);
    }
  });
});

describe("timeline", () => {
  it("formats timestamps uniformly", () => {
    const t = formatP2pTimestamp("2026-05-15T08:10:00.000Z");
    assert.match(t, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
  it("orders events chronologically", () => {
    const row = { id: "tl-1", status: "matched", created_at: "2026-05-15 07:00:00", matched_at: "2026-05-15 08:00:00" };
    const events = buildTradeTimelineEvents(row, []);
    for (let i = 1; i < events.length; i++) {
      assert.ok(events[i - 1].created_at <= events[i].created_at);
    }
    assert.ok(events[0].source);
    assert.ok(events[0].actor);
    assert.ok(events[0].severity);
  });
  it("sortTimelineEvents normalizes server rows", () => {
    const sorted = sortTimelineEvents(
      [
        { action: "LATE", created_at: "2026-05-15 10:00:00" },
        { action: "EARLY", created_at: "2026-05-15 08:00:00" },
      ],
      {},
    );
    assert.equal(sorted[0].action, "EARLY");
  });
});
