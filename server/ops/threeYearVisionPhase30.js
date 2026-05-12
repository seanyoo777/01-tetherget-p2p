/**
 * Phase 30: 다음 3년 비전 — 로드맵·글로벌·팀 확충 메타(공개 요약은 고수준만).
 */

const KEY = "p2p.three_year_vision";

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

function asStringArray(v, max = 24) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim().slice(0, 240)).filter(Boolean).slice(0, max);
}

export function readThreeYearVisionAdmin(db) {
  const j = readJson(db);
  return {
    headline: String(j.headline || "P2P 글로벌 표준 결제·정산 허브").trim().slice(0, 300),
    pillars: asStringArray(j.pillars, 12),
    y1_highlights: asStringArray(j.y1_highlights, 16),
    y2_highlights: asStringArray(j.y2_highlights, 16),
    y3_highlights: asStringArray(j.y3_highlights, 16),
    global_expansion_targets: asStringArray(j.global_expansion_targets, 16),
    team_scaling_plan_ref: String(j.team_scaling_plan_ref || "").trim().slice(0, 500) || null,
    feature_roadmap_wiki_url: String(j.feature_roadmap_wiki_url || "").trim().slice(0, 500) || null,
    public_summary_md_url: String(j.public_summary_md_url || "").trim().slice(0, 500) || null,
    notes: String(j.notes || "").slice(0, 12_000),
    updated_at: j.updated_at != null ? String(j.updated_at).slice(0, 40) : null,
  };
}

export function mergeThreeYearVisionPatch(db, body) {
  const prev = readJson(db);
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    if (body.headline != null) next.headline = String(body.headline).slice(0, 300);
    if (body.pillars != null) next.pillars = asStringArray(body.pillars, 12);
    if (body.y1_highlights != null) next.y1_highlights = asStringArray(body.y1_highlights, 16);
    if (body.y2_highlights != null) next.y2_highlights = asStringArray(body.y2_highlights, 16);
    if (body.y3_highlights != null) next.y3_highlights = asStringArray(body.y3_highlights, 16);
    if (body.global_expansion_targets != null) next.global_expansion_targets = asStringArray(body.global_expansion_targets, 16);
    if (body.team_scaling_plan_ref != null) next.team_scaling_plan_ref = String(body.team_scaling_plan_ref).slice(0, 500);
    if (body.feature_roadmap_wiki_url != null) next.feature_roadmap_wiki_url = String(body.feature_roadmap_wiki_url).slice(0, 500);
    if (body.public_summary_md_url != null) next.public_summary_md_url = String(body.public_summary_md_url).slice(0, 500);
    if (body.notes != null) next.notes = String(body.notes).slice(0, 12_000);
  }
  writeJson(db, next);
  return readThreeYearVisionAdmin(db);
}

export function getThreeYearVisionPublicSummary(db) {
  const v = readThreeYearVisionAdmin(db);
  return {
    headline: v.headline,
    pillars: (v.pillars || []).slice(0, 6),
    global_expansion_targets: (v.global_expansion_targets || []).slice(0, 8),
    public_summary_md_url: v.public_summary_md_url,
    hints: ["연도별 상세는 내부 위키·투자자 자료와 동기화."],
  };
}
