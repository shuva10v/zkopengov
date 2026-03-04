import { useState, useEffect } from 'react';
import { getRegistryContract, getProvider } from '../lib/contracts';
import { config } from '../lib/config';

interface StatsData {
    registrationCount: number | null;
    balancesTreeSize: number | null;
    snapshotCount: number | null;
    latestSnapshotBlock: number | null;
    registeredProposals: number | null;
}

/**
 * Count registered proposals by scanning ProposalRegistered events.
 */
async function fetchProposalCount(registryAddress: string): Promise<number> {
    const provider = getProvider();
    const abi = ['event ProposalRegistered(bytes32 indexed proposalId, uint256 createdAtBlock)'];
    const contract = new (await import('ethers')).Contract(registryAddress, abi, provider);
    const events = await contract.queryFilter(contract.filters.ProposalRegistered(), 0, 'latest');
    return events.length;
}

/**
 * Fetch the latest balances tree from S3 to get the leaf count.
 */
async function fetchLatestBalancesTreeSize(): Promise<{ size: number; block: number } | null> {
    const registry = getRegistryContract();

    // Find the latest snapshot block
    const count = await registry.getSubmittedBlockCount();
    if (count === 0n) return null;

    let latestBlock = 0n;
    for (let i = 0; i < Number(count); i++) {
        const b: bigint = await registry.submittedBlocks(i);
        if (b > latestBlock) latestBlock = b;
    }

    // Fetch tree JSON from S3 (just the metadata, abort after headers if possible)
    const url = `${config.s3Url}/balances-trees/${latestBlock.toString()}.json`;
    try {
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const data = await resp.json();
        return {
            size: Array.isArray(data.leaves) ? data.leaves.length : 0,
            block: Number(latestBlock),
        };
    } catch {
        return null;
    }
}

export default function Stats() {
    const [stats, setStats] = useState<StatsData>({
        registrationCount: null,
        balancesTreeSize: null,
        snapshotCount: null,
        latestSnapshotBlock: null,
        registeredProposals: null,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const registry = getRegistryContract();

                // Fetch all stats in parallel
                const [regCount, snapCount, balancesInfo, proposalCount] = await Promise.all([
                    registry.getRegistrationCount() as Promise<bigint>,
                    registry.getSubmittedBlockCount() as Promise<bigint>,
                    fetchLatestBalancesTreeSize(),
                    config.registryAddress
                        ? fetchProposalCount(config.registryAddress)
                        : Promise.resolve(0),
                ]);

                if (!cancelled) {
                    setStats({
                        registrationCount: Number(regCount),
                        balancesTreeSize: balancesInfo?.size ?? null,
                        snapshotCount: Number(snapCount),
                        latestSnapshotBlock: balancesInfo?.block ?? null,
                        registeredProposals: proposalCount,
                    });
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load stats');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, []);

    return (
        <div className="page page-stats">
            <h1 className="stats-title">Network Stats</h1>
            <p className="stats-subtitle">
                Live statistics from the zkOpenGov contracts and indexer
            </p>

            {error && (
                <div className="stats-error">
                    <p>Failed to load stats: {error}</p>
                </div>
            )}

            <div className="stats-grid">
                <StatCard
                    label="Registered Voters"
                    value={stats.registrationCount}
                    loading={loading}
                    description="Addresses with on-chain commitments"
                />
                <StatCard
                    label="Balances Tree Accounts"
                    value={stats.balancesTreeSize}
                    loading={loading}
                    description="DOT holders (1+ DOT) mapped to EVM-compatible Asset Hub addresses"
                />
                <StatCard
                    label="Registered Proposals"
                    value={stats.registeredProposals}
                    loading={loading}
                    description="Referenda available for private voting"
                />
                <StatCard
                    label="Balance Snapshots"
                    value={stats.snapshotCount}
                    loading={loading}
                    description={
                        stats.latestSnapshotBlock
                            ? `Latest: block #${stats.latestSnapshotBlock.toLocaleString()}`
                            : 'On-chain balances tree roots'
                    }
                />
            </div>
        </div>
    );
}

function StatCard({
    label,
    value,
    loading,
    description,
}: {
    label: string;
    value: number | null;
    loading: boolean;
    description: string;
}) {
    return (
        <div className="stat-card">
            <div className="stat-value">
                {loading ? (
                    <span className="stat-loading">&middot;&middot;&middot;</span>
                ) : value !== null ? (
                    value.toLocaleString()
                ) : (
                    '--'
                )}
            </div>
            <div className="stat-label">{label}</div>
            <div className="stat-description">{description}</div>
        </div>
    );
}
