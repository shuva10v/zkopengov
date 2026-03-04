/**
 * Nullifier computation for ZK private voting.
 *
 * The nullifier = Poseidon(secret, proposalId) prevents double-voting:
 * each (secret, proposal) pair produces a unique, deterministic nullifier
 * that is revealed publicly without leaking the secret.
 */

import { poseidonHash } from './poseidon';

/**
 * Compute the nullifier for a given secret and proposal ID.
 *
 * @param secret - The user's private secret
 * @param proposalId - The proposal identifier as a bigint
 * @returns The nullifier as a bigint
 * @throws If Poseidon has not been initialized
 */
export function computeNullifier(secret: bigint, proposalId: bigint): bigint {
    return poseidonHash([secret, proposalId]);
}
