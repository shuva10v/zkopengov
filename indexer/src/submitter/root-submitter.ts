/**
 * Root Submitter.
 *
 * Submits Merkle tree roots to the VotingRegistry contract on-chain.
 * The tree builder (indexer operator) signs these transactions.
 */

import { ethers } from "ethers";

/** ABI fragments for root submission functions */
const REGISTRY_ABI = [
  "function submitOwnershipRoot(uint256 root, uint256 registrationCount) external",
  "function submitBalancesRoot(uint256 root, uint256 snapshotBlock) external",
  "function ownershipRoot() external view returns (uint256)",
  "function balancesRoot() external view returns (uint256)",
];

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
): Promise<ethers.TransactionReceipt> {
  console.log(
    `[root-submitter] Submitting ownership root: ${root.toString().slice(0, 20)}... (${regCount} registrations)`
  );

  const contract = new ethers.Contract(registryAddress, REGISTRY_ABI, signer);

  const tx = await contract.submitOwnershipRoot(root, regCount);
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
): Promise<ethers.TransactionReceipt> {
  console.log(
    `[root-submitter] Submitting balances root: ${root.toString().slice(0, 20)}... (snapshot block ${snapshotBlock})`
  );

  const contract = new ethers.Contract(registryAddress, REGISTRY_ABI, signer);

  const tx = await contract.submitBalancesRoot(root, snapshotBlock);
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
  const root = await contract.ownershipRoot();
  return BigInt(root.toString());
}

/**
 * Read the current on-chain balances root.
 */
export async function readBalancesRoot(
  provider: ethers.Provider,
  registryAddress: string
): Promise<bigint> {
  const contract = new ethers.Contract(registryAddress, REGISTRY_ABI, provider);
  const root = await contract.balancesRoot();
  return BigInt(root.toString());
}
