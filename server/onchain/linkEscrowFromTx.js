/**
 * createEscrow 트랜잭션 리ceipt에서 EscrowCreated 로그를 파싱해 주문 메타에 onchain_escrow_id 기록.
 * 판매자·매수자 지갑은 user_wallets 테이블과 일치해야 함.
 */
import { ethers } from "ethers";

const ESCROW_EVENTS_ABI = [
  {
    type: "event",
    name: "EscrowCreated",
    inputs: [
      { indexed: true, name: "id", type: "uint256" },
      { indexed: true, name: "seller", type: "address" },
      { indexed: true, name: "buyer", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
  },
];

function userIdForWallet(db, addr) {
  const row = db
    .prepare(`SELECT user_id FROM user_wallets WHERE LOWER(wallet_address) = LOWER(?) LIMIT 1`)
    .get(String(addr || "").trim());
  return row?.user_id != null ? Number(row.user_id) : null;
}

export async function parseEscrowCreatedFromTx(rpcUrl, escrowContractAddress, txHash) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) return { ok: false, message: "트랜잭션 리ceipt를 찾을 수 없습니다." };
  const iface = new ethers.Interface(ESCROW_EVENTS_ABI);
  const target = String(escrowContractAddress).trim().toLowerCase();
  for (const log of receipt.logs) {
    if (String(log.address).toLowerCase() !== target) continue;
    try {
      const ev = iface.parseLog({
        topics: /** @type {string[]} */ (log.topics),
        data: log.data,
      });
      if (ev?.name === "EscrowCreated") {
        return {
          ok: true,
          escrowId: String(ev.args.id),
          seller: String(ev.args.seller),
          buyer: String(ev.args.buyer),
          amount: /** @type {bigint} */ (ev.args.amount),
        };
      }
    } catch {
      /* 다음 로그 */
    }
  }
  return { ok: false, message: "EscrowCreated 이벤트가 없거나 컨트랙트 주소가 다릅니다." };
}

/**
 * @param {object} arg
 * @param {import("better-sqlite3").Database} arg.db
 * @param {object} arg.orderRow — p2p_orders 행
 * @param {string} arg.txHash
 * @param {string} arg.rpcUrl
 * @param {string} arg.escrowContractAddress
 */
export async function validateEscrowCreatedForOrder(arg) {
  const { db, orderRow, txHash, rpcUrl, escrowContractAddress } = arg;
  const parsed = await parseEscrowCreatedFromTx(rpcUrl, escrowContractAddress, txHash);
  if (!parsed.ok) return { ok: false, message: parsed.message || "트랜잭션 파싱 실패" };

  const sellerUid = userIdForWallet(db, parsed.seller);
  const buyerUid = userIdForWallet(db, parsed.buyer);
  if (sellerUid !== Number(orderRow.seller_user_id)) {
    return { ok: false, message: "로그의 판매자 주소가 주문 판매자와 연결된 지갑과 일치하지 않습니다." };
  }
  if (orderRow.buyer_user_id == null || buyerUid !== Number(orderRow.buyer_user_id)) {
    return { ok: false, message: "로그의 구매자 주소가 주문 매수자와 연결된 지갑과 일치하지 않습니다." };
  }

  const coin = String(orderRow.coin || "USDT").toUpperCase();
  if (coin !== "USDT") {
    return { ok: false, message: "현재 자동 연결은 USDT 호가만 지원합니다." };
  }

  const amtMinor = BigInt(Math.trunc(Number(orderRow.amount_minor ?? 0)));
  if (parsed.amount !== amtMinor) {
    return {
      ok: false,
      message: `에스크로 물량이 주문과 다릅니다. 체인=${parsed.amount.toString()} 주문_minor=${amtMinor.toString()}`,
    };
  }

  return {
    ok: true,
    escrowId: parsed.escrowId,
    seller: parsed.seller,
    buyer: parsed.buyer,
    amount: parsed.amount,
  };
}
