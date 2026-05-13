import React, { useEffect, useRef, useState } from "react";
import { mergeAuthUserWithStageConsistency, normalizeStageLabel } from "../admin/adminMemberModel.js";
import { refreshAdminPlatformSurface, getUteSurfaceMetrics, type AdminApiClient } from "../mock/adminPlatformMock";
import type { UteSurfacePayload } from "../tetherget/types";

const LEVEL_OPTIONS = [
  "회원",
  "LEVEL 1",
  "LEVEL 2",
  "LEVEL 3",
  "LEVEL 4",
  "LEVEL 5",
  "LEVEL 6",
  "LEVEL 7",
  "LEVEL 8",
  "LEVEL 9",
  "LEVEL 10",
] as const;

function isPickLevel(s: string): boolean {
  for (const x of LEVEL_OPTIONS) {
    if (x === s) return true;
  }
  return false;
}

type ThemeStrings = Record<string, string | undefined>;

type ApiClient = {
  request: (path: string, options?: { method?: string; auth?: boolean; body?: string }) => Promise<unknown>;
};

export type SimpleAdminProps = {
  theme: ThemeStrings;
  notify: (message: string) => void;
  apiClient: ApiClient;
  authToken: string | null;
  authUsers: unknown[];
  setAuthUsers: React.Dispatch<React.SetStateAction<unknown[]>>;
  currentAdminActorId: string | number | null | undefined;
  isSuperAdmin: boolean;
  onForceRefresh?: () => void | Promise<void>;
};

function readLevel(user: Record<string, unknown>): string {
  return normalizeStageLabel(String(user?.stage_label ?? user?.stageLabel ?? "회원").trim());
}

function emptyCounts(): Record<number, number> {
  const o: Record<number, number> = {};
  for (let n = 1; n <= 10; n += 1) o[n] = 0;
  return o;
}

function countLevels(users: Record<string, unknown>[]) {
  const c = emptyCounts();
  for (const u of users) {
    const v = readLevel(u);
    const m = String(v).match(/^LEVEL\s+(\d+)$/i);
    if (!m) continue;
    const n = Number(m[1]);
    if (n >= 1 && n <= 10) c[n] += 1;
  }
  return c;
}

function filterRowsForAdmin(users: unknown[], aid: string): Record<string, unknown>[] {
  const list: Record<string, unknown>[] = [];
  const raw = Array.isArray(users) ? users : [];
  for (const u of raw) {
    if (!u || typeof u !== "object") continue;
    const row = u as Record<string, unknown>;
    if (aid && String(row.id) === aid) continue;
    list.push(row);
  }
  return list;
}

function countsEqual(a: Record<number, number>, b: Record<number, number>): boolean {
  for (let n = 1; n <= 10; n += 1) {
    if ((a[n] ?? 0) !== (b[n] ?? 0)) return false;
  }
  return true;
}

function applyStage(users: unknown[], idStr: string, stageLabel: string): unknown[] {
  return (Array.isArray(users) ? users : []).map((x) => {
    if (!x || typeof x !== "object") return x;
    const row = x as Record<string, unknown>;
    return String(row.id) !== idStr ? x : mergeAuthUserWithStageConsistency(row, { stageLabel: stageLabel });
  });
}

function referralUrl(userId: string | number) {
  if (typeof window === "undefined") return "";
  try {
    const u = new URL(window.location.href);
    u.searchParams.set("ref", String(userId));
    return u.toString();
  } catch {
    return `${window.location.origin}/?ref=${encodeURIComponent(String(userId))}`;
  }
}

function randomPickLevel(exclude?: string): string {
  const opts = [...LEVEL_OPTIONS];
  let s = opts[Math.floor(Math.random() * opts.length)]!;
  if (exclude && opts.length > 1) {
    let guard = 0;
    while (s === exclude && guard++ < 30) {
      s = opts[Math.floor(Math.random() * opts.length)]!;
    }
  }
  return s;
}

/**
 * Admin panel with built-in self-validation (count logs + Run Self Test).
 */
