import { computeNullifier } from '../src/nullifier';
import { initPoseidon } from '../src/poseidon';

/** BN254 scalar field prime */
const BN254_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

describe('nullifier', () => {
    beforeAll(async () => {
        await initPoseidon();
    });

    describe('computeNullifier', () => {
        it('is deterministic (same inputs produce same output)', () => {
            const secret = 12345678901234567890n;
            const proposalId = 42n;
            const nullifier1 = computeNullifier(secret, proposalId);
            const nullifier2 = computeNullifier(secret, proposalId);
            expect(nullifier1).toEqual(nullifier2);
        });

        it('different secrets produce different nullifiers', () => {
            const proposalId = 42n;
            const nullifier1 = computeNullifier(111111n, proposalId);
            const nullifier2 = computeNullifier(222222n, proposalId);
            expect(nullifier1).not.toEqual(nullifier2);
        });

        it('different proposalIds produce different nullifiers (same secret)', () => {
            const secret = 12345678901234567890n;
            const nullifier1 = computeNullifier(secret, 1n);
            const nullifier2 = computeNullifier(secret, 2n);
            expect(nullifier1).not.toEqual(nullifier2);
        });

        it('produces a valid field element', () => {
            const secret = 98765432109876543210n;
            const proposalId = 100n;
            const nullifier = computeNullifier(secret, proposalId);
            expect(nullifier).toBeGreaterThan(0n);
            expect(nullifier).toBeLessThan(BN254_PRIME);
        });

        it('produces a bigint', () => {
            const nullifier = computeNullifier(1n, 1n);
            expect(typeof nullifier).toBe('bigint');
        });

        it('handles large field elements', () => {
            const largeSecret = BN254_PRIME - 1n;
            const largeProposal = BN254_PRIME - 2n;
            const nullifier = computeNullifier(largeSecret, largeProposal);
            expect(nullifier).toBeGreaterThanOrEqual(0n);
            expect(nullifier).toBeLessThan(BN254_PRIME);
        });
    });
});
