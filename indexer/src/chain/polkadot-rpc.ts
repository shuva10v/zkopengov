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

  const provider = new WsProvider(rpcUrl, /* autoConnect */ undefined, /* headers */ {}, /* timeout */ 120_000);
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

  // Binary search in a window around the estimate.
  // Start with a wide margin (~30 minutes each side) to handle block time variance.
  // If the window doesn't straddle midnight, expand exponentially until it does.
  const INITIAL_MARGIN = 300; // ~30 minutes each side at 6s/block
  let lo = Math.max(1, estBlock - INITIAL_MARGIN);
  let hi = Math.min(currentBlock, estBlock + INITIAL_MARGIN);

  // Verify the window actually straddles midnight — expand if needed
  let loTs = await getBlockTimestamp(api, lo);
  let hiTs = await getBlockTimestamp(api, hi);

  let expansions = 0;
  while (loTs >= midnightMs && lo > 1 && expansions < 10) {
    // lo is still after midnight — expand left
    lo = Math.max(1, lo - INITIAL_MARGIN * (2 ** expansions));
    loTs = await getBlockTimestamp(api, lo);
    expansions++;
  }

  expansions = 0;
  while (hiTs < midnightMs && hi < currentBlock && expansions < 10) {
    // hi is still before midnight — expand right
    hi = Math.min(currentBlock, hi + INITIAL_MARGIN * (2 ** expansions));
    hiTs = await getBlockTimestamp(api, hi);
    expansions++;
  }

  console.log(
    `[polkadot-rpc] Binary search window: #${lo} (${new Date(loTs).toISOString()}) — #${hi} (${new Date(hiTs).toISOString()})`
  );

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
