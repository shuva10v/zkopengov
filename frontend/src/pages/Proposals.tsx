import { useProposals } from '../hooks/useProposals';
import ProposalCard from '../components/ProposalCard';

export default function Proposals() {
    const { proposals, isLoading, error } = useProposals();

    const active = proposals.filter(
        (p) => p.status === 'active' || p.status === 'confirming',
    );
    const other = proposals.filter(
        (p) => p.status !== 'active' && p.status !== 'confirming',
    );

    return (
        <div className="page page-proposals">
            <h1 className="page-title">Governance Proposals</h1>
            <p className="page-subtitle">
                Browse active Polkadot OpenGov referenda and cast your private vote.
            </p>

            {isLoading && (
                <div className="results-loading">
                    <span className="spinner" />
                    <span>Loading proposals...</span>
                </div>
            )}

            {error && (
                <div className="error-box">
                    <span className="error-icon">&#10007;</span>
                    <span>{error}</span>
                </div>
            )}

            {!isLoading && !error && proposals.length === 0 && (
                <div className="results-empty">
                    <p>No proposals found.</p>
                </div>
            )}

            {active.length > 0 && (
                <div className="proposals-section">
                    <h2 className="section-title">
                        Active Referenda
                        <span className="section-count">{active.length}</span>
                    </h2>
                    <div className="proposals-grid">
                        {active.map((p) => (
                            <ProposalCard key={p.id} proposal={p} />
                        ))}
                    </div>
                </div>
            )}

            {other.length > 0 && (
                <div className="proposals-section">
                    <h2 className="section-title">
                        Other Referenda
                        <span className="section-count">{other.length}</span>
                    </h2>
                    <div className="proposals-grid">
                        {other.map((p) => (
                            <ProposalCard key={p.id} proposal={p} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
