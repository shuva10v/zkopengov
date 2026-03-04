/**
 * Poseidon hash wrapper using circomlibjs.
 *
 * Uses a singleton pattern because Poseidon initialization (building the
 * permutation constants) is expensive and only needs to happen once.
 */

let poseidonInstance: any = null;
let fieldInstance: any = null;

/**
 * Initialize the Poseidon hash function. Must be called before any hashing.
 * Safe to call multiple times -- subsequent calls are no-ops.
 */
export async function initPoseidon(): Promise<void> {
    if (poseidonInstance !== null) {
        return;
    }
    const circomlibjs = await import('circomlibjs');
    const buildPoseidon = circomlibjs.buildPoseidon ?? (circomlibjs as any).default?.buildPoseidon;
    poseidonInstance = await buildPoseidon();
    fieldInstance = poseidonInstance.F;
}

/**
 * Compute Poseidon hash of the given inputs.
 *
 * @param inputs - Array of bigint field elements to hash
 * @returns The hash as a bigint
 * @throws If Poseidon has not been initialized via initPoseidon()
 */
export function poseidonHash(inputs: bigint[]): bigint {
    if (!poseidonInstance || !fieldInstance) {
        throw new Error('Poseidon not initialized. Call initPoseidon() first.');
    }
    const hash = poseidonInstance(inputs.map((x: bigint) => fieldInstance.e(x)));
    return fieldInstance.toObject(hash) as bigint;
}

/**
 * Get the raw Poseidon instance (for advanced usage).
 */
export function getPoseidon(): any {
    if (!poseidonInstance) {
        throw new Error('Poseidon not initialized. Call initPoseidon() first.');
    }
    return poseidonInstance;
}

/**
 * Get the finite field instance used by Poseidon.
 */
export function getField(): any {
    if (!fieldInstance) {
        throw new Error('Poseidon not initialized. Call initPoseidon() first.');
    }
    return fieldInstance;
}
