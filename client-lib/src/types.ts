/**
 * Input parameters for generating a vote proof.
 */
export interface VoteProofInput {
    /** User's secret (generated during registration) */
    secret: bigint;
    /** User's address (hex, no 0x prefix) */
    address: string;
    /** Proposal ID as bytes32 hex string */
    proposalId: string;
    /** Vote choice: 0=nay, 1=aye, 2=abstain */
    voteChoice: 0 | 1 | 2;
    /** URL to fetch the ownership tree JSON (e.g. S3) */
    ownershipTreeUrl: string;
    /** URL to fetch the balances tree JSON (e.g. S3) */
    balancesTreeUrl: string;
}

/**
 * Generated ZK proof formatted for Solidity verifier submission.
 */
export interface VoteProof {
    proof: {
        pA: [string, string];
        pB: [[string, string], [string, string]];
        pC: [string, string];
    };
    publicInputs: {
        ownershipRoot: string;
        balancesRoot: string;
        proposalId: string;
        voteChoice: number;
        tier: number;
        nullifier: string;
        tierConfig: string;
    };
}

/**
 * Data returned from the registration process.
 */
export interface RegistrationData {
    /** The user's secret -- must be stored safely */
    secret: bigint;
    /** Commitment as bytes32 hex for contract submission */
    commitment: string;
}

/**
 * Information about a balance tier.
 */
export interface TierInfo {
    /** Tier identifier (0-4) */
    id: number;
    /** Minimum balance in plancks (inclusive) */
    min: bigint;
    /** Maximum balance in plancks (exclusive) */
    max: bigint;
    /** Voting weight for this tier */
    weight: number;
}

/**
 * A single leaf in a Merkle tree as returned by the indexer.
 */
export interface TreeLeaf {
    /** Leaf index in the tree */
    index: number;
    /** Account address (hex string) */
    address: string;
    /** Commitment hash (hex string, for ownership tree) */
    commitment?: string;
    /** Balance in plancks (decimal string, for balances tree) */
    balance?: string;
}

/**
 * Full tree data returned from the indexer API.
 */
export interface TreeData {
    /** Merkle root as hex string */
    root: string;
    /** Total number of leaves in the tree */
    leafCount: number;
    /** ISO timestamp of last update */
    updatedAt: string;
    /** All leaves in the tree */
    leaves: TreeLeaf[];
    /** Block number of the snapshot (if applicable) */
    snapshotBlock?: number;
}

/**
 * Merkle proof data: path elements and left/right indices.
 */
export interface MerkleProofData {
    /** Sibling hashes along the path from leaf to root */
    pathElements: bigint[];
    /** 0 = left, 1 = right for each level */
    pathIndices: number[];
}
