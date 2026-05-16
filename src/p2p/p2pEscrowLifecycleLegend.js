/**
 * Escrow lifecycle compact legend (mock / display only).
 * Maps canonical UTE keys ↔ UI display keys.
 */
import { P2P_ESCROW_DISPLAY } from "./p2pEscrowDisplay.js";

export const P2P_ESCROW_LEGEND_ENTRIES = Object.freeze([
  {
    key: "release_pending",
    uiKey: P2P_ESCROW_DISPLAY.WAITING_RELEASE,
    label: "릴리스 대기",
    short: "canon release_pending → UI waiting_release",
    tone: "sky",
  },
  {
    key: P2P_ESCROW_DISPLAY.WAITING_RELEASE,
    uiKey: P2P_ESCROW_DISPLAY.WAITING_RELEASE,
    label: "waiting_release",
    short: "예치 해제 전 (mock)",
    tone: "sky",
  },
  {
    key: "released",
    uiKey: P2P_ESCROW_DISPLAY.RELEASED,
    label: "released",
    short: "모의 릴리스 완료",
    tone: "emerald",
  },
  {
    key: "refunded",
    uiKey: P2P_ESCROW_DISPLAY.REFUNDED,
    label: "refunded",
    short: "취소·환불 mock",
    tone: "slate",
  },
  {
    key: "disputed",
    uiKey: P2P_ESCROW_DISPLAY.DISPUTED,
    label: "disputed",
    short: "분쟁 홀드 — 자동 정산 없음",
    tone: "rose",
  },
]);
