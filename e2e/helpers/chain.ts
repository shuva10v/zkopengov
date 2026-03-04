/**
 * Hardhat network helpers for E2E tests.
 *
 * Provides utility functions for interacting with the local Hardhat node
 * during testing, such as snapshot/restore and time manipulation.
 */

import { ethers, network } from "hardhat";

/**
 * Take a snapshot of the current chain state.
 * Returns a snapshot ID that can be used to revert later.
 */
export async function takeSnapshot(): Promise<string> {
  const snapshotId = await network.provider.send("evm_snapshot", []);
  return snapshotId;
}

/**
 * Revert the chain to a previous snapshot.
 * The snapshot is consumed (single-use).
 */
export async function revertToSnapshot(snapshotId: string): Promise<void> {
  await network.provider.send("evm_revert", [snapshotId]);
}

/**
 * Mine a single block.
 */
export async function mineBlock(): Promise<void> {
  await network.provider.send("evm_mine", []);
}

/**
 * Get the current block number.
 */
export async function getBlockNumber(): Promise<number> {
  return await ethers.provider.getBlockNumber();
}

/**
 * Convert a bigint to a bytes32 hex string (0x-prefixed, zero-padded to 64 hex chars).
 */
export function bigintToBytes32(value: bigint): string {
  return "0x" + value.toString(16).padStart(64, "0");
}

/**
 * Convert a bytes32 hex string to a bigint.
 */
export function bytes32ToBigint(hex: string): bigint {
  return BigInt(hex);
}
