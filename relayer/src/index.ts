import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { ethers } from "ethers";
import { config } from "./config";
import { validateRequestFormat, preCheckOnChain } from "./proof-validator";
import { TransactionQueue } from "./queue";
import { VoteRelayRequest, RelayResponse } from "./types";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize provider and signer
const provider = new ethers.JsonRpcProvider(config.evmRpc);
const signer = new ethers.Wallet(config.privateKey, provider);

// Initialize transaction queue
const txQueue = new TransactionQueue(signer, config.votingBoothAddress);

/**
 * POST /api/v1/relay
 *
 * Accepts a vote proof from a user and submits it on-chain via the relayer wallet.
 * This decouples the voter's address from the vote transaction, preserving privacy.
 */
app.post("/api/v1/relay", async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
        // Step 1: Validate request format
        const validationError = validateRequestFormat(req.body);
        if (validationError) {
            console.log(`[Relay] Rejected - validation error: ${validationError}`);
            const response: RelayResponse = {
                success: false,
                error: validationError,
            };
            res.status(400).json(response);
            return;
        }

        const request = req.body as VoteRelayRequest;

        console.log(
            `[Relay] Received vote relay request - nullifier: ${request.nullifier}, proposalId: ${request.proposalId}`
        );

        // Step 2: On-chain pre-checks (nullifier, roots)
        if (config.votingBoothAddress && config.registryAddress) {
            const preCheckError = await preCheckOnChain(provider, request);
            if (preCheckError) {
                console.log(
                    `[Relay] Rejected - pre-check failed: ${preCheckError}, nullifier: ${request.nullifier}`
                );
                const response: RelayResponse = {
                    success: false,
                    error: preCheckError,
                };
                res.status(400).json(response);
                return;
            }
        }

        // Step 3: Enqueue for submission
        const receipt = await txQueue.enqueue(request);

        const elapsed = Date.now() - startTime;
        console.log(
            `[Relay] Success - txHash: ${receipt.hash}, nullifier: ${request.nullifier}, elapsed: ${elapsed}ms`
        );

        const response: RelayResponse = {
            success: true,
            txHash: receipt.hash,
        };
        res.json(response);
    } catch (err) {
        const error = err as Error;
        const elapsed = Date.now() - startTime;
        console.error(
            `[Relay] Error - ${error.message}, elapsed: ${elapsed}ms`
        );

        const response: RelayResponse = {
            success: false,
            error: error.message,
        };
        res.status(500).json(response);
    }
});

/**
 * GET /api/v1/health
 *
 * Returns the relayer's operational status including its address, ETH balance,
 * and the number of pending transactions in the queue.
 */
app.get("/api/v1/health", async (_req: Request, res: Response) => {
    try {
        const address = signer.address;
        const balance = await provider.getBalance(address);

        res.json({
            status: "ok",
            address,
            balance: ethers.formatEther(balance),
            pendingTxs: txQueue.pendingCount,
        });
    } catch (err) {
        const error = err as Error;
        res.status(500).json({
            status: "error",
            error: error.message,
        });
    }
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[Server] Unhandled error:", err.message);
    res.status(500).json({
        success: false,
        error: "Internal server error",
    });
});

// Start server (only when not imported as a module, e.g. during tests)
if (require.main === module) {
    app.listen(config.port, () => {
        console.log(`[Server] ZK OpenGov Relayer running on port ${config.port}`);
        console.log(`[Server] Relayer address: ${signer.address}`);
        console.log(`[Server] RPC: ${config.evmRpc}`);
        console.log(
            `[Server] VotingBooth: ${config.votingBoothAddress || "(not configured)"}`
        );
        console.log(
            `[Server] Registry: ${config.registryAddress || "(not configured)"}`
        );
    });
}

export { app, provider, signer, txQueue };
