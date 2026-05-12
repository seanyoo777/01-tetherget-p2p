/**
 * Phase 16: SLO 복구 힌트·Statuspage 준비, 온보딩 퍼널, CRM CSV.
 */

import { computeBetaSloSnapshot } from "./betaPhase14.js";

/**
 * @param {ReturnType<typeof computeBetaSloSnapshot>} snap
 * @param {NodeJS.ProcessEnv} env
 */
export function enrichSloSnapshotWithRecovery(snap, env) {
  const hints = [];
  if (snap.slo && !snap.slo.indexer_lag_ok) {
    hints.push(
      "인덱서 블록 지연: RPC·ESCROW_INDEXER_FINALITY_BLOCKS·platform_settings `p2p.escrow_indexer` 의 last_block / last_rpc_latest 확인.",
    );
  }
  if (snap.slo && !snap.slo.indexer_fresh_ok) {
    hints.push("인덱서 틱 정지: ESCROW_INDEXER_ENABLED, RPC 가용성, ESCROW_RPC_WS_URL, 서버 시계 확인.");
  }
  if (snap.slo && !snap.slo.push_failed_ok) {
    hints.push("FCM 실패 누적: push_notification_outbound status=failed, FCM v1 서비스 계정·토큰 무효화 확인.");
  }
  const recoveryDocs = String(env.RECOVERY_DOCS_URL || "").trim();
  if (recoveryDocs) hints.push(`복구 문서: ${recoveryDocs}`);

  const statuspagePublic = String(env.STATUSPAGE_PUBLIC_URL || "").trim() || null;
  const pageId = String(env.STATUSPAGE_PAGE_ID || "").trim();
  const apiKey = String(env.STATUSPAGE_API_KEY || "").trim();
  const componentId = String(env.STATUSPAGE_COMPONENT_ID || "").trim() || null;

  const statuspage = {
    public_url: statuspagePublic,
    api_ready: Boolean(pageId && apiKey),
    api_doc: "https://developer.statuspage.io/#operation/postPagesPageIdIncidents",
    suggested_incident: snap.slo?.all_ok
      ? null
      : {
          name: "Tetherget P2P / Infra: SLO breach",
          body: hints.join("\n\n"),
          statuspage_component_id: componentId,
        },
  };

  return { ...snap, recovery_hints: hints, statuspage };
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 */
export function computeBetaSloSnapshotEnriched(db, env) {
  return enrichSloSnapshotWithRecovery(computeBetaSloSnapshot(db, env), env);
}

/**
 * @param {import("better-sqlite3").Database} db
 */
export function buildOnboardingFunnel(db) {
  const rows = db.prepare(`SELECT user_id, steps_json, completed_at FROM beta_onboarding_progress`).all();
  const stepCounts = {};
  let completed = 0;
  for (const row of rows) {
    if (row.completed_at) completed += 1;
    let steps = {};
    try {
      steps = JSON.parse(String(row.steps_json || "{}"));
    } catch {
      steps = {};
    }
    for (const [k, v] of Object.entries(steps)) {
      if (v === true) stepCounts[k] = (stepCounts[k] || 0) + 1;
    }
  }
  const keys = Object.keys(stepCounts).sort();
  return {
    captured_at: new Date().toISOString(),
    users_with_progress: rows.length,
    onboarding_completed: completed,
    step_completion_counts: stepCounts,
    step_keys: keys,
  };
}

function csvEscape(value) {
  const s = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * @param {object[]} rows DB rows from beta_feedback
 */
export function feedbackRowsToCsv(rows) {
  const cols = [
    "id",
    "user_id",
    "category",
    "priority",
    "status",
    "cohort_slug",
    "labels_json",
    "assignee_user_id",
    "contact_hint",
    "created_at",
    "updated_at",
    "message",
    "admin_note",
  ];
  const lines = [cols.join(",")];
  for (const r of rows) {
    lines.push(cols.map((c) => csvEscape(r[c])).join(","));
  }
  return lines.join("\n") + "\n";
}

/** 코호트 slug: 소문자·숫자·하이픈만 */
export function normalizeCohortSlug(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  return s || null;
}
