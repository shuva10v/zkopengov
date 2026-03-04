import { formatCircuitInputs } from '../src/input-formatter';
import { initPoseidon } from '../src/poseidon';
import { packTierConfig, TIERS } from '../src/tiers';
import { MerkleProofData, TierInfo } from '../src/types';

describe('input-formatter', () => {
    beforeAll(async () => {
        await initPoseidon();
    });

    const TREE_DEPTH = 21;

    function makeMockProof(): MerkleProofData {
        return {
            pathElements: Array.from({ length: TREE_DEPTH }, (_, i) => BigInt(i + 100)),
            pathIndices: Array.from({ length: TREE_DEPTH }, (_, i) => i % 2),
        };
    }

    function makeDefaultParams() {
        return {
            secret: 123456789n,
            address: 0xabcdef1234n,
            balance: 50_000_000_000_000n, // 5000 DOT -> tier 2
            proposalId: 42n,
            voteChoice: 1,
            tier: TIERS[2], // 1000-10000 DOT
            nullifier: 9999999n,
            ownershipRoot: 111111n,
            balancesRoot: 222222n,
            ownershipProof: makeMockProof(),
            balancesProof: makeMockProof(),
        };
    }

    describe('formatCircuitInputs', () => {
        it('has all required fields present', () => {
            const params = makeDefaultParams();
            const result = formatCircuitInputs(params);

            // Public signals
            expect(result).toHaveProperty('ownershipRoot');
            expect(result).toHaveProperty('balancesRoot');
            expect(result).toHaveProperty('proposalId');
            expect(result).toHaveProperty('voteChoice');
            expect(result).toHaveProperty('tier');
            expect(result).toHaveProperty('nullifier');
            expect(result).toHaveProperty('tierConfig');

            // Private signals
            expect(result).toHaveProperty('secret');
            expect(result).toHaveProperty('address');
            expect(result).toHaveProperty('balance');
            expect(result).toHaveProperty('ownershipPathElements');
            expect(result).toHaveProperty('ownershipPathIndices');
            expect(result).toHaveProperty('balancesPathElements');
            expect(result).toHaveProperty('balancesPathIndices');
            expect(result).toHaveProperty('tierMin');
            expect(result).toHaveProperty('tierMax');
        });

        it('all scalar values are decimal strings', () => {
            const params = makeDefaultParams();
            const result = formatCircuitInputs(params);

            // All scalar fields should be valid decimal strings
            const scalarFields = [
                'ownershipRoot', 'balancesRoot', 'proposalId', 'voteChoice',
                'tier', 'nullifier', 'tierConfig', 'secret', 'address',
                'balance', 'tierMin', 'tierMax',
            ];
            for (const field of scalarFields) {
                const value = (result as any)[field];
                expect(typeof value).toBe('string');
                expect(value).toMatch(/^\d+$/);
            }
        });

        it('all array values are arrays of decimal strings', () => {
            const params = makeDefaultParams();
            const result = formatCircuitInputs(params);

            const arrayFields = [
                'ownershipPathElements', 'ownershipPathIndices',
                'balancesPathElements', 'balancesPathIndices',
            ];
            for (const field of arrayFields) {
                const arr = (result as any)[field];
                expect(Array.isArray(arr)).toBe(true);
                for (const v of arr) {
                    expect(typeof v).toBe('string');
                    expect(v).toMatch(/^\d+$/);
                }
            }
        });

        it('path arrays have correct length (21)', () => {
            const params = makeDefaultParams();
            const result = formatCircuitInputs(params);

            expect(result.ownershipPathElements).toHaveLength(TREE_DEPTH);
            expect(result.ownershipPathIndices).toHaveLength(TREE_DEPTH);
            expect(result.balancesPathElements).toHaveLength(TREE_DEPTH);
            expect(result.balancesPathIndices).toHaveLength(TREE_DEPTH);
        });

        it('tierConfig is correctly packed', () => {
            const params = makeDefaultParams();
            const result = formatCircuitInputs(params);

            const expectedTierConfig = packTierConfig(params.tier);
            expect(result.tierConfig).toEqual(expectedTierConfig.toString());
        });

        it('correctly maps scalar values', () => {
            const params = makeDefaultParams();
            const result = formatCircuitInputs(params);

            expect(result.secret).toEqual(params.secret.toString());
            expect(result.address).toEqual(params.address.toString());
            expect(result.balance).toEqual(params.balance.toString());
            expect(result.proposalId).toEqual(params.proposalId.toString());
            expect(result.voteChoice).toEqual(params.voteChoice.toString());
            expect(result.tier).toEqual(params.tier.id.toString());
            expect(result.nullifier).toEqual(params.nullifier.toString());
            expect(result.ownershipRoot).toEqual(params.ownershipRoot.toString());
            expect(result.balancesRoot).toEqual(params.balancesRoot.toString());
            expect(result.tierMin).toEqual(params.tier.min.toString());
            expect(result.tierMax).toEqual(params.tier.max.toString());
        });

        it('works for all tiers', () => {
            for (const tier of TIERS) {
                const params = {
                    ...makeDefaultParams(),
                    tier,
                    balance: tier.min + 1n,
                };
                const result = formatCircuitInputs(params);
                expect(result.tier).toEqual(tier.id.toString());
                expect(result.tierMin).toEqual(tier.min.toString());
                expect(result.tierMax).toEqual(tier.max.toString());
            }
        });
    });
});
