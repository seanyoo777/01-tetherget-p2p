/**
 * UTE(7번) 연동용 P2P·에스크로·분쟁·리스크 스냅샷 빌더. 실 송금/온체인 release 없음 — 집계·표시만.
 */
import {
  mapDbOrderToP2pLifecycle,
  mapP2pLifecycleToEscrowStatus,
  mapDisputeDbStatusToCanonical,
  mergeP2pLifecycleWithDispute,
  isDisputeActiveCanonical,
} from "../../shared/p2pLifecycleMap.js";
import { PLATFORM_CODE, SERVICE_LINE, mergeDomainPayload } from "../platform/context.js";

function matchDeadlineIso(matchedAt, getP2pMatchSlaMinutes) {
  const mt = Date.parse(matchedAt);
  if (!Number.isFinite(mt)) return null;
  const ms = Math.max(5, Number(getP2pMatchSlaMinutes?.() ?? 30)) * 60_000;
  return new Date(mt + ms).toISOString();
}

function computeRiskSummary(db) {
  const webhookFailed24h = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM admin_webhook_events WHERE status = 'failed' AND datetime(occurred_at) >= datetime('now', '-1 day')`,
    )
    .get();
  const webhookDisabled24h = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM admin_webhook_events WHERE status = 'disabled' AND datetime(occurred_at) >= datetime('now', '-1 day')`,
    )
    .get();
  const pendingKycOver12h = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM kyc_document_view_requests WHERE status = 'pending' AND datetime(created_at) <= datetime('now', '-12 hour')`,
    )
    .get();
  const expiredOtpUnused = db
    .prepare(`SELECT COUNT(*) as cnt FROM dispute_final_otp WHERE used = 0 AND datetime(expires_at) < datetime('now')`)
    .get();
  const disputeFinalPendingOver24h = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM disputes WHERE status = '최종승인대기' AND datetime(multi_approved_at) <= datetime('now', '-1 day')`,
    )
    .get();

  const risks = [
    {
      key: "webhook_failed_24h",
      level: Number(webhookFailed24h?.cnt || 0) > 0 ? "high" : "normal",
      count: Number(webhookFailed24h?.cnt || 0),
      message: "최근 24시간 웹훅 실패 건수",
    },
    {
      key: "webhook_disabled_24h",
      level: Number(webhookDisabled24h?.cnt || 0) > 0 ? "medium" : "normal",
      count: Number(webhookDisabled24h?.cnt || 0),
      message: "최근 24시간 웹훅 비활성(disabled) 건수",
    },
    {
      key: "kyc_pending_over_12h",
      level: Number(pendingKycOver12h?.cnt || 0) > 0 ? "medium" : "normal",
      count: Number(pendingKycOver12h?.cnt || 0),
      message: "12시간 이상 대기중인 KYC 열람 요청",
    },
    {
      key: "expired_otp_unused",
      level: Number(expiredOtpUnused?.cnt || 0) > 0 ? "medium" : "normal",
      count: Number(expiredOtpUnused?.cnt || 0),
      message: "만료되었지만 미사용 상태인 OTP 건수",
    },
    {
      key: "dispute_final_pending_over_24h",
      level: Number(disputeFinalPendingOver24h?.cnt || 0) > 0 ? "high" : "normal",
      count: Number(disputeFinalPendingOver24h?.cnt || 0),
      message: "24시간 이상 최종승인대기 분쟁 건수",
    },
  ];

  const score = risks.reduce((acc, item) => {
    if (item.level === "high") return acc + 3;
    if (item.level === "medium") return acc + 1;
    return acc;
  }, 0);
  const overallLevel = score >= 6 ? "high" : score >= 2 ? "medium" : "normal";
  return { overallLevel, score, risks, generatedAt: new Date().toISOString() };
}

