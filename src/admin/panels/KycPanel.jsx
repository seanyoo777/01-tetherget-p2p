import React from "react";

/** `kyc` 탭 본문 — `AdminSectionBoundary`는 `App.jsx`에서 유지. */
export function KycPanel(props) {
  const {
    theme,
    visible,
    buyerKyc,
    setBuyerKyc,
    apiClient,
    currentAdminActorId,
    appendAdminAction,
    notify,
    Box,
    formatNumber,
    kycDocs,
    kycViewReason,
    setKycViewReason,
    loadKycDocuments,
    createKycViewRequest,
    loadKycViewRequests,
    viewKycDocument,
    verifyKycAccessLogs,
    selectedKycDocId,
    kycRejectReason,
    setKycRejectReason,
    selectedKycRequestId,
    setSelectedKycRequestId,
    kycViewRequests,
    approveKycViewRequest,
    rejectKycViewRequest,
    kycDocPreview,
    kycWatermarkText,
    kycLogVerifyResult,
    kycDocLogs,
  } = props;

  return (
    <div className={`${visible ? "" : "hidden "}mt-5 rounded-3xl border p-5 ${theme.card}`}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xl font-black">회사 KYC 승인 센터</div>
          <div className={`text-sm ${theme.subtext}`}>KYC는 회사만 승인하며, 문서는 분쟁 대응 목적으로 비공개 보관됩니다.</div>
        </div>
        <span className="rounded-full bg-violet-600 px-3 py-1 text-xs font-black text-white">{buyerKyc.companyApprovalStatus}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Box label="실명" value={buyerKyc.realName || "미입력"} theme={theme} />
        <Box label="서류 제출 여부" value={buyerKyc.idImageUploaded && buyerKyc.bankAccountUploaded ? "제출됨" : "미제출"} theme={theme} />
      </div>
      <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-6">
        KYC 문서는 회사 내부 보관 정책에 따라 접근 통제되며, 법적 분쟁/수사 협조를 제외하고 누구에게도 공개되지 않습니다.
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={async () => {
            try {
              const data = await apiClient.request(`/api/admin/kyc/${buyerKyc.userId || currentAdminActorId}/review`, {
                method: "POST",
                auth: true,
                body: JSON.stringify({ approve: true }),
              });
              if (data?.profile) setBuyerKyc(data.profile);
              appendAdminAction?.("KYC 회사 승인 처리");
              notify("회사 KYC 승인 완료");
            } catch (error) {
              notify(error.message || "KYC 승인 처리에 실패했습니다.");
            }
          }}
          className={`rounded-2xl px-4 py-3 text-sm font-black ${theme.main}`}
        >
          회사 승인
        </button>
        <button
          onClick={async () => {
            try {
              const data = await apiClient.request(`/api/admin/kyc/${buyerKyc.userId || currentAdminActorId}/review`, {
                method: "POST",
                auth: true,
                body: JSON.stringify({ approve: false }),
              });
              if (data?.profile) setBuyerKyc(data.profile);
              appendAdminAction?.("KYC 회사 반려 처리");
              notify("KYC 반려 처리 완료");
            } catch (error) {
              notify(error.message || "KYC 반려 처리에 실패했습니다.");
            }
          }}
          className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white"
        >
          반려
        </button>
      </div>
      <div className="mt-3 rounded-2xl border p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-black">KYC 문서 열람 (사유 필수)</div>
          <button onClick={loadKycDocuments} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
            문서 목록 새로고침
          </button>
        </div>
        <input
          value={kycViewReason}
          onChange={(e) => setKycViewReason(e.target.value)}
          placeholder="열람 사유 입력 (5자 이상)"
          className={`w-full rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
        />
        <div className="mt-2 space-y-2">
          {kycDocs.length ? (
            kycDocs.map((doc) => (
              <div key={doc.id} className={`rounded-xl border p-2 text-xs ${theme.input}`}>
                <div className="font-black">{doc.file_name}</div>
                <div className={theme.muted}>{doc.doc_type} · {doc.mime_type} · {formatNumber((doc.size_bytes || 0) / 1024)}KB</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <button
                    onClick={() => createKycViewRequest(doc.id)}
                    className={`rounded-lg border px-2 py-1 text-xs font-black ${theme.input}`}
                  >
                    열람요청 생성
                  </button>
                  <button
                    onClick={() => loadKycViewRequests(doc.id)}
                    className={`rounded-lg border px-2 py-1 text-xs font-black ${theme.input}`}
                  >
                    요청목록 조회
                  </button>
                  <button
                    onClick={() => viewKycDocument(doc.id, doc.mime_type)}
                    className={`rounded-lg border px-2 py-1 text-xs font-black ${theme.input}`}
                  >
                    사유 입력 후 열람
                  </button>
                  <button
                    onClick={() => verifyKycAccessLogs(doc.id)}
                    className={`rounded-lg border px-2 py-1 text-xs font-black ${theme.input}`}
                  >
                    로그 무결성 검증
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>등록된 KYC 문서가 없습니다.</div>
          )}
        </div>
        {!!selectedKycDocId && (
          <div className="mt-3 rounded-xl border p-3 text-xs">
            <div className="mb-2 font-black">열람 요청 승인 워크플로우 (2인 승인)</div>
            <input
              value={kycRejectReason}
              onChange={(e) => setKycRejectReason(e.target.value)}
              placeholder="반려 사유 입력 (5자 이상)"
              className={`mb-2 w-full rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
            />
            <select
              value={selectedKycRequestId}
              onChange={(e) => setSelectedKycRequestId(e.target.value)}
              className={`w-full rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
            >
              <option value="">열람 요청 선택</option>
              {kycViewRequests.map((reqItem) => (
                <option key={reqItem.id} value={reqItem.id}>
                  #{reqItem.id} · {reqItem.status} · approvals {reqItem.approvals?.length || 0}/2
                </option>
              ))}
            </select>
            <div className="mt-2 max-h-36 space-y-1 overflow-y-auto pr-1">
              {kycViewRequests.length ? (
                kycViewRequests.map((reqItem) => (
                  <div key={reqItem.id} className={`rounded-lg border p-2 text-[11px] ${theme.input}`}>
                    <div>
                      요청 #{reqItem.id} · {reqItem.status} · 승인 {(reqItem.approvals || []).length}/2
                    </div>
                    <div className={theme.muted}>{reqItem.reason}</div>
                    {!!reqItem.rejected_reason && (
                      <div className="text-red-400">
                        반려사유: {reqItem.rejected_reason} (by {reqItem.rejected_by_user_id || "-"} · {reqItem.rejected_at || "-"})
                      </div>
                    )}
                    <div className={theme.muted}>요청자 {reqItem.requester_user_id} · {reqItem.created_at}</div>
                    <div className="mt-1 flex gap-1">
                      <button
                        onClick={() => approveKycViewRequest(reqItem.id, Number(selectedKycDocId))}
                        className={`rounded-lg border px-2 py-1 text-xs font-black ${theme.input}`}
                      >
                        이 요청 승인
                      </button>
                      <button
                        onClick={() => rejectKycViewRequest(reqItem.id, Number(selectedKycDocId))}
                        className="rounded-lg border border-red-500/60 px-2 py-1 text-xs font-black text-red-400"
                      >
                        이 요청 반려
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className={`rounded-lg border p-2 text-[11px] ${theme.input}`}>조회된 열람 요청이 없습니다.</div>
              )}
            </div>
          </div>
        )}
        {kycDocPreview && (
          <div className="mt-3 rounded-xl border p-3 text-xs">
            <div className="font-black">문서 미리보기</div>
            <div
              className="relative mt-2 overflow-hidden rounded-lg border"
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
              onCopy={(e) => e.preventDefault()}
              style={{ userSelect: "none", WebkitUserSelect: "none" }}
            >
              {kycDocPreview.startsWith("data:image/") ? (
                <img src={kycDocPreview} alt="kyc-preview" className="max-h-56 w-full object-contain" />
              ) : (
                <pre className="whitespace-pre-wrap p-2">{kycDocPreview}</pre>
              )}
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-transparent p-2 text-[10px] font-black tracking-wider text-red-500/30">
                {kycWatermarkText || "CONFIDENTIAL"}
              </div>
            </div>
            <div className={`mt-1 text-[11px] ${theme.muted}`}>
              보안뷰어 모드: 다운로드/우클릭/드래그/복사 제한 + 워터마크 적용
            </div>
          </div>
        )}
        {!!kycLogVerifyResult && (
          <div className={`mt-2 rounded-lg border p-2 text-[11px] ${theme.input}`}>{kycLogVerifyResult}</div>
        )}
        <div className="mt-3">
          <div className="text-xs font-black">문서 열람 로그</div>
          <div className="mt-1 max-h-28 space-y-1 overflow-y-auto pr-1">
            {kycDocLogs.length ? (
              kycDocLogs.map((log) => (
                <div key={log.id} className={`rounded-lg border p-2 text-[11px] ${theme.input}`}>
                  actor {log.actor_user_id} · {log.created_at}
                  <div className={theme.muted}>{log.reason}</div>
                </div>
              ))
            ) : (
              <div className={`rounded-lg border p-2 text-[11px] ${theme.input}`}>아직 열람 로그가 없습니다.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
