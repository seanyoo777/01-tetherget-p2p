/**
 * UTE(7번) 연동·관리자 패널용 공통 타입. DB `p2p_orders.status` 는 레거시 문자열로 유지하고,
 * `lifecycle` 필드로 canonical 상태를 병행 표기한다.
 */

export type P2pLifecycle =
  | "created"
  | "waiting_payment"
  | "paid"
  | "release_pending"
  | "released"
  | "dispute"
  | "cancelled"
  | "closed";

export type EscrowLifecycle = "locked" | "release_pending" | "released" | "disputed" | "cancelled";

export type DisputeLifecycle = "open" | "reviewing" | "resolved" | "rejected";

/** 집계·대시보드용 지갑/출금 스냅샷 (실 송금 없음) */
export type WalletStatus = {
  scope: string;
  pending_withdrawal_requests?: number;
  p2p_escrow_locked_minor_total?: string;
  wallet_risk_user_count?: number;
};

/** 추천 트리 노드 (UTE 연동 시 확장) */
export type ReferralNode = {
  userId: string;
  parentUserId: string | null;
  tier: number;
  displayName?: string;
};

export type ReferralSettlement = {
  id: string;
  status: "pending" | "ledgered_internal" | "treasury_bucket" | "mock_demo";
  amount_minor_total_pending?: number;
  order_ref?: string;
  note?: string;
};

export type DisputeCase = {
  id: string;
  order_ref: string;
  coin: string;
  amount: number;
  lifecycle: DisputeLifecycle;
  db_status: string;
  created_at: string;
  _platform?: string;
  _line?: string;
};

export type AdminRiskStatus = {
  overallLevel: "high" | "medium" | "normal";
  score: number;
  risks: Array<{ key: string; level: string; count: number; message: string }>;
  generatedAt: string;
};

/** `/api/admin/p2p/ute-surface` 주문 행 + canonical */
export type P2pOrder = {
  id: string;
  seller_user_id: number;
  buyer_user_id: number | null;
  coin: string;
  amount: number;
  unit_price: number;
  payment_method: string;
  /** SQLite 원본 status */
  status: string;
  db_status?: string;
  metadata_json?: string;
  platform_code?: string;
  created_at: string;
  updated_at: string;
  matched_at?: string | null;
  buyer_payment_started_at?: string | null;
  match_deadline_at?: string | null;
  match_sla_minutes?: number;
  my_role?: "seller" | "buyer" | null;
  lifecycle: P2pLifecycle;
  escrow_lifecycle: EscrowLifecycle;
  dispute_linked?: {
    id: string;
    lifecycle: DisputeLifecycle | null;
    db_status: string;
  } | null;
  _platform?: string;
  _line?: string;
};

export type EscrowStatus = {
  order_id: string;
  escrow_lifecycle: EscrowLifecycle;
  p2p_lifecycle: P2pLifecycle;
  coin: string;
  amount: number;
  updated_at: string;
};

export type UteSurfacePayload = {
  schemaVersion: number;
  platform_code: string;
  service_line: string;
  generated_at: string;
  mock_only: boolean;
  orders: P2pOrder[];
  escrow_statuses: EscrowStatus[];
  wallet_statuses: WalletStatus[];
  referral_settlements: ReferralSettlement[];
  dispute_cases: DisputeCase[];
  admin_risk: AdminRiskStatus;
  metrics: {
    p2p_order_count: number;
    p2p_escrow_locked_minor_total: string;
    dispute_active_count: number;
    referral_settlement_pending_count: number;
    wallet_risk_user_count: number;
    admin_risk_level: string;
    admin_risk_score: number;
  };
};
