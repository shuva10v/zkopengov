import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useProposals } from '../hooks/useProposals';
import { hasSecret } from '../lib/secret-storage';
import { useVoting } from '../hooks/useVoting';
import { isProposalRegistered } from '../lib/contracts';
import VoteForm from '../components/VoteForm';
import TierBadge from '../components/TierBadge';
import ProofStatus from '../components/ProofStatus';

interface VotePageProps {
    account: string | null;
    isConnected: boolean;
}

export default function Vote({ account, isConnected }: VotePageProps) {
    const { id } = useParams<{ id: string }>();
    const { proposals, isLoading } = useProposals();
    const proposal = proposals.find((p) => p.id === id);

    const {
        vote,
        isGeneratingProof,
        isSubmitting,
        proofStage,
        proofProgress,
        txHash,
        error,
        hasVoted,
        tier,
    } = useVoting(id || '', account, proposal?.createdAtBlock);

    const [proposalRegistered, setProposalRegistered] = useState<boolean | null>(null);

    useEffect(() => {
        if (!id) return;
        isProposalRegistered(id).then(setProposalRegistered).catch(() => setProposalRegistered(null));
    }, [id]);

    if (isLoading) {
        return (
            <div className="page page-vote">
                <div className="loading-state">
                    <p>Loading proposal...</p>
                </div>
            </div>
        );
    }

    if (!proposal) {
        return (
            <div className="page page-vote">
                <div className="error-page">
                    <h1>Proposal Not Found</h1>
                    <p>
                        The proposal you are looking for does not exist or the ID is
                        invalid.
                    </p>
                    <Link to="/proposals" className="btn btn-primary">
                        Back to Proposals
                    </Link>
                </div>
            </div>
        );
    }

    const isProcessing = isGeneratingProof || isSubmitting;
    const userHasSecret = hasSecret();

    return (
        <div className="page page-vote">
            {/* Proposal details */}
            <div className="vote-proposal-header">
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
                        {proposal.createdAtBlock > 0 && (
                            <span className="proposal-block">
                                Block #{proposal.createdAtBlock.toLocaleString()}
                            </span>
                        )}
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

            <div className="vote-content">
                {/* Left: Voting form */}
                <div className="vote-main">
                    {/* Pre-conditions check */}
                    {!isConnected && (
                        <div className="vote-prereq">
                            <div className="prereq-icon">&#128274;</div>
                            <h3>Connect Your Wallet</h3>
                            <p>
                                Please connect your wallet to vote on this proposal.
                            </p>
                        </div>
                    )}

                    {isConnected && !userHasSecret && (
                        <div className="vote-prereq">
                            <div className="prereq-icon">&#128221;</div>
                            <h3>Registration Required</h3>
                            <p>
                                You need to register before you can vote. This creates
                                your secret key and records your commitment on-chain.
                            </p>
                            <Link to="/register" className="btn btn-primary">
                                Go to Registration
                            </Link>
                        </div>
                    )}

                    {isConnected && userHasSecret && proposalRegistered === false && (
                        <div className="vote-prereq">
                            <div className="prereq-icon">&#9888;</div>
                            <h3>Not Available for Private Voting</h3>
                            <p>
                                This proposal is not yet registered for private voting.
                                The indexer will register it automatically — please check back later.
                            </p>
                        </div>
                    )}

                    {isConnected && userHasSecret && proposalRegistered !== false && (
                        <>
                            <VoteForm
                                onVote={vote}
                                isDisabled={isProcessing || proposalRegistered === null}
                                hasVoted={hasVoted}
                            />

                            {proofStage !== 'idle' && (
                                <ProofStatus
                                    stage={proofStage}
                                    progress={proofProgress}
                                    txHash={txHash}
                                    error={error}
                                />
                            )}

                            {error && proofStage === 'idle' && (
                                <div className="error-box">
                                    <span className="error-icon">&#10007;</span>
                                    <span>{error}</span>
                                </div>
                            )}

                            {hasVoted && txHash && (
                                <div className="vote-complete">
                                    <Link
                                        to={`/results/${proposal.id}`}
                                        className="btn btn-primary"
                                    >
                                        View Results
                                    </Link>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Right: Sidebar info */}
                <div className="vote-sidebar">
                    {isConnected && (
                        <div className="sidebar-section">
                            <h3 className="sidebar-title">Your Tier</h3>
                            {tier !== null ? (
                                <>
                                    <TierBadge tier={tier} />
                                    <p className="sidebar-note">
                                        Your tier was determined from your DOT balance
                                        at the time of the last snapshot.
                                    </p>
                                </>
                            ) : (
                                <p className="sidebar-note">
                                    Your tier will be determined from your DOT balance
                                    during proof generation.
                                </p>
                            )}
                        </div>
                    )}

                    <div className="sidebar-section">
                        <h3 className="sidebar-title">How Private Voting Works</h3>
                        <ol className="sidebar-steps">
                            <li>Your browser downloads all tree data (same for everyone)</li>
                            <li>A ZK proof is generated locally in your browser</li>
                            <li>The proof is sent to a relayer (not your wallet)</li>
                            <li>The relayer submits the vote on-chain anonymously</li>
                        </ol>
                    </div>

                    <div className="sidebar-section">
                        <h3 className="sidebar-title">Privacy Guarantees</h3>
                        <ul className="sidebar-list">
                            <li>Your address is never linked to your vote</li>
                            <li>The relayer cannot see who you are</li>
                            <li>A nullifier prevents double-voting</li>
                            <li>ZK proof verifies you are an eligible voter</li>
                        </ul>
                    </div>

                    <div className="sidebar-section">
                        <Link
                            to={`/results/${proposal.id}`}
                            className="btn btn-outline btn-block"
                        >
                            View Current Results
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
