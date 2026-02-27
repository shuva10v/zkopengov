/**
 * Ownership Tree Builder.
 *
 * Constructs a Poseidon Merkle tree from VotingRegistry registration events.
 * Each leaf is: Poseidon(address, commitment)
 *
 * The address is treated as a numeric value (the 20-byte Ethereum address
 * interpreted as a big-endian unsigned integer). The commitment comes directly
 * from the Registered event emitted by the VotingRegistry contract.
 */

import { PoseidonMerkleTree } from "./PoseidonMerkleTree";

export interface Registration {
  /** EVM address (hex string, e.g. "0xabc...") */
  address: string;
  /** Poseidon commitment from the Registered event (decimal or hex string) */
  commitment: string;
}

/**
 * Convert an Ethereum address hex string to a bigint.
 */
export function addressToBigInt(address: string): bigint {
  const normalized = address.toLowerCase().startsWith("0x")
    ? address
    : "0x" + address;
  return BigInt(normalized);
}

/**
 * Build the ownership Merkle tree from an array of registrations.
 *
 * @param registrations - Array of { address, commitment } from contract events
 * @param poseidon - circomlibjs poseidon instance
 * @param depth - Merkle tree depth
 * @returns A populated PoseidonMerkleTree whose leaves are Poseidon(address, commitment)
 */
export async function buildOwnershipTree(
  registrations: Registration[],
  poseidon: any,
  depth: number
): Promise<PoseidonMerkleTree> {
  const F = poseidon.F;
  const tree = new PoseidonMerkleTree(depth, poseidon);

  for (const reg of registrations) {
    const addrBigInt = addressToBigInt(reg.address);
    const commitBigInt = BigInt(reg.commitment);

    // Leaf = Poseidon(address, commitment)
    const leafHash = poseidon([addrBigInt, commitBigInt]);
    const leaf = BigInt(F.toString(leafHash));

    tree.insert(leaf);
  }

  return tree;
}

/**
 * Compute the leaf value for a single registration.
 * Useful for the client to locate its own leaf in the downloaded tree.
 */
export function computeOwnershipLeaf(
  address: string,
  commitment: string,
  poseidon: any
): bigint {
  const F = poseidon.F;
  const addrBigInt = addressToBigInt(address);
  const commitBigInt = BigInt(commitment);
  const leafHash = poseidon([addrBigInt, commitBigInt]);
  return BigInt(F.toString(leafHash));
}
