/**
 * Escrow UI display layer (mock·표시 전용).
 * Canonical `shared/p2pLifecycleMap` escrow → 운영 UI 5상태.
 */

export const P2P_ESCROW_DISPLAY = Object.freeze({
  LOCKED: "locked",
  WAITING_RELEASE: "waiting_release",
  RELEASED: "released",
  REFUNDED: "refunded",
  DISPUTED: "disputed",
});

export const P2P_ESCROW_DISPLAY_META = Object.freeze({
  [P2P_ESCROW_DISPLAY.LOCKED]: { label: "예치 잠금", tone: "amber" },
  [P2P_ESCROW_DISPLAY.WAITING_RELEASE]: { label: "릴리스 대기", tone: "sky" },
  [P2P_ESCROW_DISPLAY.RELEASED]: { label: "릴리스 완료", tone: "emerald" },
  [P2P_ESCROW_DISPLAY.REFUNDED]: { label: "환불·해제", tone: "slate" },
  [P2P_ESCROW_DISPLAY.DISPUTED]: { label: "분쟁·홀드", tone: "rose" },
});

/**
 * @param {string} canonicalEscrow from mapP2pLifecycleToEscrowStatus
 * @param {string} matrixStatus from deriveMatrixStatus
 */
export function mapCanonicalEscrowToDisplay(canonicalEscrow, matrixStatus) {
  if (matrixStatus === "disputed" || canonicalEscrow === "disputed") return P2P_ESCROW_DISPLAY.DISPUTED;
  if (matrixStatus === "cancelled" || canonicalEscrow === "cancelled") return P2P_ESCROW_DISPLAY.REFUNDED;
  if (canonicalEscrow === "released" || matrixStatus === "completed") return P2P_ESCROW_DISPLAY.RELEASED;
  if (
    canonicalEscrow === "release_pending" ||
    matrixStatus === "releasing" ||
    matrixStatus === "payment_confirmed" ||
    matrixStatus === "payment_sent"
  ) {
    return P2P_ESCROW_DISPLAY.WAITING_RELEASE;
  }
  return P2P_ESCROW_DISPLAY.LOCKED;
}

/**
 * @param {string} displayEscrow
 */
export function getEscrowDisplayMeta(displayEscrow) {
  return P2P_ESCROW_DISPLAY_META[displayEscrow] || P2P_ESCROW_DISPLAY_META[P2P_ESCROW_DISPLAY.LOCKED];
}
