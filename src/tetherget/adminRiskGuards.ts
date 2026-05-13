/**
 * UTE / 관리자 콘솔에서 위험도 높은 토글 전 확인 플래그 (문서·UI 공통).
 */

export type AdminRiskTarget =
  | "p2p_lifecycle_dispute"
  | "p2p_lifecycle_cancel_after_payment"
  | "p2p_lifecycle_released"
  | "escrow_emergency_mode"
  | "referral_distribution_bps"
  | "kyc_admin_switches";

export function adminRiskChangeRequiresConfirm(target: AdminRiskTarget): boolean {
  const confirmed: Record<AdminRiskTarget, boolean> = {
    p2p_lifecycle_dispute: true,
    p2p_lifecycle_cancel_after_payment: true,
    p2p_lifecycle_released: true,
    escrow_emergency_mode: true,
    referral_distribution_bps: true,
    kyc_admin_switches: true,
  };
  return confirmed[target] ?? true;
}
