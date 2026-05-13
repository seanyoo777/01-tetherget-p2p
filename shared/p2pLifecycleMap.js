/**
 * DB / legacy 문자열 ↔ UTE·관리자용 canonical 상태 (P2P / escrow / dispute).
 * 서버·클라이언트 공통 — 한쪽만 수정하지 않도록 유지.
 */

/** @typedef {'created'|'waiting_payment'|'paid'|'release_pending'|'released'|'dispute'|'cancelled'|'closed'} P2pLifecycleCanonical */
/** @typedef {'locked'|'release_pending'|'released'|'disputed'|'cancelled'} EscrowLifecycleCanonical */
/** @typedef {'open'|'reviewing'|'resolved'|'rejected'} DisputeLifecycleCanonical */

export const P2P_LIFECYCLE = Object.freeze({
  CREATED: "created",
  WAITING_PAYMENT: "waiting_payment",
  PAID: "paid",
  RELEASE_PENDING: "release_pending",
  RELEASED: "released",
  DISPUTE: "dispute",
  CANCELLED: "cancelled",
  CLOSED: "closed",
});

export const ESCROW_LIFECYCLE = Object.freeze({
  LOCKED: "locked",
  RELEASE_PENDING: "release_pending",
  RELEASED: "released",
  DISPUTED: "disputed",
  CANCELLED: "cancelled",
});

export const DISPUTE_LIFECYCLE = Object.freeze({
  OPEN: "open",
  REVIEWING: "reviewing",
  RESOLVED: "resolved",
  REJECTED: "rejected",
});

/**
 * SQLite `p2p_orders.status` + 부가 컬럼 → canonical P2P lifecycle.
 * @param {{ status?: string, buyer_payment_started_at?: string|null }} row
 * @returns {P2pLifecycleCanonical}
 */
export function mapDbOrderToP2pLifecycle(row) {
  const st = String(row?.status || "").trim();
  if (st === "listed") return P2P_LIFECYCLE.CREATED;
  if (st === "cancelled") return P2P_LIFECYCLE.CANCELLED;
  if (st === "completed") return P2P_LIFECYCLE.RELEASED;
  if (st === "payment_sent") return P2P_LIFECYCLE.RELEASE_PENDING;
  if (st === "matched") {
    const started = row?.buyer_payment_started_at;
    if (started != null && String(started).trim() !== "") return P2P_LIFECYCLE.PAID;
    return P2P_LIFECYCLE.WAITING_PAYMENT;
  }
  return P2P_LIFECYCLE.CLOSED;
}

/**
 * 주문에 연결된 분쟁이 있으면 canonical 을 dispute 로 덮어씀 (UTE 대시보드 일관성).
 * @param {P2pLifecycleCanonical} base
 * @param {boolean} hasActiveDispute
 * @returns {P2pLifecycleCanonical}
 */
export function mergeP2pLifecycleWithDispute(base, hasActiveDispute) {
  if (!hasActiveDispute) return base;
  if (base === P2P_LIFECYCLE.CANCELLED || base === P2P_LIFECYCLE.RELEASED || base === P2P_LIFECYCLE.CLOSED) return base;
  return P2P_LIFECYCLE.DISPUTE;
}

/**
 * @param {P2pLifecycleCanonical} p2p
 * @returns {EscrowLifecycleCanonical}
 */
export function mapP2pLifecycleToEscrowStatus(p2p) {
  if (p2p === P2P_LIFECYCLE.CANCELLED) return ESCROW_LIFECYCLE.CANCELLED;
  if (p2p === P2P_LIFECYCLE.RELEASED || p2p === P2P_LIFECYCLE.CLOSED) return ESCROW_LIFECYCLE.RELEASED;
  if (p2p === P2P_LIFECYCLE.DISPUTE) return ESCROW_LIFECYCLE.DISPUTED;
  if (p2p === P2P_LIFECYCLE.RELEASE_PENDING) return ESCROW_LIFECYCLE.RELEASE_PENDING;
  return ESCROW_LIFECYCLE.LOCKED;
}

/**
 * `disputes.status` (한글/레거시) → canonical
 * @param {string} raw
 * @returns {DisputeLifecycleCanonical}
 */
export function mapDisputeDbStatusToCanonical(raw) {
  const s = String(raw || "").trim();
  if (s === "분쟁접수") return DISPUTE_LIFECYCLE.OPEN;
  if (s === "승인대기" || s === "최종승인대기") return DISPUTE_LIFECYCLE.REVIEWING;
  if (s === "반환완료") return DISPUTE_LIFECYCLE.RESOLVED;
  if (s.includes("거절") || s.includes("reject")) return DISPUTE_LIFECYCLE.REJECTED;
  return DISPUTE_LIFECYCLE.REVIEWING;
}

/**
 * 분쟁이 주문과 동일 참조(`order_seller` 에 주문 id 저장)일 때 활성으로 본다.
 * @param {DisputeLifecycleCanonical} c
 * @returns {boolean}
 */
export function isDisputeActiveCanonical(c) {
  return c === DISPUTE_LIFECYCLE.OPEN || c === DISPUTE_LIFECYCLE.REVIEWING;
}
