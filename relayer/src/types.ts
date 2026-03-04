export interface VoteRelayRequest {
    proof: {
        pA: [string, string];
        pB: [[string, string], [string, string]];
        pC: [string, string];
    };
    ownershipRoot: string;
    balancesRoot: string;
    proposalId: string;
    voteChoice: number;
    tier: number;
    nullifier: string;
}

export interface RelayResponse {
    success: boolean;
    txHash?: string;
    error?: string;
}

export interface QueueItem {
    request: VoteRelayRequest;
    resolve: (receipt: import("ethers").TransactionReceipt) => void;
    reject: (error: Error) => void;
}
