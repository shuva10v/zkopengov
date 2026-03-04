/**
 * Main proof generation entry point for ZK private voting.
 *
 * This module orchestrates the entire proof generation pipeline:
 * 1. Initialize Poseidon hash
 * 2. Download full tree data from the indexer (privacy-preserving)
 * 3. Find the user's leaves locally
 * 4. Rebuild Merkle trees and compute proofs
 * 5. Determine balance tier
 * 6. Compute nullifier
 * 7. Format circuit inputs
 * 8. Generate the ZK proof via snarkjs
 * 9. Format the proof for Solidity verifier submission
 */

import * as snarkjs from 'snarkjs';
import { initPoseidon, poseidonHash } from './poseidon';
import { fetchOwnershipTreeFromUrl, fetchBalancesTreeFromUrl } from './tree-client';
import { buildOwnershipTreeFromData, buildBalancesTreeFromData } from './merkle-tree';
import { computeNullifier } from './nullifier';
import { determineTier } from './tiers';
import { formatCircuitInputs } from './input-formatter';
import { VoteProofInput, VoteProof, TreeLeaf } from './types';

/** Default path to the circuit WASM file (served from frontend public/) */
const CIRCUIT_WASM_PATH = '/PrivateVote.wasm';

/** Default path to the circuit zkey file (served from frontend public/) */
const CIRCUIT_ZKEY_PATH = '/circuit_final.zkey';

/**
 * Generate a ZK vote proof.
 *
 * This is the main entry point for proof generation. It handles the entire
 * pipeline from downloading tree data to producing a proof formatted for
 * submission to the Solidity verifier contract.
 *
 * @param input - Vote proof input parameters
 * @param wasmPath - Optional custom path to the circuit WASM file
 * @param zkeyPath - Optional custom path to the circuit zkey file
 * @returns The formatted ZK proof and public inputs
 * @throws If the user is not registered or not found in the balances snapshot
 */
export async function generateVoteProof(
    input: VoteProofInput,
    wasmPath: string = CIRCUIT_WASM_PATH,
    zkeyPath: string = CIRCUIT_ZKEY_PATH,
): Promise<VoteProof> {
    // 1. Initialize Poseidon
    await initPoseidon();

    // 2. Download full tree data (privacy: same data for everyone)
    const ownershipData = await fetchOwnershipTreeFromUrl(input.ownershipTreeUrl);
    const balancesData = await fetchBalancesTreeFromUrl(input.balancesTreeUrl);

    // 3. Normalise EVM address (20 bytes, lowercase, no 0x)
    const addressHex = input.address.replace(/^0x/, '').toLowerCase();
    const addressBigInt = BigInt('0x' + addressHex);

    // 4. Find own leaves locally (no server-side filtering)
    const commitment = poseidonHash([input.secret]);

    const ownershipLeaf = ownershipData.leaves.find(
        (l: TreeLeaf) => l.address.replace(/^0x/, '').toLowerCase() === addressHex
    );
    const balancesLeaf = balancesData.leaves.find(
        (l: TreeLeaf) => l.address.replace(/^0x/, '').toLowerCase() === addressHex
    );

    if (!ownershipLeaf) {
        throw new Error('Not registered in ownership tree');
    }
    if (!balancesLeaf) {
        const accountCount = balancesData.leafCount ?? balancesData.leaves.length;
        const snapshotInfo = balancesData.snapshotBlock
            ? ` (snapshot block #${balancesData.snapshotBlock}, ${accountCount} accounts)`
            : ` (${accountCount} accounts)`;
        throw new Error(
            `Address not found in balances snapshot${snapshotInfo}. ` +
            `Your account must have a balance before the proposal's snapshot block.`
        );
    }

    // 5. Rebuild Poseidon Merkle trees locally and compute proofs
    const ownershipTree = buildOwnershipTreeFromData(
        ownershipData.leaves.map((l: TreeLeaf) => ({
            address: l.address,
            commitment: l.commitment!,
        }))
    );
    const balancesTree = buildBalancesTreeFromData(
        balancesData.leaves.map((l: TreeLeaf) => ({
            address: l.address,
            balance: l.balance!,
        }))
    );

    const ownershipProof = ownershipTree.getProof(ownershipLeaf.index);
    const balancesProof = balancesTree.getProof(balancesLeaf.index);

    // 6. Determine tier
    const balance = BigInt(balancesLeaf.balance!);
    const tier = determineTier(balance);

    // 7. Compute nullifier
    const proposalIdBigInt = BigInt(input.proposalId);
    const nullifier = computeNullifier(input.secret, proposalIdBigInt);

    // 8. Format circuit inputs
    const circuitInputs = formatCircuitInputs({
        secret: input.secret,
        address: addressBigInt,
        balance: balance,
        proposalId: proposalIdBigInt,
        voteChoice: input.voteChoice,
        tier: tier,
        nullifier: nullifier,
        ownershipRoot: ownershipTree.getRoot(),
        balancesRoot: balancesTree.getRoot(),
        ownershipProof: ownershipProof,
        balancesProof: balancesProof,
    });

    // 9. Generate ZK proof via snarkjs
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs,
        wasmPath,
        zkeyPath
    );

    // 10. Format proof for Solidity verifier contract submission.
    //
    // IMPORTANT: pi_b coordinates are SWAPPED for the Solidity verifier.
    // snarkjs outputs pi_b[i][j] but the Solidity BN254 pairing precompile
    // expects the coordinates in reverse order within each G2 point component.
    return {
        proof: {
            pA: [proof.pi_a[0], proof.pi_a[1]],
            pB: [
                [proof.pi_b[0][1], proof.pi_b[0][0]],
                [proof.pi_b[1][1], proof.pi_b[1][0]],
            ],
            pC: [proof.pi_c[0], proof.pi_c[1]],
        },
        publicInputs: {
            ownershipRoot: '0x' + BigInt(publicSignals[0]).toString(16).padStart(64, '0'),
            balancesRoot: '0x' + BigInt(publicSignals[1]).toString(16).padStart(64, '0'),
            proposalId: '0x' + BigInt(publicSignals[2]).toString(16).padStart(64, '0'),
            voteChoice: Number(publicSignals[3]),
            tier: Number(publicSignals[4]),
            nullifier: '0x' + BigInt(publicSignals[5]).toString(16).padStart(64, '0'),
            tierConfig: '0x' + BigInt(publicSignals[6]).toString(16).padStart(64, '0'),
        },
    };
}
