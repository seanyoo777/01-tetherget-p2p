import React, { forwardRef } from "react";

/** `member` / `memberOps` 공용 관리자 액션 로그 스트립 — 상태·ref는 `App.jsx`에서 props/ref 전달. */
export const AdminActionLogStrip = forwardRef(function AdminActionLogStrip(props, ref) {
  const { theme, visible, adminActionLogs } = props;

  return (
    <div
      ref={ref}
      className={`${visible ? "" : "hidden "}mt-5 rounded-3xl border p-5 ${theme.card}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xl font-black">관리자 액션 로그</div>
          <div className={`text-sm ${theme.subtext}`}>단계 변경·필터·권한 등 관리자 행동 기록 (VD 목업은 로컬 반영)</div>
        </div>
        <span className="rounded-full bg-slate-700 px-3 py-1 text-xs font-black text-white">{adminActionLogs.length}건</span>
      </div>
      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {adminActionLogs.length ? (
          adminActionLogs.map((log) => (
            <div key={log.id} className={`rounded-2xl border p-3 text-sm ${theme.input}`}>
              <div className="font-black">{log.action}</div>
              <div className={`mt-1 text-xs ${theme.muted}`}>{log.role} · {log.time}</div>
            </div>
          ))
        ) : (
          <div className={`rounded-2xl border p-3 text-sm ${theme.input}`}>아직 기록된 관리자 액션이 없습니다.</div>
        )}
      </div>
    </div>
  );
});
