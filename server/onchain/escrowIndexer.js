/**
 * EscrowCreated 인덱서: finalized 블록 + WS 보강 + (tx,log) 멱등 + 리오그 시 커서·로그 롤백.
 */
import { ethers, JsonRpcProvider, WebSocketProvider } from "ethers";

const SETTING_KEY = "p2p.escrow_indexer";

const ESCROW_EVENTS_ABI = [
  "event EscrowCreated(uint256 indexed id, address indexed seller, address indexed buyer, uint256 amount)",
];

function parseMetaRow(metadataJson) {
  try {
    return JSON.parse(String(metadataJson || "{}"));
  } catch {
    return {};
  }
}

function mergeOrderMeta(db, orderId, patch) {
  const row = db.prepare("SELECT metadata_json FROM p2p_orders WHERE id = ?").get(orderId);
  const meta = parseMetaRow(row?.metadata_json);
  const next = { ...meta, ...patch };
  db.prepare(`UPDATE p2p_orders SET metadata_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(JSON.stringify(next), orderId);
  return next;
}

function userIdForWallet(db, addr) {
  const row = db
    .prepare(`SELECT user_id FROM user_wallets WHERE LOWER(wallet_address) = LOWER(?) LIMIT 1`)
    .get(String(addr || "").trim());
  return row?.user_id != null ? Number(row.user_id) : null;
}

function readIndexerState(db) {
  const row = db.prepare(`SELECT value_json FROM platform_settings WHERE setting_key = ?`).get(SETTING_KEY);
  try {
    return row?.value_json ? JSON.parse(String(row.value_json)) : {};
  } catch {
    return {};
  }
}

function writeIndexerState(db, patch, updatedBy = null) {
  const prev = readIndexerState(db);
  const next = { ...prev, ...patch, updated_at: new Date().toISOString() };
  db.prepare(`
    INSERT INTO platform_settings (setting_key, value_json, updated_by_user_id, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_by_user_id = excluded.updated_by_user_id, updated_at = CURRENT_TIMESTAMP
  `).run(SETTING_KEY, JSON.stringify(next), updatedBy);
}

function getLastProcessedBlock(db) {
  const j = readIndexerState(db);
  return Number.isFinite(Number(j.last_block)) ? Number(j.last_block) : 0;
}

function loadMatchableOrders(db, limit = 400) {
  return db
    .prepare(
      `SELECT * FROM p2p_orders WHERE status IN ('matched','payment_sent') ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(limit);
}

function escrowLogRow(db, txHash, logIndex) {
  return db.prepare(`SELECT order_id FROM p2p_escrow_indexed_logs WHERE tx_hash = ? AND log_index = ?`).get(txHash, logIndex);
}

function ensureEscrowLogPlaceholder(db, txHash, logIndex, blockNumber) {
  const bn = Number.isFinite(Number(blockNumber)) ? Number(blockNumber) : null;
  db.prepare(`INSERT OR IGNORE INTO p2p_escrow_indexed_logs (tx_hash, log_index, block_number) VALUES (?, ?, ?)`).run(txHash, logIndex, bn);
  if (bn != null) {
    db.prepare(`UPDATE p2p_escrow_indexed_logs SET block_number = ? WHERE tx_hash = ? AND log_index = ? AND block_number IS NULL`).run(bn, txHash, logIndex);
  }
}

function finalizeEscrowLog(db, txHash, logIndex, orderId, escrowId, blockNumber) {
  const bn = Number.isFinite(Number(blockNumber)) ? Number(blockNumber) : null;
  db.prepare(
    `UPDATE p2p_escrow_indexed_logs SET order_id = ?, escrow_id = ?, block_number = COALESCE(?, block_number), indexed_at = CURRENT_TIMESTAMP WHERE tx_hash = ? AND log_index = ?`,
  ).run(orderId, escrowId, bn, txHash, logIndex);
}

/**
 * @param {object} opts
 * @param {() => void} [opts.onReorgRewind]
 * @param {number} [opts.reorgRewindBlocks]
 */
export async function runEscrowIndexerTick(opts) {
  const {
    db,
    rpcUrl,
    contractAddress,
    appendP2pOrderEvent,
    maxBlocksPerTick = 400,
    lookbackIfFresh = 2500,
    finalityBlocks = 12,
    onReorgRewind,
    reorgRewindBlocks = 48,
  } = opts;
  const provider = new JsonRpcProvider(rpcUrl);
  const iface = new ethers.Interface(ESCROW_EVENTS_ABI);
  const topic0 = iface.getEvent("EscrowCreated").topicHash;
  const latest = Number(await provider.getBlockNumber());
  const lag = Math.max(0, Math.floor(Number(finalityBlocks) || 0));
  const safeHead = Math.max(0, latest - lag);

  let safeBlock = null;
  try {
    safeBlock = await provider.getBlock(safeHead);
  } catch {
    safeBlock = null;
  }
  const st = readIndexerState(db);
  const prevHash = String(st.safe_head_hash || "");
  const prevNum = Number(st.safe_head_block);
  const rewind = Math.max(8, Math.floor(Number(reorgRewindBlocks) || 48));
  if (safeBlock?.hash && prevHash && Number.isFinite(prevNum) && prevNum === safeHead && safeBlock.hash !== prevHash) {
    const lb = getLastProcessedBlock(db);
    const nb = Math.max(0, lb - rewind);
    writeIndexerState(db, {
      last_block: nb,
      reorg_detected_at: new Date().toISOString(),
      reorg_prev_hash: prevHash.slice(0, 80),
      reorg_new_hash: safeBlock.hash.slice(0, 80),
    });
    db.prepare(`DELETE FROM p2p_escrow_indexed_logs WHERE block_number IS NOT NULL AND block_number > ?`).run(nb);
    onReorgRewind?.({ safeHead, rewindTo: nb, previousLast: lb });
  }
  if (safeBlock?.hash) {
    writeIndexerState(db, { safe_head_hash: safeBlock.hash, safe_head_block: safeHead });
  }

  let from = getLastProcessedBlock(db) + 1;
  if (from <= 0 || from > safeHead) {
    from = Math.max(1, safeHead - lookbackIfFresh + 1);
  }
  const to = Math.min(safeHead, from + maxBlocksPerTick - 1);
  writeIndexerState(db, {
    last_rpc_latest: latest,
    last_safe_head: safeHead,
    last_tick_at: new Date().toISOString(),
    finality_blocks: lag,
  });

  if (from > to) {
    writeIndexerState(db, { last_block: safeHead });
    return { scanned: 0, linked: 0, fromBlock: from, toBlock: to, safeHead, latest, reorg: false };
  }

  const logs = await provider.getLogs({
    address: contractAddress,
    topics: [topic0],
    fromBlock: from,
    toBlock: to,
  });
  const orders = loadMatchableOrders(db);
  let linked = 0;
  for (const log of logs) {
    let parsed;
    try {
      parsed = iface.parseLog({ topics: log.topics, data: log.data });
    } catch {
      continue;
    }
    if (parsed?.name !== "EscrowCreated") continue;
    const escrowId = String(parsed.args.id);
    const seller = String(parsed.args.seller);
    const buyer = String(parsed.args.buyer);
    const amount = /** @type {bigint} */ (parsed.args.amount);
    const sellerUid = userIdForWallet(db, seller);
    const buyerUid = userIdForWallet(db, buyer);
    const txHash = log.transactionHash;
    const logIndex = Number(log.index ?? log.logIndex);
    const blockNumber = Number(log.blockNumber);
    if (!Number.isFinite(logIndex)) continue;

    const seen = escrowLogRow(db, txHash, logIndex);
    if (seen?.order_id) continue;
    ensureEscrowLogPlaceholder(db, txHash, logIndex, blockNumber);

    for (const row of orders) {
      const meta = parseMetaRow(row.metadata_json);
      if (meta.onchain_escrow_id != null && String(meta.onchain_escrow_id).trim() !== "") continue;
      if (Number(row.seller_user_id) !== sellerUid) continue;
      if (row.buyer_user_id == null || Number(row.buyer_user_id) !== buyerUid) continue;
      if (String(row.coin || "").toUpperCase() !== "USDT") continue;
      const amtMinor = BigInt(Math.trunc(Number(row.amount_minor ?? 0)));
      if (amtMinor !== amount) continue;
      mergeOrderMeta(db, row.id, {
        onchain_escrow_id: escrowId,
        onchain_escrow_linked_at: new Date().toISOString(),
        onchain_escrow_tx_hash: txHash,
        onchain_escrow_source: "background_indexer",
      });
      appendP2pOrderEvent?.(row.id, null, "onchain_escrow_indexed", {
        onchain_escrow_id: escrowId,
        tx_hash: txHash,
        log_index: logIndex,
        block_number: blockNumber,
      });
      finalizeEscrowLog(db, txHash, logIndex, String(row.id), escrowId, blockNumber);
      linked += 1;
      break;
    }
  }
  writeIndexerState(db, { last_block: to });
  return { scanned: logs.length, linked, fromBlock: from, toBlock: to, safeHead, latest };
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {NodeJS.ProcessEnv} env
 * @param {(orderId: string, actor: unknown, action: string, detail: object) => void} appendP2pOrderEvent
 * @param {(() => void) | undefined} onReorgRewind
 * @returns {() => void}
 */
export function startEscrowIndexer(db, env, appendP2pOrderEvent, onReorgRewind) {
  const pollMs = Math.max(10_000, Number(env.ESCROW_INDEXER_POLL_MS || 25_000));
  const rpc = String(env.ESCROW_RPC_URL || env.BASE_RPC_URL || "").trim();
  const addr = String(env.ESCROW_CONTRACT_ADDRESS || env.VITE_ESCROW_CONTRACT_ADDRESS || "").trim();
  const wsUrl = String(env.ESCROW_RPC_WS_URL || "").trim();
  const finalityBlocks = Math.max(0, Number(env.ESCROW_INDEXER_FINALITY_BLOCKS ?? 12));
  const reorgRewindBlocks = Math.max(8, Number(env.ESCROW_INDEXER_REORG_REWIND || 48));

  if (!rpc || !addr) {
    console.warn("[escrow-indexer] disabled: missing ESCROW_RPC_URL or ESCROW_CONTRACT_ADDRESS");
    return () => {};
  }
  if (String(env.ESCROW_INDEXER_ENABLED || "1").trim() === "0") {
    console.warn("[escrow-indexer] disabled by ESCROW_INDEXER_ENABLED=0");
    return () => {};
  }

  const tick = () =>
    runEscrowIndexerTick({
      db,
      rpcUrl: rpc,
      contractAddress: addr,
      appendP2pOrderEvent,
      finalityBlocks,
      onReorgRewind,
      reorgRewindBlocks,
    }).catch((e) => console.warn("[escrow-indexer]", e?.message || e));

  const pollTimer = setInterval(tick, pollMs);
  void tick();

  let wsTimer = null;
  if (wsUrl) {
    try {
      const wsProvider = new WebSocketProvider(wsUrl);
      let debounce = null;
      const onBlock = () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          debounce = null;
          void tick();
        }, 1500);
      };
      wsProvider.on("block", onBlock);
      let host = "";
      try {
        host = new URL(wsUrl).host;
      } catch {
        host = "";
      }
      writeIndexerState(db, { ws_subscribe: true, ws_url_host: host });
      wsTimer = { debounce, onBlock, wsProvider };
    } catch (e) {
      console.warn("[escrow-indexer] WS init failed, poll only:", e?.message || e);
      writeIndexerState(db, { ws_subscribe: false, ws_error: String(e?.message || e) });
    }
  }

  return () => {
    clearInterval(pollTimer);
    if (wsTimer?.wsProvider && wsTimer.onBlock) {
      try {
        wsTimer.wsProvider.off("block", wsTimer.onBlock);
      } catch {
        /* ignore */
      }
      if (wsTimer.debounce) clearTimeout(wsTimer.debounce);
      try {
        wsTimer.wsProvider.destroy?.();
      } catch {
        /* ignore */
      }
    }
  };
}
