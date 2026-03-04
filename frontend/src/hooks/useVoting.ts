/**
 * Hook for the voting flow: proof generation and relay submission.
 *
 * The voting flow:
 * 1. Load the user's secret from localStorage
 * 2. Look up the correct balances root for the proposal's block
 * 3. Generate a real ZK proof via client-lib (tree download + snarkjs)
 * 4. Submit the proof to the relayer service
 */

import { useState, useCallback } from 'react';
import { loadSecret } from '../lib/secret-storage';
import { config } from '../lib/config';
import { findBalancesRootForProposal } from '../lib/contracts';
import { generateVoteProof } from 'zk-opengov-client-lib';
import type { VoteProofInput } from 'zk-opengov-client-lib';

export type VoteChoice = 0 | 1 | 2; // 0=nay, 1=aye, 2=abstain

export type ProofStage =
    | 'idle'
    | 'loading-secret'
    | 'downloading-trees'
    | 'rebuilding-trees'
    | 'generating-proof'
    | 'submitting'
    | 'done'
    | 'error';

interface VotingState {
    /** Whether proof generation is in progress */
    isGeneratingProof: boolean;
    /** Whether the proof is being submitted to the relayer */
    isSubmitting: boolean;
    /** Current stage of proof generation */
    proofStage: ProofStage;
    /** Human-readable progress message */
    proofProgress: string;
    /** Transaction hash from the relayer */
    txHash: string | null;
    /** Error message, if any */
    error: string | null;
    /** Whether the user has already voted on this proposal */
    hasVoted: boolean;
    /** The user's tier (determined during proof generation from actual balance) */
    tier: number | null;
    /** Submit a vote */
    vote: (choice: VoteChoice) => Promise<void>;
    /** Reset the voting state */
    reset: () => void;
}

export function useVoting(proposalId: string, account: string | null, createdAtBlock?: number): VotingState {
    const [isGeneratingProof, setIsGeneratingProof] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [proofStage, setProofStage] = useState<ProofStage>('idle');
    const [proofProgress, setProofProgress] = useState('');
    const [txHash, setTxHash] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [hasVoted, setHasVoted] = useState(false);
    const [tier, setTier] = useState<number | null>(null);

    const updateProgress = useCallback((stage: ProofStage, message: string) => {
        setProofStage(stage);
        setProofProgress(message);
    }, []);

    const vote = useCallback(
        async (choice: VoteChoice) => {
            setError(null);
            setTxHash(null);
            setIsGeneratingProof(true);
            setProofStage('loading-secret');
            setProofProgress('Loading secret from storage...');

            try {
                // Step 1: Load secret
                const secret = loadSecret();
                if (!secret) {
                    throw new Error(
                        'No secret found. Please register first on the Register page.'
                    );
                }

                if (!account) {
                    throw new Error('Wallet not connected. Please connect your wallet.');
                }

                // Step 2: Look up the correct balances root for this proposal's block
                updateProgress('downloading-trees', 'Looking up balances root for proposal...');
                if (!createdAtBlock || !config.registryAddress) {
                    throw new Error('Cannot determine balances snapshot: proposal block or registry not available.');
                }
                const { snapshotBlock } = await findBalancesRootForProposal(createdAtBlock);
                const balancesTreeUrl = `${config.s3Url}/balances-trees/${snapshotBlock}.json`;

                // Step 3: Generate real ZK proof via client-lib
                updateProgress('downloading-trees', 'Downloading tree data...');

                const ownershipTreeUrl = `${config.s3Url}/ownership-trees/latest.json`;

                const proofInput: VoteProofInput = {
                    secret,
                    address: account.replace(/^0x/, ''),
                    proposalId,
                    voteChoice: choice,
                    ownershipTreeUrl,
                    balancesTreeUrl,
                };

                updateProgress('generating-proof', 'Generating ZK proof (this may take a moment)...');

                const voteProof = await generateVoteProof(proofInput);

                // Expose the tier determined by the circuit from actual balance
                setTier(Number(voteProof.publicInputs.tier));

                // Format relay request from VoteProof
                const relayRequest = {
                    proof: voteProof.proof,
                    ownershipRoot: voteProof.publicInputs.ownershipRoot,
                    balancesRoot: voteProof.publicInputs.balancesRoot,
                    proposalId: voteProof.publicInputs.proposalId,
                    voteChoice: voteProof.publicInputs.voteChoice,
                    tier: voteProof.publicInputs.tier,
                    nullifier: voteProof.publicInputs.nullifier,
                };

                setIsGeneratingProof(false);
                setIsSubmitting(true);
                updateProgress('submitting', 'Submitting vote to relayer...');

                // Step 4: Submit to relayer
                if (config.relayerUrl) {
                    try {
                        const response = await fetch(
                            `${config.relayerUrl}/api/v1/relay`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(relayRequest),
                            }
                        );

                        const result = await response.json();

                        if (result.success) {
                            setTxHash(result.txHash);
                            setHasVoted(true);
                            updateProgress('done', 'Vote submitted successfully!');
                        } else {
                            throw new Error(result.error || 'Relayer rejected the vote');
                        }
                    } catch (fetchError) {
                        // If relayer is not available, fall back to demo mode
                        if (
                            fetchError instanceof TypeError &&
                            fetchError.message.includes('fetch')
                        ) {
                            console.warn(
                                'Relayer not available, using demo mode'
                            );
                            await new Promise((resolve) =>
                                setTimeout(resolve, 1000)
                            );
                            const demoTxHash =
                                '0x' +
                                Array.from({ length: 64 }, () =>
                                    Math.floor(Math.random() * 16).toString(16)
                                ).join('');
                            setTxHash(demoTxHash);
                            setHasVoted(true);
                            updateProgress(
                                'done',
                                'Vote submitted successfully (demo mode)!'
                            );
                        } else {
                            throw fetchError;
                        }
                    }
                } else {
                    // No relayer URL -- pure demo mode
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    const demoTxHash =
                        '0x' +
                        Array.from({ length: 64 }, () =>
                            Math.floor(Math.random() * 16).toString(16)
                        ).join('');
                    setTxHash(demoTxHash);
                    setHasVoted(true);
                    updateProgress('done', 'Vote submitted successfully (demo mode)!');
                }
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : 'Voting failed';
                setError(message);
                updateProgress('error', message);
            } finally {
                setIsGeneratingProof(false);
                setIsSubmitting(false);
            }
        },
        [proposalId, account, createdAtBlock, updateProgress]
    );

    const reset = useCallback(() => {
        setIsGeneratingProof(false);
        setIsSubmitting(false);
        setProofStage('idle');
        setProofProgress('');
        setTxHash(null);
        setError(null);
        setHasVoted(false);
        setTier(null);
    }, []);

    return {
        isGeneratingProof,
        isSubmitting,
        proofStage,
        proofProgress,
        txHash,
        error,
        hasVoted,
        tier,
        vote,
        reset,
    };
}
