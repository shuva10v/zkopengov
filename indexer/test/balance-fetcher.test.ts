/**
 * Balance Fetcher tests.
 *
 * Tests the mock balance generation and tier classification logic.
 * Real chain tests would require a live Polkadot connection.
 */

import { generateMockBalances, getTierForBalance } from "../src/chain/balance-fetcher";
import { config } from "../src/config";

describe("generateMockBalances", () => {
  it("should generate the requested number of accounts", () => {
    const balances = generateMockBalances(10);
    expect(balances.size).toBe(10);
  });

  it("should generate default number of accounts from config", () => {
    const balances = generateMockBalances();
    expect(balances.size).toBe(config.demoAccountCount);
  });

  it("should generate valid hex addresses", () => {
    const balances = generateMockBalances(5);

    for (const [address] of balances) {
      expect(address).toMatch(/^0x[0-9a-f]{40}$/);
    }
  });

  it("should generate positive balances", () => {
    const balances = generateMockBalances(15);

    for (const [, balance] of balances) {
      expect(balance > 0n).toBe(true);
    }
  });

  it("should generate balances across multiple tiers", () => {
    const balances = generateMockBalances(15);
    const tiersHit = new Set<number>();

    for (const [, balance] of balances) {
      const tier = getTierForBalance(balance);
      if (tier >= 0) {
        tiersHit.add(tier);
      }
    }

    // With 15 accounts, we should hit at least 3 tiers
    expect(tiersHit.size).toBeGreaterThanOrEqual(3);
  });

  it("should generate deterministic addresses", () => {
    const b1 = generateMockBalances(5);
    const b2 = generateMockBalances(5);

    const addrs1 = Array.from(b1.keys());
    const addrs2 = Array.from(b2.keys());

    expect(addrs1).toEqual(addrs2);
  });
});

describe("getTierForBalance", () => {
  it("should return tier 0 for 1-100 DOT", () => {
    expect(getTierForBalance(10_000_000_000n)).toBe(0);     // 1 DOT
    expect(getTierForBalance(50_000_000_000n)).toBe(0);     // 5 DOT
    expect(getTierForBalance(999_999_999_999n)).toBe(0);    // ~99.99 DOT
  });

  it("should return tier 1 for 100-1000 DOT", () => {
    expect(getTierForBalance(1_000_000_000_000n)).toBe(1);  // 100 DOT
    expect(getTierForBalance(5_000_000_000_000n)).toBe(1);  // 500 DOT
    expect(getTierForBalance(9_999_999_999_999n)).toBe(1);  // ~999.99 DOT
  });

  it("should return tier 2 for 1000-10000 DOT", () => {
    expect(getTierForBalance(10_000_000_000_000n)).toBe(2);
    expect(getTierForBalance(50_000_000_000_000n)).toBe(2);
  });

  it("should return tier 3 for 10000-100000 DOT", () => {
    expect(getTierForBalance(100_000_000_000_000n)).toBe(3);
    expect(getTierForBalance(500_000_000_000_000n)).toBe(3);
  });

  it("should return tier 4 for 100000+ DOT", () => {
    expect(getTierForBalance(1_000_000_000_000_000n)).toBe(4);
    expect(getTierForBalance(10_000_000_000_000_000n)).toBe(4);
  });

  it("should return -1 for balance below minimum tier", () => {
    expect(getTierForBalance(0n)).toBe(-1);
    expect(getTierForBalance(1_000_000_000n)).toBe(-1);   // 0.1 DOT
    expect(getTierForBalance(9_999_999_999n)).toBe(-1);   // ~0.999 DOT
  });
});
