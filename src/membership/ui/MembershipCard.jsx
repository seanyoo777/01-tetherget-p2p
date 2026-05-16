import React from "react";
import { MEMBERSHIP_TEST_IDS } from "../membershipTestIds.js";
import { isMembershipDiscountEnabled } from "../membershipFeatureFlags.js";

const TIER_TONE = {
  basic: "from-slate-600 to-slate-800",
  silver: "from-slate-400 to-slate-600",
  gold: "from-amber-500 to-orange-600",
  platinum: "from-violet-500 to-indigo-700",
  vip: "from-fuchsia-500 to-purple-800",
};

export function MembershipCard({ theme, state, formatNumber = (n) => String(n) }) {
  if (!state) return null;
  const enabled = isMembershipDiscountEnabled();
  const progress = state.progress ?? {};
  const tone = TIER_TONE[state.tierId] ?? TIER_TONE.basic;

  return (
    <div data-testid={MEMBERSHIP_TEST_IDS.card} className={`overflow-hidden rounded-2xl border ${theme.cardSoft}`}>
      <div className={`bg-gradient-to-br px-4 py-4 text-white ${tone}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider opacity-80">Membership (mock)</div>
            <div className="mt-1 text-2xl font-black">{state.tierLabel}</div>
            <p className="mt-1 text-xs opacity-90">OneAI Points · {formatNumber(state.oneAiPoints)} pts</p>
          </div>
          {enabled ? (
            <span
              data-testid={MEMBERSHIP_TEST_IDS.discountBadge}
              className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-black backdrop-blur"
            >
              −{state.discountPct}% P2P fee
            </span>
          ) : (
            <span className="rounded-full bg-black/30 px-2 py-1 text-[10px] font-black">할인 OFF</span>
          )}
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <div className="mb-1 flex justify-between text-[10px] font-bold">
            <span className={theme.muted}>다음 등급</span>
            <span className={theme.subtext}>
              {progress.next ? `${progress.next.label} · ${formatNumber(progress.pointsToNext)} pts 남음` : "최고 등급"}
            </span>
          </div>
          <div
            data-testid={MEMBERSHIP_TEST_IDS.progressBar}
            className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
            role="progressbar"
            aria-valuenow={progress.progressPct ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all"
              style={{ width: `${progress.progressPct ?? 0}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center">
          <MiniStat label="현재 할인" value={enabled ? `${state.discountPct}%` : "0%"} theme={theme} />
          <MiniStat
            label="다음 필요"
            value={progress.next ? formatNumber(progress.next.pointsRequired) : "—"}
            theme={theme}
          />
        </div>

        <p className={`text-[9px] leading-relaxed ${theme.muted}`}>
          3번 OneAI Points와 연동 예정 · 실제 서버·정산·할인 엔진 없음 (MOCK ONLY)
        </p>
      </div>
    </div>
  );
}

function MiniStat({ label, value, theme }) {
  return (
    <div className={`rounded-xl border p-2.5 ${theme.card}`}>
      <div className={`text-[9px] font-bold uppercase ${theme.muted}`}>{label}</div>
      <div className="mt-0.5 text-sm font-black tabular-nums">{value}</div>
    </div>
  );
}