function referralPendingCountSafe(db) {
  try {
    const row = db
      .prepare(
        `SELECT COUNT(*) as c FROM referral_payout_ledger WHERE status IN ('pending','pending_settlement','mock_pending')`,
      )
      .get();
    return Number(row?.c || 0);
  } catch {
    return 0;
  }
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {(row: object, viewerUserId: number|null) => object} mapP2pOrderRowFromIndex
 * @param {() => number} getP2pMatchSlaMinutes
 */
export function buildP2pUteSurfacePayloadFromIndex(db, mapP2pOrderRowFromIndex, getP2pMatchSlaMinutes) {
  const orderRows = db.prepare(`SELECT * FROM p2p_orders ORDER BY updated_at DESC LIMIT 500`).all();
  const disputeRows = db.prepare(`SELECT * FROM disputes ORDER BY created_at DESC LIMIT 200`).all();
  const disputeByOrderRef = new Map();
  for (const d of disputeRows) {
    const key = String(d.order_seller || "").trim();
    if (key) disputeByOrderRef.set(key, d);
  }

  const orders = orderRows.map((row) => {
    const base = mapDbOrderToP2pLifecycle(row);
    const linked = disputeByOrderRef.get(String(row.id));
    let disputeCanonical = null;
    if (linked) {
      disputeCanonical = mapDisputeDbStatusToCanonical(linked.status);
    }
    const hasActiveDispute = disputeCanonical != null && isDisputeActiveCanonical(disputeCanonical);
    const lifecycle = mergeP2pLifecycleWithDispute(base, Boolean(hasActiveDispute));
    const escrowLifecycle = mapP2pLifecycleToEscrowStatus(lifecycle);
    const mapped = mapP2pOrderRowFromIndex(row, null);
    const matchedAt = row.matched_at ?? null;
    const buyerStarted = row.buyer_payment_started_at ?? null;
    const sellerId = Number(row.seller_user_id);
    const buyerId = row.buyer_user_id != null ? Number(row.buyer_user_id) : null;
    return mergeDomainPayload({
      ...mapped,
      match_deadline_at: row.status === "matched" && matchedAt ? matchDeadlineIso(matchedAt, getP2pMatchSlaMinutes) : mapped.match_deadline_at ?? null,
      matched_at: matchedAt,
      buyer_payment_started_at: buyerStarted,
      seller_user_id: sellerId,
      buyer_user_id: buyerId,
      lifecycle,
      escrow_lifecycle: escrowLifecycle,
      db_status: row.status,
      dispute_linked: linked
        ? {
            id: linked.id,
            lifecycle: disputeCanonical,
            db_status: linked.status,
          }
        : null,
    });
  });

  const escrowStatuses = orders.map((o) => ({
    order_id: o.id,
    escrow_lifecycle: o.escrow_lifecycle,
    p2p_lifecycle: o.lifecycle,
    coin: o.coin,
    amount: o.amount,
    updated_at: o.updated_at,
  }));

  let escrowLockedMinorTotal = 0n;
  try {
    const sumRow = db.prepare(`SELECT COALESCE(SUM(p2p_escrow_locked_minor), 0) as s FROM user_financial_accounts`).get();
    escrowLockedMinorTotal = BigInt(Math.trunc(Number(sumRow?.s || 0)));
  } catch {
    /* keep 0n */
  }

  let pendingWithdrawals = 0;
  const walletRiskUserIds = new Set();
  try {
    const pend = db.prepare(`SELECT COUNT(*) as c FROM withdrawal_requests WHERE status = 'pending'`).get();
    pendingWithdrawals = Number(pend?.c || 0);
    const uidRows = db.prepare(`SELECT DISTINCT user_id FROM withdrawal_requests WHERE status = 'pending'`).all();
    for (const r of uidRows) walletRiskUserIds.add(Number(r.user_id));
  } catch {
    /* keep 0 */
  }

  try {
    const riskAcc = db
      .prepare(
        `SELECT user_id FROM user_financial_accounts WHERE pending_withdrawal_minor > 0 OR p2p_escrow_locked_minor > 1000000000`,
      )
      .all();
    for (const r of riskAcc) walletRiskUserIds.add(Number(r.user_id));
  } catch {
    /* ignore */
  }

  const walletStatuses = [
    {
      scope: "platform",
      pending_withdrawal_requests: pendingWithdrawals,
      p2p_escrow_locked_minor_total: escrowLockedMinorTotal.toString(),
      wallet_risk_user_count: walletRiskUserIds.size,
    },
  ];

  const referralPending = referralPendingCountSafe(db);
  const referralSettlements =
    referralPending > 0
      ? [
          {
            id: "REF-PENDING-AGG",
            status: "pending",
            amount_minor_total_pending: referralPending,
            note: "referral_payout_ledger 기반(테이블 없으면 0)",
          },
        ]
      : [];

  const disputeCases = disputeRows.map((d) =>
    mergeDomainPayload({
      id: d.id,
      order_ref: d.order_seller,
      coin: d.coin,
      amount: d.amount,
      lifecycle: mapDisputeDbStatusToCanonical(d.status),
      db_status: d.status,
      created_at: d.created_at,
    }),
  );

  const adminRisk = computeRiskSummary(db);

  const disputeActiveCount = disputeCases.filter((d) => isDisputeActiveCanonical(d.lifecycle)).length;

  const metrics = {
    p2p_order_count: orders.length,
    p2p_escrow_locked_minor_total: escrowLockedMinorTotal.toString(),
    dispute_active_count: disputeActiveCount,
    referral_settlement_pending_count: referralPending,
    wallet_risk_user_count: walletRiskUserIds.size,
    admin_risk_level: adminRisk.overallLevel,
    admin_risk_score: adminRisk.score,
  };

  return {
    schemaVersion: 1,
    platform_code: PLATFORM_CODE,
    service_line: SERVICE_LINE,
    generated_at: new Date().toISOString(),
    mock_only: true,
    orders,
    escrow_statuses: escrowStatuses,
    wallet_statuses: walletStatuses,
    referral_settlements: referralSettlements,
    dispute_cases: disputeCases,
    admin_risk: adminRisk,
    metrics,
  };
}
