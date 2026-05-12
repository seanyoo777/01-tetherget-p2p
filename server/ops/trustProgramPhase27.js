/**
 * Phase 27: 신뢰 프로그램 — 침투 테스트·버그 바운티·DPA 메타(PII 최소 공개).
 */

const KEY = "p2p.trust_program";

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

export function readTrustProgramAdmin(db) {
  const j = readJson(db);
  return {
    last_external_pentest_completed_at: j.last_external_pentest_completed_at != null ? String(j.last_external_pentest_completed_at).slice(0, 40) : null,
    next_pentest_planned_at: j.next_pentest_planned_at != null ? String(j.next_pentest_planned_at).slice(0, 40) : null,
    bug_bounty_program_url: String(j.bug_bounty_program_url || "").trim().slice(0, 500) || null,
    dpa_version: String(j.dpa_version || "").trim().slice(0, 64) || null,
    security_disclosure_email_domain: String(j.security_disclosure_email_domain || "").trim().slice(0, 120) || null,
    notes: String(j.notes || "").slice(0, 4000),
    updated_at: j.updated_at != null ? String(j.updated_at).slice(0, 40) : null,
  };
}

export function mergeTrustProgramPatch(db, body) {
  const prev = readJson(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    if (body.last_external_pentest_completed_at != null) {
      next.last_external_pentest_completed_at = String(body.last_external_pentest_completed_at).slice(0, 40);
    }
    if (body.next_pentest_planned_at != null) next.next_pentest_planned_at = String(body.next_pentest_planned_at).slice(0, 40);
    if (body.bug_bounty_program_url != null) next.bug_bounty_program_url = String(body.bug_bounty_program_url).slice(0, 500);
    if (body.dpa_version != null) next.dpa_version = String(body.dpa_version).slice(0, 64);
    if (body.security_disclosure_email_domain != null) next.security_disclosure_email_domain = String(body.security_disclosure_email_domain).slice(0, 120);
    if (body.notes != null) next.notes = String(body.notes).slice(0, 4000);
  }
  writeJson(db, next);
  return readTrustProgramAdmin(db);
}

export function getTrustProgramPublicHints(db) {
  const t = readTrustProgramAdmin(db);
  return {
    bug_bounty_program_url: t.bug_bounty_program_url,
    dpa_version: t.dpa_version,
    pentest_completed: Boolean(t.last_external_pentest_completed_at),
    next_pentest_planned: Boolean(t.next_pentest_planned_at),
    hints: ["보안 연락처 이메일은 공개 도메인 힌트만 제공 — 전체 주소는 보안 페이지에서 안내."],
  };
}
