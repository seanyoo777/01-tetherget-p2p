import React, { useMemo } from "react";
import { AdminErrorBoundary } from "./AdminErrorBoundary.jsx";

const DEFAULT_MENU = [
  { id: "dashboard", label: "대시보드" },
  { id: "member", label: "회원관리" },
  { id: "referral", label: "레퍼럴 관리" },
  { id: "stage", label: "단계관리" },
  { id: "trade", label: "거래관리" },
  { id: "settlement", label: "정산관리" },
  { id: "settings", label: "설정" },
  { id: "ute", label: "UTE·P2P" },
];

/**
 * @param {object} props
 * @param {object} props.theme
 * @param {string} props.title
 * @param {string} props.subtitle
 * @param {string} props.userLabel
 * @param {string} props.activeMenu
 * @param {(id: string) => void} props.onMenuChange
 * @param {() => void} props.onExit
 * @param {React.ReactNode} props.children
 */
export function AdminShell({ theme, title, subtitle, userLabel, activeMenu, onMenuChange, onExit, children, menuItems }) {
  const t = theme || {};
  const items = useMemo(() => (Array.isArray(menuItems) && menuItems.length ? menuItems : DEFAULT_MENU), [menuItems]);

  return (
    <div className={`flex min-h-[calc(100vh-120px)] flex-col gap-3 md:flex-row ${t.page || ""}`}>
      <aside className={`shrink-0 rounded-2xl border p-3 md:w-56 ${t.cardSoft || t.card || ""}`}>
        <div className="mb-3 text-xs font-black uppercase tracking-wide opacity-70">Admin</div>
        <nav className="flex flex-col gap-1">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onMenuChange?.(item.id)}
              className={`rounded-xl px-3 py-2 text-left text-sm font-black transition ${
                activeMenu === item.id ? t.main || "bg-emerald-600 text-white" : t.input || "border border-white/10"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className={`mt-4 w-full rounded-xl border px-3 py-2 text-xs font-black ${t.input || ""}`}
          onClick={() => onExit?.()}
        >
          나가기
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <header className={`rounded-2xl border px-4 py-3 ${t.card || ""}`}>
          <div className="text-lg font-black">{title || "관리자"}</div>
          {subtitle ? <div className={`mt-1 text-xs ${t.muted || t.subtext || ""}`}>{subtitle}</div> : null}
          <div className={`mt-2 text-xs font-bold ${t.muted || ""}`}>{userLabel || "—"}</div>
        </header>

        <AdminErrorBoundary theme={t}>
          <main className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</main>
        </AdminErrorBoundary>
      </div>
    </div>
  );
}
