import { useState } from 'react';
import type { VoteChoice } from '../hooks/useVoting';

interface VoteFormProps {
    onVote: (choice: VoteChoice) => Promise<void>;
    isDisabled: boolean;
    hasVoted: boolean;
}

export default function VoteForm({ onVote, isDisabled, hasVoted }: VoteFormProps) {
    const [selected, setSelected] = useState<VoteChoice | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);

    const handleSelect = (choice: VoteChoice) => {
        if (isDisabled || hasVoted) return;
        setSelected(choice);
        setIsConfirming(false);
    };

    const handleSubmit = async () => {
        if (selected === null || isDisabled) return;

        if (!isConfirming) {
            setIsConfirming(true);
            return;
        }

        await onVote(selected);
    };

    const handleCancel = () => {
        setIsConfirming(false);
        setSelected(null);
    };

    if (hasVoted) {
        return (
            <div className="vote-form vote-form-completed">
                <div className="vote-success-icon">&#10003;</div>
                <p className="vote-success-text">Your vote has been submitted privately!</p>
            </div>
        );
    }

    return (
        <div className="vote-form">
            <h3 className="vote-form-title">Cast Your Vote</h3>
            <p className="vote-form-subtitle">
                Your vote will be submitted privately using a ZK proof.
                No one can link your vote to your identity.
            </p>

            <div className="vote-buttons">
                <button
                    className={`vote-btn vote-btn-aye ${selected === 1 ? 'vote-btn-selected' : ''}`}
                    onClick={() => handleSelect(1)}
                    disabled={isDisabled}
                >
                    <span className="vote-btn-icon">&#10003;</span>
                    <span className="vote-btn-label">Aye</span>
                    <span className="vote-btn-desc">Support this proposal</span>
                </button>

                <button
                    className={`vote-btn vote-btn-nay ${selected === 0 ? 'vote-btn-selected' : ''}`}
                    onClick={() => handleSelect(0)}
                    disabled={isDisabled}
                >
                    <span className="vote-btn-icon">&#10007;</span>
                    <span className="vote-btn-label">Nay</span>
                    <span className="vote-btn-desc">Oppose this proposal</span>
                </button>

                <button
                    className={`vote-btn vote-btn-abstain ${selected === 2 ? 'vote-btn-selected' : ''}`}
                    onClick={() => handleSelect(2)}
                    disabled={isDisabled}
                >
                    <span className="vote-btn-icon">&#8212;</span>
                    <span className="vote-btn-label">Abstain</span>
                    <span className="vote-btn-desc">Participate without choosing</span>
                </button>
            </div>

            {selected !== null && (
                <div className="vote-confirm-area">
                    {isConfirming ? (
                        <div className="vote-confirm-prompt">
                            <p>
                                Are you sure you want to vote{' '}
                                <strong>
                                    {selected === 1
                                        ? 'Aye'
                                        : selected === 0
                                          ? 'Nay'
                                          : 'Abstain'}
                                </strong>
                                ? This action cannot be undone.
                            </p>
                            <div className="vote-confirm-buttons">
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSubmit}
                                    disabled={isDisabled}
                                >
                                    Confirm Vote
                                </button>
                                <button
                                    className="btn btn-outline"
                                    onClick={handleCancel}
                                    disabled={isDisabled}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            className="btn btn-primary btn-lg"
                            onClick={handleSubmit}
                            disabled={isDisabled}
                        >
                            Submit Vote
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
