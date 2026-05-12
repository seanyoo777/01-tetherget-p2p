import React, { useCallback, useMemo, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useChainId,
  useSwitchChain,
  useWatchContractEvent,
} from "wagmi";
import { parseUnits, formatUnits, isAddress, encodeFunctionData } from "viem";
import { base, baseSepolia, arbitrumSepolia } from "wagmi/chains";
import { escrowContractAbi } from "./escrowAbi.js";

const STATUS_LABELS = ["None", "Funded", "Released", "Disputed", "RefundedToBuyer", "EmergencyWithdrawn"];

function parseEscrowAddress() {
  const raw = import.meta.env.VITE_ESCROW_CONTRACT_ADDRESS;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const v = raw.trim();
  return isAddress(v) ? v : null;
}

export function OnchainEscrowPanel({ theme, notify, guestMode = false }) {
  const escrowAddress = useMemo(() => parseEscrowAddress(), []);
  const [buyerAddr, setBuyerAddr] = useState("");
  const [amountHuman, setAmountHuman] = useState("");
  const [viewId, setViewId] = useState("");
  const chainId = useChainId();
  const { switchChain, isPending: switchPending } = useSwitchChain();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: connectPending } = useConnect();
  const { disconnect } = useDisconnect();

  const { data: nextEscrowIdRaw, refetch: refetchNextEscrowId } = useReadContract({
    address: escrowAddress ?? undefined,
    abi: escrowContractAbi,
    functionName: "nextEscrowId",
    query: { enabled: Boolean(escrowAddress), refetchInterval: 12_000 },
  });

  const { data: superAdminAddr } = useReadContract({
    address: escrowAddress ?? undefined,
    abi: escrowContractAbi,
    functionName: "superAdmin",
    query: { enabled: Boolean(escrowAddress) },
  });

  const { data: disputeResolverAddr } = useReadContract({
    address: escrowAddress ?? undefined,
    abi: escrowContractAbi,
    functionName: "disputeResolver",
    query: { enabled: Boolean(escrowAddress) },
  });

  const viewIdNum = useMemo(() => {
    const n = Number(viewId);
    return Number.isFinite(n) && n > 0 ? BigInt(Math.floor(n)) : null;
  }, [viewId]);

  const { data: escrowRow, refetch: refetchEscrow } = useReadContract({
    address: escrowAddress ?? undefined,
    abi: escrowContractAbi,
    functionName: "escrows",
    args: viewIdNum != null ? [viewIdNum] : undefined,
    query: {
      enabled: Boolean(escrowAddress && viewIdNum != null),
      refetchInterval: viewIdNum != null ? 8_000 : false,
    },
  });

  const multisigCalldata = useMemo(() => {
    if (!escrowAddress || viewIdNum == null) return { paySeller: "", refundBuyer: "" };
    try {
      return {
        paySeller: encodeFunctionData({
          abi: escrowContractAbi,
          functionName: "resolveDispute",
          args: [viewIdNum, 0],
        }),
        refundBuyer: encodeFunctionData({
          abi: escrowContractAbi,
          functionName: "resolveDispute",
          args: [viewIdNum, 1],
        }),
      };
    } catch {
      return { paySeller: "", refundBuyer: "" };
    }
  }, [escrowAddress, viewIdNum]);

  const bumpEscrowReads = useCallback(() => {
    refetchEscrow?.();
    refetchNextEscrowId?.();
  }, [refetchEscrow, refetchNextEscrowId]);

  const watchEnabled = Boolean(escrowAddress);
  useWatchContractEvent({
    address: escrowAddress ?? undefined,
    abi: escrowContractAbi,
    eventName: "EscrowCreated",
    enabled: watchEnabled,
    onLogs: bumpEscrowReads,
  });
  useWatchContractEvent({
    address: escrowAddress ?? undefined,
    abi: escrowContractAbi,
    eventName: "Released",
    enabled: watchEnabled,
    onLogs: bumpEscrowReads,
  });
  useWatchContractEvent({
    address: escrowAddress ?? undefined,
    abi: escrowContractAbi,
    eventName: "DisputeRaised",
    enabled: watchEnabled,
    onLogs: bumpEscrowReads,
  });
  useWatchContractEvent({
    address: escrowAddress ?? undefined,
    abi: escrowContractAbi,
    eventName: "DisputeResolved",
    enabled: watchEnabled,
    onLogs: bumpEscrowReads,
  });

  const { writeContract, data: txHash, isPending: writePending, error: writeError } = useWriteContract();
  const { isLoading: confirming, isSuccess: txSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  React.useEffect(() => {
    if (writeError) notify(writeError.shortMessage || writeError.message || "온체인 트랜잭션 오류");
  }, [writeError, notify]);

  React.useEffect(() => {
    if (txSuccess) {
      notify("트랜잭션이 확인되었습니다.");
      bumpEscrowReads();
    }
  }, [txSuccess, notify, bumpEscrowReads]);

  const card = theme.cardSoft ?? theme.card ?? "rounded-3xl border border-slate-700 bg-slate-900/40 p-4";
  const btn = theme.input ?? "rounded-xl border px-3 py-2 text-xs font-black";

  if (!escrowAddress) {
    return (
      <div className={`${card} mb-4`}>
        <div className="text-sm font-black">온체인 에스크로 (Base / Arbitrum)</div>
        <p className={`mt-2 text-xs ${theme.subtext ?? "opacity-80"}`}>
          배포 후 <code className="rounded bg-black/30 px-1">VITE_ESCROW_CONTRACT_ADDRESS</code> 를 설정하면 지갑 연동·에스크로 UI가 활성화됩니다.
        </p>
      </div>
    );
  }

  const seller = escrowRow?.[0];
  const buyer = escrowRow?.[1];
  const amountLocked = escrowRow?.[2];
  const statusIdx = escrowRow != null ? Number(escrowRow[3]) : null;

  function onCreateEscrow() {
    if (guestMode) {
      notify("로그인 후 이용할 수 있습니다.");
      return;
    }
    if (!isConnected || !address) {
      notify("지갑을 연결하세요.");
      return;
    }
    if (!isAddress(buyerAddr.trim())) {
      notify("구매자 주소가 올바른지 확인하세요.");
      return;
    }
    let amountWei;
    try {
      amountWei = parseUnits(amountHuman.trim() || "0", 6);
    } catch {
      notify("수량 형식이 올바르지 않습니다. (USDT 6 decimals)");
      return;
    }
    if (amountWei <= 0n) {
      notify("수량을 입력하세요.");
      return;
    }
    writeContract({
      address: escrowAddress,
      abi: escrowContractAbi,
      functionName: "createEscrow",
      args: [buyerAddr.trim(), amountWei],
    });
  }

  function onConfirm() {
    if (!viewIdNum) {
      notify("에스크로 ID를 입력하세요.");
      return;
    }
    writeContract({
      address: escrowAddress,
      abi: escrowContractAbi,
      functionName: "confirmReceipt",
      args: [viewIdNum],
    });
  }

  function onDispute() {
    if (!viewIdNum) {
      notify("에스크로 ID를 입력하세요.");
      return;
    }
    writeContract({
      address: escrowAddress,
      abi: escrowContractAbi,
      functionName: "raiseDispute",
      args: [viewIdNum],
    });
  }

  function onResolveDispute(outcome) {
    if (!viewIdNum) {
      notify("에스크로 ID를 입력하세요.");
      return;
    }
    writeContract({
      address: escrowAddress,
      abi: escrowContractAbi,
      functionName: "resolveDispute",
      args: [viewIdNum, outcome],
    });
  }

  const isSuperWallet =
    Boolean(address && superAdminAddr) &&
    address.toLowerCase() === String(superAdminAddr).toLowerCase();

  const injected = connectors.find((c) => c.id === "injected" || c.name?.toLowerCase().includes("injected"));

  return (
    <div className={`${card} mb-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black">온체인 USDT 에스크로 (비수탁)</div>
          <p className={`mt-1 max-w-xl text-[11px] leading-relaxed ${theme.subtext ?? "opacity-80"}`}>
            판매자가 컨트랙트에 USDT를 락하고, 구매자 확인 시 스마트컨트랙트가 판매자·Treasury로 자동 분배합니다. 분쟁 해결은{" "}
            <code className="rounded bg-black/30 px-1">disputeResolver</code>(멀티시그) 또는 <code className="rounded bg-black/30 px-1">superAdmin</code>이{" "}
            <code className="rounded bg-black/30 px-1">resolveDispute</code>를 호출합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={chainId}
            onChange={(e) => switchChain?.({ chainId: Number(e.target.value) })}
            disabled={guestMode || switchPending}
            className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${btn}`}
          >
            <option value={base.id}>Base</option>
            <option value={baseSepolia.id}>Base Sepolia</option>
            <option value={arbitrumSepolia.id}>Arbitrum Sepolia</option>
          </select>
          {!isConnected ? (
            <button
              type="button"
              disabled={guestMode || connectPending || !injected}
              onClick={() => injected && connect({ connector: injected })}
              className={`rounded-xl px-3 py-2 text-xs font-black ${theme.main ?? "bg-emerald-600 text-white"}`}
            >
              {guestMode ? "지갑 (로그인 필요)" : connectPending ? "연결 중…" : "지갑 연결"}
            </button>
          ) : (
            <button type="button" onClick={() => disconnect()} className={`rounded-xl px-3 py-2 text-xs font-black ${btn}`}>
              연결 해제
            </button>
          )}
        </div>
      </div>

      {address ? (
        <div className={`mt-2 font-mono text-[10px] ${theme.muted ?? "opacity-70"}`}>연결됨: {address}</div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className={`rounded-2xl border p-3 ${theme.card ?? ""}`}>
          <div className="text-xs font-black">새 에스크로 (판매자 락)</div>
          <label className={`mt-2 grid gap-1 text-[10px] font-bold ${theme.subtext ?? ""}`}>
            구매자 지갑 주소
            <input
              value={buyerAddr}
              onChange={(e) => setBuyerAddr(e.target.value)}
              placeholder="0x…"
              className={`rounded-xl border px-3 py-2 font-mono text-xs ${theme.input ?? ""}`}
            />
          </label>
          <label className={`mt-2 grid gap-1 text-[10px] font-bold ${theme.subtext ?? ""}`}>
            수량 (USDT, 소수 6자리)
            <input
              value={amountHuman}
              onChange={(e) => setAmountHuman(e.target.value)}
              placeholder="예: 100.5"
              className={`rounded-xl border px-3 py-2 text-xs ${theme.input ?? ""}`}
            />
          </label>
          <button
            type="button"
            disabled={guestMode || writePending || confirming}
            onClick={onCreateEscrow}
            className={`mt-3 w-full rounded-xl py-2 text-xs font-black ${theme.main ?? "bg-indigo-600 text-white"}`}
          >
            {writePending || confirming ? "트랜잭션 대기…" : "createEscrow() — USDT 락"}
          </button>
          <p className={`mt-2 text-[10px] ${theme.muted ?? ""}`}>사전에 ERC20 approve(escrow, amount) 필요합니다. (다음 단계에서 UI 추가)</p>
        </div>

        <div className={`rounded-2xl border p-3 ${theme.card ?? ""}`}>
          <div className="text-xs font-black">상태 조회 · 구매확정 · 분쟁</div>
          <label className={`mt-2 grid gap-1 text-[10px] font-bold ${theme.subtext ?? ""}`}>
            에스크로 ID
            <input
              value={viewId}
              onChange={(e) => setViewId(e.target.value)}
              placeholder="1, 2, …"
              className={`rounded-xl border px-3 py-2 text-xs ${theme.input ?? ""}`}
            />
          </label>
          <button type="button" onClick={() => refetchEscrow?.()} className={`mt-2 rounded-xl px-3 py-2 text-[10px] font-black ${btn}`}>
            새로고침
          </button>

          {escrowRow != null && viewIdNum != null ? (
            <div className={`mt-3 space-y-1 rounded-xl border p-2 text-[10px] ${theme.cardSoft ?? ""}`}>
              <div>
                <span className={theme.muted ?? ""}>seller </span>
                <span className="font-mono">{seller}</span>
              </div>
              <div>
                <span className={theme.muted ?? ""}>buyer </span>
                <span className="font-mono">{buyer}</span>
              </div>
              <div>
                <span className={theme.muted ?? ""}>amount </span>
                <span className="font-black">{formatUnits(amountLocked ?? 0n, 6)} USDT</span>
              </div>
              <div>
                <span className={theme.muted ?? ""}>status </span>
                <span className="font-black">{STATUS_LABELS[statusIdx] ?? statusIdx}</span>
              </div>
              {disputeResolverAddr ? (
                <div className="break-all">
                  <span className={theme.muted ?? ""}>disputeResolver </span>
                  <span className="font-mono">{disputeResolverAddr}</span>
                </div>
              ) : null}
              {superAdminAddr ? (
                <div className="break-all">
                  <span className={theme.muted ?? ""}>superAdmin </span>
                  <span className="font-mono">{superAdminAddr}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <p className={`mt-3 text-[10px] ${theme.muted ?? ""}`}>ID 입력 후 새로고침으로 온체인 상태를 읽습니다.</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={guestMode || writePending || confirming || statusIdx !== 1}
              onClick={onConfirm}
              className={`rounded-xl px-3 py-2 text-[10px] font-black ${theme.main ?? "bg-emerald-600 text-white"}`}
            >
              구매확정 confirmReceipt
            </button>
            <button
              type="button"
              disabled={guestMode || writePending || confirming || statusIdx !== 1}
              onClick={onDispute}
              className={`rounded-xl px-3 py-2 text-[10px] font-black ${btn}`}
            >
              분쟁 제기 raiseDispute
            </button>
          </div>

          {statusIdx === 3 && viewIdNum != null ? (
            <div className={`mt-3 space-y-2 rounded-xl border p-2 text-[10px] ${theme.cardSoft ?? ""}`}>
              <div className="font-black">분쟁 해결 (Disputed)</div>
              {isSuperWallet ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={guestMode || writePending || confirming}
                    onClick={() => onResolveDispute(0)}
                    className={`rounded-xl px-3 py-2 text-[10px] font-black ${theme.main ?? "bg-emerald-600 text-white"}`}
                  >
                    SuperAdmin: 판매자 지급 (outcome 0)
                  </button>
                  <button
                    type="button"
                    disabled={guestMode || writePending || confirming}
                    onClick={() => onResolveDispute(1)}
                    className={`rounded-xl px-3 py-2 text-[10px] font-black ${btn}`}
                  >
                    SuperAdmin: 구매자 환불 (outcome 1)
                  </button>
                </div>
              ) : (
                <p className={theme.muted ?? ""}>
                  연결 지갑이 컨트랙트 <code className="rounded bg-black/30 px-1">superAdmin</code>과 일치할 때만 여기서 직접 트랜잭션을 보냅니다.
                </p>
              )}
              <div className="space-y-1">
                <div className="font-bold">멀티시그용 calldata (disputeResolver 지갑에서 실행)</div>
                <label className={`grid gap-0.5 ${theme.muted ?? ""}`}>
                  resolveDispute(id, 0) — 판매자 지급 + 수수료
                  <textarea readOnly rows={2} className="w-full resize-y rounded border bg-black/20 p-1 font-mono text-[9px]" value={multisigCalldata.paySeller} />
                </label>
                <label className={`grid gap-0.5 ${theme.muted ?? ""}`}>
                  resolveDispute(id, 1) — 구매자 전액 환불
                  <textarea readOnly rows={2} className="w-full resize-y rounded border bg-black/20 p-1 font-mono text-[9px]" value={multisigCalldata.refundBuyer} />
                </label>
              </div>
            </div>
          ) : null}

          <p className={`mt-2 text-[10px] ${theme.muted ?? ""}`}>
            온체인 이벤트 수신 시 상태가 갱신되며, 폴링(약 8초)으로도 보조 동기화합니다.
          </p>
        </div>
      </div>

      <div className={`mt-3 text-[10px] ${theme.muted ?? ""}`}>
        다음 에스크로 예상 ID: <b>{nextEscrowIdRaw != null ? String(nextEscrowIdRaw + 1n) : "…"}</b> (createEscrow 전 참고)
      </div>
    </div>
  );
}
