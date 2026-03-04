/**
 * Pre-defined test accounts for deterministic E2E testing.
 *
 * Each account maps to a Hardhat default account (indices 1-5; index 0 is the deployer).
 * Secrets are derived deterministically from keccak256 so that tests are reproducible.
 * Balances are in plancks (1 DOT = 10^10 plancks).
 */

import { ethers } from "hardhat";

export interface TestAccount {
  /** Human-readable name */
  name: string;
  /** Hardhat signer index (1-5) */
  signerIndex: number;
  /** Known secret for deterministic testing (derived from keccak256) */
  secret: bigint;
  /** Simulated DOT balance in plancks */
  balance: bigint;
  /** Expected tier index (0-4) */
  expectedTier: number;
  /** Expected voting weight for the tier */
  expectedWeight: number;
}

/**
 * BN254 scalar field prime. Secrets must be strictly less than this.
 */
const BN254_PRIME =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * Derive a deterministic secret from a label using keccak256, reduced modulo the BN254 prime.
 */
function deriveSecret(label: string): bigint {
  const hash = ethers.keccak256(ethers.toUtf8Bytes(label));
  const raw = BigInt(hash);
  // Reduce modulo BN254 prime to ensure it is a valid field element
  return raw % BN254_PRIME;
}

/**
 * The five test accounts. Their signer indices correspond to Hardhat's default
 * accounts at positions 1 through 5.
 *
 * Tier boundaries (from client-lib/src/tiers.ts):
 *   Tier 0:  10_000_000_000     ..  1_000_000_000_000     (1-100 DOT)       weight 1
 *   Tier 1:  1_000_000_000_000  ..  10_000_000_000_000    (100-1,000 DOT)   weight 3
 *   Tier 2:  10_000_000_000_000 ..  100_000_000_000_000   (1,000-10,000 DOT) weight 6
 *   Tier 3:  100_000_000_000_000 .. 1_000_000_000_000_000 (10,000-100k DOT) weight 10
 *   Tier 4:  1_000_000_000_000_000 .. 2^128               (100k+ DOT)       weight 15
 */
export const TEST_ACCOUNTS: TestAccount[] = [
  {
    name: "Alice",
    signerIndex: 1,
    secret: deriveSecret("alice-secret"),
    balance: 500_000_000_000n, // 50 DOT -> tier 0, weight 1
    expectedTier: 0,
    expectedWeight: 1,
  },
  {
    name: "Bob",
    signerIndex: 2,
    secret: deriveSecret("bob-secret"),
    balance: 5_000_000_000_000n, // 500 DOT -> tier 1, weight 3
    expectedTier: 1,
    expectedWeight: 3,
  },
  {
    name: "Charlie",
    signerIndex: 3,
    secret: deriveSecret("charlie-secret"),
    balance: 50_000_000_000_000n, // 5,000 DOT -> tier 2, weight 6
    expectedTier: 2,
    expectedWeight: 6,
  },
  {
    name: "Diana",
    signerIndex: 4,
    secret: deriveSecret("diana-secret"),
    balance: 500_000_000_000_000n, // 50,000 DOT -> tier 3, weight 10
    expectedTier: 3,
    expectedWeight: 10,
  },
  {
    name: "Eve",
    signerIndex: 5,
    secret: deriveSecret("eve-secret"),
    balance: 2_000_000_000_000_000n, // 200,000 DOT -> tier 4, weight 15
    expectedTier: 4,
    expectedWeight: 15,
  },
];

/**
 * Tier definitions matching the contract configuration.
 * All values in plancks.
 */
export const TIER_CONFIGS = [
  {
    min: 10_000_000_000n,
    max: 1_000_000_000_000n,
    weight: 1n,
  },
  {
    min: 1_000_000_000_000n,
    max: 10_000_000_000_000n,
    weight: 3n,
  },
  {
    min: 10_000_000_000_000n,
    max: 100_000_000_000_000n,
    weight: 6n,
  },
  {
    min: 100_000_000_000_000n,
    max: 1_000_000_000_000_000n,
    weight: 10n,
  },
  {
    min: 1_000_000_000_000_000n,
    max: BigInt("340282366920938463463374607431768211456"), // 2^128
    weight: 15n,
  },
];
