import { ethers } from "ethers";
import { QueueItem, VoteRelayRequest } from "./types";
import { submitVote } from "./tx-submitter";
import { config } from "./config";

/**
 * Sequential transaction queue that processes vote submissions one at a time
 * to avoid nonce conflicts. Each transaction waits for the previous one to
 * be mined before sending the next.
 */
export class TransactionQueue {
    private queue: QueueItem[] = [];
    private processing = false;
    private currentNonce: number | null = null;
    private signer: ethers.Wallet;
    private votingBoothAddress: string;
    private maxQueueSize: number;

    constructor(signer: ethers.Wallet, votingBoothAddress: string, maxQueueSize?: number) {
        this.signer = signer;
        this.votingBoothAddress = votingBoothAddress;
        this.maxQueueSize = maxQueueSize ?? config.maxQueueSize;
    }

    /**
     * Returns the number of pending (queued) transactions.
     */
    get pendingCount(): number {
        return this.queue.length;
    }

    /**
     * Enqueues a vote relay request. Returns a promise that resolves with the
     * transaction receipt once the transaction is mined, or rejects if the
     * transaction fails.
     */
    enqueue(request: VoteRelayRequest): Promise<ethers.TransactionReceipt> {
        if (this.queue.length >= this.maxQueueSize) {
            return Promise.reject(
                new Error(`Queue is full (max ${this.maxQueueSize} pending transactions)`)
            );
        }

        return new Promise<ethers.TransactionReceipt>((resolve, reject) => {
            this.queue.push({ request, resolve, reject });
            this.processNext();
        });
    }

    /**
     * Processes the next item in the queue if not already processing.
     */
    private async processNext(): Promise<void> {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;
        const item = this.queue.shift()!;

        try {
            // Fetch nonce if we don't have one yet
            if (this.currentNonce === null) {
                this.currentNonce = await this.signer.getNonce();
            }

            const nonce = this.currentNonce;
            this.currentNonce++;

            console.log(
                `[Queue] Processing tx with nonce ${nonce}, nullifier: ${item.request.nullifier}`
            );

            const receipt = await submitVote(
                this.signer,
                this.votingBoothAddress,
                item.request,
                nonce
            );

            console.log(
                `[Queue] Tx mined: ${receipt.hash}, nonce: ${nonce}, status: ${receipt.status}`
            );

            item.resolve(receipt);
        } catch (err) {
            const error = err as Error;
            console.error(`[Queue] Tx failed: ${error.message}`);

            // Reset nonce on failure so the next tx fetches a fresh one
            this.currentNonce = null;

            item.reject(error);
        } finally {
            this.processing = false;
            // Process the next item in the queue
            if (this.queue.length > 0) {
                this.processNext();
            }
        }
    }
}
