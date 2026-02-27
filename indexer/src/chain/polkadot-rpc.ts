/**
 * Polkadot.js API wrapper.
 *
 * Provides a singleton-style connection manager for the Polkadot chain.
 * Handles connection lifecycle and exposes commonly-used API methods.
 */

import { ApiPromise, WsProvider } from "@polkadot/api";
import { config } from "../config";

let apiInstance: ApiPromise | null = null;

/**
 * Connect to the Polkadot chain via WebSocket RPC.
 * Returns a cached instance if already connected.
 */
export async function connectToChain(
  endpoint?: string
): Promise<ApiPromise> {
  if (apiInstance && apiInstance.isConnected) {
    return apiInstance;
  }

  const rpcUrl = endpoint || config.polkadotRpc;
  console.log(`[polkadot-rpc] Connecting to ${rpcUrl}...`);

  const provider = new WsProvider(rpcUrl);
  apiInstance = await ApiPromise.create({ provider });

  await apiInstance.isReady;

  const chain = await apiInstance.rpc.system.chain();
  const version = await apiInstance.rpc.system.version();
  console.log(
    `[polkadot-rpc] Connected to ${chain} (node ${version})`
  );

  return apiInstance;
}

/**
 * Disconnect from the Polkadot chain.
 */
export async function disconnectFromChain(): Promise<void> {
  if (apiInstance) {
    await apiInstance.disconnect();
    apiInstance = null;
    console.log("[polkadot-rpc] Disconnected from chain");
  }
}

/**
 * Get the current API instance. Throws if not connected.
 */
export function getApi(): ApiPromise {
  if (!apiInstance || !apiInstance.isConnected) {
    throw new Error(
      "[polkadot-rpc] Not connected to chain. Call connectToChain() first."
    );
  }
  return apiInstance;
}

/**
 * Get the latest finalized block hash and number.
 */
export async function getLatestFinalizedBlock(): Promise<{
  hash: string;
  number: number;
}> {
  const api = getApi();
  const finalizedHash = await api.rpc.chain.getFinalizedHead();
  const header = await api.rpc.chain.getHeader(finalizedHash);

  return {
    hash: finalizedHash.toHex(),
    number: header.number.toNumber(),
  };
}

/**
 * Get the timestamp (ms) stored in a given block.
 */
async function getBlockTimestamp(
  api: ApiPromise,
  blockNumber: number
): Promise<number> {
  const hash = await api.rpc.chain.getBlockHash(blockNumber);
  const apiAt = await api.at(hash);
  return Number((await apiAt.query.timestamp.now()).toString());
}

/**
 * Find the first block of today (00:00 UTC) using estimate + binary search.
 *
 * 1. Get the current finalized block and its timestamp.
 * 2. Estimate how many blocks back midnight was (~6s block time).
 * 3. Binary search a narrow window to find the exact first block >= midnight.
 */
export async function getFirstBlockOfToday(): Promise<{
  hash: string;
  number: number;
}> {
  const api = getApi();

  // Current finalized block
  const finalizedHash = await api.rpc.chain.getFinalizedHead();
  const header = await api.rpc.chain.getHeader(finalizedHash);
  const currentBlock = header.number.toNumber();
  const currentTs = await getBlockTimestamp(api, currentBlock);

  // Midnight UTC today
  const now = new Date();
  const midnightMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );

  // If the chain timestamp is before today's midnight (clock skew / just after midnight),
  // fall back to the finalized block itself.
  if (currentTs < midnightMs) {
    console.log(
      "[polkadot-rpc] Current finalized block is before today's midnight, using it directly"
    );
    return { hash: finalizedHash.toHex(), number: currentBlock };
  }

  // Estimate block at midnight (~6s block time)
  const estBlocksBack = Math.floor((currentTs - midnightMs) / 6000);
  const estBlock = currentBlock - estBlocksBack;

  console.log(
    `[polkadot-rpc] Searching for first block of today (${new Date(midnightMs).toISOString()})...`
  );
  console.log(
    `[polkadot-rpc] Current block: ${currentBlock}, estimated midnight block: ${estBlock}`
  );

  // Binary search in a window around the estimate
  const SEARCH_MARGIN = 30; // ~3 minutes each side
  let lo = Math.max(1, estBlock - SEARCH_MARGIN);
  let hi = Math.min(currentBlock, estBlock + SEARCH_MARGIN);

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const ts = await getBlockTimestamp(api, mid);
    if (ts < midnightMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const blockHash = await api.rpc.chain.getBlockHash(lo);
  const blockTs = await getBlockTimestamp(api, lo);

  console.log(
    `[polkadot-rpc] First block of today: #${lo} at ${new Date(blockTs).toISOString()}`
  );

  return { hash: blockHash.toHex(), number: lo };
}
