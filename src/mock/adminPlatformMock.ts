/**
 * 관리자·UTE(7번) 연동용 mock/집계 surface. 실제 송금·온체인 release 없음.
 * `refreshAdminPlatformSurface` 로 `/api/admin/p2p/ute-surface` 캐시 후 getter 사용.
 */
import type {
  AdminRiskStatus,
  DisputeCase,
  EscrowStatus,
  P2pOrder,
  ReferralSettlement,
  UteSurfacePayload,
  WalletStatus,
} from "../tetherget/types";

export type AdminApiClient = {
  request: (path: string, options?: { method?: string; auth?: boolean; body?: string }) => Promise<unknown>;
};

let surfaceCache: UteSurfacePayload | null = null;

const DEMO_SURFACE: UteSurfacePayload = {
  schemaVersion: 1,
  platform_code: "tetherget",
  service_line: "p2p",
  generated_at: new Date().toISOString(),
  mock_only: true,
  orders: [
    {
      id: "UTE-DEMO-1",
      seller_user_id: 1,
      buyer_user_id: 2,
      coin: "USDT",
      amount: 100,
      unit_price: 1400,
      payment_method: "BANK",
      status: "matched",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      lifecycle: "waiting_payment",
      escrow_lifecycle: "locked",
      dispute_linked: null,
    },
  ],
  escrow_statuses: [
    {
      order_id: "UTE-DEMO-1",
      escrow_lifecycle: "locked",
      p2p_lifecycle: "waiting_payment",
      coin: "USDT",
      amount: 100,
      updated_at: new Date().toISOString(),
    },
  ],
  wallet_statuses: [
    {
      scope: "platform",
      pending_withdrawal_requests: 0,
      p2p_escrow_locked_minor_total: "0",
      wallet_risk_user_count: 0,
    },
  ],
  referral_settlements: [],
  dispute_cases: [],
  admin_risk: {
    overallLevel: "normal",
    score: 0,
    risks: [],
    generatedAt: new Date().toISOString(),
  },
  metrics: {
    p2p_order_count: 1,
    p2p_escrow_locked_minor_total: "0",
    dispute_active_count: 0,
    referral_settlement_pending_count: 0,
    wallet_risk_user_count: 0,
    admin_risk_level: "normal",
    admin_risk_score: 0,
  },
};

function asSurface(data: unknown): UteSurfacePayload | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (!Array.isArray(o.orders)) return null;
  return data as UteSurfacePayload;
}

/** 관리자 토큰으로 서버 스냅샷 갱신. 실패 시 데모 스냅샷으로 폴백(숫자 0 오류 방지). */
export async function refreshAdminPlatformSurface(api: AdminApiClient): Promise<void> {
  try {
    const data = await api.request("/api/admin/p2p/ute-surface", { auth: true });
    const parsed = asSurface(data);
    surfaceCache = parsed ?? DEMO_SURFACE;
  } catch {
    surfaceCache = DEMO_SURFACE;
  }
}

export function clearAdminPlatformSurfaceCache(): void {
  surfaceCache = null;
}

function cache(): UteSurfacePayload {
  return surfaceCache ?? DEMO_SURFACE;
}

export function getP2pOrders(): P2pOrder[] {
  return cache().orders;
}

export function getEscrowStatuses(): EscrowStatus[] {
  return cache().escrow_statuses;
}

export function getWalletStatuses(): WalletStatus[] {
  return cache().wallet_statuses;
}

export function getReferralSettlements(): ReferralSettlement[] {
  return cache().referral_settlements;
}

export function getDisputeCases(): DisputeCase[] {
  return cache().dispute_cases;
}

export function getAdminRiskStatus(): AdminRiskStatus {
  return cache().admin_risk;
}

export function getUteSurfaceMetrics(): UteSurfacePayload["metrics"] {
  return cache().metrics;
}

export function getUteSurfacePayload(): UteSurfacePayload {
  return cache();
}
