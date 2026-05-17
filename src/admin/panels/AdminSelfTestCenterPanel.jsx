import React, { useCallback, useState } from "react";
import { runAdminSelfTestSuiteWithCore } from "../adminSelfTestEngine.js";
import { ADMIN_TEST_IDS } from "../adminTestIds.js";
import { SALES_LEVEL_STAGES } from "../adminMemberModel.js";

const STATUS_STYLE = {
  pass: { label: "PASS", cls: "bg-emerald-500/25 text-emerald-200 border-emerald-500/40" },
  warn: { label: "WARN", cls: "bg-amber-500/25 text-amber-200 border-amber-500/40" },
  fail: { label: "FAIL", cls: "bg-rose-500/25 text-rose-200 border-rose-500/40" },
};

export function AdminSelfTestCenterPanel({ theme, visible, sampleUser }) {
  const [suite, setSuite] = useState(null);
  const [running, setRunning] = useState(false);

  const runTests = useCallback(() => {
    setRunning(true);
    const result = runAdminSelfTestSuiteWithCore({
      sampleUser: sampleUser ?? { id: "ADM-SELF-1", nickname: "SelfTest User" },
      fromLevel: SALES_LEVEL_STAGES[2],
      toLevel: SALES_LEVEL_STAGES[3],
    });
    setSuite(result);
    setRunning(false);
  }, [sampleUser]);

  if (!visible) return null;

  const summary = suite ?? { status: "—", issueCount: "—", lastChecked: null };

  return (
    <div
      data-testid={ADMIN_TEST_IDS.selfTestCenter}
      className={`mb-5 rounded-3xl border p-4 ${theme.cardSoft}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black">Admin Self-Test Center</div>
          <p className={`text-xs ${theme.muted}`}>
            회원 단계 · 수수료 · 레퍼럴 · 거래/escrow · 메뉴 mock 검증 (실정산·DB 변경 없음)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-violet-500/20 px-2 py-0.5 text-[9px] font-black text-violet-200">MOCK ONLY</span>
          <button
            type="button"
            data-testid={ADMIN_TEST_IDS.selfTestRun}
            disabled={running}
            onClick={runTests}
            className={`rounded-xl border px-3 py-2 text-xs font-black ${running ? "opacity-60" : theme.main}`}
          >
            {running ? "검증 중…" : "자동 검증 실행"}
          </button>
        </div>
      </div>

      <div
        data-testid={ADMIN_TEST_IDS.selfTestSummary}
        data-self-test-status={suite?.status ?? "pending"}
        className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 ${theme.card}`}
      >
        <SummaryChip label="상태" value={String(summary.status).toUpperCase()} status={suite?.status} />
        <SummaryChip label="issues" value={String(summary.issueCount)} />
        <SummaryChip
          label="last checked"
          value={suite?.lastChecked ? new Date(suite.lastChecked).toLocaleString() : "—"}
        />
        {suite?.coreBundle ? (
          <SummaryChip
            label="core"
            value={`${suite.coreBundle.overall} · fail ${suite.coreBundle.issueCount}`}
            status={suite.coreBundle.overall === "FAIL" ? "fail" : suite.coreBundle.overall === "WARN" ? "warn" : "pass"}
          />
        ) : null}
      </div>

      {!suite ? (
        <p className={`text-xs ${theme.muted}`}>「자동 검증 실행」을 눌러 mock self-test를 수행하세요.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {suite.cards.map((card) => (
            <SelfTestCard key={card.id} theme={theme} card={card} />
          ))}
        </div>
      )}

      {suite?.levelTransition ? (
        <div className={`mt-4 rounded-xl border p-3 ${theme.card}`}>
          <div className="text-[10px] font-black uppercase text-violet-300">Level transition (mock)</div>
          <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-2">
            <div>
              <span className={theme.muted}>이전</span>{" "}
              <span className="font-mono font-bold">
                {suite.levelTransition.fromLevel} ({suite.levelTransition.fromBadge}) · received{" "}
                {suite.levelTransition.tableBefore.receivedRate}%
              </span>
            </div>
            <div>
              <span className={theme.muted}>변경</span>{" "}
              <span className="font-mono font-bold">
                {suite.levelTransition.toLevel} ({suite.levelTransition.toBadge}) · received{" "}
                {suite.levelTransition.tableAfter.receivedRate}%
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {suite?.feeBreakdown ? (
        <div className={`mt-3 rounded-xl border p-3 ${theme.card}`}>
          <div className="text-[10px] font-black uppercase text-violet-300">Fee breakdown (mock · 10k USDT)</div>
          <div className="mt-2 flex flex-wrap gap-2 font-mono text-[10px]">
            <FeeChip label="buyer" value={suite.feeBreakdown.buyerFee} />
            <FeeChip label="seller" value={suite.feeBreakdown.sellerFee} />
            <FeeChip label="total" value={suite.feeBreakdown.totalFee} />
            <FeeChip label="referral" value={suite.feeBreakdown.referralShare} />
            <FeeChip label="company" value={suite.feeBreakdown.companyShare} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryChip({ label, value, status }) {
  const st = STATUS_STYLE[status] || { label: value, cls: "border-white/10 text-slate-300" };
  return (
    <div className="text-center">
      <div className="text-[8px] uppercase opacity-60">{label}</div>
      <div className={`mt-0.5 rounded px-2 py-0.5 text-xs font-black ${status ? st.cls : ""}`}>{value}</div>
    </div>
  );
}

function FeeChip({ label, value }) {
  return (
    <span className="rounded border border-white/10 bg-black/20 px-2 py-1">
      {label}: {value}
    </span>
  );
}

function SelfTestCard({ theme, card }) {
  const st = STATUS_STYLE[card.status] || STATUS_STYLE.pass;
  return (
    <div
      data-testid={ADMIN_TEST_IDS.selfTestCard}
      data-card-id={card.id}
      data-card-status={card.status}
      className={`rounded-xl border p-3 ${theme.card}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-black">{card.title}</div>
        <span className={`rounded px-2 py-0.5 text-[9px] font-black ${st.cls}`}>{st.label}</span>
      </div>
      <div className={`mb-2 text-[9px] ${theme.muted}`}>
        issues {card.issueCount} · {card.lastChecked ? new Date(card.lastChecked).toLocaleTimeString() : "—"}
      </div>
      <ul className="space-y-1">
        {card.checks.slice(0, 6).map((c, i) => (
          <li key={`${card.id}-${i}`} className="flex gap-2 text-[10px]">
            <span
              className={`shrink-0 rounded px-1 font-black uppercase ${
                STATUS_STYLE[c.status]?.cls || "text-slate-400"
              }`}
            >
              {c.status}
            </span>
            <span className={theme.subtext}>{c.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
