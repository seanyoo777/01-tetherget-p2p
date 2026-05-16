import React, { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { isAddress } from "viem";
import { escrowContractAbi } from "../contracts/escrowAbi.js";
import { P2P_ESCROW_COPY } from "./p2pEscrowCopy.js";

const STATUS_LABELS = ["None", "Funded", "Released", "Disputed", "RefundedToBuyer", "EmergencyWithdrawn"];

function parseEscrowAddress() {
  const raw = import.meta.env.VITE_ESCROW_CONTRACT_ADDRESS;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const v = raw.trim();
  return isAddress(v) ? v : null;
}

function parseOrderMeta(metadataJson) {
  if (!metadataJson) return {};
  if (typeof metadataJson === "object") return metadataJson;
  try {
    return JSON.parse(String(metadataJson));
  } catch {
    return {};
  }
}

/**
 * 진행 중 P2P 주문 카드용: 에스크로 컨트랙트 ID를 주문에 저장(PATCH) + buyer 가 Funded 일 때 confirmReceipt.
 */
export function P2pOnchainEscrowBlock({ row, theme, notify, apiClient, onReload }) {
  const escrowAddress = useMemo(() => parseEscrowAddress(), []);
  const meta = useMemo(() => parseOrderMeta(row.metadata_json), [row.metadata_json]);
  const linkedIdStr = meta.onchain_escrow_id != null ? String(meta.onchain_escrow_id).trim() : "";
  const linkedId = /^\d+$/.test(linkedIdStr) ? BigInt(linkedIdStr) : null;

  const [inputId, setInputId] = useState("");
  const [txHashInput, setTxHashInput] = useState("");
  const [linking, setLinking] = useState(false);

  const { address, isConnected } = useAccount();

  const { writeContract, data: writeHash, isPending: writePending, error: writeError } = useWriteContract();
  const { isLoading: confirmWait, isSuccess: confirmSuccess } = useWaitForTransactionReceipt({
    hash: writeHash,
  });

  useEffect(() => {
    if (!writeError) return;
    notify(writeError.shortMessage || writeError.message || "온체인 트랜잭션 오류");
  }, [writeError, notify]);

  useEffect(() => {
    if (!confirmSuccess || !writeHash) return;
    notify("온체인 수령 확인(confirmReceipt) 이 블록에 포함되었습니다.");
    void onReload?.();
  }, [confirmSuccess, writeHash, notify, onReload]);

  const { data: escrowRow } = useReadContract({
    address: escrowAddress ?? undefined,
    abi: escrowContractAbi,
    functionName: "escrows",
    args: linkedId != null ? [linkedId] : undefined,
    query: {
      enabled: Boolean(escrowAddress && linkedId != null),
      refetchInterval: 10_000,
    },
  });

  const onchainBuyer = escrowRow?.[1];
  const onchainStatus = escrowRow != null ? Number(escrowRow[3]) : null;

  const canParty = row.my_role === "seller" || row.my_role === "buyer";
  const showLinkForm =
    canParty && (row.status === "matched" || row.status === "payment_sent");

  const isBuyerWallet =
    isConnected &&
    address &&
    onchainBuyer &&
    String(address).toLowerCase() === String(onchainBuyer).toLowerCase();

  async function submitLink(e) {
    e.preventDefault();
    const raw = inputId.trim();
    if (!/^\d+$/.test(raw)) {
      notify("에스크로 ID는 양의 정수여야 합니다.");
      return;
    }
    setLinking(true);
    try {
      await apiClient.request(`/api/p2p/orders/${encodeURIComponent(row.id)}/onchain-escrow`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({
          onchainEscrowId: raw,
          ...(txHashInput.trim() ? { txHash: txHashInput.trim() } : {}),
        }),
      });
      notify("주문에 온체인 에스크로 ID를 저장했습니다.");
      setInputId("");
      setTxHashInput("");
      await onReload?.();
    } catch (err) {
      notify(err.message || "저장에 실패했습니다.");
    } finally {
      setLinking(false);
    }
  }

  function onConfirmReceipt() {
    if (!escrowAddress || linkedId == null) return;
    writeContract({
      address: escrowAddress,
      abi: escrowContractAbi,
      functionName: "confirmReceipt",
      args: [linkedId],
    });
  }

  if (!escrowAddress) {
    return (
      <div className={`mt-2 rounded-lg border border-white/10 px-2 py-2 text-[10px] ${theme.muted}`}>
        {P2P_ESCROW_COPY.onchainNoContract}
      </div>
    );
  }

  return (
    <div className={`mt-3 rounded-xl border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 text-[10px]`}>
      <div className="font-black text-cyan-200">{P2P_ESCROW_COPY.onchainBlockTitle}</div>
      {meta.onchain_escrow_id ? (
        <div className={`mt-1 ${theme.muted}`}>
          연결 ID: <span className="font-mono text-cyan-300">{String(meta.onchain_escrow_id)}</span>
          {meta.onchain_escrow_linked_at ? <span> · {meta.onchain_escrow_linked_at}</span> : null}
        </div>
      ) : (
        <div className={`mt-1 ${theme.muted}`}>
          컨트랙트 에스크로 ID가 주문에 없습니다. 판매자가 createEscrow 후 아래에 저장합니다.
        </div>
      )}
      {escrowRow != null && linkedId != null ? (
        <div className={`mt-1 ${theme.muted}`}>
          체인 상태: {onchainStatus != null ? STATUS_LABELS[onchainStatus] ?? onchainStatus : "…"} · Buyer{" "}
          <span className="font-mono">{onchainBuyer ? String(onchainBuyer).slice(0, 12) : "—"}…</span>
        </div>
      ) : null}

      {showLinkForm ? (
        <form className="mt-2 flex flex-col gap-1" onSubmit={submitLink}>
          <label className={`${theme.muted}`}>
            에스크로 ID (정수)
            <input
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
              className={`mt-0.5 w-full rounded border border-white/15 bg-black/30 px-2 py-1 font-mono text-[10px] ${theme.input}`}
              placeholder={meta.onchain_escrow_id ? String(meta.onchain_escrow_id) : "예: 12"}
              inputMode="numeric"
            />
          </label>
          <label className={`${theme.muted}`}>
            생성 TX 해시 (선택)
            <input
              value={txHashInput}
              onChange={(e) => setTxHashInput(e.target.value)}
              className={`mt-0.5 w-full rounded border border-white/15 bg-black/30 px-2 py-1 font-mono text-[10px] ${theme.input}`}
              placeholder="0x…"
            />
          </label>
          <button
            type="submit"
            disabled={linking}
            className={`mt-1 rounded-lg border border-cyan-500/50 px-2 py-1 text-[10px] font-black text-cyan-200 ${theme.input}`}
          >
            {linking ? "저장 중…" : meta.onchain_escrow_id ? "에스크로 ID 수정" : "주문에 에스크로 ID 저장"}
          </button>
        </form>
      ) : null}

      {row.status === "payment_sent" && row.my_role === "buyer" && meta.onchain_escrow_id ? (
        <div className="mt-2 space-y-1">
          {!isConnected ? (
            <div className={theme.muted}>수령 확인: 지갑 연결 (연결 주소 = 컨트랙트 buyer 와 동일해야 함).</div>
          ) : !isBuyerWallet ? (
            <div className="text-amber-300">
              연결된 지갑이 에스크로 buyer 와 다릅니다. 매수 시 사용한 지갑으로 전환하세요.
            </div>
          ) : onchainStatus === 1 ? (
            <button
              type="button"
              disabled={writePending || confirmWait}
              onClick={onConfirmReceipt}
              className={`rounded-lg border border-emerald-500/60 px-2 py-1 text-[10px] font-black text-emerald-200 ${theme.main}`}
            >
              {writePending || confirmWait ? "트랜잭션…" : "온체인 수령 확인 (confirmReceipt)"}
            </button>
          ) : (
            <div className={theme.muted}>
              Funded 가 아니면 수령 확인 불가 (현재:{" "}
              {onchainStatus != null ? STATUS_LABELS[onchainStatus] ?? onchainStatus : "조회 중"}).
            </div>
          )}
        </div>
      ) : null}
      <p className={`mt-2 text-[9px] ${theme.muted}`}>{P2P_ESCROW_COPY.onchainBlockFootnote}</p>
    </div>
  );
}
