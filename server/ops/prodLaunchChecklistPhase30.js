/**
 * Phase 30: 플랫폼 1.0 완전 상용화 — 론칭 체크리스트(JSON).
 */

const KEY = "p2p.prod_launch_checklist";

export const DEFAULT_PROD_LAUNCH_CHECKLIST = {
  sections: [
    {
      id: "stability",
      title: "최종 안정성",
      items: [
        { id: "slo_contract", label: "SLO·에러버짓 대외 계약 정합", done: false },
        { id: "load_test", label: "피크 부하·롤백 드릴 통과", done: false },
        { id: "data_reconciliation", label: "정산·대사 파이프라인 서명오프", done: false },
      ],
    },
    {
      id: "security",
      title: "보안·컴플라이언스",
      items: [
        { id: "pentest_closed", label: "침투 테스트 크리티컬 클로즈", done: false },
        { id: "secrets_rotation", label: "프로덕션 시크릿·키 로테이션 계획 이행", done: false },
        { id: "dpa_signed", label: "DPA·하위처리자 목록 최신화", done: false },
      ],
    },
    {
      id: "ops",
      title: "운영",
      items: [
        { id: "oncall_runbook", label: "온콜·런북·에스컬레이션 경로 검증", done: false },
        { id: "statuspage", label: "Statuspage·고객 커뮤 채널 준비", done: false },
        { id: "backup_restore", label: "백업·스냅샷 복구 리허설", done: false },
      ],
    },
  ],
  launch_gate_cleared: false,
  notes: "",
};

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

function mergeWithDefaults(j) {
  const base = structuredClone(DEFAULT_PROD_LAUNCH_CHECKLIST);
  if (j && typeof j === "object") {
    if (Array.isArray(j.sections) && j.sections.length) base.sections = j.sections;
    if (typeof j.launch_gate_cleared === "boolean") base.launch_gate_cleared = j.launch_gate_cleared;
    if (j.notes != null) base.notes = String(j.notes).slice(0, 12_000);
    if (j.updated_at != null) base.updated_at = String(j.updated_at).slice(0, 40);
  }
  return base;
}

export function readProdLaunchChecklistAdmin(db) {
  return mergeWithDefaults(readJson(db));
}

export function mergeProdLaunchChecklistPatch(db, body) {
  const prev = mergeWithDefaults(readJson(db));
  const next = { ...prev, updated_at: new Date().toISOString() };
  if (body && typeof body === "object") {
    if (Array.isArray(body.sections)) next.sections = body.sections;
    if (typeof body.launch_gate_cleared === "boolean") next.launch_gate_cleared = body.launch_gate_cleared;
    if (body.notes != null) next.notes = String(body.notes).slice(0, 12_000);
  }
  writeJson(db, next);
  return readProdLaunchChecklistAdmin(db);
}

export function computeLaunchChecklistStats(db) {
  const c = readProdLaunchChecklistAdmin(db);
  let total = 0;
  let done = 0;
  for (const sec of c.sections || []) {
    for (const it of sec.items || []) {
      total += 1;
      if (it.done === true) done += 1;
    }
  }
  const pct = total > 0 ? Math.round((done / total) * 1000) / 10 : 0;
  return { total_items: total, done_items: done, readiness_pct: pct, launch_gate_cleared: Boolean(c.launch_gate_cleared) };
}

export function getProdLaunchPublicHints(db) {
  const s = computeLaunchChecklistStats(db);
  return {
    ...s,
    hints: [
      "세부 항목은 내부 위키·감사 로그로만 공유 — 공개 API에는 집계만 노출.",
      "launch_gate_cleared 는 경영·SRE 공동 서명 후 true 권장.",
    ],
  };
}
