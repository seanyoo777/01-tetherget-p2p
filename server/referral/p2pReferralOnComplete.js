/**
 * P2P 거래 완료 시 레퍼럴 풀 분배(@tetherget/core) + 감사 JSON + 내부 지급(ledger) 기록.
 */
import {
  allocateReferralPool,
  buildReferralAuditEntry,
  validateReferralDistributionBps,
  p2pReferralPoolFromTradeFeeMinor,
} from "@tetherget/core";

function loadDistributionMap(db) {
  const row = db.prepare(`SELECT value_json FROM platform_settings WHERE setting_key = ?`).get("referral.p2p_distribution_bps");
  let raw = { 1: 10_000 };
  if (row?.value_json) {
    try {
      raw = JSON.parse(String(row.value_json));
    } catch {
      raw = { 1: 10_000 };
    }
  }
  return new Map(Object.entries(raw).map(([k, v]) => [Number(k), Number(v)]));
}

function buildReferrerChain(db, buyerUserId, maxDepth = 12) {
  const chain = [];
  let cur = Number(buyerUserId);
  for (let i = 0; i < maxDepth; i++) {
    const row = db.prepare(`SELECT referred_by_user_id FROM users WHERE id = ?`).get(cur);
    const ref = row?.referred_by_user_id;
    if (ref == null || !Number.isFinite(Number(ref)) || Number(ref) <= 0) break;
    chain.push(String(ref));
    cur = Number(ref);
  }
  return chain;
}

function creditReferralMinor(db, userId, amountMinorBig) {
  const mi = Number(amountMinorBig);
  if (!Number.isFinite(mi) || mi <= 0) return;
  db.prepare(`INSERT OR IGNORE INTO user_financial_accounts (user_id) VALUES (?)`).run(userId);
  db.prepare(`
    UPDATE user_financial_accounts
    SET referral_earnings_total_minor = referral_earnings_total_minor + ?,
        available_balance_minor = available_balance_minor + ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(mi, mi, userId);
}

function minorToSql(b) {
  const n = Number(b);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @returns {{ correlationId: string, poolMinor: string } | null}
 */
export function runP2pReferralOnComplete(db, { orderId, buyerUserId, tradeMinorBigInt }) {
  if (!Number.isFinite(Number(buyerUserId)) || Number(buyerUserId) <= 0) return null;
  const feePortion = tradeMinorBigInt / 100n;
  const feeMinor = feePortion > 0n ? feePortion : 0n;
  const poolMinor = p2pReferralPoolFromTradeFeeMinor(feeMinor);
  if (poolMinor <= 0n) return null;

  const distMap = loadDistributionMap(db);
  const val = validateReferralDistributionBps(distMap);
  if (!val.ok) {
    console.warn("[referral] invalid distribution bps", val.errors);
    return null;
  }

  const chain = buildReferrerChain(db, buyerUserId);
  const result = allocateReferralPool({
    poolMinor,
    distributionBpsByTier: distMap,
    referrerChainUserIds: chain,
  });

  const correlationId = `p2p-${orderId}-${Date.now()}`;
  const audit = buildReferralAuditEntry({
    id: correlationId,
    source: "p2p_trade_fee",
    poolPolicyId: "p2p_fee_is_pool_100pct",
    poolMinor,
    currencyCode: "USDT",
    distributionBpsByTier: distMap,
    result,
    createdAtMs: Date.now(),
    correlationId,
    sourceRef: orderId,
  });

  const feeSql = minorToSql(feeMinor);
  db.prepare(`
    INSERT INTO referral_distribution_audit (order_id, pool_policy, fee_minor, audit_json)
    VALUES (?, 'p2p_core_allocate', ?, ?)
  `).run(
    orderId,
    feeSql,
    JSON.stringify({
      correlation_id: correlationId,
      pool_minor: poolMinor.toString(),
      treasury_minor: result.toTreasuryMinor.toString(),
      dust_minor: result.roundingDustMinor.toString(),
      referral_audit: audit,
    }),
  );

  for (const line of result.lines) {
    const uid = Number(line.beneficiaryUserId);
    if (!Number.isFinite(uid) || uid <= 0) continue;
    creditReferralMinor(db, uid, line.amountMinor);
    db.prepare(`
      INSERT INTO referral_payout_ledger (order_id, correlation_id, beneficiary_user_id, amount_minor, status, onchain_tx_hash)
      VALUES (?, ?, ?, ?, 'ledgered_internal', '')
    `).run(orderId, correlationId, uid, minorToSql(line.amountMinor));
  }

  if (result.toTreasuryMinor > 0n) {
    db.prepare(`
      INSERT INTO referral_payout_ledger (order_id, correlation_id, beneficiary_user_id, amount_minor, status, onchain_tx_hash, chain_label)
      VALUES (?, ?, NULL, ?, 'treasury_bucket', '', 'treasury')
    `).run(orderId, correlationId, minorToSql(result.toTreasuryMinor));
  }

  return { correlationId, poolMinor: poolMinor.toString() };
}
