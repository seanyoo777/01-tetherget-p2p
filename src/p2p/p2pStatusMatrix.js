/**
 * P2P 거래 UI Status Matrix (표시·mock 전용).
 * DB `p2p_orders.status` + 플래그 → 운영 안정성 레이어용 8상태.
 */

export const P2P_MATRIX_STATUS = Object.freeze({
  PENDING: "pending",
  MATCHED: "matched",
  PAYMENT_SENT: "payment_sent",
  PAYMENT_CONFIRMED: "payment_confirmed",
  RELEASING: "releasing",
  COMPLETED: "completed",
  DISPUTED: "disputed",
  CANCELLED: "cancelled",
});

/** @type {readonly string[]} */
export const P2P_MATRIX_STATUS_ORDER = [
  P2P_MATRIX_STATUS.PENDING,
  P2P_MATRIX_STATUS.MATCHED,
  P2P_MATRIX_STATUS.PAYMENT_SENT,
  P2P_MATRIX_STATUS.PAYMENT_CONFIRMED,
  P2P_MATRIX_STATUS.RELEASING,
  P2P_MATRIX_STATUS.COMPLETED,
  P2P_MATRIX_STATUS.DISPUTED,
  P2P_MATRIX_STATUS.CANCELLED,
];

export const P2P_MATRIX_META = Object.freeze({
  [P2P_MATRIX_STATUS.PENDING]: { label: "대기", tone: "slate", terminal: false },
  [P2P_MATRIX_STATUS.MATCHED]: { label: "매칭됨", tone: "sky", terminal: false },
  [P2P_MATRIX_STATUS.PAYMENT_SENT]: { label: "송금 진행", tone: "violet", terminal: false },
  [P2P_MATRIX_STATUS.PAYMENT_CONFIRMED]: { label: "송금 확인", tone: "indigo", terminal: false },
  [P2P_MATRIX_STATUS.RELEASING]: { label: "릴리스 중", tone: "amber", terminal: false },
  [P2P_MATRIX_STATUS.COMPLETED]: { label: "완료", tone: "emerald", terminal: true },
  [P2P_MATRIX_STATUS.DISPUTED]: { label: "분쟁", tone: "rose", terminal: false },
  [P2P_MATRIX_STATUS.CANCELLED]: { label: "취소", tone: "slate", terminal: true },
});

/**
 * @param {{ status?: string, buyer_payment_started_at?: string|null }} row
 * @param {boolean} [hasActiveDispute]
 * @returns {keyof typeof P2P_MATRIX_STATUS | string}
 */
export function deriveMatrixStatus(row, hasActiveDispute = false) {
  if (hasActiveDispute) return P2P_MATRIX_STATUS.DISPUTED;
  const st = String(row?.status || "").trim();
  if (st === "cancelled") return P2P_MATRIX_STATUS.CANCELLED;
  if (st === "completed") return P2P_MATRIX_STATUS.COMPLETED;
  if (st === "listed") return P2P_MATRIX_STATUS.PENDING;
  if (st === "matched") {
    const started = row?.buyer_payment_started_at;
    if (started != null && String(started).trim() !== "") return P2P_MATRIX_STATUS.PAYMENT_SENT;
    return P2P_MATRIX_STATUS.MATCHED;
  }
  if (st === "payment_sent") return P2P_MATRIX_STATUS.PAYMENT_CONFIRMED;
  return P2P_MATRIX_STATUS.PENDING;
}

/**
 * Matrix 단계 인덱스 (스테퍼 하이라이트용, -1 = terminal cancel).
 * @param {string} matrixStatus
 */
export function matrixStatusStepIndex(matrixStatus) {
  const idx = P2P_MATRIX_STATUS_ORDER.indexOf(matrixStatus);
  if (matrixStatus === P2P_MATRIX_STATUS.CANCELLED) return -1;
  if (matrixStatus === P2P_MATRIX_STATUS.DISPUTED) return 3;
  if (matrixStatus === P2P_MATRIX_STATUS.COMPLETED) return P2P_MATRIX_STATUS_ORDER.length - 2;
  return idx >= 0 ? idx : 0;
}

/**
 * @param {string} matrixStatus
 */
export function getMatrixMeta(matrixStatus) {
  return P2P_MATRIX_META[matrixStatus] || P2P_MATRIX_META[P2P_MATRIX_STATUS.PENDING];
}
