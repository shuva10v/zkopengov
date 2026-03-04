export const config = {
    evmRpc: process.env.EVM_RPC || "http://localhost:8545",
    votingBoothAddress: process.env.VOTING_BOOTH_ADDRESS || "",
    registryAddress: process.env.REGISTRY_ADDRESS || "",
    privateKey:
        process.env.RELAYER_PRIVATE_KEY ||
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // hardhat default account #0
    port: parseInt(process.env.PORT || "3002"),
    maxQueueSize: 100,
};

export const VOTING_BOOTH_ABI = [
    "function vote(uint256[2] calldata pA, uint256[2][2] calldata pB, uint256[2] calldata pC, bytes32 ownershipRoot, bytes32 balancesRoot, bytes32 proposalId, uint8 voteChoice, uint8 tier, bytes32 nullifier) external",
    "function nullifierUsed(bytes32, bytes32) view returns (bool)",
];

export const VOTING_REGISTRY_ABI = [
    "function isKnownOwnershipRoot(bytes32) view returns (bool)",
    "function isKnownBalancesRoot(bytes32) view returns (bool)",
    "function getProposalBlock(bytes32) view returns (uint256)",
    "function findBalancesRootForProposal(uint256) view returns (bytes32 root, uint256 snapshotBlock)",
];
