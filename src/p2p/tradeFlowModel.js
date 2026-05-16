/**
 * P2P 거래 플로우 UI용 파생 상태 (mock·표시 전용, 실제 송금/릴리즈 없음).
 * 계약: docs/TETHERGET_P2P_STATE_CONTRACT.md, docs/TETHERGET_ESCROW_STATE_ALIGNMENT.md
 */
import {
  mapDbOrderToP2pLifecycle,
  mapP2pLifecycleToEscrowStatus,
  mergeP2pLifecycleWithDispute,
  P2P_LIFECYCLE,
} from "../../shared/p2pLifecycleMap.js";
import { getMockDisputeForOrder } from "../mock/p2pTradeFlowMock.js";
import { deriveMatrixStatus, getMatrixMeta, matrixStatusStepIndex } from "./p2pStatusMatrix.js";
import { mapCanonicalEscrowToDisplay, getEscrowDisplayMeta } from "./p2pEscrowDisplay.js";
import { getStepperMatrixHint, getEscrowPhaseCopy } from "./p2pEscrowCopy.js";
import { P2P_MATRIX_STATUS } from "./p2pStatusMatrix.js";

export const FLOW_STEPS = [
  { key: "CREATED", label: "등록", short: "1" },
  { key: "WAITING_PAYMENT", label: "매칭·송금대기", short: "2" },
  { key: "PAYMENT", label: "송금·확인", short: "3" },
  { key: "RELEASE_PENDING", label: "릴리스 대기", short: "4" },
  { key: "DONE", label: "완료", short: "5" },
];

const DB_TO_CONTRACT = {
  listed: "CREATED",
  matched: "WAITING_PAYMENT",
  payment_sent: "RELEASE_PENDING",
  completed: "RELEASED",
  cancelled: "CANCELLED",
};

export function dbStatusToContractLabel(status) {
  return DB_TO_CONTRACT[status] || String(status || "").toUpperCase();
}

export function deriveP2pLifecycleFromOrder(row, hasActiveDispute = false) {
  const base = mapDbOrderToP2pLifecycle({
    status: row?.status,
    buyer_payment_started_at: row?.buyer_payment_started_at,
  });
  return mergeP2pLifecycleWithDispute(base, hasActiveDispute);
}

export function deriveTradeFlowView(row, options = {}) {
  const dispute = options.disputeMock ?? getMockDisputeForOrder(row);
  const hasActiveDispute =
    options.forceDispute === true ||
    (dispute && ["OPEN", "REVIEWING", "WAITING_EVIDENCE", "ESCALATED"].includes(dispute.state));

  const lifecycle = deriveP2pLifecycleFromOrder(row, hasActiveDispute);
  const escrowCanonical = mapP2pLifecycleToEscrowStatus(lifecycle);
  const matrixStatus = deriveMatrixStatus(row, hasActiveDispute);
  const matrixMeta = getMatrixMeta(matrixStatus);
  const escrowDisplay = mapCanonicalEscrowToDisplay(escrowCanonical, matrixStatus);
  const escrowDisplayMeta = getEscrowDisplayMeta(escrowDisplay);
  const role = row?.my_role === "buyer" || row?.my_role === "seller" ? row.my_role : null;

  let activeStep = 0;
  const st = row?.status;
  if (st === "listed") activeStep = 0;
  else if (st === "matched") {
    activeStep = row?.buyer_payment_started_at ? 2 : 1;
  } else if (st === "payment_sent") activeStep = 3;
  else if (st === "completed") activeStep = 4;
  else if (st === "cancelled") activeStep = -1;

  if (hasActiveDispute && activeStep >= 0) activeStep = Math.max(activeStep, 2);

  const steps = FLOW_STEPS.map((s, i) => ({
    ...s,
    status: activeStep < 0 ? "cancelled" : i < activeStep ? "done" : i === activeStep ? "current" : "upcoming",
  }));

  const stepperMatrixHint = getStepperMatrixHint(matrixStatus);
  const escrowPhaseCopy = getEscrowPhaseCopy(matrixStatus, escrowDisplay);
  const matrixReleasing =
    matrixStatus === P2P_MATRIX_STATUS.PAYMENT_CONFIRMED && escrowDisplay === "waiting_release";

  return {
    lifecycle,
    escrow: escrowCanonical,
    escrowCanonical,
    escrowDisplay,
    escrowDisplayMeta,
    matrixStatus,
    matrixMeta,
    matrixStepIndex: matrixStatusStepIndex(matrixStatus),
    contractState: dbStatusToContractLabel(st),
    role,
    steps,
    activeStep,
    isTerminal: st === "completed" || st === "cancelled",
    isCancelled: st === "cancelled",
    dispute,
    hasActiveDispute,
    delayedRelease: st === "payment_sent" || lifecycle === P2P_LIFECYCLE.RELEASE_PENDING,
    matrixReleasing,
    stepperMatrixHint,
    escrowPhaseCopy,
    buyerHint: role === "buyer" ? buyerHintFor(row) : null,
    sellerHint: role === "seller" ? sellerHintFor(row) : null,
  };
}

function buyerHintFor(row) {
  if (row.status === "matched" && !row.buyer_payment_started_at) return "송금 후 「송금 신청」을 눌러 주세요.";
  if (row.status === "matched" && row.buyer_payment_started_at) return "송금이 끝났다면 「송금 완료 표시」를 눌러 주세요.";
  if (row.status === "payment_sent") return "판매자 확인·릴리스를 기다리는 중입니다.";
  return null;
}

function sellerHintFor(row) {
  if (row.status === "matched") return "구매자 송금·확인을 기다리는 중입니다.";
  if (row.status === "payment_sent") {
    return "입금 확인됨(송금 확인). escrow는 릴리스 대기 — 「거래 완료」로 모의 릴리스만 진행합니다.";
  }
  return null;
}

/** @deprecated use flow.escrowDisplayMeta — kept for backward compat */
export const ESCROW_LABELS = {
  locked: { label: "예치 잠금", tone: "amber" },
  waiting_release: { label: "릴리스 대기", tone: "sky" },
  release_pending: { label: "릴리스 대기", tone: "sky" },
  released: { label: "릴리스 완료", tone: "emerald" },
  refunded: { label: "환불·해제", tone: "slate" },
  disputed: { label: "분쟁·홀드", tone: "rose" },
  cancelled: { label: "취소·해제", tone: "slate" },
};
