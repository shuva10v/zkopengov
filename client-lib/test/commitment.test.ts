import { generateSecret, generateCommitment, generateRegistrationData } from '../src/commitment';
import { initPoseidon } from '../src/poseidon';

/** BN254 scalar field prime */
const BN254_PRIME = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

describe('commitment', () => {
    beforeAll(async () => {
        await initPoseidon();
    });

    describe('generateSecret', () => {
        it('produces a valid field element (less than BN254 prime)', () => {
            const secret = generateSecret();
            expect(secret).toBeGreaterThan(0n);
            expect(secret).toBeLessThan(BN254_PRIME);
        });

        it('produces a value fitting in 31 bytes (248 bits)', () => {
            const secret = generateSecret();
            // 31 bytes = 248 bits, max value = 2^248 - 1
            const maxValue = (1n << 248n) - 1n;
            expect(secret).toBeLessThanOrEqual(maxValue);
        });

        it('produces different values on each call', () => {
            const secret1 = generateSecret();
            const secret2 = generateSecret();
            const secret3 = generateSecret();
            // The probability of collision among 31-byte randoms is negligible
            expect(secret1).not.toEqual(secret2);
            expect(secret2).not.toEqual(secret3);
            expect(secret1).not.toEqual(secret3);
        });

        it('produces non-zero values', () => {
            // Generate several secrets and confirm all are non-zero
            for (let i = 0; i < 10; i++) {
                const secret = generateSecret();
                expect(secret).not.toEqual(0n);
            }
        });
    });

    describe('generateCommitment', () => {
        it('produces a consistent result for the same secret', async () => {
            const secret = 12345678901234567890n;
            const commitment1 = await generateCommitment(secret);
            const commitment2 = await generateCommitment(secret);
            expect(commitment1).toEqual(commitment2);
        });

        it('produces a valid field element', async () => {
            const secret = generateSecret();
            const commitment = await generateCommitment(secret);
            expect(commitment).toBeGreaterThan(0n);
            expect(commitment).toBeLessThan(BN254_PRIME);
        });

        it('produces different commitments for different secrets', async () => {
            const secret1 = 111111111111111111n;
            const secret2 = 222222222222222222n;
            const commitment1 = await generateCommitment(secret1);
            const commitment2 = await generateCommitment(secret2);
            expect(commitment1).not.toEqual(commitment2);
        });
    });

    describe('generateRegistrationData', () => {
        it('returns secret and commitment', async () => {
            const data = await generateRegistrationData();
            expect(data).toHaveProperty('secret');
            expect(data).toHaveProperty('commitment');
            expect(typeof data.secret).toBe('bigint');
            expect(typeof data.commitment).toBe('string');
        });

        it('returns a commitment as 0x-prefixed hex string', async () => {
            const data = await generateRegistrationData();
            expect(data.commitment).toMatch(/^0x[0-9a-f]{64}$/);
        });

        it('returns a valid secret (less than BN254 prime)', async () => {
            const data = await generateRegistrationData();
            expect(data.secret).toBeGreaterThan(0n);
            expect(data.secret).toBeLessThan(BN254_PRIME);
        });

        it('commitment matches Poseidon(secret)', async () => {
            const data = await generateRegistrationData();
            const expectedCommitment = await generateCommitment(data.secret);
            const actualCommitment = BigInt(data.commitment);
            expect(actualCommitment).toEqual(expectedCommitment);
        });
    });
});
