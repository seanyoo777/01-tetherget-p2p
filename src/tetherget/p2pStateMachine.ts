/**
 * Canonical P2P / escrow / dispute 상태 전이 검사 (모의·문서화 목적).
 * 실제 온체인 release·은행 송금과 무관 — 승인 UI 전 `canTransition*` 으로 게이트.
 */
import {
  P2P_LIFECYCLE,
  ESCROW_LIFECYCLE,
  DISPUTE_LIFECYCLE,
  mapDbOrderToP2pLifecycle,
  mapP2pLifecycleToEscrowStatus,
  mapDisputeDbStatusToCanonical,
} from "../../shared/p2pLifecycleMap.js";
import type { DisputeLifecycle, EscrowLifecycle, P2pLifecycle } from "./types";

export const MOCK_UT_ADMIN_ACK = "MOCK_UT_ADMIN_ACK_V1" as const;

export type TransitionResult = { ok: true } | { ok: false; reason: string };

const P2P_EDGES: Record<P2pLifecycle, Partial<Record<P2pLifecycle, string>>> = {
  [P2P_LIFECYCLE.CREATED]: {
    [P2P_LIFECYCLE.CANCELLED]: "admin_or_seller_cancel_listing",
    [P2P_LIFECYCLE.WAITING_PAYMENT]: "buyer_take_match",
    [P2P_LIFECYCLE.CLOSED]: "archived",
  },
  [P2P_LIFECYCLE.WAITING_PAYMENT]: {
    [P2P_LIFECYCLE.PAID]: "buyer_payment_started",
    [P2P_LIFECYCLE.CANCELLED]: "withdraw_match_or_expire",
    [P2P_LIFECYCLE.DISPUTE]: "operator_opens_dispute",
  },
  [P2P_LIFECYCLE.PAID]: {
    [P2P_LIFECYCLE.RELEASE_PENDING]: "buyer_mark_paid",
    [P2P_LIFECYCLE.DISPUTE]: "operator_opens_dispute",
    [P2P_LIFECYCLE.CANCELLED]: "admin_cancel_pre_release",
  },
  [P2P_LIFECYCLE.RELEASE_PENDING]: {
    [P2P_LIFECYCLE.RELEASED]: "seller_complete_offchain_ledger",
    [P2P_LIFECYCLE.DISPUTE]: "operator_opens_dispute",
    [P2P_LIFECYCLE.CANCELLED]: "admin_cancel_before_release",
  },
  [P2P_LIFECYCLE.DISPUTE]: {
    [P2P_LIFECYCLE.CANCELLED]: "dispute_resolved_cancel",
    [P2P_LIFECYCLE.RELEASED]: "dispute_resolved_release",
    [P2P_LIFECYCLE.CLOSED]: "archive_after_dispute",
  },
  [P2P_LIFECYCLE.CANCELLED]: {
    [P2P_LIFECYCLE.CLOSED]: "archive_terminal",
  },
  [P2P_LIFECYCLE.CLOSED]: {},
  [P2P_LIFECYCLE.RELEASED]: {
    [P2P_LIFECYCLE.CLOSED]: "archive_terminal",
  },
};

const ESCROW_EDGES: Record<EscrowLifecycle, Partial<Record<EscrowLifecycle, string>>> = {
  [ESCROW_LIFECYCLE.LOCKED]: {
    [ESCROW_LIFECYCLE.RELEASE_PENDING]: "buyer_mark_paid",
    [ESCROW_LIFECYCLE.DISPUTED]: "dispute",
    [ESCROW_LIFECYCLE.CANCELLED]: "cancel_unlock",
  },
  [ESCROW_LIFECYCLE.RELEASE_PENDING]: {
    [ESCROW_LIFECYCLE.RELEASED]: "seller_complete",
    [ESCROW_LIFECYCLE.DISPUTED]: "dispute",
    [ESCROW_LIFECYCLE.CANCELLED]: "admin_cancel_unlock",
  },
  [ESCROW_LIFECYCLE.DISPUTED]: {
    [ESCROW_LIFECYCLE.RELEASED]: "policy_release",
    [ESCROW_LIFECYCLE.CANCELLED]: "policy_refund",
  },
  [ESCROW_LIFECYCLE.RELEASED]: {},
  [ESCROW_LIFECYCLE.CANCELLED]: {},
};

