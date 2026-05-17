import React from "react";

/**
 * P2P 전용 루트 shell — OneAI/공유 앱 레이아웃과 구분하는 마커·DEV 배지만 담당.
 * 비즈니스 UI(Header/Nav)는 `App.jsx`에 유지.
 */
export function P2pAppShell({ children, pageClassName = "" }) {
  return (
    <div
      data-testid="p2p-app-root"
      data-app="tetherget-p2p"
      className={`p2p-app-shell ${pageClassName}`.trim()}
    >
      {import.meta.env.DEV ? (
        <div
          data-testid="p2p-dev-app-marker"
          className="pointer-events-none fixed bottom-2 left-2 z-[600] rounded-lg border border-emerald-500/40 bg-emerald-950/90 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-200 shadow-lg"
          aria-hidden
        >
          01 · TetherGet P2P
        </div>
      ) : null}
      {children}
    </div>
  );
}
