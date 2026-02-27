/**
 * Balance Fetcher.
 *
 * Fetches all account balances from the Polkadot chain using paginated
 * storage key enumeration. Filters to accounts with balance >= 1 DOT.
 *
 * Also provides a mock/demo mode for hackathon testing.
 */

import { ApiPromise } from "@polkadot/api";
import { config } from "../config";

/** Minimum balance to include: 1 DOT = 10^10 plancks */
const MIN_BALANCE = 10_000_000_000n;

/** Page size for storage key pagination */
const PAGE_SIZE = 1000;

/**
 * Fetch all account balances from the Polkadot chain.
 *
 * Uses `api.query.system.account.entriesPaged()` for memory-efficient
 * paginated iteration through all accounts.
 * Filters to accounts with total balance (free + reserved) >= 1 DOT.
 *
 * @param api - Connected Polkadot.js API instance
 * @param blockHash - Optional block hash for a specific snapshot
 * @returns Map of SS58 address => total balance in plancks
 */
export async function fetchAllBalances(
  api: ApiPromise,
  blockHash?: string
): Promise<Map<string, bigint>> {
  console.log("[balance-fetcher] Fetching all account balances (paginated)...");
  console.log(`[balance-fetcher] Block hash: ${blockHash || "latest"}`);

  const balances = new Map<string, bigint>();
  const apiAt = blockHash ? await api.at(blockHash) : api;

  let totalScanned = 0;
  let lastKey: string | undefined = undefined;

  while (true) {
    const page: [any, any][] = await apiAt.query.system.account.entriesPaged({
      args: [],
      pageSize: PAGE_SIZE,
      startKey: lastKey,
    });

    const pageLen = page.length;
    if (pageLen === 0) break;

    // Extract the last key before processing (we only need the hex key for pagination)
    lastKey = page[pageLen - 1][0].toHex();

    // Extract only primitive values from each entry to allow GC of heavy codec objects
    for (let i = 0; i < pageLen; i++) {
      try {
        const accountId = page[i][0].args[0].toString();
        const data = (page[i][1] as any).data;
        const total = BigInt(data.free.toString()) + BigInt(data.reserved.toString());

        if (total >= MIN_BALANCE) {
          balances.set(accountId, total);
        }
      } catch {
        // Skip accounts that fail to decode
      }
      // Release reference to allow GC of the codec objects
      page[i] = null as any;
    }

    totalScanned += pageLen;

    if (totalScanned % 50000 === 0 || pageLen < PAGE_SIZE) {
      console.log(
        `[balance-fetcher] Scanned ${totalScanned} accounts, ${balances.size} with >= 1 DOT...`
      );
    }

    if (pageLen < PAGE_SIZE) break;
  }

  console.log(
    `[balance-fetcher] Done. Scanned ${totalScanned} total, found ${balances.size} with balance >= 1 DOT`
  );

  return balances;
}

/**
 * Generate mock balances for demo/hackathon testing.
 *
 * Creates accounts with balances distributed across all tiers to exercise
 * the full system.
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

  // Sample balance values across all tiers
  const sampleBalances: bigint[] = [
    // Tier 0: 1-100 DOT
    15_000_000_000n,       // 1.5 DOT
    50_000_000_000n,       // 5 DOT
    250_000_000_000n,      // 25 DOT
    750_000_000_000n,      // 75 DOT
    // Tier 1: 100-1000 DOT
    1_500_000_000_000n,    // 150 DOT
    3_000_000_000_000n,    // 300 DOT
    7_500_000_000_000n,    // 750 DOT
    // Tier 2: 1000-10000 DOT
    15_000_000_000_000n,   // 1,500 DOT
    50_000_000_000_000n,   // 5,000 DOT
    // Tier 3: 10000-100000 DOT
    150_000_000_000_000n,  // 15,000 DOT
    500_000_000_000_000n,  // 50,000 DOT
    // Tier 4: 100000+ DOT
    1_500_000_000_000_000n, // 150,000 DOT
    5_000_000_000_000_000n, // 500,000 DOT
    // Extra small ones
    12_000_000_000n,       // 1.2 DOT
    99_000_000_000n,       // 9.9 DOT
  ];

  for (let i = 0; i < numAccounts; i++) {
    // Generate a deterministic fake address
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
