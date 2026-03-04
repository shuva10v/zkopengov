import { Link } from 'react-router-dom';
import { Proposal } from '../lib/proposals';

interface ProposalCardProps {
    proposal: Proposal;
}

const STATUS_COLORS: Record<string, string> = {
    active: '#2ecc71',
    confirming: '#f39c12',
    decided: '#3498db',
    closed: '#95a5a6',
};

const TRACK_ICONS: Record<string, string> = {
    'Medium Spender': 'Treasury',
    Root: 'Runtime',
    'Big Spender': 'Treasury',
    'Wish For Change': 'Governance',
    'Small Spender': 'Treasury',
    'Fellowship Admin': 'Fellowship',
};

export default function ProposalCard({ proposal }: ProposalCardProps) {
    const statusColor = STATUS_COLORS[proposal.status] || '#95a5a6';
    const trackCategory = TRACK_ICONS[proposal.track] || 'General';

    return (
        <div className="proposal-card">
            <div className="proposal-card-header">
                <span className="proposal-index">#{proposal.referendumIndex}</span>
                <span
                    className="proposal-status"
                    style={{ backgroundColor: statusColor }}
                >
                    {proposal.status}
                </span>
            </div>

            <h3 className="proposal-title">{proposal.title}</h3>

            <p className="proposal-description">{proposal.description}</p>

            <div className="proposal-meta">
                <span className="proposal-track">
                    <span className="track-category">{trackCategory}</span>
                    <span className="track-name">{proposal.track}</span>
                </span>
            </div>

            <div className="proposal-actions">
                <Link
                    to={`/vote/${proposal.id}`}
                    className="btn btn-primary btn-sm"
                >
                    Vote
                </Link>
                <Link
                    to={`/results/${proposal.id}`}
                    className="btn btn-outline btn-sm"
                >
                    Results
                </Link>
                <a
                    href={proposal.polkassemblyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm"
                >
                    Subsquare &#8599;
                </a>
            </div>
        </div>
    );
}
