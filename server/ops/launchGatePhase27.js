/**
 * Phase 27: 론칭 게이트 — 카나리 상한·SLO/정산 블로커·런북·커뮤니케이션 메타.
 */

import { readTrafficShading } from "./trafficShadingPhase23.js";
import { countOpenSettlementVarianceTickets } from "./settlementMaturityPhase26.js";
import { computeSreSnapshot } from "./srePhase23.js";

const KEY = "p2p.launch_gate";

function readJson(db) {
  const row = db.prepare(`SELECT value_json FROM platform_settings WHERE setting_key = ?`).get(KEY);
  try {
    return row?.value_json ? JSON.parse(String(row.value_json)) : {};
  } catch {
    return {};
  }
}

function writeJson(db, obj) {
  db.prepare(`
    INSERT INTO platform_settings (setting_key, value_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
  `).run(KEY, JSON.stringify(obj));
}

export function readLaunchGateAdmin(db) {
  const j = readJson(db);
  return {
    canary_cap_bps: Math.min(10_000, Math.max(0, Math.floor(Number(j.canary_cap_bps) || 1500))),
    max_open_variance_tickets: Math.min(500, Math.max(0, Math.floor(Number(j.max_open_variance_tickets) || 8))),
    auto_rollback_recommended_on_fail: Boolean(j.auto_rollback_recommended_on_fail),
    runbook_bundle_url: String(j.runbook_bundle_url || "").trim().slice(0, 500) || null,
    customer_comms_template_ref: String(j.customer_comms_template_ref || "").trim().slice(0, 200) || null,
    launch_window_utc: String(j.launch_window_utc || "").trim().slice(0, 120) || null,
    notes: String(j.notes || "").slice(0, 4000),
    updated_at: j.updated_at != null ? String(j.updated_at).slice(0, 40) : null,
  };
}

export function mergeLaunchGatePatch(db, body) {
  const prev = readJson(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    const c = Number(body.canary_cap_bps);
    if (Number.isFinite(c)) next.canary_cap_bps = Math.min(10_000, Math.max(0, Math.floor(c)));
    const m = Number(body.max_open_variance_tickets);
    if (Number.isFinite(m)) next.max_open_variance_tickets = Math.min(500, Math.max(0, Math.floor(m)));
    if (typeof body.auto_rollback_recommended_on_fail === "boolean") next.auto_rollback_recommended_on_fail = body.auto_rollback_recommended_on_fail;
    if (body.runbook_bundle_url != null) next.runbook_bundle_url = String(body.runbook_bundle_url).slice(0, 500);
    if (body.customer_comms_template_ref != null) next.customer_comms_template_ref = String(body.customer_comms_template_ref).slice(0, 200);
    if (body.launch_window_utc != null) next.launch_window_utc = String(body.launch_window_utc).slice(0, 120);
    if (body.notes != null) next.notes = String(body.notes).slice(0, 4000);
  }
  writeJson(db, next);
  return readLaunchGateAdmin(db);
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 */
export function evaluateLaunchGate(db, env) {
  const gate = readLaunchGateAdmin(db);
  const blockers = [];
  let pass = true;
  try {
    db.prepare("SELECT 1").get();
  } catch {
    pass = false;
    blockers.push({ code: "database_unavailable", severity: "block" });
  }
  const openVar = countOpenSettlementVarianceTickets(db, "");
  if (openVar > gate.max_open_variance_tickets) {
    pass = false;
    blockers.push({
      code: "open_settlement_variance_tickets",
      severity: "block",
      count: openVar,
      max: gate.max_open_variance_tickets,
    });
  }
  const shade = readTrafficShading(db);
  const canary = Math.floor(Number(shade.canary_weight_bps) || 0);
  if (canary > gate.canary_cap_bps) {
    pass = false;
    blockers.push({
      code: "canary_weight_above_cap",
      severity: "warn",
      canary_weight_bps: canary,
      cap_bps: gate.canary_cap_bps,
    });
  }
  const burnEnv = Number(env.LAUNCH_GATE_MAX_BURN_RATIO || 1.5);
  const burnMax = Number.isFinite(burnEnv) ? burnEnv : 1.5;
  try {
    const snap = computeSreSnapshot(db, env);
    if (snap.burn_ratio_vs_monthly_budget > burnMax) {
      pass = false;
      blockers.push({
        code: "sre_burn_ratio_high",
        severity: "block",
        burn_ratio_vs_monthly_budget: snap.burn_ratio_vs_monthly_budget,
        max: burnMax,
      });
    }
  } catch {
    /* ignore sre in edge cases */
  }

  const actions = [];
  if (!pass && gate.auto_rollback_recommended_on_fail) {
    actions.push({
      kind: "rollback_hint",
      detail: "POST /api/admin/ops/rollback + 최근 ops_snapshot id (스테이징에서 먼저 검증)",
    });
  }
  if (gate.runbook_bundle_url) {
    actions.push({ kind: "runbook", url: gate.runbook_bundle_url });
  }
  if (gate.customer_comms_template_ref) {
    actions.push({ kind: "customer_comms", ref: gate.customer_comms_template_ref });
  }

  return {
    pass,
    evaluated_at: new Date().toISOString(),
    blockers,
    suggested_actions: actions,
    gate_config: {
      canary_cap_bps: gate.canary_cap_bps,
      max_open_variance_tickets: gate.max_open_variance_tickets,
    },
    traffic_shading: { canary_weight_bps: canary },
  };
}
