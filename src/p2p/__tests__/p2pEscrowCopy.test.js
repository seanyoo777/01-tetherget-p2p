import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getStepperMatrixHint, getEscrowPhaseCopy } from "../p2pEscrowCopy.js";
import { P2P_MATRIX_STATUS } from "../p2pStatusMatrix.js";
import { P2P_ESCROW_DISPLAY } from "../p2pEscrowDisplay.js";
import { deriveTradeFlowView } from "../tradeFlowModel.js";

describe("payment_confirmed dual display copy", () => {
  it("stepper hint mentions payment_confirmed", () => {
    const hint = getStepperMatrixHint(P2P_MATRIX_STATUS.PAYMENT_CONFIRMED);
    assert.ok(hint?.includes("payment_confirmed"));
  });

  it("escrow copy explains waiting_release while matrix is payment_confirmed", () => {
    const copy = getEscrowPhaseCopy(P2P_MATRIX_STATUS.PAYMENT_CONFIRMED, P2P_ESCROW_DISPLAY.WAITING_RELEASE);
    assert.ok(copy?.headline?.includes("waiting_release"));
    assert.ok(copy?.dualNote);
  });

  it("deriveTradeFlowView exposes both hints for payment_sent db row", () => {
    const flow = deriveTradeFlowView({
      id: "P2P-DEMO-dual",
      status: "payment_sent",
      my_role: "buyer",
    });
    assert.equal(flow.matrixStatus, P2P_MATRIX_STATUS.PAYMENT_CONFIRMED);
    assert.equal(flow.escrowDisplay, P2P_ESCROW_DISPLAY.WAITING_RELEASE);
    assert.ok(flow.stepperMatrixHint);
    assert.ok(flow.escrowPhaseCopy?.dualNote);
    assert.equal(flow.matrixReleasing, true);
  });
});

describe("disputed / refunded escrow copy", () => {
  it("disputed escrow shows hold copy without auto release", () => {
    const copy = getEscrowPhaseCopy(P2P_MATRIX_STATUS.DISPUTED, P2P_ESCROW_DISPLAY.DISPUTED);
    assert.ok(copy?.headline?.includes("disputed"));
    assert.match(copy.detail, /자동 릴리즈|자동 릴리즈·환불/);
  });

  it("refunded escrow shows mock refund copy", () => {
    const copy = getEscrowPhaseCopy(P2P_MATRIX_STATUS.CANCELLED, P2P_ESCROW_DISPLAY.REFUNDED);
    assert.ok(copy?.headline?.includes("refunded"));
    assert.match(copy.detail, /실제 송금 반환은 없습니다/);
  });

  it("released escrow notes mock-only settlement", () => {
    const copy = getEscrowPhaseCopy(P2P_MATRIX_STATUS.COMPLETED, P2P_ESCROW_DISPLAY.RELEASED);
    assert.ok(copy?.headline?.includes("released"));
    assert.match(copy.detail, /온체인·실송금/);
  });
});
