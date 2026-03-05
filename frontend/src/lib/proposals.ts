/**
 * Proposal data for ZK private voting.
 *
 * Fetches real Polkadot OpenGov referenda from the Subscan Asset Hub API.
 * Post-migration (Nov 4 2025), all referenda live on Asset Hub.
 */

import { ethers } from 'ethers';
import { config } from './config';

export interface Proposal {
    /** Unique bytes32 hex identifier for our contracts */
    id: string;
    /** Polkadot referendum index number */
    referendumIndex: number;
    /** Human-readable title */
    title: string;
    /** Short description */
    description: string;
    /** OpenGov track name */
    track: string;
    /** Current status */
    status: 'active' | 'confirming' | 'decided' | 'closed';
    /** Computed proposalId (same as id, kept for clarity) */
    proposalId: string;
    /** Block number when the proposal was submitted (Asset Hub) */
    createdAtBlock: number;
    /** URL to the proposal on Subsquare */
    polkassemblyUrl: string;
    /** Real OpenGov tally (DOT values) */
    tally: { ayes: number; nays: number } | null;
}

/**
 * BN254 scalar field prime.
 * Circom field elements are reduced modulo this prime, so any proposalId
 * that exceeds it would be silently reduced inside the circuit.  We reduce
 * the keccak hash up-front so the on-chain bytes32 and the circuit value match.
 */
const BN254_FIELD_PRIME = BigInt(
    '21888242871839275222246405745257275088548364400416034343698204186575808495617',
);

/**
 * Compute a deterministic proposalId from a referendum index.
 *
 * 1. keccak256(abi.encodePacked("polkadot-opengov", uint256(referendumIndex)))
 * 2. Reduce modulo the BN254 scalar-field prime so the value is always
 *    representable as a Circom signal without silent truncation.
 */
export function computeProposalId(referendumIndex: number): string {
    const encoded = ethers.solidityPacked(
        ['string', 'uint256'],
        ['polkadot-opengov', referendumIndex]
    );
    const hash = ethers.keccak256(encoded);
    const reduced = BigInt(hash) % BN254_FIELD_PRIME;
    return '0x' + reduced.toString(16).padStart(64, '0');
}

const SUBSCAN_API = 'https://assethub-polkadot.api.subscan.io';

/** DOT has 10 decimals */
const DOT_DECIMALS = 10_000_000_000;

/** OpenGov track ID → human-readable name */
const TRACK_NAMES: Record<number, string> = {
    0: 'Root',
    1: 'Whitelisted Caller',
    2: 'Staking Admin',
    10: 'Treasurer',
    11: 'Lease Admin',
    12: 'Fellowship Admin',
    13: 'General Admin',
    14: 'Auction Admin',
    15: 'Referendum Canceller',
    16: 'Referendum Killer',
    20: 'Small Tipper',
    21: 'Big Tipper',
    30: 'Small Spender',
    31: 'Medium Spender',
    32: 'Big Spender',
    33: 'Wish For Change',
    34: 'Treasurer',
};

/** Map Subscan status strings to our simplified status. */
function mapStatus(status: string): Proposal['status'] {
    switch (status) {
        case 'Decision':
        case 'ConfirmStarted':
            return 'active';
        case 'Submitted':
            return 'confirming';
        case 'Executed':
        case 'Confirmed':
        case 'Approved':
            return 'decided';
        case 'Rejected':
        case 'Timeout':
        case 'Cancelled':
        case 'Killed':
            return 'closed';
        default:
            return 'active';
    }
}

/** Humanize the origins field from Subscan (e.g. "small_spender" → "Small Spender"). */
function formatOrigin(origins: string, originsId: number): string {
    if (TRACK_NAMES[originsId]) return TRACK_NAMES[originsId];
    return origins
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

/** Parse a Subscan referendum item into our Proposal type. */
function parseReferendum(item: any): Proposal {
    const referendumIndex: number = item.referendum_index;
    const proposalId = computeProposalId(referendumIndex);
    const track = formatOrigin(item.origins || '', item.origins_id ?? -1);

    // Listing API returns ayes_amount/nays_amount as null; tally fetched on demand via fetchTally()
    let tally: Proposal['tally'] = null;
    if (item.ayes_amount != null && item.nays_amount != null) {
        tally = {
            ayes: Number(BigInt(item.ayes_amount) / BigInt(DOT_DECIMALS)),
            nays: Number(BigInt(item.nays_amount) / BigInt(DOT_DECIMALS)),
        };
    }

    return {
        id: proposalId,
        referendumIndex,
        title: item.title || `Referendum #${referendumIndex}`,
        description: '',
        track,
        status: mapStatus(item.status),
        proposalId,
        createdAtBlock: item.created_block,
        polkassemblyUrl: `https://polkadot.subsquare.io/referenda/${referendumIndex}`,
        tally,
    };
}

/** How many referenda to fetch per page. */
const PAGE_SIZE = 50;

/** In-flight promise so concurrent callers share a single request. */
let inflightProposals: Promise<Proposal[]> | null = null;

/**
 * Fetch live proposals from the Subscan Asset Hub API.
 *
 * Concurrent calls are deduplicated — only one HTTP request is made,
 * and all callers share the same promise.
 */
export async function fetchProposals(): Promise<Proposal[]> {
    if (inflightProposals) return inflightProposals;

    inflightProposals = doFetchProposals().finally(() => {
        inflightProposals = null;
    });
    return inflightProposals;
}

async function fetchWithRetry(url: string, init: RequestInit, maxRetries = 5): Promise<Response> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const resp = await fetch(url, init);
        if (resp.status !== 429) return resp;
        const delay = attempt * 1000;
        console.warn(`[proposals] 429 from ${url}, retrying in ${delay / 1000}s (${attempt}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, delay));
    }
    throw new Error(`Rate limited after ${maxRetries} retries`);
}

async function doFetchProposals(): Promise<Proposal[]> {
    const response = await fetchWithRetry(
        `${SUBSCAN_API}/api/scan/referenda/referendums`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page: 0, row: PAGE_SIZE, order: 'desc' }),
        },
    );

    if (!response.ok) {
        throw new Error(`Subscan API error: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.code !== 0) {
        throw new Error(`Subscan API error: ${data.message}`);
    }

    const items: any[] = data.data?.list || [];
    const proposals = items.map(parseReferendum);
    if (config.minProposalBlock > 0) {
        return proposals.filter((p) => p.createdAtBlock >= config.minProposalBlock);
    }
    return proposals;
}

const POLKASSEMBLY_API = 'https://polkadot.polkassembly.io/api/v1';

/**
 * Fetch tally data for a single referendum from the Polkassembly detail endpoint.
 * (Subscan's listing endpoint omits tally amounts and the detail endpoint is rate-limited.)
 */
export async function fetchTally(referendumIndex: number): Promise<Proposal['tally']> {
    try {
        const response = await fetch(
            `${POLKASSEMBLY_API}/posts/on-chain-post?postId=${referendumIndex}&proposalType=referendums_v2`,
            { headers: { 'x-network': 'polkadot' } },
        );
        if (!response.ok) return null;
        const data = await response.json();
        const tally = data.tally;
        if (!tally) return null;
        return {
            ayes: Number(BigInt(tally.ayes || '0') / BigInt(DOT_DECIMALS)),
            nays: Number(BigInt(tally.nays || '0') / BigInt(DOT_DECIMALS)),
        };
    } catch {
        return null;
    }
}
