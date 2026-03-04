import { ethers } from "ethers";
import { VoteRelayRequest } from "./types";
import { config, VOTING_BOOTH_ABI, VOTING_REGISTRY_ABI } from "./config";

const BYTES32_REGEX = /^0x[0-9a-fA-F]{64}$/;
const UINT256_HEX_REGEX = /^0x[0-9a-fA-F]{1,64}$/;

/**
 * Validates that a value is a valid hex string representable as uint256.
 */
function isValidUint256Hex(value: unknown): value is string {
    return typeof value === "string" && UINT256_HEX_REGEX.test(value);
}

/**
 * Validates that a value is a valid bytes32 hex string.
 */
function isValidBytes32(value: unknown): value is string {
    return typeof value === "string" && BYTES32_REGEX.test(value);
}

/**
 * Validates the structure and format of a VoteRelayRequest body.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateRequestFormat(body: unknown): string | null {
    if (!body || typeof body !== "object") {
        return "Request body must be a JSON object";
    }

    const req = body as Record<string, unknown>;

    // Validate proof structure
    if (!req.proof || typeof req.proof !== "object") {
        return "Missing or invalid 'proof' field";
    }

    const proof = req.proof as Record<string, unknown>;

    // Validate pA: array of 2 hex strings
    if (!Array.isArray(proof.pA) || proof.pA.length !== 2) {
        return "proof.pA must be an array of 2 elements";
    }
    for (let i = 0; i < 2; i++) {
        if (!isValidUint256Hex(proof.pA[i])) {
            return `proof.pA[${i}] must be a valid hex string (uint256)`;
        }
    }

    // Validate pB: array of 2 arrays of 2 hex strings
    if (!Array.isArray(proof.pB) || proof.pB.length !== 2) {
        return "proof.pB must be an array of 2 elements";
    }
    for (let i = 0; i < 2; i++) {
        if (!Array.isArray(proof.pB[i]) || proof.pB[i].length !== 2) {
            return `proof.pB[${i}] must be an array of 2 elements`;
        }
        for (let j = 0; j < 2; j++) {
            if (!isValidUint256Hex(proof.pB[i][j])) {
                return `proof.pB[${i}][${j}] must be a valid hex string (uint256)`;
            }
        }
    }

    // Validate pC: array of 2 hex strings
    if (!Array.isArray(proof.pC) || proof.pC.length !== 2) {
        return "proof.pC must be an array of 2 elements";
    }
    for (let i = 0; i < 2; i++) {
        if (!isValidUint256Hex(proof.pC[i])) {
            return `proof.pC[${i}] must be a valid hex string (uint256)`;
        }
    }

    // Validate bytes32 fields
    if (!isValidBytes32(req.ownershipRoot)) {
        return "ownershipRoot must be a valid bytes32 hex string (0x + 64 hex chars)";
    }
    if (!isValidBytes32(req.balancesRoot)) {
        return "balancesRoot must be a valid bytes32 hex string (0x + 64 hex chars)";
    }
    if (!isValidBytes32(req.proposalId)) {
        return "proposalId must be a valid bytes32 hex string (0x + 64 hex chars)";
    }
    if (!isValidBytes32(req.nullifier)) {
        return "nullifier must be a valid bytes32 hex string (0x + 64 hex chars)";
    }

    // Validate voteChoice: 0, 1, or 2
    if (typeof req.voteChoice !== "number" || ![0, 1, 2].includes(req.voteChoice)) {
        return "voteChoice must be 0, 1, or 2";
    }

    // Validate tier: non-negative integer
    if (
        typeof req.tier !== "number" ||
        !Number.isInteger(req.tier) ||
        req.tier < 0
    ) {
        return "tier must be a non-negative integer";
    }

    return null;
}

/**
 * Performs on-chain pre-checks before submitting a vote transaction.
 * Returns null if all checks pass, or an error message string if a check fails.
 */
export async function preCheckOnChain(
    provider: ethers.Provider,
    request: VoteRelayRequest
): Promise<string | null> {
    const votingBooth = new ethers.Contract(
        config.votingBoothAddress,
        VOTING_BOOTH_ABI,
        provider
    );

    const registry = new ethers.Contract(
        config.registryAddress,
        VOTING_REGISTRY_ABI,
        provider
    );

    // Check if nullifier has already been used
    try {
        const used: boolean = await votingBooth.nullifierUsed(
            request.proposalId,
            request.nullifier
        );
        if (used) {
            return "Nullifier has already been used for this proposal";
        }
    } catch (err) {
        // If contract call fails (e.g. contract not deployed), log but don't block
        console.warn("Warning: nullifierUsed check failed:", (err as Error).message);
    }

    // Check if ownership root is known
    try {
        const knownOwnership: boolean = await registry.isKnownOwnershipRoot(
            request.ownershipRoot
        );
        if (!knownOwnership) {
            return "Unknown ownership root";
        }
    } catch (err) {
        console.warn("Warning: isKnownOwnershipRoot check failed:", (err as Error).message);
    }

    // Check if the balances root matches the expected root for this proposal
    try {
        const propBlock: bigint = await registry.getProposalBlock(
            request.proposalId
        );
        if (propBlock === 0n) {
            return "Proposal not registered";
        }

        const [expectedRoot]: [string, bigint] = await registry.findBalancesRootForProposal(
            propBlock
        );
        if (request.balancesRoot !== expectedRoot) {
            return "Wrong balances root for proposal";
        }
    } catch (err) {
        console.warn("Warning: proposal/balancesRoot check failed:", (err as Error).message);
    }

    return null;
}
