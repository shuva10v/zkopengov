/**
 * Balance Fetcher — Raw RPC edition.
 *
 * Fetches all account balances using raw JSON-RPC calls (state_getKeysPaged +
 * state_queryStorageAt) with manual SCALE decoding. This avoids the Polkadot.js
 * codec layer entirely, eliminating the memory leak from TypeRegistry/codec objects.
 *
 * Also provides a mock/demo mode for hackathon testing.
 */

import { WsProvider } from "@polkadot/api";
import { config } from "../config";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/** Minimum balance to include: 1 DOT = 10^10 plancks */
const MIN_BALANCE = 10_000_000_000n;

/** Page size for state_getKeysPaged */
const PAGE_SIZE = 1000;

/** How many keys to batch in state_queryStorageAt per call */
const VALUE_BATCH_SIZE = 500;

/** Max retries per RPC call on timeout */
const MAX_RETRIES = 5;

/** Base delay (ms) for exponential backoff */
const BASE_DELAY_MS = 5_000;

/** Number of parallel workers / partitions */
const NUM_PARTITIONS = 16;
const CONCURRENCY = 4;

/**
 * Storage prefix for system.account:
 *   twox128("System") ++ twox128("Account")
 * = 0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9
 */
const SYSTEM_ACCOUNT_PREFIX =
  "0x26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9";

/**
 * The 12-byte (24 hex char) 0xEE suffix that identifies MetaMask-derived accounts.
 * H160 → AccountId32: address ++ 0xEEEEEEEEEEEEEEEEEEEEEEEE
 */
const EE_SUFFIX = "eeeeeeeeeeeeeeeeeeeeeeee";

/** Prefix length including "0x" */
const PREFIX_HEX_LEN = SYSTEM_ACCOUNT_PREFIX.length; // 66

/**
 * Key layout after prefix: blake2_128concat(accountId)
 *   = 16 bytes hash (32 hex) + 32 bytes accountId (64 hex)
 * AccountId starts at PREFIX_HEX_LEN + 32 = 98
 */
const ACCOUNT_ID_OFFSET = PREFIX_HEX_LEN + 32;
const ACCOUNT_ID_HEX_LEN = 64;

/**
 * SCALE layout of AccountInfo (after "0x"):
 *   nonce: u32 (8 hex) + consumers: u32 (8 hex) +
 *   providers: u32 (8 hex) + sufficients: u32 (8 hex) = 32 hex
 *   data.free: u128 LE (32 hex) @ offset 32
 *   data.reserved: u128 LE (32 hex) @ offset 64
 */
const FREE_OFFSET = 2 + 32;     // after "0x" + 16 bytes header
const RESERVED_OFFSET = 2 + 64; // after "0x" + 16 header + 16 free
const U128_HEX_LEN = 32;

/** Decode a little-endian u128 from a hex string slice */
function decodeU128LE(hex: string, offset: number): bigint {
  let result = 0n;
  for (let i = 0; i < U128_HEX_LEN; i += 2) {
    result |= BigInt(parseInt(hex.slice(offset + i, offset + i + 2), 16)) << BigInt((i / 2) * 8);
  }
  return result;
}

/** Extract accountId hex (0x-prefixed, lowercase) from a full storage key */
function extractAccountId(key: string): string {
  return "0x" + key.slice(ACCOUNT_ID_OFFSET, ACCOUNT_ID_OFFSET + ACCOUNT_ID_HEX_LEN).toLowerCase();
}

/**
 * Get the 20-byte EVM (H160) address for an AccountId32, or null if not EVM-compatible.
 *
 * - MetaMask-derived: AccountId32 = H160 ++ 0xEEEEEEEEEEEEEEEEEEEEEEEE
 *   → return first 20 bytes as H160
 * - Mapped native: present in mappedAccounts map (AccountId32 → H160)
 *   → return the mapped H160
 */
function getEvmAddress(accountId: string, mappedAccounts: Map<string, string>): string | null {
  const lower = accountId.toLowerCase();
  // MetaMask / EVM wallet: H160 ++ 0xEEEEEEEEEEEEEEEEEEEEEEEE
  if (lower.endsWith(EE_SUFFIX)) {
    return "0x" + lower.slice(2, 42);
  }
  // Native Polkadot account that called pallet_revive::map_account
  const h160 = mappedAccounts.get(lower);
  if (h160) return h160;
  return null;
}

/** Extract free + reserved balance from a SCALE-encoded AccountInfo value */
function extractBalance(value: string): bigint {
  const free = decodeU128LE(value, FREE_OFFSET);
  const reserved = decodeU128LE(value, RESERVED_OFFSET);
  return free + reserved;
}

