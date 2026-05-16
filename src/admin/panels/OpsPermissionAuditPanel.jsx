import React from "react";

/** `ops` tab — **권한 감사 리포트** card (inside `admin-tab-ops`, boundary in `App.jsx`). */
export function OpsPermissionAuditPanel(props) {
  const {
    theme,
    visible,
    auditFromDate,
    setAuditFromDate,
    auditToDate,
    setAuditToDate,
    loadApprovalAuditReport,
    auditLoading,
    exportApprovalAuditCsv,
    exportApprovalAuditPdf,
    approvalAuditSummary,
    approvalAuditEvents,
  } = props;

  return (
    <div className={`${visible ? "" : "hidden "}mb-5 rounded-3xl border p-4 ${theme.cardSoft}`}>
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-black">권한 감사 리포트</div>
          <div className={`text-xs ${theme.muted}`}>누가 언제 무엇을 승인/반려/열람했는지 추적합니다.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={auditFromDate}
            onChange={(e) => setAuditFromDate(e.target.value)}
            className={`rounded-xl border px-2 py-2 text-xs font-black outline-none ${theme.input}`}
          />
          <input
            type="date"
            value={auditToDate}
            onChange={(e) => setAuditToDate(e.target.value)}
            className={`rounded-xl border px-2 py-2 text-xs font-black outline-none ${theme.input}`}
          />
          <button
            onClick={loadApprovalAuditReport}
            className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
          >
            {auditLoading ? "조회중..." : "리포트 조회"}
          </button>
          <button
            onClick={exportApprovalAuditCsv}
            className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
          >
            {"CSV\u0020\uB0B4\uBCF4\uB0B4\uAE30"}
          </button>
          <button
            onClick={exportApprovalAuditPdf}
            className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
          >
            PDF 출력
          </button>
        </div>
      </div>

      <div className="mb-3 grid gap-2 md:grid-cols-6">
        <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>전체 이벤트 <b>{approvalAuditSummary.totalEvents || 0}</b></div>
        <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>KYC 요청 <b>{approvalAuditSummary.kycRequestCount || 0}</b></div>
        <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>KYC 승인 <b>{approvalAuditSummary.kycApprovalCount || 0}</b></div>
        <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>KYC 반려 <b>{approvalAuditSummary.kycRejectedCount || 0}</b></div>
        <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>KYC 열람 <b>{approvalAuditSummary.kycViewCount || 0}</b></div>
        <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>분쟁 결재 <b>{approvalAuditSummary.disputeApprovalCount || 0}</b></div>
      </div>

      <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
        {approvalAuditEvents.length ? (
          approvalAuditEvents.map((event, idx) => (
            <div key={`${event.kind}-${event.target}-${idx}`} className={`rounded-xl border p-2 text-xs ${theme.input}`}>
              <div className="font-black">{event.action}</div>
              <div className={theme.muted}>
                {event.createdAt} · {event.actorName} ({event.actorUserId}) · {event.target}
              </div>
              {!!event.detail && <div className="mt-1 text-[11px]">{event.detail}</div>}
            </div>
          ))
        ) : (
          <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>조회된 감사 이벤트가 없습니다.</div>
        )}
      </div>
    </div>
  );
}
