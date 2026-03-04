/**
 * Poseidon hash wrapper for E2E tests.
 *
 * Uses circomlibjs so that all hashes match the circuit implementation exactly.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildPoseidon } = require("circomlibjs");

/**
 * Initialize Poseidon and return both the hash function and its finite field.
 *
 * @returns An object with `poseidon` (the hash function) and `F` (the field).
 */
export async function initPoseidon(): Promise<{ poseidon: any; F: any }> {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  return { poseidon, F };
}

/**
 * Compute a Poseidon hash of the given inputs and return the result as a bigint.
 *
 * @param poseidon - The Poseidon hash function from circomlibjs
 * @param F        - The finite field from circomlibjs
 * @param inputs   - Array of bigint field elements to hash
 * @returns The hash as a bigint
 */
export function poseidonHash(poseidon: any, F: any, inputs: bigint[]): bigint {
  const hash = poseidon(inputs.map((x: bigint) => F.e(x)));
  return BigInt(F.toString(hash));
}
