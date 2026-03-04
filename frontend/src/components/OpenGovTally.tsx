import { useState, useEffect } from 'react';
import type { Proposal } from '../lib/proposals';
import { fetchTally } from '../lib/proposals';

interface OpenGovTallyProps {
    proposal: Proposal;
}

function formatDot(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString();
}

export default function OpenGovTally({ proposal }: OpenGovTallyProps) {
    const [tally, setTally] = useState(proposal.tally);
    const [loading, setLoading] = useState(!proposal.tally);

    useEffect(() => {
        if (proposal.tally) {
            setTally(proposal.tally);
            setLoading(false);
            return;
        }
        let active = true;
        setLoading(true);
        fetchTally(proposal.referendumIndex).then((t) => {
            if (active) {
                setTally(t);
                setLoading(false);
            }
        }).catch(() => {
            if (active) setLoading(false);
        });
        return () => { active = false; };
    }, [proposal.referendumIndex, proposal.tally]);

    if (loading) {
        return (
            <div className="opengov-tally">
                <h3 className="results-section-title">
                    OpenGov Public Tally
                    <span className="opengov-tally-badge">Subscan</span>
                </h3>
                <p className="opengov-tally-note">Loading tally data...</p>
            </div>
        );
    }
    if (!tally) return null;

    const { ayes, nays } = tally;
    const total = ayes + nays;
    const ayePct = total > 0 ? (ayes / total) * 100 : 0;
    const nayPct = total > 0 ? (nays / total) * 100 : 0;

    return (
        <div className="opengov-tally">
            <h3 className="results-section-title">
                OpenGov Public Tally
                <span className="opengov-tally-badge">Subscan</span>
            </h3>
            <p className="opengov-tally-note">
                Real-time on-chain tally from Polkadot OpenGov (public, non-private votes).
            </p>

            {total === 0 ? (
                <div className="results-bar-empty" style={{ height: 32 }}>
                    <span>No votes yet</span>
                </div>
            ) : (
                <>
                    <div className="results-bar-container">
                        <div className="results-bar" style={{ height: 32 }}>
                            {ayePct > 0 && (
                                <div
                                    className="results-bar-segment results-bar-aye"
                                    style={{ width: `${ayePct}%` }}
                                    title={`Aye: ${ayePct.toFixed(1)}%`}
                                >
                                    {ayePct > 10 && (
                                        <span className="results-bar-label">
                                            {ayePct.toFixed(1)}%
                                        </span>
                                    )}
                                </div>
                            )}
                            {nayPct > 0 && (
                                <div
                                    className="results-bar-segment results-bar-nay"
                                    style={{ width: `${nayPct}%` }}
                                    title={`Nay: ${nayPct.toFixed(1)}%`}
                                >
                                    {nayPct > 10 && (
                                        <span className="results-bar-label">
                                            {nayPct.toFixed(1)}%
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="results-legend">
                        <div className="legend-item">
                            <span className="legend-color legend-color-aye" />
                            <span className="legend-label">Aye</span>
                            <span className="legend-value">
                                {formatDot(ayes)} DOT
                                <span className="legend-pct"> ({ayePct.toFixed(1)}%)</span>
                            </span>
                        </div>
                        <div className="legend-item">
                            <span className="legend-color legend-color-nay" />
                            <span className="legend-label">Nay</span>
                            <span className="legend-value">
                                {formatDot(nays)} DOT
                                <span className="legend-pct"> ({nayPct.toFixed(1)}%)</span>
                            </span>
                        </div>
                    </div>
                </>
            )}

            <a
                href={proposal.polkassemblyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="proposal-external-link"
            >
                View full details on Subsquare &#8599;
            </a>
        </div>
    );
}
