/**
 * Secret storage for ZK private voting.
 *
 * Stores the user's secret in localStorage. For hackathon purposes,
 * this is acceptable -- in production, a more secure storage mechanism
 * (e.g., encrypted with a password, hardware wallet, etc.) would be used.
 */

const STORAGE_KEY = 'zk-opengov-secret';
const REG_INDEX_KEY = 'zk-opengov-reg-index';

export function saveSecret(secret: bigint): void {
    localStorage.setItem(STORAGE_KEY, secret.toString());
}

export function loadSecret(): bigint | null {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? BigInt(stored) : null;
}

export function clearSecret(): void {
    localStorage.removeItem(STORAGE_KEY);
}

export function hasSecret(): boolean {
    return localStorage.getItem(STORAGE_KEY) !== null;
}

export function saveRegistrationIndex(index: number): void {
    localStorage.setItem(REG_INDEX_KEY, index.toString());
}

export function loadRegistrationIndex(): number | null {
    const stored = localStorage.getItem(REG_INDEX_KEY);
    return stored !== null ? parseInt(stored, 10) : null;
}

export function clearRegistrationIndex(): void {
    localStorage.removeItem(REG_INDEX_KEY);
}
