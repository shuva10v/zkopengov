/**
 * ZK OpenGov Client Library
 *
 * Browser-compatible TypeScript library for generating ZK proofs
 * for private voting on Polkadot OpenGov.
 *
 * All proof generation happens client-side. The library downloads full
 * tree data from the indexer, finds the user's leaf locally, rebuilds
 * Poseidon Merkle trees, computes Merkle paths, and calls the snarkjs
 * WASM prover.
 */

export { generateVoteProof } from './prover';
export { generateRegistrationData, generateCommitment } from './commitment';
export { computeNullifier } from './nullifier';
export { determineTier, TIERS } from './tiers';
export { fetchOwnershipTreeFromUrl, fetchBalancesTreeFromUrl, fetchOwnershipTree, fetchBalancesTree } from './tree-client';
export type {
    VoteProofInput,
    VoteProof,
    RegistrationData,
    TierInfo,
    TreeLeaf,
    TreeData,
    MerkleProofData,
} from './types';
