/**
 * Tree data client for the ZK private voting indexer API.
 *
 * Downloads FULL tree data from the indexer. This is critical for privacy:
 * we never query for a specific address. Instead, the entire tree is
 * downloaded and the user's leaf is found locally in the browser.
 */

import { TreeData } from './types';

/**
 * Fetch the full ownership tree data from the indexer.
 *
 * The ownership tree contains leaves of the form Poseidon(address, commitment)
 * for every registered voter.
 *
 * @param indexerUrl - Base URL of the indexer service (no trailing slash)
 * @returns Full ownership tree data including all leaves
 * @throws On network errors or non-OK HTTP responses
 */
export async function fetchOwnershipTree(indexerUrl: string): Promise<TreeData> {
    const url = `${indexerUrl.replace(/\/+$/, '')}/api/v1/ownership-tree`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(
            `Failed to fetch ownership tree: HTTP ${response.status} ${response.statusText}`
        );
    }
    const data = (await response.json()) as TreeData;
    return data;
}

/**
 * Fetch the full balances tree data from the indexer.
 *
 * The balances tree contains leaves of the form Poseidon(address, balance)
 * for every account in the snapshot.
 *
 * @param indexerUrl - Base URL of the indexer service (no trailing slash)
 * @returns Full balances tree data including all leaves
 * @throws On network errors or non-OK HTTP responses
 */
export async function fetchBalancesTree(indexerUrl: string): Promise<TreeData> {
    const url = `${indexerUrl.replace(/\/+$/, '')}/api/v1/balances-tree`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(
            `Failed to fetch balances tree: HTTP ${response.status} ${response.statusText}`
        );
    }
    const data = (await response.json()) as TreeData;
    return data;
}

/**
 * Fetch the full ownership tree from an arbitrary URL (e.g. S3 CDN).
 *
 * @param url - Full URL to the ownership tree JSON file
 * @returns Full ownership tree data including all leaves
 * @throws On network errors or non-OK HTTP responses
 */
export async function fetchOwnershipTreeFromUrl(url: string): Promise<TreeData> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(
            `Failed to fetch ownership tree from ${url}: HTTP ${response.status} ${response.statusText}`
        );
    }
    const data = (await response.json()) as TreeData;
    return data;
}

/**
 * Fetch the full balances tree from an arbitrary URL (e.g. S3 CDN).
 *
 * @param url - Full URL to the balances tree JSON file
 * @returns Full balances tree data including all leaves
 * @throws On network errors or non-OK HTTP responses
 */
export async function fetchBalancesTreeFromUrl(url: string): Promise<TreeData> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(
            `Failed to fetch balances tree from ${url}: HTTP ${response.status} ${response.statusText}`
        );
    }
    const data = (await response.json()) as TreeData;
    return data;
}
