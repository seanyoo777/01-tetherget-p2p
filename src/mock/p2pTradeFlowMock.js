/**
 * P2P 거래 플로우 UI 전용 mock (실거래·실제 분쟁 API 없음).
 */
import { formatP2pTimestamp, normalizeTimelineEvent, sortTimelineEvents } from "../p2p/p2pTimelineEvents.js";
import { deriveMatrixStatus } from "../p2p/p2pStatusMatrix.js";
import {
  normalizeAdminMockTradeRow,
  getAdminMockRowsFromUteSurface,
  mapUteSurfaceOrderToAdminRow,
} from "../p2p/p2pUteFieldAlign.js";

export { getAdminMockRowsFromUteSurface, mapUteSurfaceOrderToAdminRow, normalizeAdminMockTradeRow };

export const MOCK_REFERRAL_SUMMARY = {
  code: "TG-DEMO",
  directCount: 12,
  teamVolumeUsdt: 284500,
  totalVolumeUsdt: 412800,
  referralFeeUsdt: 1842.6,
  pendingRewardUsdt: 420.5,
  settledRewardUsdt: 3180,
  tierLabel: "Silver Partner",
  level: 3,
  levelLabel: "L3 · Silver",
  weekDeltaPct: 4.2,
  weeklyActivity: {
    trades: 28,
    matched: 19,
    completed: 14,
    volumeUsdt: 52300,
  },
};

const DISPUTE_STATES = ["OPEN", "REVIEWING", "WAITING_EVIDENCE", null, null, null];

/** 주문 ID 기반 결정적 mock 분쟁 (일부 주문만 표시). */
export function getMockDisputeForOrder(row) {
  if (!row?.id) return null;
  const id = String(row.id);
  if (id.startsWith("P2P-DEMO")) return null;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const bucket = Math.abs(h) % 11;
  if (bucket > 2) return null;
  const state = DISPUTE_STATES[bucket % DISPUTE_STATES.length];
  if (!state) return null;
  return {
    id: `DSP-MOCK-${id.slice(-8)}`,
    order_ref: id,
    state,
    stateLabel: disputeStateLabel(state),
    opened_at: formatP2pTimestamp("2026-05-14T09:12:00Z"),
    evidence_count: state === "WAITING_EVIDENCE" ? 2 : 1,
    _mock: true,
  };
}

export function disputeStateLabel(state) {
  const map = {
    OPEN: "분쟁 접수",
    REVIEWING: "검토 중",
    WAITING_EVIDENCE: "증빙 대기",
    RESOLVED: "해결됨",
    REJECTED: "기각",
    ESCALATED: "상위 이관",
    CLOSED: "종료",
  };
  return map[state] || state;
}

function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * 관리자 mock 거래 위험도·배지 (표시 전용).
 * @param {object} row
 */
export function getMockAdminTradeAudit(row) {
  const h = hashId(String(row?.id || ""));
  const dispute = row?.dispute ? { state: row.dispute } : getMockDisputeForOrder(row);
  const disputeCount = dispute ? 1 : h % 5 === 0 ? 1 : 0;
  const escrowLc = row?.escrow_lifecycle ?? row?.escrow;
  const delayedRelease =
    row?.status === "payment_sent" ||
    row?.db_status === "payment_sent" ||
    escrowLc === "release_pending" ||
    escrowLc === "waiting_release";
  const riskScore = Math.min(100, 20 + (h % 70) + (disputeCount ? 25 : 0) + (delayedRelease ? 15 : 0));
  const highRisk = riskScore >= 75 || row?.amount >= 10000;
  return {
    riskScore,
    highRisk,
    delayedRelease,
    disputeCount,
    _mock: true,
  };
}

const MOCK_ADMIN_P2P_TRADES_RAW = [
  {
    id: "P2P-ADM-1001",
    db_status: "matched",
    status: "matched",
    lifecycle: "waiting_payment",
    escrow_lifecycle: "locked",
    escrow: "locked",
    coin: "USDT",
    amount: 2500,
    seller_user_id: 42,
    buyer_user_id: 88,
    seller: "seller_42",
    buyer: "buyer_88",
    dispute_linked: null,
    dispute: null,
    updated_at: "2026-05-15 08:10:00",
    created_at: "2026-05-15 07:50:00",
  },
  {
    id: "P2P-ADM-1002",
    db_status: "payment_sent",
    status: "payment_sent",
    lifecycle: "release_pending",
    escrow_lifecycle: "release_pending",
    escrow: "waiting_release",
    coin: "USDT",
    amount: 800,
    seller_user_id: 12,
    buyer_user_id: 33,
    seller: "seller_12",
    buyer: "buyer_33",
    dispute_linked: { lifecycle: "reviewing", db_status: "승인대기" },
    dispute: "REVIEWING",
    updated_at: "2026-05-15 07:55:00",
    created_at: "2026-05-15 06:20:00",
  },
  {
    id: "P2P-ADM-1003",
    db_status: "completed",
    status: "completed",
    lifecycle: "released",
    escrow_lifecycle: "released",
    escrow: "released",
    coin: "SOL",
    amount: 45,
    seller_user_id: 1,
    buyer_user_id: 19,
    seller: "seller_01",
    buyer: "buyer_19",
    dispute_linked: null,
    dispute: null,
    updated_at: "2026-05-14 22:30:00",
    created_at: "2026-05-14 20:00:00",
  },
  {
    id: "P2P-ADM-1004",
    db_status: "matched",
    status: "matched",
    lifecycle: "dispute",
    escrow_lifecycle: "disputed",
    escrow: "disputed",
    coin: "USDT",
    amount: 12000,
    seller_user_id: 99,
    buyer_user_id: 77,
    seller: "seller_vip",
    buyer: "buyer_77",
    dispute_linked: { lifecycle: "reviewing", db_status: "분쟁접수" },
    dispute: "WAITING_EVIDENCE",
    updated_at: "2026-05-15 06:40:00",
    created_at: "2026-05-15 05:10:00",
  },
];

