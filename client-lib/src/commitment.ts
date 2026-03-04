/**
 * Commitment generation for ZK private voting registration.
 *
 * During registration, a user generates a random secret and computes
 * commitment = Poseidon(secret). The commitment is stored on-chain in the
 * ownership tree; the secret is kept privately by the user.
 */

import { initPoseidon, poseidonHash } from './poseidon';
import { RegistrationData } from './types';

/**
 * Generate a cryptographically random secret suitable as a BN254 field element.
 *
 * Generates 31 random bytes (248 bits), which is safely under the ~254-bit
 * BN254 prime, so no modular reduction is needed.
 * Works in both Node.js and browser environments.
 *
 * @returns A random bigint in the range [1, 2^248)
 */
export function generateSecret(): bigint {
    const bytes = new Uint8Array(31);
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        // Node.js fallback
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodeCrypto = require('crypto') as typeof import('crypto');
        const buf = nodeCrypto.randomBytes(31);
        bytes.set(buf);
    }
    let secret = 0n;
    for (let i = 0; i < bytes.length; i++) {
        secret = (secret << 8n) | BigInt(bytes[i]);
    }
    // Ensure the secret is non-zero (astronomically unlikely, but be safe)
    if (secret === 0n) {
        return generateSecret();
    }
    return secret;
}

/**
 * Compute commitment = Poseidon(secret).
 *
 * @param secret - The user's private secret
 * @returns The commitment hash as a bigint
 */
export async function generateCommitment(secret: bigint): Promise<bigint> {
    await initPoseidon();
    return poseidonHash([secret]);
}

/**
 * Generate complete registration data: a random secret and its commitment.
 *
 * @returns Object containing the secret and the commitment as a hex string
 */
export async function generateRegistrationData(): Promise<RegistrationData> {
    const secret = generateSecret();
    const commitmentBigInt = await generateCommitment(secret);
    const commitment = '0x' + commitmentBigInt.toString(16).padStart(64, '0');
    return {
        secret,
        commitment,
    };
}
