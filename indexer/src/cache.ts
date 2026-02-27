/**
 * Disk cache for indexed balance snapshots.
 *
 * Saves balance data keyed by block number to avoid re-fetching on restart.
 * Files are stored in the `data/` directory as `balances-<blockNumber>.json`.
 */

import * as fs from "fs";
import * as path from "path";

const DATA_DIR = process.env.CACHE_DIR || path.join(process.cwd(), "data");

export interface CachedBalances {
  blockNumber: number;
  blockHash: string;
  fetchedAt: string;
  accountCount: number;
  /** address (SS58) => balance in plancks (as string for JSON compat) */
  balances: Record<string, string>;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`[cache] Created data directory: ${DATA_DIR}`);
  }
}

function cacheFilePath(blockNumber: number): string {
  return path.join(DATA_DIR, `balances-${blockNumber}.json`);
}

/**
 * Check if we have cached balances for a given block.
 */
export function hasCachedBalances(blockNumber: number): boolean {
  return fs.existsSync(cacheFilePath(blockNumber));
}

/**
 * Load cached balances for a block number.
 * Returns null if no cache exists.
 */
export function loadCachedBalances(blockNumber: number): Map<string, bigint> | null {
  const filePath = cacheFilePath(blockNumber);
  if (!fs.existsSync(filePath)) return null;

  console.log(`[cache] Loading cached balances from ${filePath}...`);
  const raw = fs.readFileSync(filePath, "utf-8");
  const data: CachedBalances = JSON.parse(raw);

  const balances = new Map<string, bigint>();
  for (const [addr, bal] of Object.entries(data.balances)) {
    balances.set(addr, BigInt(bal));
  }

  console.log(
    `[cache] Loaded ${balances.size} balances for block ${data.blockNumber} (fetched ${data.fetchedAt})`
  );
  return balances;
}

/**
 * Save balances to disk cache.
 */
export function saveCachedBalances(
  blockNumber: number,
  blockHash: string,
  balances: Map<string, bigint>
): void {
  ensureDataDir();
  const filePath = cacheFilePath(blockNumber);

  const data: CachedBalances = {
    blockNumber,
    blockHash,
    fetchedAt: new Date().toISOString(),
    accountCount: balances.size,
    balances: {},
  };

  for (const [addr, bal] of balances) {
    data.balances[addr] = bal.toString();
  }

  console.log(`[cache] Saving ${balances.size} balances to ${filePath}...`);
  fs.writeFileSync(filePath, JSON.stringify(data), "utf-8");
  console.log(`[cache] Saved.`);
}

/**
 * List all cached block numbers (sorted descending).
 */
export function listCachedBlocks(): number[] {
  ensureDataDir();
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.startsWith("balances-") && f.endsWith(".json"))
    .map((f) => parseInt(f.replace("balances-", "").replace(".json", ""), 10))
    .filter((n) => !isNaN(n))
    .sort((a, b) => b - a);
}
