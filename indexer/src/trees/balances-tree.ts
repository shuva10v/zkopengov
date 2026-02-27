/**
 * Balances Tree Builder.
 *
 * Constructs a Poseidon Merkle tree from a snapshot of chain balances.
 * Each leaf is: Poseidon(address, balance)
 *
 * The address can be either:
 *   - An SS58 string (from Polkadot chain queries, e.g. "111B8Cxc...")
 *   - A hex string (from EVM/mock data, e.g. "0xabc...")
 * Both are converted to a 32-byte public key as a bigint for hashing.
 */

import { decodeAddress } from "@polkadot/util-crypto";
import { u8aToHex } from "@polkadot/util";
import { PoseidonMerkleTree } from "./PoseidonMerkleTree";

/**
 * Convert an address (SS58 or hex) to a bigint.
 * SS58 addresses are decoded to their raw 32-byte public key.
 * Hex addresses (0x-prefixed) are used directly.
 */
function addressToBigInt(address: string): bigint {
  if (address.startsWith("0x")) {
    return BigInt(address);
  }
  // SS58 → raw 32-byte public key → hex → bigint
  const raw = decodeAddress(address);
  const hex = u8aToHex(raw);
  return BigInt(hex);
}

/**
 * Build the balances Merkle tree from a map of address => balance.
 *
 * Addresses are sorted lexicographically to ensure deterministic leaf ordering.
 *
 * @param balances - Map of address (hex) => total balance in plancks
 * @param poseidon - circomlibjs poseidon instance
 * @param depth - Merkle tree depth
 * @returns A populated PoseidonMerkleTree whose leaves are Poseidon(address, balance)
 */
export async function buildBalancesTree(
  balances: Map<string, bigint>,
  poseidon: any,
  depth: number
): Promise<PoseidonMerkleTree> {
  const F = poseidon.F;
  const tree = new PoseidonMerkleTree(depth, poseidon);

  // Sort addresses for deterministic ordering
  const sortedAddresses = Array.from(balances.keys()).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  for (const address of sortedAddresses) {
    const balance = balances.get(address)!;
    const addrBigInt = addressToBigInt(address);

    // Leaf = Poseidon(address, balance)
    const leafHash = poseidon([addrBigInt, balance]);
    const leaf = BigInt(F.toString(leafHash));

    tree.insert(leaf);
  }

  return tree;
}

/**
 * Compute the leaf value for a single address/balance pair.
 * Useful for the client to locate its own leaf in the downloaded tree.
 */
export function computeBalanceLeaf(
  address: string,
  balance: bigint,
  poseidon: any
): bigint {
  const F = poseidon.F;
  const addrBigInt = addressToBigInt(address);
  const leafHash = poseidon([addrBigInt, balance]);
  return BigInt(F.toString(leafHash));
}
