import React from "react";

/** `ops` 탭 — **비상 점검 모드** 카드 (`admin-tab-ops` 경계 **안**, `App.jsx`에 경계 유지). */
export function OpsMaintenancePanel(props) {
  const {
    theme,
    visible,
    emergencyState,
    emergencyReasonInput,
    setEmergencyReasonInput,
    emergencyEtaInput,
    setEmergencyEtaInput,
    emergencyLoading,
    updateEmergencyMode,
    loadEmergencyState,
  } = props;

  return (
    <div className={`${visible ? "" : "hidden "}mb-5 rounded-3xl border p-4 ${theme.cardSoft}`}>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-black">비상 점검 모드 (원클릭)</div>
          <div className={`text-xs ${theme.muted}`}>활성화 시 일반 사용자 변경 요청을 차단하고 관리자 복구 작업만 허용합니다.</div>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-black ${
          emergencyState.emergencyMode ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
        }`}>
          {emergencyState.emergencyMode ? "ON" : "OFF"}
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto_auto]">
        <input
          value={emergencyReasonInput}
          onChange={(e) => setEmergencyReasonInput(e.target.value)}
          placeholder="비상모드 사유 (예: 결제 장애 긴급 점검)"
          className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
        />
        <input
          value={emergencyEtaInput}
          onChange={(e) => setEmergencyEtaInput(e.target.value)}
          placeholder="예상 복구 시간 ETA (예: 2026-05-09 03:00 KST)"
          className={`rounded-xl border px-3 py-2 text-xs font-bold outline-none ${theme.input}`}
        />
        <button onClick={() => updateEmergencyMode(true)} disabled={emergencyLoading} className="rounded-xl border border-red-500/60 px-3 py-2 text-xs font-black text-red-400">
          {emergencyLoading ? "처리중..." : "비상모드 ON"}
        </button>
        <button onClick={() => updateEmergencyMode(false)} disabled={emergencyLoading} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
          비상모드 OFF
        </button>
        <button onClick={loadEmergencyState} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
          상태 새로고침
        </button>
      </div>
      <div className={`mt-2 text-[11px] ${theme.muted}`}>
        현재 사유: {emergencyState.emergencyReason || "-"} · ETA: {emergencyState.emergencyEta || "-"} · updatedBy: {emergencyState.updatedByUserId || "-"} · {emergencyState.updatedAt || "-"}
      </div>
    </div>
  );
}
