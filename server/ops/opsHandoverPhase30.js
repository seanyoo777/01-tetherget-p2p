/**
 * Phase 30: 운영 핸드오버 — 문서 인덱스 + 마일스톤 테이블.
 */

const KEY = "p2p.handover_document_index";

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

const DEFAULT_INDEX = {
  doc_sections: [
    { id: "runbooks", title: "런북·온콜", doc_url: "", owner_role: "hq_ops", last_verified_at: null },
    { id: "billing", title: "청구·정산", doc_url: "", owner_role: "billing_read", last_verified_at: null },
    { id: "security", title: "보안·감사", doc_url: "", owner_role: "hq_ops", last_verified_at: null },
    { id: "customer", title: "고객 지원·SLA", doc_url: "", owner_role: "sales", last_verified_at: null },
  ],
  runbook_root_url: "",
  primary_escalation_path_ref: "",
  stakeholder_raci_wiki_url: "",
  notes: "",
};

export function readHandoverDocumentIndexAdmin(db) {
  const j = readJson(db);
  const base = structuredClone(DEFAULT_INDEX);
  if (j && typeof j === "object") {
    if (Array.isArray(j.doc_sections) && j.doc_sections.length) base.doc_sections = j.doc_sections;
    if (j.runbook_root_url != null) base.runbook_root_url = String(j.runbook_root_url).slice(0, 500);
    if (j.primary_escalation_path_ref != null) base.primary_escalation_path_ref = String(j.primary_escalation_path_ref).slice(0, 500);
    if (j.stakeholder_raci_wiki_url != null) base.stakeholder_raci_wiki_url = String(j.stakeholder_raci_wiki_url).slice(0, 500);
    if (j.notes != null) base.notes = String(j.notes).slice(0, 12_000);
    if (j.updated_at != null) base.updated_at = String(j.updated_at).slice(0, 40);
  }
  return base;
}

export function mergeHandoverDocumentIndexPatch(db, body) {
  const prev = readHandoverDocumentIndexAdmin(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    if (Array.isArray(body.doc_sections)) next.doc_sections = body.doc_sections;
    if (body.runbook_root_url != null) next.runbook_root_url = String(body.runbook_root_url).slice(0, 500);
    if (body.primary_escalation_path_ref != null) next.primary_escalation_path_ref = String(body.primary_escalation_path_ref).slice(0, 500);
    if (body.stakeholder_raci_wiki_url != null) next.stakeholder_raci_wiki_url = String(body.stakeholder_raci_wiki_url).slice(0, 500);
    if (body.notes != null) next.notes = String(body.notes).slice(0, 12_000);
  }
  writeJson(db, next);
  return readHandoverDocumentIndexAdmin(db);
}

export function getHandoverPublicHints(db) {
  const idx = readHandoverDocumentIndexAdmin(db);
  return {
    section_count: (idx.doc_sections || []).length,
    runbook_root_configured: Boolean(String(idx.runbook_root_url || "").trim()),
    hints: ["PII·내부 연락처는 문서 URL에 포함하지 말고 SSO 위키만 링크."],
  };
}

export function listHandoverMilestones(db, limit = 50) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));
  return db.prepare(`SELECT * FROM p2p_handover_milestones ORDER BY id DESC LIMIT ?`).all(lim);
}

export function upsertHandoverMilestone(db, { milestoneKey, status, detail, completedByUserId }) {
  const key = String(milestoneKey || "").trim().slice(0, 120);
  if (!key) throw new Error("INVALID_KEY");
  const st = String(status || "done").trim().toLowerCase();
  if (!["pending", "done", "skipped"].includes(st)) throw new Error("INVALID_STATUS");
  const det = String(detail || "").slice(0, 2000);
  const uid = completedByUserId != null ? Math.floor(Number(completedByUserId)) : null;
  db.prepare(
    `INSERT INTO p2p_handover_milestones (milestone_key, status, detail, completed_at, completed_by_user_id)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
     ON CONFLICT(milestone_key) DO UPDATE SET
       status = excluded.status,
       detail = excluded.detail,
       completed_at = CURRENT_TIMESTAMP,
       completed_by_user_id = excluded.completed_by_user_id`,
  ).run(key, st, det, uid && uid > 0 ? uid : null);
  return db.prepare(`SELECT * FROM p2p_handover_milestones WHERE milestone_key = ?`).get(key);
}

export function computeHandoverMilestoneStats(db) {
  const total = db.prepare(`SELECT COUNT(*) as c FROM p2p_handover_milestones`).get();
  const done = db.prepare(`SELECT COUNT(*) as c FROM p2p_handover_milestones WHERE status = 'done'`).get();
  return {
    milestone_rows: Math.floor(Number(total?.c) || 0),
    milestones_done: Math.floor(Number(done?.c) || 0),
  };
}