export const MOCK_ADMIN_P2P_TRADES = MOCK_ADMIN_P2P_TRADES_RAW.map((r) => normalizeAdminMockTradeRow(r));

/** ute-surface 스키마와 동일한 shape (클라이언트 mock API용). */
export const MOCK_UTE_SURFACE_SNAPSHOT = {
  schemaVersion: 1,
  mock_only: true,
  orders: MOCK_ADMIN_P2P_TRADES_RAW.map((r) => ({
    id: r.id,
    coin: r.coin,
    amount: r.amount,
    lifecycle: r.lifecycle,
    escrow_lifecycle: r.escrow_lifecycle,
    db_status: r.db_status,
    status: r.db_status,
    seller_user_id: r.seller_user_id,
    buyer_user_id: r.buyer_user_id,
    dispute_linked: r.dispute_linked,
    created_at: r.created_at,
    updated_at: r.updated_at,
  })),
  metrics: { p2p_order_count: MOCK_ADMIN_P2P_TRADES_RAW.length, dispute_active_count: 2 },
};

/** 서버 이벤트 + mock 보강 타임라인 */
export function buildTradeTimelineEvents(row, serverEvents = []) {
  const ctx = { role: row?.my_role };
  const base = [
    normalizeTimelineEvent(
      { id: "tl-created", action: "ORDER_CREATED", created_at: row?.created_at, _mock: true },
      ctx,
    ),
  ];
  if (row?.matched_at) {
    base.push(
      normalizeTimelineEvent(
        { id: "tl-matched", action: "ORDER_MATCHED", created_at: row.matched_at, _mock: true },
        ctx,
      ),
    );
  }
  if (row?.buyer_payment_started_at) {
    base.push(
      normalizeTimelineEvent(
        {
          id: "tl-pay-start",
          action: "BUYER_PAYMENT_STARTED",
          created_at: row.buyer_payment_started_at,
          _mock: true,
        },
        ctx,
      ),
    );
  }
  const matrix = deriveMatrixStatus(row, Boolean(getMockDisputeForOrder(row)));
  if (matrix === "payment_sent" || row?.status === "payment_sent") {
    base.push(
      normalizeTimelineEvent(
        {
          id: "tl-pay-sent",
          action: "PAYMENT_SENT_MARKED",
          created_at: row?.updated_at || row?.created_at,
          severity: "warning",
          _mock: true,
        },
        ctx,
      ),
    );
  }
  if (row?.status === "payment_sent") {
    base.push(
      normalizeTimelineEvent(
        {
          id: "tl-pay-confirmed",
          action: "PAYMENT_CONFIRMED_MOCK",
          created_at: row?.updated_at,
          source: "user",
          actor: "buyer",
          severity: "success",
          _mock: true,
        },
        ctx,
      ),
    );
  }
  if (row?.status === "completed") {
    base.push(
      normalizeTimelineEvent(
        {
          id: "tl-done",
          action: "ORDER_COMPLETED_MOCK_RELEASE",
          created_at: row?.updated_at,
          _mock: true,
        },
        ctx,
      ),
    );
  }
  const dispute = getMockDisputeForOrder(row);
  if (dispute) {
    base.push(
      normalizeTimelineEvent(
        {
          id: "tl-dispute",
          action: `DISPUTE_${dispute.state}`,
          created_at: dispute.opened_at,
          detail_json: JSON.stringify({ dispute_id: dispute.id, mock: true }),
          source: "admin",
          actor: "admin_ops",
          severity: "critical",
          _mock: true,
        },
        ctx,
      ),
    );
  }
  const serverNorm = (Array.isArray(serverEvents) ? serverEvents : []).map((ev) =>
    normalizeTimelineEvent(ev, ctx),
  );
  return sortTimelineEvents([...base, ...serverNorm], ctx);
}

export function getMockAdminAuditSummary() {
  const rows = MOCK_ADMIN_P2P_TRADES;
  let disputeCount = 0;
  let highRiskCount = 0;
  let delayedCount = 0;
  for (const row of rows) {
    const a = getMockAdminTradeAudit(row);
    disputeCount += a.disputeCount;
    if (a.highRisk) highRiskCount += 1;
    if (a.delayedRelease) delayedCount += 1;
  }
  return { disputeCount, highRiskCount, delayedCount, tradeCount: rows.length, _mock: true };
}