const DISPUTE_EDGES: Record<DisputeLifecycle, Partial<Record<DisputeLifecycle, string>>> = {
  [DISPUTE_LIFECYCLE.OPEN]: {
    [DISPUTE_LIFECYCLE.REVIEWING]: "multi_approve_progress",
    [DISPUTE_LIFECYCLE.REJECTED]: "operator_reject",
  },
  [DISPUTE_LIFECYCLE.REVIEWING]: {
    [DISPUTE_LIFECYCLE.RESOLVED]: "finalize_or_return_complete",
    [DISPUTE_LIFECYCLE.REJECTED]: "operator_reject",
  },
  [DISPUTE_LIFECYCLE.RESOLVED]: {},
  [DISPUTE_LIFECYCLE.REJECTED]: {},
};

export type P2pTransitionOpts = {
  /** 온체인·실제 자금 이동을 시뮬레이션하는 UI 전용 확인 문자열 */
  mockUtAdminAck?: string;
};

export function canTransitionP2pLifecycle(
  from: P2pLifecycle,
  to: P2pLifecycle,
  opts: P2pTransitionOpts = {},
): TransitionResult {
  if (from === to) return { ok: true };
  const edge = P2P_EDGES[from]?.[to];
  if (!edge) return { ok: false, reason: `NO_EDGE:${from}->${to}` };

  if (to === P2P_LIFECYCLE.RELEASED) {
    if (opts.mockUtAdminAck !== MOCK_UT_ADMIN_ACK) {
      return {
        ok: false,
        reason: "RELEASED_REQUIRES_MOCK_UT_ACK_AND_SEPARATE_OFFCHAIN_FLOW",
      };
    }
  }
  if (to === P2P_LIFECYCLE.DISPUTE) {
    if (opts.mockUtAdminAck !== MOCK_UT_ADMIN_ACK) {
      return { ok: false, reason: "DISPUTE_OPEN_REQUIRES_MOCK_UT_ADMIN_ACK" };
    }
  }
  if (
    to === P2P_LIFECYCLE.CANCELLED &&
    (from === P2P_LIFECYCLE.RELEASE_PENDING || from === P2P_LIFECYCLE.PAID || from === P2P_LIFECYCLE.DISPUTE)
  ) {
    if (opts.mockUtAdminAck !== MOCK_UT_ADMIN_ACK) {
      return { ok: false, reason: "CANCEL_AFTER_PAYMENT_REQUIRES_MOCK_UT_ADMIN_ACK" };
    }
  }
  return { ok: true };
}

export function canTransitionEscrowLifecycle(from: EscrowLifecycle, to: EscrowLifecycle): TransitionResult {
  if (from === to) return { ok: true };
  const edge = ESCROW_EDGES[from]?.[to];
  if (!edge) return { ok: false, reason: `NO_ESCROW_EDGE:${from}->${to}` };
  if (to === ESCROW_LIFECYCLE.RELEASED) {
    return { ok: false, reason: "ESCROW_RELEASED_VIA_EXISTING_P2P_COMPLETE_API_ONLY" };
  }
  return { ok: true };
}

export function canTransitionDisputeLifecycle(from: DisputeLifecycle, to: DisputeLifecycle): TransitionResult {
  if (from === to) return { ok: true };
  const edge = DISPUTE_EDGES[from]?.[to];
  if (!edge) return { ok: false, reason: `NO_DISPUTE_EDGE:${from}->${to}` };
  return { ok: true };
}

/** DB row → canonical (shared 와 동일 로직 재사용) */
export function deriveP2pLifecycleFromDbRow(row: {
  status?: string;
  buyer_payment_started_at?: string | null;
}): P2pLifecycle {
  return mapDbOrderToP2pLifecycle(row) as P2pLifecycle;
}

export function deriveEscrowFromP2pLifecycle(lifecycle: P2pLifecycle): EscrowLifecycle {
  return mapP2pLifecycleToEscrowStatus(lifecycle) as EscrowLifecycle;
}

export function deriveDisputeLifecycleFromDbStatus(dbStatus: string): DisputeLifecycle {
  return mapDisputeDbStatusToCanonical(dbStatus) as DisputeLifecycle;
}
