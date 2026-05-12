/**
 * Phase 24: 카오스 자동화 실행 기록 + 롤백 힌트(ops 스냅샷과 연계).
 */

/**
 * @param {import("better-sqlite3").Database} db
 * @param {{ scenario: string; payload?: object; ops_snapshot_id?: number|null }} p
 */
export function createChaosRun(db, p) {
  const scenario = String(p.scenario || "generic").trim().slice(0, 64);
  const payload = JSON.stringify(p.payload && typeof p.payload === "object" ? p.payload : {}).slice(0, 4000);
  const snap = p.ops_snapshot_id != null && Number.isFinite(Number(p.ops_snapshot_id)) ? Math.floor(Number(p.ops_snapshot_id)) : null;
  const ins = db
    .prepare(
      `INSERT INTO p2p_chaos_automation_runs (scenario, status, payload_json, ops_snapshot_id, rollback_note)
       VALUES (?, 'running', ?, ?, '')`,
    )
    .run(scenario, payload, snap);
  return db.prepare(`SELECT * FROM p2p_chaos_automation_runs WHERE id = ?`).get(Number(ins.lastInsertRowid));
}

export function finishChaosRun(db, id, status = "completed") {
  const st = ["completed", "failed"].includes(String(status)) ? String(status) : "completed";
  const r = db
    .prepare(
      `UPDATE p2p_chaos_automation_runs SET status = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'running'`,
    )
    .run(st, id);
  if (!r.changes) return null;
  return db.prepare(`SELECT * FROM p2p_chaos_automation_runs WHERE id = ?`).get(id);
}

export function markChaosRollback(db, id, note) {
  const n = String(note || "").slice(0, 2000);
  db.prepare(
    `UPDATE p2p_chaos_automation_runs SET rollback_note = ?, status = CASE WHEN status = 'running' THEN 'rolled_back' ELSE status END, finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP) WHERE id = ?`,
  ).run(n, id);
  return db.prepare(`SELECT * FROM p2p_chaos_automation_runs WHERE id = ?`).get(id);
}

export function listChaosRuns(db, limit = 40) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 40));
  return db.prepare(`SELECT * FROM p2p_chaos_automation_runs ORDER BY id DESC LIMIT ?`).all(lim);
}
