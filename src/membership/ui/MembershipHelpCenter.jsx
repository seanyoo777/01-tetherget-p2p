import React from "react";
import { MEMBERSHIP_TEST_IDS } from "../membershipTestIds.js";
import { MEMBERSHIP_TIERS } from "../membershipTiers.js";

export function MembershipHelpCenter({ theme }) {
  return (
    <div
      data-testid={MEMBERSHIP_TEST_IDS.helpCenter}
      className={`mt-6 rounded-2xl border p-4 ${theme.cardSoft}`}
    >
      <h3 className="text-lg font-black">멤버십 · P2P 수수료 할인 (mock)</h3>
      <p className={`mt-2 text-sm leading-relaxed ${theme.subtext}`}>
        TetherGet P2P 멤버십은 <b>03-OneAI</b> 포인트·레벨과 연동할 예정인 <b>목업 구조</b>입니다. 실제 포인트 차감, 결제 할인, 정산은 하지 않습니다.
      </p>

      <div className="mt-4 space-y-2">
        <div className="text-xs font-black uppercase text-violet-400">등급 · 할인율</div>
        <ul className="space-y-2">
          {MEMBERSHIP_TIERS.map((tier) => (
            <li
              key={tier.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${theme.card}`}
            >
              <span className="font-black">{tier.label}</span>
              <span className={theme.muted}>{tier.pointsRequired.toLocaleString()} pts+</span>
              <span className="font-mono font-black text-emerald-400">−{tier.discountPct}%</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={`mt-4 rounded-xl border p-3 text-xs leading-relaxed ${theme.card}`}>
        <div className="font-black text-amber-300">MOCK ONLY</div>
        <ul className={`mt-2 list-disc space-y-1 pl-4 ${theme.muted}`}>
          <li>거래 수수료 preview는 기존 mock BPS에 멤버십 %를 곱한 표시용입니다.</li>
          <li>OneAI Bridge 「Mock 동기화」는 로컬 상태만 갱신합니다.</li>
          <li>Audit 이벤트: membership.level.mock · discount.preview · sync.mock</li>
        </ul>
      </div>
    </div>
  );
}
