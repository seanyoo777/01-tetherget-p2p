import React from "react";

/** `dashboard` 탭 — DOM 순서 유지를 위해 `segment`별로 세 곳에서 렌더. */
export function DashboardPanel(props) {
  const { segment, theme, visible } = props;

  if (segment === "categories") {
    if (props.useExternalAdminNav) return null;
    const { adminCategories, setAdminViewTab } = props;
    return (
      <div className={`${visible ? "" : "hidden "}mb-4 rounded-3xl border p-4 ${theme.cardSoft}`}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-lg font-black">관리자 메인 카테고리</div>
            <div className={`text-xs ${theme.muted}`}>카테고리를 누르면 해당 기능 화면으로 이동합니다.</div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {adminCategories.map((category) => (
            <button
              key={category.key}
              onClick={() => setAdminViewTab(category.key)}
              className={`rounded-2xl border p-4 text-left transition hover:scale-[1.01] ${theme.input}`}
            >
              <div className="flex items-center justify-between">
                <div className="text-base font-black">{category.title}</div>
                <span className={`rounded-full px-2 py-1 text-[11px] font-black text-white ${category.color}`}>이동</span>
              </div>
              <div className={`mt-2 text-xs leading-5 ${theme.muted}`}>{category.desc}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (segment === "briefs") {
    const { adminBriefs } = props;
    return (
      <div className={`${visible ? "" : "hidden "}mb-4 rounded-3xl border p-4 ${theme.card}`}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-sm font-black">
              운영 알림 요약{" "}
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-black text-amber-300">MOCK</span>
            </div>
            <div className={`mt-1 text-xs ${theme.muted}`}>실제 알림·승인 큐 API 연동 전, 레이아웃과 우선순위 점검용입니다.</div>
          </div>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {adminBriefs.map((b) => (
            <li
              key={b.id}
              className={`rounded-2xl border p-3 text-left ${
                b.tone === "warn"
                  ? "border-amber-500/40 bg-amber-500/5"
                  : b.tone === "info"
                    ? "border-sky-500/35 bg-sky-500/5"
                    : theme.input
              }`}
            >
              <div className="text-xs font-black">{b.title}</div>
              <div className={`mt-1 text-[11px] leading-snug ${theme.subtext}`}>{b.body}</div>
              <div className={`mt-2 text-[10px] font-bold ${theme.muted}`}>{b.at}</div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (segment === "storage") {
    const { lang, notify, formatNumber, myTotalVolume, myReferralProfit, myWithdrawable, myPendingProfit, myWeeklyProfit, myMonthlyProfit, myDirectUsers } = props;
    return (
      <div className={`${visible ? "" : "hidden "}mb-4 rounded-3xl border p-4 ${theme.card}`}>
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xl font-black">{lang.adminStorage}</div>
            <div className={`text-sm ${theme.subtext}`}>내 하부 기준 총거래량 · 레퍼럴 수익 · 기간별 수익 · 출금가능액</div>
          </div>
          <button onClick={() => notify("withdraw")} className={`rounded-2xl px-4 py-3 text-sm font-black ${theme.main}`}>{lang.withdrawRequest}</button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className={`rounded-3xl p-4 ${theme.cardSoft}`}>
            <div className={theme.muted}>{lang.totalVolume}</div>
            <div className="mt-2 text-2xl font-black">${formatNumber(myTotalVolume)}</div>
            <div className={`mt-1 text-xs ${theme.muted}`}>직접 레퍼럴 거래량 기준</div>
          </div>
          <div className={`rounded-3xl p-4 ${theme.cardSoft}`}>
            <div className={theme.muted}>{lang.referralProfit}</div>
            <div className="mt-2 text-2xl font-black">${formatNumber(myReferralProfit)}</div>
            <div className={`mt-1 text-xs ${theme.muted}`}>직접 하부 거래 수익 합산</div>
          </div>
          <div className={`rounded-3xl p-4 ${theme.cardSoft}`}>
            <div className={theme.muted}>{lang.withdrawable}</div>
            <div className="mt-2 text-2xl font-black text-emerald-500">${formatNumber(myWithdrawable)}</div>
            <div className={`mt-1 text-xs ${theme.muted}`}>정산 가능 금액</div>
          </div>
          <div className={`rounded-3xl p-4 ${theme.cardSoft}`}>
            <div className={theme.muted}>{lang.pendingSettlement}</div>
            <div className="mt-2 text-2xl font-black text-amber-500">${formatNumber(myPendingProfit)}</div>
            <div className={`mt-1 text-xs ${theme.muted}`}>검증/락업 대기</div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className={`rounded-3xl p-4 ${theme.cardSoft}`}>
            <div className={theme.muted}>{lang.weeklyProfit}</div>
            <div className="mt-2 text-xl font-black">${formatNumber(myWeeklyProfit)}</div>
          </div>
          <div className={`rounded-3xl p-4 ${theme.cardSoft}`}>
            <div className={theme.muted}>{lang.monthlyProfit}</div>
            <div className="mt-2 text-xl font-black">${formatNumber(myMonthlyProfit)}</div>
          </div>
          <div className={`rounded-3xl p-4 ${theme.cardSoft}`}>
            <div className={theme.muted}>{lang.managedChildren}</div>
            <div className="mt-2 text-xl font-black">{myDirectUsers.length}명</div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
