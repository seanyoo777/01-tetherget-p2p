import React from "react";

/** `dispute` 탭 본문 — `AdminSectionBoundary`는 `App.jsx`에서 유지. */
export function DisputePanel(props) {
  const {
    theme,
    visible,
    Field,
    escrowPolicy,
    setEscrowPolicy,
    authUsers,
    isSuperAdmin,
    notify,
    apiClient,
    appendAdminAction,
    newPolicyPinInput,
    setNewPolicyPinInput,
    finalApprovalPinInput,
    setFinalApprovalPinInput,
    finalApprovalOtpInput,
    setFinalApprovalOtpInput,
    disputeCases,
    formatNumber,
    approveDisputeCase,
    currentAdminActorId,
    loadDisputeEvents,
    finalizeDisputeByMain,
    selectedDisputeIdForTimeline,
    timelineActionFilter,
    setTimelineActionFilter,
    timelineFromDate,
    setTimelineFromDate,
    timelineToDate,
    setTimelineToDate,
    filteredTimelineEvents,
    actorNameMap,
    timelineVerifyResult,
    exportTimelineCsv,
    verifyTimelineIntegrity,
  } = props;

  return (
    <div className={`${visible ? "" : "hidden "}mt-5 rounded-3xl border p-5 ${theme.card}`}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xl font-black">분쟁 다중승인 / 메인 관리자 보관계좌 정책</div>
          <div className={`text-sm ${theme.subtext}`}>분쟁 시 지정 승인자 3~5인 결재가 모여야 반환 처리됩니다.</div>
        </div>
        <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-black text-white">고신뢰 정책</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="회사 지정 보관 계좌" theme={theme}>
          <input
            value={escrowPolicy.mainCustodyAccount}
            onChange={(e) => setEscrowPolicy((prev) => ({ ...prev, mainCustodyAccount: e.target.value }))}
            className={`rounded-2xl border px-4 py-3 font-bold outline-none ${theme.input}`}
          />
        </Field>
        <Field label="필요 승인 인원(3~5)" theme={theme}>
          <select
            value={escrowPolicy.requiredApprovals}
            onChange={(e) => setEscrowPolicy((prev) => ({ ...prev, requiredApprovals: Number(e.target.value) }))}
            className={`rounded-2xl border px-4 py-3 font-bold outline-none ${theme.input}`}
          >
            <option value={3}>3인 승인</option>
            <option value={4}>4인 승인</option>
            <option value={5}>5인 승인</option>
          </select>
        </Field>
        <Field label="최종 승인 메인 관리자 ID (1인 고정)" theme={theme}>
          <select
            value={escrowPolicy.mainFinalApproverId}
            onChange={(e) => setEscrowPolicy((prev) => ({ ...prev, mainFinalApproverId: e.target.value }))}
            className={`rounded-2xl border px-4 py-3 font-bold outline-none ${theme.input}`}
          >
            {authUsers.filter((u) => u.role.includes("관리자")).map((user) => (
              <option key={user.id} value={user.id}>
                {user.nickname} ({user.id})
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-3 rounded-2xl border p-3">
        <div className="text-sm font-black">레벨별 구매 지연시간(시간)</div>
        <div className="mt-2 grid gap-2 md:grid-cols-5">
          {["Lv1", "Lv2", "Lv3", "Lv4", "Lv5"].map((levelKey) => (
            <label key={levelKey} className={`rounded-xl border px-3 py-2 text-xs ${theme.input}`}>
              <div className="font-black">{levelKey}</div>
              <input
                type="number"
                min={0}
                max={168}
                value={escrowPolicy?.levelDelayHours?.[levelKey] ?? 0}
                onChange={(e) =>
                  setEscrowPolicy((prev) => ({
                    ...prev,
                    levelDelayHours: {
                      ...(prev.levelDelayHours || {}),
                      [levelKey]: Math.max(0, Number(e.target.value || 0)),
                    },
                  }))
                }
                className={`mt-1 w-full rounded-lg border px-2 py-1 text-xs font-bold outline-none ${theme.input}`}
              />
            </label>
          ))}
        </div>
        <div className={`mt-2 text-xs ${theme.muted}`}>0 입력 시 즉시 처리로 표시됩니다.</div>
      </div>
      <div className="mt-3 rounded-2xl border p-3">
        <div className="text-sm font-black">지정 승인자 선택</div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {authUsers.filter((u) => u.role.includes("관리자")).map((user) => (
            <label key={user.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${theme.input}`}>
              <input
                type="checkbox"
                checked={escrowPolicy.approverIds.includes(user.id)}
                onChange={(e) => {
                  if (!isSuperAdmin) {
                    notify("슈퍼관리자만 승인자를 지정할 수 있습니다.");
                    return;
                  }
                  setEscrowPolicy((prev) => ({
                    ...prev,
                    approverIds: e.target.checked
                      ? [...prev.approverIds, user.id]
                      : prev.approverIds.filter((id) => id !== user.id),
                  }));
                }}
              />
              <span className="font-black">{user.nickname}</span>
              <span className={theme.muted}>({user.id})</span>
            </label>
          ))}
        </div>
      </div>
      <button
        onClick={async () => {
          try {
            const data = await apiClient.request("/api/admin/escrow-policy", {
              method: "PUT",
              auth: true,
              body: JSON.stringify(escrowPolicy),
            });
            if (data?.policy) setEscrowPolicy(data.policy);
            appendAdminAction?.("보관계좌/분쟁승인 정책 저장");
            notify("분쟁 다중승인 정책이 저장되었습니다.");
          } catch (error) {
            notify(error.message || "정책 저장에 실패했습니다.");
          }
        }}
        className={`mt-3 rounded-2xl px-4 py-3 text-sm font-black ${theme.main}`}
      >
        정책 저장
      </button>
      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
        <input
          value={newPolicyPinInput}
          onChange={(e) => setNewPolicyPinInput(e.target.value)}
          placeholder="최종승인 PIN 변경 (숫자 6~10자리)"
          className={`rounded-2xl border px-4 py-3 text-sm font-bold outline-none ${theme.input}`}
        />
        <button
          onClick={async () => {
            try {
              await apiClient.request("/api/admin/escrow-policy/pin", {
                method: "PUT",
                auth: true,
                body: JSON.stringify({ pin: newPolicyPinInput }),
              });
              appendAdminAction?.("최종승인 PIN 변경");
              setNewPolicyPinInput("");
              notify("최종승인 PIN이 업데이트되었습니다.");
            } catch (error) {
              notify(error.message || "PIN 변경에 실패했습니다.");
            }
          }}
          className={`rounded-2xl px-4 py-3 text-sm font-black ${theme.main}`}
        >
          PIN 저장
        </button>
      </div>
      <input
        value={finalApprovalPinInput}
        onChange={(e) => setFinalApprovalPinInput(e.target.value)}
        placeholder="메인 관리자 최종승인 PIN 입력"
        className={`mt-3 w-full rounded-2xl border px-4 py-3 text-sm font-bold outline-none ${theme.input}`}
      />
      <input
        value={finalApprovalOtpInput}
        onChange={(e) => setFinalApprovalOtpInput(e.target.value)}
        placeholder="메인 관리자 최종승인 OTP 입력"
        className={`mt-2 w-full rounded-2xl border px-4 py-3 text-sm font-bold outline-none ${theme.input}`}
      />
      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
        {disputeCases.length ? (
          disputeCases.map((item) => (
            <div key={item.id} className={`rounded-2xl border p-3 text-sm ${theme.input}`}>
              <div className="flex items-center justify-between">
                <div className="font-black">{item.id} · {item.orderSeller}</div>
                <span className={`rounded-full px-2 py-1 text-xs font-black ${item.status === "반환완료" ? "bg-emerald-600 text-white" : "bg-amber-500 text-white"}`}>
                  {item.status}
                </span>
              </div>
              <div className={`mt-1 text-xs ${theme.muted}`}>{item.coin} {formatNumber(item.amount)} · 입금자 {item.senderName} · 계좌 {item.senderAccount}</div>
              <div className={`mt-1 text-xs ${theme.muted}`}>승인 {item.approvals.length} / {escrowPolicy.requiredApprovals} · 최종승인자 {escrowPolicy.mainFinalApproverId}</div>
              {item.releaseMessage && <div className="mt-1 text-xs font-black text-emerald-500">{item.releaseMessage}</div>}
              <button
                onClick={() => approveDisputeCase(item.id, currentAdminActorId)}
                disabled={!escrowPolicy.approverIds.includes(currentAdminActorId) || item.status === "반환완료" || item.status === "최종승인대기"}
                className={`mt-2 rounded-xl px-3 py-2 text-xs font-black ${item.status === "반환완료" ? "bg-slate-500 text-white" : theme.main}`}
              >
                내가 승인하기
              </button>
              <button
                onClick={() => loadDisputeEvents(item.id)}
                className={`mt-2 ml-2 rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
              >
                이벤트 타임라인
              </button>
              <button
                onClick={async () => {
                  try {
                    await apiClient.request(`/api/admin/disputes/${item.id}/request-otp`, {
                      method: "POST",
                      auth: true,
                      body: JSON.stringify({}),
                    });
                    notify("OTP 발급 완료 (5분 유효). 등록된 관리자 보안 채널로 전송되었습니다.");
                  } catch (error) {
                    notify(error.message || "OTP 발급에 실패했습니다.");
                  }
                }}
                disabled={item.status !== "최종승인대기" || currentAdminActorId !== escrowPolicy.mainFinalApproverId}
                className={`mt-2 ml-2 rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}
              >
                OTP 발급
              </button>
              <button
                onClick={() => finalizeDisputeByMain(item.id, currentAdminActorId, finalApprovalPinInput, finalApprovalOtpInput)}
                disabled={item.status !== "최종승인대기" || currentAdminActorId !== escrowPolicy.mainFinalApproverId}
                className={`mt-2 ml-2 rounded-xl px-3 py-2 text-xs font-black ${item.status === "최종승인대기" ? "bg-red-600 text-white" : "bg-slate-500 text-white"}`}
              >
                메인 관리자 최종승인
              </button>
            </div>
          ))
        ) : (
          <div className={`rounded-2xl border p-3 text-sm ${theme.input}`}>접수된 분쟁이 없습니다.</div>
        )}
      </div>
      <div className="mt-3 rounded-2xl border p-3">
        <div className="text-sm font-black">분쟁 이벤트 타임라인 {selectedDisputeIdForTimeline ? `(${selectedDisputeIdForTimeline})` : ""}</div>
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <select value={timelineActionFilter} onChange={(e) => setTimelineActionFilter(e.target.value)} className={`rounded-xl border px-3 py-2 text-xs font-black outline-none ${theme.input}`}>
            <option>전체</option>
            <option>분쟁접수</option>
            <option>다중승인</option>
            <option>OTP발급</option>
            <option>최종승인</option>
          </select>
          <input type="date" value={timelineFromDate} onChange={(e) => setTimelineFromDate(e.target.value)} className={`rounded-xl border px-3 py-2 text-xs font-black outline-none ${theme.input}`} />
          <input type="date" value={timelineToDate} onChange={(e) => setTimelineToDate(e.target.value)} className={`rounded-xl border px-3 py-2 text-xs font-black outline-none ${theme.input}`} />
        </div>
        <div className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
          {filteredTimelineEvents.length ? (
            filteredTimelineEvents.map((event) => (
              <div key={event.id} className={`rounded-xl border p-2 text-xs ${theme.input}`}>
                <div className="font-black">{event.action}</div>
                <div className={theme.muted}>actor: {actorNameMap[event.actor_user_id] || event.actor_user_id} · {event.created_at}</div>
                <div className={theme.muted}>{event.detail}</div>
              </div>
            ))
          ) : (
            <div className={`rounded-xl border p-2 text-xs ${theme.input}`}>조회된 이벤트가 없습니다. 분쟁 카드에서 `이벤트 타임라인`을 누르세요.</div>
          )}
        </div>
        <button onClick={exportTimelineCsv} className={`mt-2 rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
          타임라인 CSV 내보내기
        </button>
        <button onClick={verifyTimelineIntegrity} className={`mt-2 ml-2 rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
          타임라인 무결성 검증
        </button>
        {timelineVerifyResult && <div className={`mt-2 text-xs font-black ${theme.muted}`}>{timelineVerifyResult}</div>}
      </div>
    </div>
  );
}
