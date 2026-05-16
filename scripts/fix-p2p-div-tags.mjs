import fs from "fs";
import path from "path";

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(fp);
    else if (/\.(jsx|js)$/.test(ent.name)) {
      let c = fs.readFileSync(fp, "utf8");
      const next = c.replace(/motion+(?=div)/g, "");
      if (next !== c) fs.writeFileSync(fp, next);
    }
  }
}

walk(path.join(process.cwd(), "src", "p2p"));

const D = "motionmotionmotionmotiondiv".replace(/motion+/g, "");
const referral = `import React from "react";
import { MOCK_REFERRAL_SUMMARY } from "../../mock/p2pTradeFlowMock.js";
import { isP2pTradeDark, p2pSurfaceCard } from "./p2pTradeShell.js";

export function P2pReferralSummaryCard({ theme, summary = MOCK_REFERRAL_SUMMARY, formatNumber }) {
  const isDark = isP2pTradeDark(theme);
  const s = summary || MOCK_REFERRAL_SUMMARY;
  const wa = s.weeklyActivity || {};
  return (
    <${D} className={\`rounded-2xl border p-4 sm:p-5 \${p2pSurfaceCard(isDark)}\`}>
      <${D} className="flex flex-wrap items-end justify-between gap-2">
        <${D}>
          <${D} className="text-[10px] font-black uppercase tracking-wider text-emerald-500">Referral (mock)</${D}>
          <${D} className="mt-1 text-lg font-black">레퍼럴 요약</${D}>
          <p className={\`mt-1 text-xs \${theme.subtext}\`}>{s.code} · {s.levelLabel || s.tierLabel} · L{s.level ?? "—"}</p>
        </${D}>
        <span className={\`rounded-full px-2 py-1 text-[10px] font-black \${s.weekDeltaPct >= 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}\`}>
          주간 {s.weekDeltaPct >= 0 ? "+" : ""}{s.weekDeltaPct}%
        </span>
      </${D}>
      <${D} className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="직접 추천" value={\`\${s.directCount}명\`} theme={theme} />
        <Stat label="총 거래량" value={\`\${formatNumber(s.totalVolumeUsdt ?? s.teamVolumeUsdt)} USDT\`} theme={theme} />
        <Stat label="레퍼럴 수수료" value={formatNumber(s.referralFeeUsdt ?? 0)} theme={theme} accent />
        <Stat label="정산 대기" value={formatNumber(s.pendingRewardUsdt)} theme={theme} />
        <Stat label="팀 명목" value={\`\${formatNumber(s.teamVolumeUsdt)} USDT\`} theme={theme} />
        <Stat label="누적 수익" value={formatNumber(s.settledRewardUsdt)} theme={theme} />
        <Stat label="주간 거래" value={\`\${wa.trades ?? 0}건\`} theme={theme} />
        <Stat label="주간 완료" value={\`\${wa.completed ?? 0}건\`} theme={theme} accent />
      </${D}>
      {wa.volumeUsdt != null ? (
        <p className={\`mt-3 text-[10px] \${theme.muted}\`}>주간 매칭 {wa.matched ?? 0}건 · {formatNumber(wa.volumeUsdt)} USDT (mock)</p>
      ) : null}
      <p className={\`mt-2 text-[9px] \${theme.muted}\`}>모의 수치 · 실제 출금·정산·온체인 없음</p>
    </${D}>
  );
}

function Stat({ label, value, theme, accent }) {
  return (
    <${D} className={\`rounded-xl border p-2.5 \${theme.cardSoft} \${accent ? "border-emerald-500/30" : ""}\`}>
      <${D} className={\`text-[9px] font-bold uppercase \${theme.muted}\`}>{label}</${D}>
      <${D} className="mt-1 text-sm font-black tabular-nums">{value}</${D}>
    </${D}>
  );
}
`;

fs.writeFileSync(path.join(process.cwd(), "src", "p2p", "ui", "P2pReferralSummaryCard.jsx"), referral);
console.log("fixed p2p div tags + referral card");
