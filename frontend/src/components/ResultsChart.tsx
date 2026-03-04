import type { AggregateResults, TierResult } from '../hooks/useResults';
import { TIER_LABELS, TIER_WEIGHTS } from '../hooks/useResults';

interface ResultsChartProps {
    results: AggregateResults;
    tierResults: TierResult[];
}

/**
 * Horizontal stacked bar showing Aye / Nay / Abstain proportions.
 * Pure CSS + SVG, no chart library needed.
 */
function ResultsBar({
    aye,
    nay,
    abstain,
    height = 32,
}: {
    aye: number;
    nay: number;
    abstain: number;
    height?: number;
}) {
    const total = aye + nay + abstain;
    if (total === 0) {
        return (
            <div className="results-bar-empty" style={{ height }}>
                <span>No votes yet</span>
            </div>
        );
    }

    const ayePct = (aye / total) * 100;
    const nayPct = (nay / total) * 100;
    const abstainPct = (abstain / total) * 100;

    return (
        <div className="results-bar-container">
            <div className="results-bar" style={{ height }}>
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
                {abstainPct > 0 && (
                    <div
                        className="results-bar-segment results-bar-abstain"
                        style={{ width: `${abstainPct}%` }}
                        title={`Abstain: ${abstainPct.toFixed(1)}%`}
                    >
                        {abstainPct > 10 && (
                            <span className="results-bar-label">
                                {abstainPct.toFixed(1)}%
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function ResultsChart({ results, tierResults }: ResultsChartProps) {
    const total = results.aye + results.nay + results.abstain;

    return (
        <div className="results-chart">
            {/* Overall results */}
            <div className="results-overall">
                <h3 className="results-section-title">Overall Results</h3>

                <ResultsBar
                    aye={results.aye}
                    nay={results.nay}
                    abstain={results.abstain}
                    height={40}
                />

                <div className="results-legend">
                    <div className="legend-item">
                        <span className="legend-color legend-color-aye" />
                        <span className="legend-label">Aye</span>
                        <span className="legend-value">
                            {results.aye}
                            {total > 0 && (
                                <span className="legend-pct">
                                    {' '}
                                    ({((results.aye / total) * 100).toFixed(1)}%)
                                </span>
                            )}
                        </span>
                    </div>
                    <div className="legend-item">
                        <span className="legend-color legend-color-nay" />
                        <span className="legend-label">Nay</span>
                        <span className="legend-value">
                            {results.nay}
                            {total > 0 && (
                                <span className="legend-pct">
                                    {' '}
                                    ({((results.nay / total) * 100).toFixed(1)}%)
                                </span>
                            )}
                        </span>
                    </div>
                    <div className="legend-item">
                        <span className="legend-color legend-color-abstain" />
                        <span className="legend-label">Abstain</span>
                        <span className="legend-value">
                            {results.abstain}
                            {total > 0 && (
                                <span className="legend-pct">
                                    {' '}
                                    ({((results.abstain / total) * 100).toFixed(1)}
                                    %)
                                </span>
                            )}
                        </span>
                    </div>
                </div>

                <div className="results-stats">
                    <div className="stat-item">
                        <span className="stat-label">Total Weighted Score</span>
                        <span className="stat-value">{total}</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-label">Total Votes Cast</span>
                        <span className="stat-value">{results.voteCount}</span>
                    </div>
                </div>
            </div>

            {/* Per-tier breakdown */}
            <div className="results-tiers">
                <h3 className="results-section-title">Tier Breakdown</h3>

                <div className="tier-results-table">
                    <div className="tier-results-header">
                        <span className="tier-col-tier">Tier</span>
                        <span className="tier-col-range">DOT Range</span>
                        <span className="tier-col-weight">Weight</span>
                        <span className="tier-col-bar">Distribution</span>
                        <span className="tier-col-aye">Aye</span>
                        <span className="tier-col-nay">Nay</span>
                        <span className="tier-col-abstain">Abstain</span>
                    </div>

                    {tierResults.map((tr) => {
                        const tierLabel =
                            TIER_LABELS[tr.tier] || TIER_LABELS[0];
                        const weight = TIER_WEIGHTS[tr.tier] || 1;
                        const tierTotal =
                            tr.aye + tr.nay + tr.abstain;

                        return (
                            <div
                                key={tr.tier}
                                className="tier-results-row"
                            >
                                <span className="tier-col-tier">
                                    <span className="tier-number">
                                        {tr.tier}
                                    </span>
                                    <span className="tier-label">
                                        {tierLabel.label}
                                    </span>
                                </span>
                                <span className="tier-col-range">
                                    {tierLabel.min} - {tierLabel.max} DOT
                                </span>
                                <span className="tier-col-weight">
                                    {weight}x
                                </span>
                                <span className="tier-col-bar">
                                    <ResultsBar
                                        aye={tr.aye}
                                        nay={tr.nay}
                                        abstain={tr.abstain}
                                        height={20}
                                    />
                                </span>
                                <span className="tier-col-aye">
                                    {tr.aye}
                                    {tierTotal > 0 && (
                                        <span className="tier-pct">
                                            {' '}
                                            (
                                            {(
                                                (tr.aye / tierTotal) *
                                                100
                                            ).toFixed(0)}
                                            %)
                                        </span>
                                    )}
                                </span>
                                <span className="tier-col-nay">
                                    {tr.nay}
                                    {tierTotal > 0 && (
                                        <span className="tier-pct">
                                            {' '}
                                            (
                                            {(
                                                (tr.nay / tierTotal) *
                                                100
                                            ).toFixed(0)}
                                            %)
                                        </span>
                                    )}
                                </span>
                                <span className="tier-col-abstain">
                                    {tr.abstain}
                                    {tierTotal > 0 && (
                                        <span className="tier-pct">
                                            {' '}
                                            (
                                            {(
                                                (tr.abstain / tierTotal) *
                                                100
                                            ).toFixed(0)}
                                            %)
                                        </span>
                                    )}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
