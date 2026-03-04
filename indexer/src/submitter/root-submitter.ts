/**
 * Root Submitter.
 *
 * Submits Merkle tree roots to the VotingRegistry contract on-chain.
 * The tree builder (indexer operator) signs these transactions.
 */

import { ethers } from "ethers";

/** ABI fragments for root submission functions */
const REGISTRY_ABI = [
  "function submitOwnershipRoot(bytes32 root, uint256 registrationCount) external",
  "function submitBalancesRoot(bytes32 root, uint256 snapshotBlock) external",
  "function latestOwnershipRoot() external view returns (bytes32)",
  "function latestBalancesRoot() external view returns (bytes32)",
  "function latestOwnershipRegCount() external view returns (uint256)",
  "function getBalancesRootForBlock(uint256 blockNumber) external view returns (bytes32)",
];

/** Convert a bigint to a bytes32 hex string */
function bigintToBytes32(value: bigint): string {
  return "0x" + value.toString(16).padStart(64, "0");
}

/**
 * Submit the ownership tree root to the VotingRegistry contract.
 *
 * @param signer - ethers.js Signer (tree builder account)
 * @param registryAddress - VotingRegistry contract address
 * @param root - Merkle root of the ownership tree
 * @param regCount - Number of registrations included in the tree
 * @returns Transaction receipt
 */
export async function submitOwnershipRoot(
  signer: ethers.Signer,
  registryAddress: string,
  root: bigint,
  regCount: number
): Promise<ethers.TransactionReceipt | null> {
  const contract = new ethers.Contract(registryAddress, REGISTRY_ABI, signer);

  // Skip if on-chain root already matches
  const currentRegCount = Number(await contract.latestOwnershipRegCount());
  if (currentRegCount >= regCount) {
    console.log(
      `[root-submitter] Ownership root already up-to-date (on-chain regCount=${currentRegCount}, local=${regCount}), skipping`
    );
    return null;
  }

  console.log(
    `[root-submitter] Submitting ownership root: ${root.toString().slice(0, 20)}... (${regCount} registrations)`
  );

  const tx = await contract.submitOwnershipRoot(bigintToBytes32(root), regCount);
  console.log(`[root-submitter] TX hash: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(
    `[root-submitter] Ownership root submitted in block ${receipt.blockNumber}`
  );

  return receipt;
}

/**
 * Submit the balances tree root to the VotingRegistry contract.
 *
 * @param signer - ethers.js Signer (tree builder account)
 * @param registryAddress - VotingRegistry contract address
 * @param root - Merkle root of the balances tree
 * @param snapshotBlock - Block number at which the balance snapshot was taken
 * @returns Transaction receipt
 */
export async function submitBalancesRoot(
  signer: ethers.Signer,
  registryAddress: string,
  root: bigint,
  snapshotBlock: number
): Promise<ethers.TransactionReceipt | null> {
  const contract = new ethers.Contract(registryAddress, REGISTRY_ABI, signer);

  // Skip if this block already has a root on-chain
  const existingRoot = await contract.getBalancesRootForBlock(snapshotBlock);
  if (existingRoot !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
    console.log(
      `[root-submitter] Balances root for block ${snapshotBlock} already submitted, skipping`
    );
    return null;
  }

  console.log(
    `[root-submitter] Submitting balances root: ${root.toString().slice(0, 20)}... (snapshot block ${snapshotBlock})`
  );

  const tx = await contract.submitBalancesRoot(bigintToBytes32(root), snapshotBlock);
  console.log(`[root-submitter] TX hash: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(
    `[root-submitter] Balances root submitted in block ${receipt.blockNumber}`
  );

  return receipt;
}

/**
 * Read the current on-chain ownership root.
 */
export async function readOwnershipRoot(
  provider: ethers.Provider,
  registryAddress: string
): Promise<bigint> {
  const contract = new ethers.Contract(registryAddress, REGISTRY_ABI, provider);
  const root = await contract.latestOwnershipRoot();
  return BigInt(root);
}

/**
 * Read the current on-chain balances root.
 */
export async function readBalancesRoot(
  provider: ethers.Provider,
  registryAddress: string
): Promise<bigint> {
  const contract = new ethers.Contract(registryAddress, REGISTRY_ABI, provider);
  const root = await contract.latestBalancesRoot();
  return BigInt(root);
}
