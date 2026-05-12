/**
 * Prometheus 텍스트 형식 메트릭 (소규모 베타용).
 */

function lineHelp(name, help) {
  return [`# HELP ${name} ${help}`, `# TYPE ${name} gauge`];
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {{ indexerJson?: object; latestHint?: number }} [hints]
 */
export function renderPrometheusMetrics(db, hints = {}) {
  const lines = [];

  const pushFailed = db.prepare(`SELECT COUNT(*) as c FROM push_notification_outbound WHERE status = 'failed'`).get();
  lines.push(...lineHelp("tgx_push_outbound_failed", "FCM outbound rows in failed state"));
  lines.push(`tgx_push_outbound_failed ${pushFailed?.c ?? 0}`, "");

  const pushQueued = db.prepare(`SELECT COUNT(*) as c FROM push_notification_outbound WHERE status = 'queued'`).get();
  lines.push(...lineHelp("tgx_push_outbound_queued", "FCM outbound rows queued"));
  lines.push(`tgx_push_outbound_queued ${pushQueued?.c ?? 0}`, "");

  const pushSending = db.prepare(`SELECT COUNT(*) as c FROM push_notification_outbound WHERE status = 'sending'`).get();
  lines.push(...lineHelp("tgx_push_outbound_sending", "FCM outbound rows in-flight"));
  lines.push(`tgx_push_outbound_sending ${pushSending?.c ?? 0}`, "");

  const pushSent = db.prepare(`SELECT COUNT(*) as c FROM push_notification_outbound WHERE status = 'sent'`).get();
  lines.push(...lineHelp("tgx_push_outbound_sent", "FCM outbound accepted by provider, pending client ack"));
  lines.push(`tgx_push_outbound_sent ${pushSent?.c ?? 0}`, "");

  const pushDelivered = db.prepare(`SELECT COUNT(*) as c FROM push_notification_outbound WHERE status = 'delivered'`).get();
  lines.push(...lineHelp("tgx_push_outbound_delivered", "FCM outbound marked delivered"));
  lines.push(`tgx_push_outbound_delivered ${pushDelivered?.c ?? 0}`, "");

  const pushTotal = db.prepare(`SELECT COUNT(*) as c FROM push_notification_outbound`).get();
  lines.push(...lineHelp("tgx_push_outbound_total", "FCM outbound rows (all statuses)"));
  lines.push(`tgx_push_outbound_total ${pushTotal?.c ?? 0}`, "");

  const idxRow = db.prepare(`SELECT value_json FROM platform_settings WHERE setting_key = 'p2p.escrow_indexer'`).get();
  let idx = hints.indexerJson || {};
  try {
    if (!hints.indexerJson && idxRow?.value_json) idx = JSON.parse(String(idxRow.value_json));
  } catch {
    idx = {};
  }
  const lastBlock = Number(idx.last_block ?? 0);
  const lastLatest = Number(idx.last_rpc_latest ?? hints.latestHint ?? 0);
  const lag = lastLatest > 0 && lastBlock > 0 ? Math.max(0, lastLatest - lastBlock) : 0;
  lines.push(...lineHelp("tgx_escrow_indexer_block_lag", "RPC latest minus last processed block (approx)"));
  lines.push(`tgx_escrow_indexer_block_lag ${lag}`, "");

  lines.push(...lineHelp("tgx_escrow_indexer_last_block", "Last processed block cursor"));
  lines.push(`tgx_escrow_indexer_last_block ${lastBlock}`, "");

  lines.push(...lineHelp("tgx_escrow_indexer_last_rpc_latest", "Last observed RPC block number from indexer tick"));
  lines.push(`tgx_escrow_indexer_last_rpc_latest ${lastLatest}`, "");

  const leagueOpen = db.prepare(`SELECT COUNT(*) as c FROM league_sessions WHERE status = 'open'`).get();
  lines.push(...lineHelp("tgx_league_sessions_open", "Open league sessions"));
  lines.push(`tgx_league_sessions_open ${leagueOpen?.c ?? 0}`, "");

  try {
    const oaQ = db.prepare(`SELECT COUNT(*) as c FROM p2p_outbound_admin_webhooks WHERE status IN ('queued','failed')`).get();
    lines.push(...lineHelp("tgx_outbound_admin_webhook_pending", "Admin outbound webhook rows queued or failed"));
    lines.push(`tgx_outbound_admin_webhook_pending ${oaQ?.c ?? 0}`, "");
    const oaDead = db.prepare(`SELECT COUNT(*) as c FROM p2p_outbound_admin_webhooks WHERE status = 'dead'`).get();
    lines.push(...lineHelp("tgx_outbound_admin_webhook_dead", "Admin outbound webhook dead letters"));
    lines.push(`tgx_outbound_admin_webhook_dead ${oaDead?.c ?? 0}`, "");
  } catch {
    /* 테이블 없음 등 */
  }

  try {
    const adj = db.prepare(`SELECT COUNT(*) as c FROM p2p_settlement_adjustments`).get();
    lines.push(...lineHelp("tgx_settlement_adjustment_rows", "Settlement adjustment rows (Phase 24)"));
    lines.push(`tgx_settlement_adjustment_rows ${adj?.c ?? 0}`, "");
  } catch {
    /* ignore */
  }

  try {
    const wl = db.prepare(`SELECT COUNT(*) as c FROM p2p_whitelabel_onboarding_requests WHERE status = 'submitted'`).get();
    lines.push(...lineHelp("tgx_whitelabel_onboarding_submitted", "White-label onboarding requests in submitted status (Phase 25)"));
    lines.push(`tgx_whitelabel_onboarding_submitted ${wl?.c ?? 0}`, "");
  } catch {
    /* ignore */
  }

  try {
    const vo = db.prepare(`SELECT COUNT(*) as c FROM p2p_settlement_variance_tickets WHERE status = 'open'`).get();
    lines.push(...lineHelp("tgx_settlement_variance_tickets_open", "Open settlement variance tickets (Phase 26)"));
    lines.push(`tgx_settlement_variance_tickets_open ${vo?.c ?? 0}`, "");
  } catch {
    /* ignore */
  }

  try {
    const ao = db.prepare(`SELECT COUNT(*) as c FROM p2p_ops_auto_tickets WHERE status = 'open'`).get();
    lines.push(...lineHelp("tgx_ops_auto_tickets_open", "Open ops auto-tickets (Phase 28 SRE2)"));
    lines.push(`tgx_ops_auto_tickets_open ${ao?.c ?? 0}`, "");
  } catch {
    /* ignore */
  }

  try {
    const wr = db.prepare(`SELECT COUNT(*) as c FROM p2p_sre_weekly_reports`).get();
    lines.push(...lineHelp("tgx_sre_weekly_reports_rows", "SRE2 weekly report rows (Phase 28)"));
    lines.push(`tgx_sre_weekly_reports_rows ${wr?.c ?? 0}`, "");
  } catch {
    /* ignore */
  }

  try {
    const ub = db.prepare(`SELECT COUNT(*) as c FROM p2p_usage_meter_buckets`).get();
    lines.push(...lineHelp("tgx_usage_meter_bucket_rows", "Usage meter hourly bucket rows (Phase 29)"));
    lines.push(`tgx_usage_meter_bucket_rows ${ub?.c ?? 0}`, "");
  } catch {
    /* ignore */
  }

  try {
    const tp = db.prepare(`SELECT COUNT(*) as c FROM p2p_tier_change_requests WHERE status = 'pending'`).get();
    lines.push(...lineHelp("tgx_tier_change_requests_pending", "Pending self-serve tier change requests (Phase 29)"));
    lines.push(`tgx_tier_change_requests_pending ${tp?.c ?? 0}`, "");
  } catch {
    /* ignore */
  }

  try {
    const hm = db.prepare(`SELECT COUNT(*) as c FROM p2p_handover_milestones WHERE status = 'done'`).get();
    lines.push(...lineHelp("tgx_handover_milestones_done", "Handover milestones marked done (Phase 30)"));
    lines.push(`tgx_handover_milestones_done ${hm?.c ?? 0}`, "");
  } catch {
    /* ignore */
  }

  return lines.join("\n");
}
