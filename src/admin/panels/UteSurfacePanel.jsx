import React from "react";

/** `uteSurface` 탭 본문 — 데이터는 App.jsx `uteSurfaceMetrics` / `useEffect` 유지. */
export function UteSurfacePanel({ theme, uteSurfaceMetrics, visible }) {
  return (
    <div className={`${visible ? "" : "hidden "}mb-4 rounded-3xl border p-4 ${theme.card}`}>
      <div className="mb-3 text-sm font-black">UTE 연동 예비 · `/api/admin/p2p/ute-surface`</div>
      <p className={`mb-3 text-xs ${theme.muted}`}>
        집계·표시만 (실 송금·온체인 release 없음). 실패 시 데모 스냅샷으로 폴백합니다. canonical 상태는 `shared/p2pLifecycleMap.js` 기준.
      </p>
      {uteSurfaceMetrics ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className={`rounded-xl p-3 ${theme.cardSoft}`}>
            <div className={`text-[10px] font-bold uppercase ${theme.muted}`}>P2P 주문</div>
            <div className="text-xl font-black">{uteSurfaceMetrics.p2p_order_count}</div>
          </div>
          <div className={`rounded-xl p-3 ${theme.cardSoft}`}>
            <div className={`text-[10px] font-bold uppercase ${theme.muted}`}>에스크로 락 (minor)</div>
            <div className="break-all font-mono text-xs font-black">{uteSurfaceMetrics.p2p_escrow_locked_minor_total}</div>
          </div>
          <div className={`rounded-xl p-3 ${theme.cardSoft}`}>
            <div className={`text-[10px] font-bold uppercase ${theme.muted}`}>활성 분쟁</div>
            <div className="text-xl font-black">{uteSurfaceMetrics.dispute_active_count}</div>
          </div>
          <div className={`rounded-xl p-3 ${theme.cardSoft}`}>
            <div className={`text-[10px] font-bold uppercase ${theme.muted}`}>레퍼럴 pending</div>
            <div className="text-xl font-black">{uteSurfaceMetrics.referral_settlement_pending_count}</div>
          </div>
          <div className={`rounded-xl p-3 ${theme.cardSoft}`}>
            <div className={`text-[10px] font-bold uppercase ${theme.muted}`}>지갑 리스크 유저</div>
            <div className="text-xl font-black">{uteSurfaceMetrics.wallet_risk_user_count}</div>
          </div>
          <div className={`rounded-xl p-3 ${theme.cardSoft}`}>
            <div className={`text-[10px] font-bold uppercase ${theme.muted}`}>관리자 리스크</div>
            <div className="text-xl font-black">
              {uteSurfaceMetrics.admin_risk_level} ({uteSurfaceMetrics.admin_risk_score})
            </div>
          </div>
        </div>
      ) : (
        <div className={`text-xs ${theme.muted}`}>스냅샷을 불러오는 중…</div>
      )}
    </div>
  );
}
