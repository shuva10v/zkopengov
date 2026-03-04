/**
 * Hook for fetching and caching proposals from the Polkassembly API.
 */

import { useState, useEffect } from 'react';
import { Proposal, fetchProposals } from '../lib/proposals';

/** Module-level cache to avoid refetching on every mount. */
let cachedProposals: Proposal[] | null = null;

export function useProposals(): {
    proposals: Proposal[];
    isLoading: boolean;
    error: string | null;
} {
    const [proposals, setProposals] = useState<Proposal[]>(cachedProposals || []);
    const [isLoading, setIsLoading] = useState(!cachedProposals);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (cachedProposals) return;

        let cancelled = false;

        (async () => {
            try {
                const fetched = await fetchProposals();
                if (!cancelled) {
                    cachedProposals = fetched;
                    setProposals(fetched);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to fetch proposals');
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    return { proposals, isLoading, error };
}
