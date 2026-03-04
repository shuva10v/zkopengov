import { useParams, Link } from 'react-router-dom';
import { useProposals } from '../hooks/useProposals';
import { useResults } from '../hooks/useResults';
import ResultsChart from '../components/ResultsChart';
import OpenGovTally from '../components/OpenGovTally';

export default function Results() {
    const { id } = useParams<{ id: string }>();
    const { proposals } = useProposals();
    const proposal = proposals.find((p) => p.id === id);
    const { results, tierResults, isLoading, error, fetchResults } = useResults(
        id || ''
    );

    if (!proposal) {
        return (
            <div className="page page-results">
                <div className="error-page">
                    <h1>Proposal Not Found</h1>
                    <p>
                        The proposal you are looking for does not exist or the ID
                        is invalid.
                    </p>
                    <Link to="/proposals" className="btn btn-primary">
                        Back to Proposals
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="page page-results">
            {/* Proposal header */}
            <div className="results-proposal-header">
                <Link to="/proposals" className="back-link">
                    &larr; Back to Proposals
                </Link>
                <div className="proposal-detail-card">
                    <div className="proposal-detail-meta">
                        <span className="proposal-index">
                            #{proposal.referendumIndex}
                        </span>
                        <span
                            className={`proposal-status proposal-status-${proposal.status}`}
                        >
                            {proposal.status}
                        </span>
                        <span className="proposal-track-badge">
                            {proposal.track}
                        </span>
                    </div>
                    <h1 className="proposal-detail-title">{proposal.title}</h1>
                    <p className="proposal-detail-description">
                        {proposal.description}
                    </p>
                    <a
                        href={proposal.polkassemblyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="proposal-external-link"
                    >
                        View on Subsquare &#8599;
                    </a>
                </div>
            </div>

            {/* Results content */}
            <div className="results-content">
                {isLoading ? (
                    <div className="results-loading">
                        <span className="spinner" />
                        <p>Loading results...</p>
                    </div>
                ) : error ? (
                    <div className="results-error">
                        <div className="error-box">
                            <span className="error-icon">&#10007;</span>
                            <span>{error}</span>
                        </div>
                        <button
                            className="btn btn-outline"
                            onClick={fetchResults}
                        >
                            Retry
                        </button>
                    </div>
                ) : results ? (
                    <ResultsChart results={results} tierResults={tierResults} />
                ) : (
                    <div className="results-empty">
                        <p>No results available yet.</p>
                    </div>
                )}

                <OpenGovTally proposal={proposal} />

                <div className="results-actions">
                    <Link
                        to={`/vote/${proposal.id}`}
                        className="btn btn-primary"
                    >
                        Vote on This Proposal
                    </Link>
                    <button
                        className="btn btn-outline"
                        onClick={fetchResults}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <span className="spinner spinner-sm" />
                                Refreshing...
                            </>
                        ) : (
                            'Refresh Results'
                        )}
                    </button>
                </div>

                <div className="results-info">
                    <h3>About These Results</h3>
                    <p>
                        Results are weighted by tier. Higher tiers have greater vote
                        weight, but the tier system prevents any single whale from
                        dominating governance. All votes are verified by ZK proofs
                        on-chain -- it is impossible to cast an invalid vote.
                    </p>
                    <div className="results-info-grid">
                        <div className="info-card">
                            <span className="info-card-title">Tier 0: Minnow</span>
                            <span className="info-card-value">1-100 DOT, 1x weight</span>
                        </div>
                        <div className="info-card">
                            <span className="info-card-title">Tier 1: Dolphin</span>
                            <span className="info-card-value">100-1K DOT, 3x weight</span>
                        </div>
                        <div className="info-card">
                            <span className="info-card-title">Tier 2: Shark</span>
                            <span className="info-card-value">1K-10K DOT, 6x weight</span>
                        </div>
                        <div className="info-card">
                            <span className="info-card-title">Tier 3: Whale</span>
                            <span className="info-card-value">10K-100K DOT, 10x weight</span>
                        </div>
                        <div className="info-card">
                            <span className="info-card-title">Tier 4: Megalodon</span>
                            <span className="info-card-value">100K+ DOT, 15x weight</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
