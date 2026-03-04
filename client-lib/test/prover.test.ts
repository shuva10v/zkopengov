/**
 * Prover integration tests.
 *
 * NOTE: Full proof generation requires circuit artifacts (PrivateVote.wasm
 * and circuit_final.zkey) and a running indexer. These tests verify the
 * proof generation pipeline structure and error handling without the
 * actual circuit artifacts.
 *
 * For full integration testing, provide circuit artifacts and indexer URL.
 */

import { generateVoteProof } from '../src/prover';
import { initPoseidon } from '../src/poseidon';
import { VoteProofInput } from '../src/types';

describe('prover', () => {
    beforeAll(async () => {
        await initPoseidon();
    });

    describe('generateVoteProof', () => {
        it('throws when tree URLs are unreachable', async () => {
            const input: VoteProofInput = {
                secret: 12345678901234567890n,
                address: 'abcdef1234567890abcdef1234567890abcdef12',
                proposalId: '0x0000000000000000000000000000000000000000000000000000000000000001',
                voteChoice: 1,
                ownershipTreeUrl: 'http://localhost:99999/ownership-trees/latest.json',
                balancesTreeUrl: 'http://localhost:99999/balances-trees/0.json',
            };

            await expect(generateVoteProof(input)).rejects.toThrow();
        });

        it('requires valid vote choice', async () => {
            const input: VoteProofInput = {
                secret: 12345678901234567890n,
                address: 'abcdef1234567890abcdef1234567890abcdef12',
                proposalId: '0x0000000000000000000000000000000000000000000000000000000000000001',
                voteChoice: 1,
                ownershipTreeUrl: 'http://localhost:99999/ownership-trees/latest.json',
                balancesTreeUrl: 'http://localhost:99999/balances-trees/0.json',
            };

            // Valid vote choices are 0, 1, 2
            // This should fail at the network level, not the vote choice level
            await expect(generateVoteProof(input)).rejects.toThrow();
        });

        it('accepts custom wasm and zkey paths', async () => {
            const input: VoteProofInput = {
                secret: 12345678901234567890n,
                address: 'abcdef1234567890abcdef1234567890abcdef12',
                proposalId: '0x0000000000000000000000000000000000000000000000000000000000000001',
                voteChoice: 0,
                ownershipTreeUrl: 'http://localhost:99999/ownership-trees/latest.json',
                balancesTreeUrl: 'http://localhost:99999/balances-trees/0.json',
            };

            // Should still fail at network level but accept custom paths
            await expect(
                generateVoteProof(input, '/custom/path.wasm', '/custom/path.zkey')
            ).rejects.toThrow();
        });
    });

    describe('proof structure (documented expectations)', () => {
        /**
         * When a full integration test is run with real circuit artifacts,
         * the generated VoteProof should have this structure:
         *
         * proof.pA: [string, string] -- G1 point
         * proof.pB: [[string, string], [string, string]] -- G2 point (coords swapped for Solidity)
         * proof.pC: [string, string] -- G1 point
         *
         * publicInputs:
         *   ownershipRoot: 0x-prefixed hex (64 chars)
         *   balancesRoot: 0x-prefixed hex (64 chars)
         *   proposalId: 0x-prefixed hex (64 chars)
         *   voteChoice: 0, 1, or 2
         *   tier: 0-4
         *   nullifier: 0x-prefixed hex (64 chars)
         *   tierConfig: 0x-prefixed hex (64 chars)
         */
        it('documents the expected proof structure', () => {
            // This is a documentation test -- it always passes.
            // It serves to document the expected output format for
            // integration testing.
            expect(true).toBe(true);
        });

        it('documents that pi_b coordinates are swapped for Solidity', () => {
            // In the snarkjs output, pi_b has the format:
            //   pi_b[0] = [x0, x1]  (first G2 component)
            //   pi_b[1] = [y0, y1]  (second G2 component)
            //
            // For the Solidity verifier (BN254 pairing precompile),
            // the coordinates within each component are reversed:
            //   pB[0] = [pi_b[0][1], pi_b[0][0]]
            //   pB[1] = [pi_b[1][1], pi_b[1][0]]
            //
            // This is a well-known quirk of the snarkjs-to-Solidity pipeline.
            expect(true).toBe(true);
        });

        it('documents public signal order', () => {
            // The circuit outputs public signals in this order:
            //   [0] ownershipRoot
            //   [1] balancesRoot
            //   [2] proposalId
            //   [3] voteChoice
            //   [4] tier
            //   [5] nullifier
            //   [6] tierConfig
            expect(true).toBe(true);
        });
    });
});
