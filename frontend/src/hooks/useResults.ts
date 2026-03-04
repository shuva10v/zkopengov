/**
 * Hook for fetching voting results from the VotingBooth contract.
 *
 * Reads aggregate results (aye/nay/abstain) and per-tier breakdowns.
 * Falls back to demo data when the contract is not configured.
 */

import { useState, useCallback, useEffect } from 'react';
import { config } from '../lib/config';
import { ethers } from 'ethers';

export interface AggregateResults {
    aye: number;
    nay: number;
    abstain: number;
    total: number;
    voteCount: number;
}

export interface TierResult {
    tier: number;
    aye: number;
    nay: number;
    abstain: number;
}

interface ResultsState {
    /** Aggregate results across all tiers */
    results: AggregateResults | null;
    /** Per-tier breakdown */
    tierResults: TierResult[];
    /** Whether results are being loaded */
    isLoading: boolean;
    /** Error message, if any */
    error: string | null;
    /** Refresh results */
    fetchResults: () => Promise<void>;
}

const VOTING_BOOTH_ABI = [
    'function getResults(bytes32 proposalId) view returns (uint256 totalAye, uint256 totalNay, uint256 totalAbstain, uint256 voteCount)',
    'function getTierResults(bytes32 proposalId, uint8 tier) view returns (uint256 aye, uint256 nay, uint256 abstain)',
    'function getTierCount() view returns (uint256)',
];

/** Tier labels for display. */
const TIER_LABELS = [
    { min: '1', max: '100', label: 'Minnow' },
    { min: '100', max: '1,000', label: 'Dolphin' },
    { min: '1,000', max: '10,000', label: 'Shark' },
    { min: '10,000', max: '100,000', label: 'Whale' },
    { min: '100,000', max: 'Unlimited', label: 'Megalodon' },
];

/** Tier weights matching the contract configuration. */
const TIER_WEIGHTS = [1, 3, 6, 10, 15];

/**
 * Generate realistic-looking demo results for a proposal.
 * Uses the proposalId as a seed for deterministic pseudo-randomness.
 */
function generateDemoResults(proposalId: string): {
    results: AggregateResults;
    tierResults: TierResult[];
} {
    // Use the last few hex chars of proposalId as a simple seed
    const seed = parseInt(proposalId.slice(-8), 16);

    const tierResults: TierResult[] = [];
    let totalAye = 0;
    let totalNay = 0;
    let totalAbstain = 0;
    let totalVoteCount = 0;

    for (let t = 0; t < 5; t++) {
        const weight = TIER_WEIGHTS[t];
        // Generate some pseudo-random vote counts per tier
        const baseSeed = (seed * (t + 1) * 7919) % 10000;
        const ayeVotes = ((baseSeed % 30) + 5) * weight;
        const nayVotes = (((baseSeed * 3) % 20) + 2) * weight;
        const abstainVotes = (((baseSeed * 7) % 10) + 1) * weight;

        tierResults.push({
            tier: t,
            aye: ayeVotes,
            nay: nayVotes,
            abstain: abstainVotes,
        });

        totalAye += ayeVotes;
        totalNay += nayVotes;
        totalAbstain += abstainVotes;
        totalVoteCount += Math.floor(
            (ayeVotes + nayVotes + abstainVotes) / weight
        );
    }

    return {
        results: {
            aye: totalAye,
            nay: totalNay,
            abstain: totalAbstain,
            total: totalAye + totalNay + totalAbstain,
            voteCount: totalVoteCount,
        },
        tierResults,
    };
}

export { TIER_LABELS, TIER_WEIGHTS };

export function useResults(proposalId: string): ResultsState {
    const [results, setResults] = useState<AggregateResults | null>(null);
    const [tierResults, setTierResults] = useState<TierResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchResults = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            if (config.votingBoothAddress) {
                // Live mode: read from contract
                const provider = new ethers.JsonRpcProvider(config.evmRpc);
                const booth = new ethers.Contract(
                    config.votingBoothAddress,
                    VOTING_BOOTH_ABI,
                    provider
                );

                // Fetch aggregate results
                const [totalAye, totalNay, totalAbstain, voteCount] =
                    await booth.getResults(proposalId);

                const aggregate: AggregateResults = {
                    aye: Number(totalAye),
                    nay: Number(totalNay),
                    abstain: Number(totalAbstain),
                    total:
                        Number(totalAye) +
                        Number(totalNay) +
                        Number(totalAbstain),
                    voteCount: Number(voteCount),
                };
                setResults(aggregate);

                // Fetch per-tier results
                const tierCount = Number(await booth.getTierCount());
                const tiers: TierResult[] = [];
                for (let t = 0; t < tierCount; t++) {
                    const [aye, nay, abstain] = await booth.getTierResults(
                        proposalId,
                        t
                    );
                    tiers.push({
                        tier: t,
                        aye: Number(aye),
                        nay: Number(nay),
                        abstain: Number(abstain),
                    });
                }
                setTierResults(tiers);
            } else {
                // Demo mode: generate mock results
                await new Promise((resolve) => setTimeout(resolve, 500));
                const demo = generateDemoResults(proposalId);
                setResults(demo.results);
                setTierResults(demo.tierResults);
            }
        } catch (err) {
            const message =
                err instanceof Error ? err.message : 'Failed to fetch results';
            setError(message);

            // Fall back to demo data on error
            const demo = generateDemoResults(proposalId);
            setResults(demo.results);
            setTierResults(demo.tierResults);
        } finally {
            setIsLoading(false);
        }
    }, [proposalId]);

    useEffect(() => {
        if (proposalId) {
            fetchResults();
        }
    }, [proposalId, fetchResults]);

    return {
        results,
        tierResults,
        isLoading,
        error,
        fetchResults,
    };
}
