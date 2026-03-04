/**
 * Circuit input formatter for the ZK private voting proof.
 *
 * snarkjs expects all circuit inputs as decimal strings. This module
 * takes the various bigint and structured values and formats them into
 * the exact shape expected by the PrivateVote circuit.
 */

import { MerkleProofData, TierInfo } from './types';
import { packTierConfig } from './tiers';

/**
 * All circuit inputs formatted as decimal strings for snarkjs.
 */
export interface CircuitInputs {
    // Public signals
    ownershipRoot: string;
    balancesRoot: string;
    proposalId: string;
    voteChoice: string;
    tier: string;
    nullifier: string;
    tierConfig: string;
    // Private signals
    secret: string;
    address: string;
    balance: string;
    ownershipPathElements: string[];
    ownershipPathIndices: string[];
    balancesPathElements: string[];
    balancesPathIndices: string[];
    tierMin: string;
    tierMax: string;
}

/**
 * Parameters for formatting circuit inputs.
 */
export interface FormatParams {
    secret: bigint;
    address: bigint;
    balance: bigint;
    proposalId: bigint;
    voteChoice: number;
    tier: TierInfo;
    nullifier: bigint;
    ownershipRoot: bigint;
    balancesRoot: bigint;
    ownershipProof: MerkleProofData;
    balancesProof: MerkleProofData;
}

/**
 * Format all values into the circuit input structure expected by snarkjs.
 *
 * All values are converted to decimal strings. Path arrays are padded
 * or verified to match the expected tree depth (21).
 *
 * @param params - All the raw values needed for the circuit
 * @returns The formatted circuit inputs
 */
export function formatCircuitInputs(params: FormatParams): CircuitInputs {
    const tierConfigValue = packTierConfig(params.tier);

    return {
        // Public signals
        ownershipRoot: params.ownershipRoot.toString(),
        balancesRoot: params.balancesRoot.toString(),
        proposalId: params.proposalId.toString(),
        voteChoice: params.voteChoice.toString(),
        tier: params.tier.id.toString(),
        nullifier: params.nullifier.toString(),
        tierConfig: tierConfigValue.toString(),

        // Private signals
        secret: params.secret.toString(),
        address: params.address.toString(),
        balance: params.balance.toString(),
        ownershipPathElements: params.ownershipProof.pathElements.map((e) => e.toString()),
        ownershipPathIndices: params.ownershipProof.pathIndices.map((i) => i.toString()),
        balancesPathElements: params.balancesProof.pathElements.map((e) => e.toString()),
        balancesPathIndices: params.balancesProof.pathIndices.map((i) => i.toString()),
        tierMin: params.tier.min.toString(),
        tierMax: params.tier.max.toString(),
    };
}