/** Send an RPC call with retry + exponential backoff */
async function rpcWithRetry(provider: WsProvider, method: string, params: any[]): Promise<any> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await provider.send(method, params);
    } catch (err: any) {
      const isTimeout = err?.message?.includes("No response received") ||
        err?.message?.includes("timeout") ||
        err?.message?.includes("disconnected");
      if (!isTimeout || attempt === MAX_RETRIES) throw err;

      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(
        `[balance-fetcher] RPC ${method} timeout (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay / 1000}s...`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}

function estimatePartitionProgress(
  currentKey: string,
  startKey: string | undefined,
  endKey: string | null
): number | null {
  const suffixOffset = PREFIX_HEX_LEN;
  const cur = parseInt(currentKey.slice(suffixOffset, suffixOffset + 12), 16);
  const lo = startKey ? parseInt(startKey.slice(suffixOffset, suffixOffset + 12), 16) : 0;
  const hi = endKey ? parseInt(endKey.slice(suffixOffset, suffixOffset + 12), 16) : 0xffffffffffff;
  if (hi <= lo) return null;
  return Math.min(1, Math.max(0, (cur - lo) / (hi - lo)));
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m${s}s`;
}

/**
 * Scan a partition of the storage key space using raw RPC.
 * 1. state_getKeysPaged to paginate through keys
 * 2. state_queryStorageAt to batch-fetch values
 * 3. Manual SCALE decode — no codec objects, no memory leak
 */
async function scanPartition(
  provider: WsProvider,
  partitionId: number,
  partitionStartKey: string | undefined,
  partitionEndKey: string | null,
  blockHash: string | undefined,
  fd: number,
  progress: { scanned: number; qualified: number; evmFiltered: number },
  mappedAccounts: Map<string, string>
): Promise<void> {
  let lastKey: string | undefined = partitionStartKey;
  let lastLogAt = 0;
  const startedAt = Date.now();

  while (true) {
    // 1. Fetch a page of storage keys
    const keys: string[] = await rpcWithRetry(provider, "state_getKeysPaged", [
      SYSTEM_ACCOUNT_PREFIX,
      PAGE_SIZE,
      lastKey ?? null,
      blockHash ?? null,
    ]);

    if (keys.length === 0) break;

    // Trim keys that cross into the next partition
    let trimmedKeys = keys;
    if (partitionEndKey) {
      const cutoff = keys.findIndex((k) => k >= partitionEndKey);
      if (cutoff === 0) break;
      if (cutoff > 0) trimmedKeys = keys.slice(0, cutoff);
    }

    if (trimmedKeys.length === 0) break;

    // 2. Batch-fetch values using state_queryStorageAt
    for (let batchStart = 0; batchStart < trimmedKeys.length; batchStart += VALUE_BATCH_SIZE) {
      const batchKeys = trimmedKeys.slice(batchStart, batchStart + VALUE_BATCH_SIZE);

      const result = await rpcWithRetry(provider, "state_queryStorageAt", [
        batchKeys,
        blockHash ?? null,
      ]);

      // result = [{ block, changes: [[key, value], ...] }]
      const changes: [string, string | null][] = result[0]?.changes ?? [];

      for (const [key, value] of changes) {
        if (!value) continue;
        try {
          const total = extractBalance(value);
          if (total >= MIN_BALANCE) {
            const accountId = extractAccountId(key);
            const evmAddr = getEvmAddress(accountId, mappedAccounts);
            if (!evmAddr) {
              progress.evmFiltered++;
              continue;
            }
            fs.writeSync(fd, `${evmAddr}\t${total.toString()}\n`);
            progress.qualified++;
          }
        } catch {
          // Skip entries that fail to decode
        }
      }
    }

    progress.scanned += trimmedKeys.length;
    lastKey = trimmedKeys[trimmedKeys.length - 1];

    // Log every 10k accounts with ETA
    if (progress.scanned - lastLogAt >= 10_000) {
      lastLogAt = progress.scanned;
      const memMB = Math.round(process.memoryUsage.rss() / 1024 / 1024);
      const pct = estimatePartitionProgress(lastKey, partitionStartKey, partitionEndKey);
      const elapsed = (Date.now() - startedAt) / 1000;
      let etaStr = "";
      if (pct !== null && pct > 0.01) {
        const remaining = (elapsed / pct) * (1 - pct);
        etaStr = ` ~${formatEta(remaining)} remaining`;
      }
      console.log(
        `[balance-fetcher] P${partitionId}: ${progress.scanned} scanned, ${progress.qualified} qualified` +
        `${pct !== null ? ` (${(pct * 100).toFixed(0)}%${etaStr})` : ""}` +
        ` [${memMB}MB]`
      );
    }

    // If we trimmed, we've crossed the partition boundary
    if (trimmedKeys.length < keys.length) break;
    if (keys.length < PAGE_SIZE) break;
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const memMB = Math.round(process.memoryUsage.rss() / 1024 / 1024);
  console.log(
    `[balance-fetcher] P${partitionId} done in ${elapsed}s: ${progress.scanned} scanned, ${progress.qualified} qualified [${memMB}MB]`
  );
}

/**
 * Storage prefix for revive.originalAccount:
 *   twox128("Revive") ++ twox128("OriginalAccount")
 *
 * Key layout: prefix ++ blake2_128concat(H160)
 *   = 16 bytes hash (32 hex) + 20 bytes H160 (40 hex)
 * Value: AccountId32 (32 bytes, SCALE-encoded)
 */
const REVIVE_ORIGINAL_ACCOUNT_PREFIX =
  "0x" +
  // twox128("Revive")
  "735f040a5d490f1107ad9c56f5ca00d2" +
  // twox128("OriginalAccount")
  "c56ab6c1f203b345fe5879f819627723";

/**
 * Fetch all accounts that called pallet_revive::map_account.
 *
 * Scans the revive.originalAccount storage to find native Polkadot accounts
 * that have an explicit H160 mapping. Returns a Map from AccountId32 to the
 * corresponding H160 address (both lowercase hex, 0x-prefixed).
 *
 * Key layout: prefix + blake2_128concat(H160)
 *   = prefix (66 chars) + 16-byte hash (32 hex) + 20-byte H160 (40 hex)
 *
 * @param provider - Connected WsProvider
 * @param blockHash - Optional block hash for a specific snapshot
 * @returns Map of AccountId32 => H160 hex strings (lowercase) for EVM-mapped accounts
 */
async function fetchMappedAccounts(
  provider: WsProvider,
  blockHash?: string
): Promise<Map<string, string>> {
  console.log("[balance-fetcher] Scanning revive.originalAccount for mapped native accounts...");

  const mapped = new Map<string, string>();
  let lastKey: string | undefined = undefined;

  const REVIVE_PREFIX_LEN = REVIVE_ORIGINAL_ACCOUNT_PREFIX.length; // 66
  const H160_OFFSET = REVIVE_PREFIX_LEN + 32; // after blake2_128 hash
  const H160_HEX_LEN = 40; // 20 bytes

  while (true) {
    const keys: string[] = await rpcWithRetry(provider, "state_getKeysPaged", [
      REVIVE_ORIGINAL_ACCOUNT_PREFIX,
      PAGE_SIZE,
      lastKey ?? null,
      blockHash ?? null,
    ]);

    if (keys.length === 0) break;

    // Batch-fetch the values (AccountId32 for each mapping)
    const result = await rpcWithRetry(provider, "state_queryStorageAt", [
      keys,
      blockHash ?? null,
    ]);

    const changes: [string, string | null][] = result[0]?.changes ?? [];
    for (const [key, value] of changes) {
      if (!value) continue;
      // Value is SCALE-encoded AccountId32: 0x + 64 hex chars (32 bytes)
      const accountId32 = "0x" + value.slice(2, 66).toLowerCase();
      // H160 address is embedded in the storage key after the blake2_128 hash
      const h160 = "0x" + key.slice(H160_OFFSET, H160_OFFSET + H160_HEX_LEN).toLowerCase();
      mapped.set(accountId32, h160);
    }

    lastKey = keys[keys.length - 1];
    if (keys.length < PAGE_SIZE) break;
  }

  console.log(`[balance-fetcher] Found ${mapped.size} mapped native accounts`);
  return mapped;
}

/**
 * Fetch all EVM-compatible account balances from the Polkadot chain.
 *
 * Only includes accounts that can interact with pallet-revive contracts:
 *   1. MetaMask-derived accounts (AccountId32 ending in 0xEE...EE)
 *   2. Native accounts that called pallet_revive::map_account
 *
 * Uses state_getKeysPaged + state_queryStorageAt with manual SCALE decoding.
 * No Polkadot.js codec objects are created, so memory stays flat.
 *
 * Splits the key space into 16 partitions and scans 4 at a time for ~4x speedup.
 *
 * @param rpcUrl - WebSocket RPC endpoint URL
 * @param blockHash - Optional block hash for a specific snapshot
 * @returns Map of hex address => total balance in plancks
 */
export async function fetchAllBalances(
  rpcUrl: string,
  blockHash?: string
): Promise<Map<string, bigint>> {
  console.log("[balance-fetcher] Fetching EVM-compatible account balances (raw RPC, parallel)...");
  console.log(`[balance-fetcher] RPC: ${rpcUrl}`);
  console.log(`[balance-fetcher] Block hash: ${blockHash || "latest"}`);
  console.log(`[balance-fetcher] ${NUM_PARTITIONS} partitions, ${CONCURRENCY} workers`);
  console.log(`[balance-fetcher] Storage prefix: ${SYSTEM_ACCOUNT_PREFIX}`);

  const provider = new WsProvider(rpcUrl, undefined, {}, 120_000);
  await provider.isReady;

  // Step 0: Fetch the set of native accounts that called map_account
  const mappedAccounts = await fetchMappedAccounts(provider, blockHash);

  // Build partition boundaries
  const step = Math.floor(256 / NUM_PARTITIONS);
  const partitions: { startKey: string | undefined; endKey: string | null; id: number }[] = [];

  for (let i = 0; i < NUM_PARTITIONS; i++) {
    const startByte = i * step;
    const endByte = i < NUM_PARTITIONS - 1 ? (i + 1) * step : null;

    const startKey = i === 0
      ? undefined
      : SYSTEM_ACCOUNT_PREFIX + startByte.toString(16).padStart(2, "0").repeat(32);

    const endKey = endByte !== null
      ? SYSTEM_ACCOUNT_PREFIX + endByte.toString(16).padStart(2, "0").repeat(32)
      : null;

    partitions.push({ startKey, endKey, id: i });
  }

  // Stream qualifying accounts to temp file
  const tmpFile = path.join(os.tmpdir(), `balances-${Date.now()}.tsv`);
  const fd = fs.openSync(tmpFile, "w");
  const startTime = Date.now();

  try {
    const progressList = partitions.map(() => ({ scanned: 0, qualified: 0, evmFiltered: 0 }));
    const queue = [...partitions];

    async function worker(): Promise<void> {
      while (queue.length > 0) {
        const p = queue.shift()!;
        await scanPartition(
          provider, p.id, p.startKey, p.endKey, blockHash, fd, progressList[p.id], mappedAccounts
        );
      }
    }

    const workers: Promise<void>[] = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    const totalScanned = progressList.reduce((s, p) => s + p.scanned, 0);
    const totalQualified = progressList.reduce((s, p) => s + p.qualified, 0);
    const totalEvmFiltered = progressList.reduce((s, p) => s + p.evmFiltered, 0);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(
      `[balance-fetcher] Scan complete in ${elapsed}s. ${totalScanned} total, ${totalQualified} EVM-compatible, ${totalEvmFiltered} substrate-only filtered out. Loading into memory...`
    );
  } finally {
    fs.closeSync(fd);
    await provider.disconnect();
  }

  // Load results from temp file into Map
  const balances = new Map<string, bigint>();
  const content = fs.readFileSync(tmpFile, "utf8");
  for (const line of content.split("\n")) {
    if (!line) continue;
    const [address, balanceStr] = line.split("\t");
    balances.set(address, BigInt(balanceStr));
  }

  fs.unlinkSync(tmpFile);

  console.log(
    `[balance-fetcher] Done. Found ${balances.size} EVM-compatible accounts with balance >= 1 DOT`
  );

  return balances;
}

/**
 * Generate mock balances for demo/hackathon testing.
 *
 * @param count - Number of mock accounts to generate (default from config)
 * @returns Map of address (hex) => total balance in plancks
 */
export function generateMockBalances(
  count?: number
): Map<string, bigint> {
  const numAccounts = count || config.demoAccountCount;
  const balances = new Map<string, bigint>();

  console.log(
    `[balance-fetcher] Generating ${numAccounts} mock account balances...`
  );

  const sampleBalances: bigint[] = [
    15_000_000_000n, 50_000_000_000n, 250_000_000_000n, 750_000_000_000n,
    1_500_000_000_000n, 3_000_000_000_000n, 7_500_000_000_000n,
    15_000_000_000_000n, 50_000_000_000_000n,
    150_000_000_000_000n, 500_000_000_000_000n,
    1_500_000_000_000_000n, 5_000_000_000_000_000n,
    12_000_000_000n, 99_000_000_000n,
  ];

  for (let i = 0; i < numAccounts; i++) {
    const addrHex = "0x" + (i + 1).toString(16).padStart(40, "0");
    const balance = sampleBalances[i % sampleBalances.length];
    balances.set(addrHex, balance);
  }

  console.log(`[balance-fetcher] Generated ${balances.size} mock balances`);
  return balances;
}

/**
 * Determine which tier an account falls into based on its balance.
 *
 * @param balance - Balance in plancks
 * @returns Tier ID (0-4) or -1 if below minimum tier threshold
 */
export function getTierForBalance(balance: bigint): number {
  for (const tier of config.tiers) {
    if (balance >= tier.min && balance < tier.max) {
      return tier.id;
    }
  }
  return -1;
}
