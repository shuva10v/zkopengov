/**
 * Contract instances for interacting with VotingRegistry and VotingBooth.
 *
 * Uses ethers v6 with minimal human-readable ABIs. Contracts are created
 * lazily when addresses are configured.
 */

import { ethers } from 'ethers';
import { config } from './config';

// --- Minimal ABIs ---

const REGISTRY_ABI = [
    'function register(bytes32 commitment) external',
    'function isRegistered(address) view returns (bool)',
    'function getRegistrationCount() view returns (uint256)',
    'function getRegistration(uint256 index) view returns (address account, bytes32 commitment)',
    'function getProposalBlock(bytes32 proposalId) view returns (uint256)',
    'function findBalancesRootForProposal(uint256 proposalBlock) view returns (bytes32 root, uint256 snapshotBlock)',
    'function latestBalancesRoot() view returns (bytes32)',
    'function latestOwnershipRoot() view returns (bytes32)',
    'function latestOwnershipRegCount() view returns (uint256)',
    'function getSubmittedBlockCount() view returns (uint256)',
    'function submittedBlocks(uint256) view returns (uint256)',
    'event Registered(uint256 indexed index, address indexed account, bytes32 commitment)',
];

const VOTING_BOOTH_ABI = [
    'function getResults(bytes32 proposalId) view returns (uint256 totalAye, uint256 totalNay, uint256 totalAbstain, uint256 voteCount)',
    'function getTierResults(bytes32 proposalId, uint8 tier) view returns (uint256 aye, uint256 nay, uint256 abstain)',
    'function getTierCount() view returns (uint256)',
    'function nullifierUsed(bytes32, bytes32) view returns (bool)',
];

// --- Provider helpers ---

/**
 * Get a JSON-RPC provider. Falls back to the configured EVM RPC.
 */
export function getProvider(): ethers.JsonRpcProvider {
    return new ethers.JsonRpcProvider(config.evmRpc);
}

/**
 * Get a browser-based signer from window.ethereum (MetaMask).
 */
export async function getBrowserSigner(): Promise<ethers.Signer> {
    if (!window.ethereum) {
        throw new Error('No Ethereum wallet detected. Please install MetaMask.');
    }
    const provider = new ethers.BrowserProvider(window.ethereum);
    return provider.getSigner();
}

// --- Contract factories ---

/**
 * Get a read-only VotingRegistry contract instance.
 */
export function getRegistryContract(): ethers.Contract {
    if (!config.registryAddress) {
        throw new Error('Registry address not configured. Set VITE_REGISTRY_ADDRESS.');
    }
    return new ethers.Contract(config.registryAddress, REGISTRY_ABI, getProvider());
}

/**
 * Get a VotingRegistry contract instance with a signer (for write operations).
 */
export async function getRegistryWithSigner(): Promise<ethers.Contract> {
    if (!config.registryAddress) {
        throw new Error('Registry address not configured. Set VITE_REGISTRY_ADDRESS.');
    }
    const signer = await getBrowserSigner();
    return new ethers.Contract(config.registryAddress, REGISTRY_ABI, signer);
}

/**
 * Look up the balances root that applies to a given proposal block.
 * Returns the root and the snapshot block it corresponds to.
 */
export async function findBalancesRootForProposal(
    proposalBlock: number
): Promise<{ root: string; snapshotBlock: number }> {
    const registry = getRegistryContract();
    const [root, snapshotBlock] = await registry.findBalancesRootForProposal(proposalBlock);
    return { root, snapshotBlock: Number(snapshotBlock) };
}

/**
 * Check whether a proposal has been registered on-chain for private voting.
 * Returns true if the proposal's createdAtBlock is recorded in the registry.
 */
export async function isProposalRegistered(
    proposalId: string
): Promise<boolean> {
    const registry = getRegistryContract();
    const block: bigint = await registry.getProposalBlock(proposalId);
    return block > 0n;
}

/**
 * Get a read-only VotingBooth contract instance.
 */
export function getVotingBoothContract(): ethers.Contract {
    if (!config.votingBoothAddress) {
        throw new Error('VotingBooth address not configured. Set VITE_VOTING_BOOTH_ADDRESS.');
    }
    return new ethers.Contract(config.votingBoothAddress, VOTING_BOOTH_ABI, getProvider());
}
