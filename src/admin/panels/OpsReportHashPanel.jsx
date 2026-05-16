import React from "react";

/** `ops` tab — **리포트 해시 서버 기록** card (inside `admin-tab-ops`, boundary in `App.jsx`). */
export function OpsReportHashPanel(props) {
  const {
    theme,
    visible,
    loadRecentReportHashes,
    recentReportHashes,
    verifyHashType,
    setVerifyHashType,
    verifyHashInput,
    setVerifyHashInput,
    verifyReportHash,
    verifyHashResult,
  } = props;

  return (
    <div className={`${visible ? "" : "hidden "}mb-5 rounded-3xl border p-4 ${theme.cardSoft}`}>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-black">리포트 해시 서버 기록</div>
          <div className={`text-xs ${theme.muted}`}>PDF 해시를 서버에 저장해 위변조 검증 기준으로 사용합니다.</div>
        </div>
        <button onClick={loadRecentReportHashes} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
          해시 이력 새로고침
        </button>
      </div>
      <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
        {recentReportHashes.length ? (
          recentReportHashes.map((row) => (
            <div key={row.id} className={`rounded-xl border p-2 text-xs ${theme.input}`}>
              <div className="font-black">{row.report_type} · {row.created_at}</div>
              <div className={theme.muted}>
                actor {row.actor_name || row.actor_user_id} · rows {row.row_count} · {row.from_date || "all"} ~ {row.to_date || "all"}
              </div>
              <div className="mt-1 break-all text-[11px]">{row.sha256_hash}</div>
            </div>
          ))
        ) : (
          <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>저장된 리포트 해시 이력이 없습니다.</div>
        )}
      </div>
      <div className="mt-2 rounded-xl border p-2">
        <div className="mb-1 text-xs font-black">해시 대조 검증</div>
        <div className="flex flex-col gap-2 md:flex-row">
          <select
            value={verifyHashType}
            onChange={(e) => setVerifyHashType(e.target.value)}
            className={`rounded-xl border px-3 py-2 text-xs font-black outline-none ${theme.input}`}
          >
            <option value="approval_audit_pdf">PDF 리포트</option>
            <option value="approval_audit_csv">CSV 리포트</option>
            <option value="market_catalog_audit_chain">카탈로그 감사 체인</option>
          </select>
          <input
            value={verifyHashInput}
            onChange={(e) => setVerifyHashInput(e.target.value)}
            placeholder="SHA-256 해시 64자 입력"
            className={`w-full rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
          />
          <button onClick={verifyReportHash} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
            서버 대조
          </button>
        </div>
        {!!verifyHashResult && <div className={`mt-2 text-[11px] ${theme.muted}`}>{verifyHashResult}</div>}
      </div>
    </div>
  );
}
