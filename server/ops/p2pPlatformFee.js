/**
 * P2P 플랫폼 수수료(마이너 단위) — company_wallet 적립 + 원장.
 */

import { minorBigIntToSqlInt } from "../finance/moneyAmount.js";

export function computePlatformFeeMinor(tradeMinorBigInt, feeBps) {
  const bps = BigInt(Math.min(10_000, Math.max(0, Math.floor(Number(feeBps) || 0))));
  return (tradeMinorBigInt * bps) / 10_000n;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {{ orderId: string; sellerUserId: number; buyerUserId: number | null; tradeMinorBigInt: bigint; feeBps: number; feeEnabled: boolean }} p
 * @returns {{ feeMinor: bigint; netToBuyerMinor: bigint; feeSql: number; netSql: number }}
 */
export function applyP2pPlatformFeeInTransaction(db, p) {
  const { orderId, sellerUserId, buyerUserId, tradeMinorBigInt, feeBps, feeEnabled } = p;
  if (!feeEnabled || tradeMinorBigInt <= 0n) {
    const netSql = minorBigIntToSqlInt(tradeMinorBigInt);
    return { feeMinor: 0n, netToBuyerMinor: tradeMinorBigInt, feeSql: 0, netSql };
  }
  const feeMinor = computePlatformFeeMinor(tradeMinorBigInt, feeBps);
  const netToBuyerMinor = tradeMinorBigInt - feeMinor;
  if (netToBuyerMinor < 0n) {
    throw new Error("P2P_FEE_EXCEEDS_TRADE");
  }
  const feeSql = minorBigIntToSqlInt(feeMinor);
  const netSql = minorBigIntToSqlInt(netToBuyerMinor);
  if (feeMinor > 0n) {
    db.prepare(`
      UPDATE company_wallet
      SET available_balance_minor = available_balance_minor + ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(feeSql);
    db.prepare(`
      INSERT INTO p2p_platform_fee_ledger (
        order_id, seller_user_id, buyer_user_id, trade_minor, fee_bps, fee_minor, net_to_buyer_minor
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderId,
      sellerUserId,
      buyerUserId != null && Number.isFinite(buyerUserId) ? buyerUserId : null,
      minorBigIntToSqlInt(tradeMinorBigInt),
      Math.min(10_000, Math.max(0, Math.floor(Number(feeBps) || 0))),
      feeSql,
      netSql,
    );
  }
  return { feeMinor, netToBuyerMinor, feeSql, netSql };
}
