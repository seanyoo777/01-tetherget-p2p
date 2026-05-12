/**
 * 신규 피드백 배치를 외부 CRM 웹훅으로 전송 (스케줄).
 */

import { feedbackRowsToCsv } from "./betaPhase16.js";

const CURSOR_KEY = "p2p.beta_feedback_crm_cursor";

function readCursor(db) {
  const row = db.prepare(`SELECT value_json FROM platform_settings WHERE setting_key = ?`).get(CURSOR_KEY);
  try {
    return row?.value_json ? JSON.parse(String(row.value_json)) : { last_id: 0 };
  } catch {
    return { last_id: 0 };
  }
}

function writeCursor(db, lastId) {
  db.prepare(`
    INSERT INTO platform_settings (setting_key, value_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
  `).run(CURSOR_KEY, JSON.stringify({ last_id: lastId, updated_at: new Date().toISOString() }));
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 */
export function startFeedbackCrmExportWorker(db, env) {
  const enabled = String(env.FEEDBACK_CRM_EXPORT_ENABLED || "0").trim() === "1";
  const url = String(env.FEEDBACK_CRM_WEBHOOK_URL || "").trim();
  if (!enabled || !url) {
    return () => {};
  }
  const pollMs = Math.max(120_000, Number(env.FEEDBACK_CRM_EXPORT_POLL_MS || 3_600_000));

  const tick = async () => {
    try {
      let { last_id: lastId } = readCursor(db);
      lastId = Number(lastId) || 0;
      if (lastId === 0) {
        const mx = db.prepare(`SELECT MAX(id) as m FROM beta_feedback`).get();
        const m = Number(mx?.m ?? 0);
        if (m > 0) {
          writeCursor(db, m);
          return;
        }
      }
      const rows = db.prepare(`SELECT * FROM beta_feedback WHERE id > ? ORDER BY id ASC LIMIT 1000`).all(lastId);
      if (!rows.length) return;
      const maxId = Math.max(...rows.map((r) => Number(r.id)));
      const csv = feedbackRowsToCsv(rows);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "beta.feedback_crm_export",
          occurredAt: new Date().toISOString(),
          since_id_exclusive: lastId,
          through_id_inclusive: maxId,
          row_count: rows.length,
          rows,
          csv,
        }),
      });
      if (res.ok) {
        writeCursor(db, maxId);
      } else {
        const t = await res.text().catch(() => "");
        console.warn("[crm-export] webhook http", res.status, t.slice(0, 200));
      }
    } catch (e) {
      console.warn("[crm-export]", e?.message || e);
    }
  };

  const t = setInterval(() => void tick(), pollMs);
  setTimeout(() => void tick(), 45_000);
  console.warn("[crm-export] enabled — FEEDBACK_CRM_WEBHOOK_URL");
  return () => clearInterval(t);
}
