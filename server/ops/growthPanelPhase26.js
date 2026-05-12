/**
 * Phase 26: usage·과금·SLA tier 통합 성장 패널(읽기 전용 집계).
 */

import { getMonetizationPublic } from "./betaPhase17.js";
import { getSlaCustomerSummaryPublic } from "./slaCustomerPhase24.js";
import { readTenantRegistry } from "./tenantWhiteLabelPhase24.js";
import { countOpenSettlementVarianceTickets } from "./settlementMaturityPhase26.js";
import { readDataPlaneRoutingAdmin } from "./dataPlanePhase26.js";
import { readSecurityEdgePackAdmin } from "./securityEdgePhase26.js";

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 */
export function buildGrowthPanel(db, env) {
  const orders30 = db
    .prepare(`SELECT COUNT(*) as c FROM p2p_orders WHERE created_at >= datetime('now', '-30 days')`)
    .get();
  const matched30 = db
    .prepare(
      `SELECT COUNT(*) as c FROM p2p_orders WHERE status = 'matched' AND matched_at >= datetime('now', '-30 days')`,
    )
    .get();
  const monet = getMonetizationPublic(db, env);
  const sla = getSlaCustomerSummaryPublic(db, env);
  const tenants = readTenantRegistry(db);
  const openTickets = countOpenSettlementVarianceTickets(db, "");
  const dp = readDataPlaneRoutingAdmin(db);
  const sec = readSecurityEdgePackAdmin(db);
  return {
    generated_at: new Date().toISOString(),
    p2p_orders_last_30d: Number(orders30?.c ?? 0) || 0,
    p2p_matched_last_30d: Number(matched30?.c ?? 0) || 0,
    monetization: {
      partner_revshare_bps: monet.partner_revshare_bps,
      subscription_tier_count: Array.isArray(monet.subscription_tiers) ? monet.subscription_tiers.length : 0,
      billing_portal_configured: Boolean(monet.billing_portal_url),
    },
    sla_customer: {
      target_monthly_availability_pct: sla.target_monthly_availability_pct,
      p2p_match_sla_minutes: sla.p2p_match_sla_minutes,
    },
    tenant_registry_count: Object.keys(tenants.tenants || {}).length,
    settlement_variance_open_total: openTickets,
    data_plane: {
      tenant_shard_map_size: Object.keys(dp.tenant_shard_map || {}).length,
      automate_from_user_shard: dp.automate_from_user_shard,
    },
    security_edge: {
      waf_mode: sec.waf_mode,
      bot_defense_tier: sec.bot_defense_tier,
    },
  };
}
