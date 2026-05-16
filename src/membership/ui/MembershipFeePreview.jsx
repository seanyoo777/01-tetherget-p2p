import React, { useMemo } from "react";
import { MEMBERSHIP_TEST_IDS } from "../membershipTestIds.js";
import { computeMembershipFeePreview } from "../membershipModel.js";
import { isMembershipDiscountEnabled } from "../membershipFeatureFlags.js";

export function MembershipFeePreview({ theme, notionalUsdt, membershipState, formatNumber = (n) => String(n) }) {
  const enabled = isMembershipDiscountEnabled();
  const preview = useMemo(
    () =>
      computeMembershipFeePreview({
        notionalUsdt,
        points: membershipState?.oneAiPoints,
        enabled,
      }),
    [notionalUsdt, membershipState?.oneAiPoints, enabled],
  );

  if (!enabled) return null;

  return (
    <div
      data-testid={MEMBERSHIP_TEST_IDS.feePreview}
      className={`rounded-xl border p-3 ${theme.cardSoft}`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] font-black uppercase tracking-wide text-emerald-500">수수료 preview (mock)</div>
        <span
          data-testid={MEMBERSHIP_TEST_IDS.discountBadge}
          className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-black text-emerald-200"
        >
          {preview.tier.label} −{preview.discountPct}%
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <FeeCell label="기본 수수료" value={formatNumber(preview.totalFee)} theme={theme} />
        <FeeCell label="할인" value={`−${formatNumber(preview.discountAmount)}`} theme={theme} accent />
        <FeeCell label="적용 후" value={formatNumber(preview.discountedTotalFee)} theme={theme} accent />
        <FeeCell label="명목" value={`${formatNumber(preview.notionalUsdt)} USDT`} theme={theme} />
      </div>
      <p className={`mt-2 text-[9px] ${theme.muted}`}>실제 할인 엔진·정산 없음 · 표시만</p>
    </div>
  );
}

function FeeCell({ label, value, theme, accent }) {
  return (
    <div className={`rounded-lg border p-2 ${theme.card} ${accent ? "border-emerald-500/30" : ""}`}>
      <div className={`text-[8px] font-bold uppercase ${theme.muted}`}>{label}</div>
      <div className="mt-0.5 font-mono text-xs font-black tabular-nums">{value}</div>
    </div>
  );
}
