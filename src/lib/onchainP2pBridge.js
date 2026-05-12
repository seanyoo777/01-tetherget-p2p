/**
 * 오프체인 P2P 단계(buyer 송금 확인 UX) ↔ EscrowContract.confirmReceipt 연결 패턴.
 * 실제 호출은 지갑·체인 환경에 따라 wagmi useWriteContract 또는 viem walletClient 사용.
 */

/** EscrowContract.sol — Buyer만 호출 가능 */
export const ESCROW_CONFIRM_RECEIPT_SIGNATURE = "confirmReceipt(uint256 id)";

/**
 * @param {object} arg
 * @param {bigint|string|number} arg.escrowOnchainId — 온체인 escrow id (nextEscrowId 이하)
 * @returns {{ abiFunctionName: string, args: [bigint] }}
 */
export function buildConfirmReceiptCall(arg) {
  const raw = arg?.escrowOnchainId ?? arg?.onchainEscrowId;
  const id = typeof raw === "bigint" ? raw : BigInt(Math.floor(Number(raw)));
  return {
    abiFunctionName: "confirmReceipt",
    args: [id],
  };
}

/**
 * 타임라인 정렬 (문서용):
 * 1) 오프체인: buyer 가 mark-paid API 성공 → 주문 status ≈ payment_sent (코어 buyerAck buyer_marked_sent 에 해당)
 * 2) 온체인: 동일 거래의 USDT escrow 가 Funded 일 때 buyer 가 confirmReceipt(escrowId)
 * 3) 컨트랙트: buyer 만 호출 가능 → Released + 수수료 분배 (EscrowContract.sol)
 */
export function describeOffchainToOnchainBuyerAckFlow() {
  return [
    "오프체인 buyer 송금확인(mark-paid)과 온체인 confirmReceipt는 별 레이어입니다.",
    "연동 시 metadata_json 에 onchain_escrow_id 를 저장하고, 고액·KYC 게이트 통과 후에만 트랜잭션을 노출하세요.",
  ].join(" ");
}