export default function SimpleAdmin({
  theme,
  notify,
  apiClient,
  authToken,
  authUsers,
  setAuthUsers,
  currentAdminActorId,
  isSuperAdmin,
  onForceRefresh,
}: SimpleAdminProps) {
  const [tick, setTick] = useState(0);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>(() => emptyCounts());
  const [selfTestBanner, setSelfTestBanner] = useState<{ kind: "pass" | "fail"; text: string } | null>(null);
  const [selfTestRunning, setSelfTestRunning] = useState(false);
  const [uteMetrics, setUteMetrics] = useState<UteSurfacePayload["metrics"] | null>(null);

  const countsRef = useRef(counts);
  countsRef.current = counts;

  useEffect(() => {
    const aid = String(currentAdminActorId ?? "");
    const raw = Array.isArray(authUsers) ? authUsers : [];
    const list: Record<string, unknown>[] = [];
    for (const u of raw) {
      if (!u || typeof u !== "object") continue;
      const row = u as Record<string, unknown>;
      if (aid && String(row.id) === aid) continue;
      list.push(row);
    }
    setRows(list);
    setCounts(countLevels(list));
  }, [authUsers, currentAdminActorId, tick]);

  useEffect(() => {
    if (!authToken) {
      setUteMetrics(null);
      return;
    }
    let cancelled = false;
    void refreshAdminPlatformSurface(apiClient as AdminApiClient).then(() => {
      if (!cancelled) setUteMetrics(getUteSurfaceMetrics());
    });
    return () => {
      cancelled = true;
    };
  }, [authToken, apiClient, tick]);

  function copyReferral(userId: string | number) {
    const url = referralUrl(userId);
    if (!url) {
      notify("링크를 만들 수 없습니다.");
      return;
    }
    void navigator.clipboard.writeText(url).then(
      () => notify("추천 링크를 복사했습니다."),
      () => notify("추천 링크 복사에 실패했습니다.")
    );
  }

  async function onLevelChange(userId: unknown, nextRaw: string) {
    if (!isSuperAdmin) {
      notify("권한이 없습니다.");
      return;
    }
    const next = normalizeStageLabel(String(nextRaw || "").trim());
    const idStr = String(userId ?? "");
    const aid = String(currentAdminActorId ?? "");
    const prevList = Array.isArray(authUsers) ? authUsers : [];
    const prevRow = prevList.find((x) => x && typeof x === "object" && String((x as Record<string, unknown>).id) === idStr) as
      | Record<string, unknown>
      | undefined;
    if (!prevRow) return;
    const backup = { stage_label: prevRow.stage_label, stageLabel: prevRow.stageLabel };

    setAuthUsers((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      const beforeCounts = countLevels(filterRowsForAdmin(arr, aid));
      const nextArr = applyStage(arr, idStr, next);
      const afterCounts = countLevels(filterRowsForAdmin(nextArr, aid));
      console.log("[SimpleAdmin] level change — counts", {
        userId: idStr,
        nextLevel: next,
        beforeCounts,
        afterCounts,
      });
      return nextArr;
    });
    setTick((t) => t + 1);

    if (!authToken) return;

    const num = Number(idStr);
    if (!Number.isFinite(num) || num <= 0) {
      notify("유효한 사용자 ID가 필요합니다.");
      setAuthUsers((prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        const beforeCounts = countLevels(filterRowsForAdmin(arr, aid));
        const reverted = arr.map((x) => {
          if (!x || typeof x !== "object") return x;
          const row = x as Record<string, unknown>;
          return String(row.id) !== idStr ? x : mergeAuthUserWithStageConsistency(row, backup);
        });
        const afterCounts = countLevels(filterRowsForAdmin(reverted, aid));
        console.log("[SimpleAdmin] level change reverted (invalid id) — counts", { userId: idStr, beforeCounts, afterCounts });
        return reverted;
      });
      setTick((t) => t + 1);
      return;
    }

    const parentRaw = prevRow.parent_user_ref ?? prevRow.parentUserRef ?? "";
    const parentNum = parentRaw !== "" && parentRaw != null ? String(Number(parentRaw) || "").trim() : "";
    try {
      const data = await apiClient.request(`/api/admin/users/${num}/profile`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({
          stageLabel: next,
          parentUserRef: parentNum,
          adminAssigned: Boolean(prevRow.admin_assigned ?? prevRow.adminAssigned),
        }),
      });
      setAuthUsers((prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        const beforeCounts = countLevels(filterRowsForAdmin(arr, aid));
        const patchUser = (data.user || { stageLabel: next }) as Record<string, unknown>;
        const nextArr = (Array.isArray(prev) ? prev : []).map((x) => {
          if (!x || typeof x !== "object") return x;
          const row = x as Record<string, unknown>;
          return String(row.id) !== idStr ? x : mergeAuthUserWithStageConsistency(row, patchUser);
        });
        const afterCounts = countLevels(filterRowsForAdmin(nextArr, aid));
        console.log("[SimpleAdmin] level change — counts after server merge", {
          userId: idStr,
          beforeCounts,
          afterCounts,
        });
        return nextArr;
      });
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message?: unknown }).message) : "저장 실패";
      notify(msg);
      setAuthUsers((prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        const beforeCounts = countLevels(filterRowsForAdmin(arr, aid));
        const nextArr = (Array.isArray(prev) ? prev : []).map((x) => {
          if (!x || typeof x !== "object") return x;
          const row = x as Record<string, unknown>;
          return String(row.id) !== idStr ? x : mergeAuthUserWithStageConsistency(row, backup);
        });
        const afterCounts = countLevels(filterRowsForAdmin(nextArr, aid));
        console.log("[SimpleAdmin] level change reverted (error) — counts", { userId: idStr, beforeCounts, afterCounts });
        return nextArr;
      });
    }
    setTick((t) => t + 1);
  }

  function runSelfTest() {
    const aid = String(currentAdminActorId ?? "");
    const raw = Array.isArray(authUsers) ? authUsers : [];
    const filtered = filterRowsForAdmin(raw, aid);
    if (filtered.length === 0) {
      const msg = "Test Failed — no users in the table.";
      setSelfTestBanner({ kind: "fail", text: msg });
      notify(msg);
      console.warn("[SimpleAdmin] self-test", msg);
      return;
    }

    setSelfTestRunning(true);
    setSelfTestBanner(null);

    const k = Math.min(3, filtered.length);
    const usedIdx = new Set<number>();
    const picks: { id: string; label: string; newLevel: string }[] = [];
    while (picks.length < k) {
      const idx = Math.floor(Math.random() * filtered.length);
      if (usedIdx.has(idx)) continue;
      usedIdx.add(idx);
      const row = filtered[idx]!;
      const cur = readLevel(row);
      const nl = normalizeStageLabel(randomPickLevel(cur));
      picks.push({
        id: String(row.id),
        label: String(row.nickname ?? row.email ?? row.id),
        newLevel: nl,
      });
    }

    let next = [...raw];
    for (const p of picks) {
      next = applyStage(next, p.id, p.newLevel);
    }
    const expected = countLevels(filterRowsForAdmin(next, aid));

    console.log("[SimpleAdmin] self-test start", { picks, expectedCounts: expected });

    setAuthUsers(next);
    setTick((t) => t + 1);

    window.setTimeout(() => {
      const actual = countsRef.current;
      const ok = countsEqual(expected, actual);
      setSelfTestRunning(false);
      if (ok) {
        const msg = "Test Passed — sidebar counts match expected.";
        setSelfTestBanner({ kind: "pass", text: msg });
        notify(msg);
        console.log("[SimpleAdmin] self-test", msg, { expected, actual });
      } else {
        const msg = `Test Failed — counts mismatch. expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`;
        setSelfTestBanner({ kind: "fail", text: msg });
        notify("Test Failed — sidebar counts do not match (see console).");
        console.error("[SimpleAdmin] self-test mismatch", { expected, actual, picks });
      }
    }, 150);
  }

  const page = theme.page ?? "";
  const card = theme.card ?? "rounded border border-neutral-300 bg-white p-3";
  const input = theme.input ?? "rounded border px-2 py-1 text-sm";
  const thead = theme.headerControl ?? "bg-neutral-100";

  return (
    <div className={`mx-auto max-w-6xl space-y-4 p-4 ${page}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-lg font-bold">Admin</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-red-600 px-8 py-4 text-base font-bold text-white hover:bg-red-500"
            onClick={() => {
              setTick((t) => t + 1);
              if (typeof onForceRefresh === "function") void onForceRefresh();
            }}
          >
            Force Refresh Counts
          </button>
          <button
            type="button"
            disabled={selfTestRunning}
            className="rounded-lg bg-violet-700 px-8 py-4 text-base font-bold text-white hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => runSelfTest()}
          >
            Run Self Test
          </button>
        </div>
      </div>

      {selfTestBanner ? (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm font-bold ${
            selfTestBanner.kind === "pass"
              ? "border-emerald-600/40 bg-emerald-950/30 text-emerald-200"
              : "border-red-600/40 bg-red-950/30 text-red-200"
          }`}
        >
          {selfTestBanner.text}
        </div>
      ) : null}

      {uteMetrics ? (
        <section className={`${card} space-y-3`} aria-label="UTE P2P surface preview">
          <div className="text-sm font-bold">UTE 연동 예비 · P2P 운영 스냅샷 (mock 집계)</div>
          <p className={`text-xs ${theme.muted ?? "text-neutral-500"}`}>
            실 송금·온체인 release 없음. `/api/admin/p2p/ute-surface` 기준. 실패 시 데모 숫자로 폴백합니다.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className={`rounded-lg p-3 ${theme.cardSoft ?? "bg-neutral-50"}`}>
              <div className={`text-[10px] font-bold uppercase ${theme.muted ?? ""}`}>P2P 주문</div>
              <div className="text-xl font-black">{uteMetrics.p2p_order_count}</div>
            </div>
            <div className={`rounded-lg p-3 ${theme.cardSoft ?? "bg-neutral-50"}`}>
              <div className={`text-[10px] font-bold uppercase ${theme.muted ?? ""}`}>에스크로 락 (minor)</div>
              <div className="break-all font-mono text-sm font-black">{uteMetrics.p2p_escrow_locked_minor_total}</div>
            </div>
            <div className={`rounded-lg p-3 ${theme.cardSoft ?? "bg-neutral-50"}`}>
              <div className={`text-[10px] font-bold uppercase ${theme.muted ?? ""}`}>활성 분쟁</div>
              <div className="text-xl font-black">{uteMetrics.dispute_active_count}</div>
            </div>
            <div className={`rounded-lg p-3 ${theme.cardSoft ?? "bg-neutral-50"}`}>
              <div className={`text-[10px] font-bold uppercase ${theme.muted ?? ""}`}>레퍼럴 pending</div>
              <div className="text-xl font-black">{uteMetrics.referral_settlement_pending_count}</div>
            </div>
            <div className={`rounded-lg p-3 ${theme.cardSoft ?? "bg-neutral-50"}`}>
              <div className={`text-[10px] font-bold uppercase ${theme.muted ?? ""}`}>지갑 리스크 유저</div>
              <div className="text-xl font-black">{uteMetrics.wallet_risk_user_count}</div>
            </div>
            <div className={`rounded-lg p-3 ${theme.cardSoft ?? "bg-neutral-50"}`}>
              <div className={`text-[10px] font-bold uppercase ${theme.muted ?? ""}`}>관리자 리스크</div>
              <div className="text-xl font-black">
                {uteMetrics.admin_risk_level} ({uteMetrics.admin_risk_score})
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[200px_1fr]">
        <aside className={`${card}`}>
          <div className="mb-2 text-sm font-bold">LEVEL 1–10</div>
          <ul className="space-y-1 text-sm">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <li key={n} className="flex justify-between font-mono">
                <span>LEVEL {n}</span>
                <span className="font-bold">{counts[n]}</span>
              </li>
            ))}
          </ul>
        </aside>

        <div className={`overflow-auto ${card}`}>
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className={thead}>
              <tr>
                <th className="p-2">Name</th>
                <th className="p-2">Level</th>
                <th className="p-2">Change</th>
                <th className="p-2">Referral</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const cur = readLevel(u);
                const opts = isPickLevel(cur) ? [...LEVEL_OPTIONS] : [cur, ...LEVEL_OPTIONS];
                return (
                  <tr key={String(u.id)} className="border-t border-neutral-200">
                    <td className="p-2">{String(u.nickname ?? u.email ?? u.id)}</td>
                    <td className="p-2 font-mono text-xs">{cur}</td>
                    <td className="p-2">
                      <select
                        className={input}
                        disabled={!isSuperAdmin}
                        value={cur}
                        onChange={(e) => {
                          void onLevelChange(u.id, e.target.value);
                        }}
                      >
                        {opts.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <button type="button" className="rounded border px-2 py-1 text-xs font-bold" onClick={() => copyReferral(u.id as string | number)}>
                        Copy
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
