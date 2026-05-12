/**
 * Phase 28: SRE 2.0 — 주간 burn/스냅샷 기록 + burn 임계 시 ops 자동 티켓(외부 트래커 힌트만).
 */

import { computeSreSnapshot } from "./srePhase23.js";

const KEY = "p2p.sre2_config";

function readSre2Json(db) {
  const row = db.prepare(`SELECT value_json FROM platform_settings WHERE setting_key = ?`).get(KEY);
  try {
    return row?.value_json ? JSON.parse(String(row.value_json)) : {};
  } catch {
    return {};
  }
}

function writeSre2Json(db, obj) {
  db.prepare(`
    INSERT INTO platform_settings (setting_key, value_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
  `).run(KEY, JSON.stringify(obj));
}

export function readSre2ConfigAdmin(db) {
  const j = readSre2Json(db);
  return {
    weekly_autoticket_burn_threshold: Math.min(10, Math.max(0.5, Number(j.weekly_autoticket_burn_threshold) || 1.15)),
    notes: String(j.notes || "").slice(0, 4000),
    updated_at: j.updated_at != null ? String(j.updated_at).slice(0, 40) : null,
  };
}

export function mergeSre2ConfigPatch(db, body) {
  const prev = readSre2Json(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    const t = Number(body.weekly_autoticket_burn_threshold);
    if (Number.isFinite(t)) next.weekly_autoticket_burn_threshold = Math.min(10, Math.max(0.5, t));
    if (body.notes != null) next.notes = String(body.notes).slice(0, 4000);
  }
  writeSre2Json(db, next);
  return readSre2ConfigAdmin(db);
}

export function isoWeekStartUtcString(d = new Date()) {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return mon.toISOString().slice(0, 10);
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 */
export function recordWeeklySreReport(db, env) {
  const weekStart = isoWeekStartUtcString();
  const snap = computeSreSnapshot(db, env);
  const payload = JSON.stringify({ snapshot: snap, recorded_at: new Date().toISOString() }).slice(0, 48_000);
  db.prepare(
    `INSERT INTO p2p_sre_weekly_reports (week_start, snapshot_json, created_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(week_start) DO UPDATE SET snapshot_json = excluded.snapshot_json, created_at = CURRENT_TIMESTAMP`,
  ).run(weekStart, payload);
  const cfg = readSre2ConfigAdmin(db);
  let autoticket = null;
  if (snap.burn_ratio_vs_monthly_budget >= cfg.weekly_autoticket_burn_threshold) {
    const title = `sre2.burn_elevated:${weekStart}`;
    const exists = db
      .prepare(`SELECT id FROM p2p_ops_auto_tickets WHERE source = 'sre2' AND title = ? AND status = 'open'`)
      .get(title);
    if (!exists) {
      const ins = db
        .prepare(
          `INSERT INTO p2p_ops_auto_tickets (source, title, payload_json, status, external_tracker_hint, created_at)
           VALUES ('sre2', ?, ?, 'open', '', CURRENT_TIMESTAMP)`,
        )
        .run(title, JSON.stringify({ week_start: weekStart, burn_ratio: snap.burn_ratio_vs_monthly_budget }).slice(0, 12_000));
      autoticket = db.prepare(`SELECT * FROM p2p_ops_auto_tickets WHERE id = ?`).get(Number(ins.lastInsertRowid));
    }
  }
  return { week_start: weekStart, snapshot: snap, autoticket_created: Boolean(autoticket), autoticket };
}

export function listWeeklySreReports(db, limit = 12) {
  const lim = Math.min(52, Math.max(1, Number(limit) || 12));
  return db.prepare(`SELECT * FROM p2p_sre_weekly_reports ORDER BY week_start DESC LIMIT ?`).all(lim);
}

export function listOpsAutoTickets(db, q = {}) {
  const lim = Math.min(200, Math.max(1, Number(q.limit) || 60));
  const st = String(q.status || "").trim().toLowerCase();
  if (st) {
    return db.prepare(`SELECT * FROM p2p_ops_auto_tickets WHERE status = ? ORDER BY id DESC LIMIT ?`).all(st, lim);
  }
  return db.prepare(`SELECT * FROM p2p_ops_auto_tickets ORDER BY id DESC LIMIT ?`).all(lim);
}

export function patchOpsAutoTicket(db, id, body) {
  const rid = Math.floor(Number(id) || 0);
  if (rid <= 0) return null;
  const row = db.prepare(`SELECT * FROM p2p_ops_auto_tickets WHERE id = ?`).get(rid);
  if (!row) return null;
  const status = String(body?.status || "").trim().toLowerCase();
  const allowed = new Set(["open", "ack", "closed"]);
  if (!allowed.has(status)) throw new Error("INVALID_STATUS");
  const hint = String(body?.external_tracker_hint ?? row.external_tracker_hint).slice(0, 500);
  db.prepare(
    `UPDATE p2p_ops_auto_tickets SET status = ?, external_tracker_hint = ? WHERE id = ?`,
  ).run(status, hint, rid);
  return db.prepare(`SELECT * FROM p2p_ops_auto_tickets WHERE id = ?`).get(rid);
}

export function getSre2PublicHints(db) {
  const c = readSre2ConfigAdmin(db);
  const last = db.prepare(`SELECT week_start, created_at FROM p2p_sre_weekly_reports ORDER BY week_start DESC LIMIT 1`).get();
  return {
    last_report_week_start: last?.week_start ?? null,
    last_report_at: last?.created_at ?? null,
    autoticket_burn_threshold: c.weekly_autoticket_burn_threshold,
    hints: ["주간 리포트는 관리자 워커 또는 POST .../sre2-weekly-report/run — 외부 이슈 트래커는 external_tracker_hint 로 링크."],
  };
}
