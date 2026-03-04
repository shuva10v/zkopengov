import type { ProofStage } from '../hooks/useVoting';
import { config, CHAIN_CONFIGS } from '../lib/config';

interface ProofStatusProps {
    stage: ProofStage;
    progress: string;
    txHash: string | null;
    error: string | null;
}

interface StageInfo {
    label: string;
    order: number;
}

const STAGES: Record<ProofStage, StageInfo> = {
    idle: { label: 'Ready', order: 0 },
    'loading-secret': { label: 'Loading secret', order: 1 },
    'downloading-trees': { label: 'Downloading tree data', order: 2 },
    'rebuilding-trees': { label: 'Rebuilding Merkle trees', order: 3 },
    'generating-proof': { label: 'Generating ZK proof', order: 4 },
    submitting: { label: 'Submitting to relayer', order: 5 },
    done: { label: 'Complete', order: 6 },
    error: { label: 'Error', order: -1 },
};

const STEP_ORDER: ProofStage[] = [
    'loading-secret',
    'downloading-trees',
    'rebuilding-trees',
    'generating-proof',
    'submitting',
];

export default function ProofStatus({
    stage,
    progress,
    txHash,
    error,
}: ProofStatusProps) {
    if (stage === 'idle') return null;

    const currentOrder = STAGES[stage]?.order ?? 0;
    const isError = stage === 'error';
    const isDone = stage === 'done';

    return (
        <div className={`proof-status ${isError ? 'proof-status-error' : ''} ${isDone ? 'proof-status-done' : ''}`}>
            <div className="proof-status-header">
                <h4 className="proof-status-title">
                    {isDone
                        ? 'Vote Submitted'
                        : isError
                          ? 'Error'
                          : 'Processing Vote'}
                </h4>
                {!isDone && !isError && (
                    <span className="spinner" />
                )}
                {isDone && <span className="proof-check">&#10003;</span>}
                {isError && <span className="proof-error-icon">&#10007;</span>}
            </div>

            <div className="proof-steps">
                {STEP_ORDER.map((stepKey) => {
                    const stepInfo = STAGES[stepKey];
                    const stepOrder = stepInfo.order;
                    const isCurrent = stepOrder === currentOrder;
                    const isComplete = currentOrder > stepOrder || isDone;
                    const isPending = currentOrder < stepOrder && !isDone;

                    return (
                        <div
                            key={stepKey}
                            className={`proof-step ${isCurrent ? 'proof-step-active' : ''} ${isComplete ? 'proof-step-complete' : ''} ${isPending ? 'proof-step-pending' : ''}`}
                        >
                            <span className="proof-step-dot">
                                {isComplete ? '\u2713' : isCurrent ? '' : ''}
                            </span>
                            <span className="proof-step-label">
                                {stepInfo.label}
                            </span>
                        </div>
                    );
                })}
            </div>

            <p className="proof-progress-text">{progress}</p>

            {txHash && (
                <div className="proof-tx">
                    <span className="proof-tx-label">Transaction:</span>
                    {(() => {
                        const explorer = CHAIN_CONFIGS[config.chainId]?.blockExplorerUrls?.[0];
                        if (explorer) {
                            const url = `${explorer.replace(/\/$/, '')}/tx/${txHash}`;
                            return (
                                <a href={url} target="_blank" rel="noopener noreferrer" className="proof-tx-hash proof-tx-link">
                                    {txHash}
                                </a>
                            );
                        }
                        return <code className="proof-tx-hash">{txHash}</code>;
                    })()}
                </div>
            )}

            {error && (
                <div className="proof-error-message">
                    <p>{error}</p>
                </div>
            )}
        </div>
    );
}
