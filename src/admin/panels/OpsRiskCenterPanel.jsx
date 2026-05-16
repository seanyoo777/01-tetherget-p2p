import React from "react";

/** `ops` tab — **운영 리스크 센터** card (inside `admin-tab-ops`, boundary in `App.jsx`). */
export function OpsRiskCenterPanel(props) {
  const { theme, visible, loadOpsRiskSummary, opsRiskLoading, opsRiskSummary, runOpsAction, opsActionLoading } = props;

  return (
    <div className={`${visible ? "" : "hidden "}mb-5 rounded-3xl border p-4 ${theme.cardSoft}`}>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-black">운영 리스크 센터</div>
          <div className={`text-xs ${theme.muted}`}>장애/지연/승인 병목을 실시간으로 점검합니다.</div>
        </div>
        <button onClick={loadOpsRiskSummary} className={`rounded-xl border px-3 py-2 text-xs font-black ${theme.input}`}>
          {opsRiskLoading ? "점검중..." : "리스크 점검"}
        </button>
      </div>
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-1 font-black ${
          opsRiskSummary.overallLevel === "high"
            ? "bg-red-600 text-white"
            : opsRiskSummary.overallLevel === "medium"
              ? "bg-amber-500 text-white"
              : "bg-emerald-600 text-white"
        }`}>
          overall: {opsRiskSummary.overallLevel}
        </span>
        <span className={`rounded-full border px-2 py-1 font-black ${theme.input}`}>score: {opsRiskSummary.score}</span>
        <span className={theme.muted}>generated: {opsRiskSummary.generatedAt || "-"}</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {(opsRiskSummary.risks || []).map((risk) => (
          <div key={risk.key} className={`rounded-xl border p-2 text-xs ${theme.input}`}>
            <div className="flex items-center justify-between">
              <span className="font-black">{risk.message}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                risk.level === "high"
                  ? "bg-red-600 text-white"
                  : risk.level === "medium"
                    ? "bg-amber-500 text-white"
                    : "bg-emerald-600 text-white"
              }`}>
                {risk.level}
              </span>
            </div>
            <div className={theme.muted}>count: {risk.count}</div>
            <div className="mt-2">
              <button
                onClick={() => runOpsAction(risk.key)}
                disabled={opsActionLoading === risk.key}
                className={`rounded-lg border px-2 py-1 text-[11px] font-black ${theme.input}`}
              >
                {opsActionLoading === risk.key ? "조치중..." : "즉시 조치"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
