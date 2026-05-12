/**
 * Phase 29: 내부 AI 운영 보조 스텁 — 티켓 메타 기반 요약(외부 LLM 없음).
 * @param {import("better-sqlite3").Database} db
 * @param {{ ops_auto_ids?: number[]; variance_ids?: number[] }} q
 */
export function buildInternalAiTicketSummary(db, q = {}) {
  const opsIds = Array.isArray(q.ops_auto_ids) ? q.ops_auto_ids.map((x) => Math.floor(Number(x))).filter((n) => n > 0) : [];
  const varIds = Array.isArray(q.variance_ids) ? q.variance_ids.map((x) => Math.floor(Number(x))).filter((n) => n > 0) : [];
  const lines = [];
  const refs = { ops_auto: [], variance: [] };

  for (const id of opsIds.slice(0, 40)) {
    const row = db.prepare(`SELECT * FROM p2p_ops_auto_tickets WHERE id = ?`).get(id);
    if (!row) {
      lines.push(`[ops_auto#${id}] 레코드 없음 — 잘못된 ID 또는 삭제됨.`);
      continue;
    }
    refs.ops_auto.push(id);
    let payload = {};
    try {
      payload = row.payload_json ? JSON.parse(String(row.payload_json)) : {};
    } catch {
      payload = {};
    }
    lines.push(
      `[ops_auto#${id}] source=${row.source} status=${row.status} — ${row.title}. 힌트: burn/카오스/런북 연계 확인; payload 키: ${Object.keys(payload).slice(0, 6).join(",") || "없음"}.`,
    );
  }

  for (const id of varIds.slice(0, 40)) {
    const row = db.prepare(`SELECT * FROM p2p_settlement_variance_tickets WHERE id = ?`).get(id);
    if (!row) {
      lines.push(`[variance#${id}] 레코드 없음.`);
      continue;
    }
    refs.variance.push(id);
    lines.push(
      `[variance#${id}] yyyymm=${row.yyyymm} flag=${row.flag_code} sev=${row.severity} status=${row.status} — 정산 대시보드 재동기화·조정 라인 검토 권장.`,
    );
  }

  if (!lines.length) {
    lines.push("요약할 티켓 ID가 없습니다. ops_auto_ids 또는 variance_ids 를 전달하세요.");
  }

  return {
    model_stub: "rules_internal_rca_v1",
    generated_at: new Date().toISOString(),
    summary_lines: lines,
    refs,
    hints: ["PII는 로그·외부 티켓으로 보내지 마세요.", "실 LLM 연동 시 동일 스키마로 교체 가능."],
  };
}
