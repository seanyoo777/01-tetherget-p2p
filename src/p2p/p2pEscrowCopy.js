/**
 * P2P escrow 용어·카피 (플랫폼 mock + 온체인 선택 블록 공통).
 * 실제 tx/hash 자동 연결·자동 릴리즈 문구 없음.
 */
import { P2P_MATRIX_STATUS } from "./p2pStatusMatrix.js";
import { P2P_ESCROW_DISPLAY } from "./p2pEscrowDisplay.js";

export const P2P_ESCROW_COPY = Object.freeze({
  platformPanelTitle: "플랫폼 예치 상태 (mock)",
  platformPanelFootnote: "서버·DB 집계만 표시합니다. 실제 송금·자동 릴리즈·온체인 정산은 없습니다.",
  onchainBlockTitle: "온체인 에스크로 (선택)",
  onchainBlockFootnote:
    "컨트랙트 ID는 주문 메타에 수동 저장합니다. 자동 TX 감지·hash 연결·실 릴리즈는 이 MVP 범위 밖입니다.",
  onchainNoContract: "온체인 연동: 배포 주소 없음 — VITE_ESCROW_CONTRACT_ADDRESS 설정 시에만 표시됩니다.",
  dualDisplayNote:
    "스테퍼는 주문 단계(송금 확인), 아래 escrow는 예치 해제 대기를 뜻합니다. 단계 이름이 다를 수 있으며 정상입니다.",
  releasePendingCanon:
    "서버 canonical: release_pending — UI에서는 waiting_release(릴리스 대기)로 표시합니다.",
  waitingReleaseUi: "UI: waiting_release — 판매자 모의 릴리스·예치 해제 전 단계입니다.",
  disputedDetail:
    "분쟁·중재 mock 활성. 예치는 disputed(홀드)로 표시되며 자동 릴리즈·환불은 없습니다.",
  refundedDetail:
    "주문 취소·환불 mock. 예치는 refunded(해제)로 집계되며 실제 송금 반환은 없습니다.",
});

/**
 * 스테퍼 상단 matrix 힌트 (payment_confirmed 강조).
 * @param {string} matrixStatus
 */
export function getStepperMatrixHint(matrixStatus) {
  if (matrixStatus === P2P_MATRIX_STATUS.PAYMENT_CONFIRMED) {
    return "스테퍼 · 송금 확인(payment_confirmed) — 구매자 표시 완료, 판매자 릴리스 전";
  }
  if (matrixStatus === P2P_MATRIX_STATUS.PAYMENT_SENT) {
    return "스테퍼 · 송금 진행 중 — 완료 표시 전";
  }
  if (matrixStatus === P2P_MATRIX_STATUS.RELEASING) {
    return "스테퍼 · 릴리스 처리 구간";
  }
  return null;
}

/**
 * Escrow 패널 전용 카피 (waiting_release / releasing 의미).
 * @param {string} matrixStatus
 * @param {string} escrowDisplay
 */
export function getEscrowPhaseCopy(matrixStatus, escrowDisplay) {
  if (
    matrixStatus === P2P_MATRIX_STATUS.PAYMENT_CONFIRMED &&
    escrowDisplay === P2P_ESCROW_DISPLAY.WAITING_RELEASE
  ) {
    return {
      headline: "릴리스 대기 (waiting_release)",
      detail:
        "구매자 송금 확인은 끝났고, 판매자 측 모의 릴리스·예치 해제(releasing)를 기다리는 단계입니다. 플랫폼 escrow는 아직 locked→release 대기 상태로 표시됩니다.",
      dualNote: P2P_ESCROW_COPY.dualDisplayNote,
    };
  }
  if (escrowDisplay === P2P_ESCROW_DISPLAY.WAITING_RELEASE) {
    return {
      headline: "릴리스 대기 (waiting_release)",
      detail: `${P2P_ESCROW_COPY.waitingReleaseUi} ${P2P_ESCROW_COPY.releasePendingCanon}`,
      dualNote: null,
    };
  }
  if (escrowDisplay === P2P_ESCROW_DISPLAY.DISPUTED) {
    return {
      headline: "분쟁·홀드 (disputed)",
      detail: P2P_ESCROW_COPY.disputedDetail,
      dualNote: null,
    };
  }
  if (escrowDisplay === P2P_ESCROW_DISPLAY.REFUNDED) {
    return {
      headline: "환불·해제 (refunded)",
      detail: P2P_ESCROW_COPY.refundedDetail,
      dualNote: null,
    };
  }
  if (escrowDisplay === P2P_ESCROW_DISPLAY.RELEASED) {
    return {
      headline: "릴리스 완료 (released)",
      detail: "모의 릴리스가 완료된 상태입니다. 온체인·실송금 정산은 없습니다.",
      dualNote: null,
    };
  }
  if (escrowDisplay === P2P_ESCROW_DISPLAY.LOCKED) {
    return {
      headline: "예치 잠금",
      detail: "매칭·송금 확인 전까지 플랫폼 예치가 잠금 상태로 유지됩니다 (mock).",
      dualNote: null,
    };
  }
  return null;
}
