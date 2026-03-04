import { ethers } from "ethers";
import { VoteRelayRequest } from "./types";
import { VOTING_BOOTH_ABI } from "./config";

/**
 * Submits a vote transaction to the VotingBooth contract.
 *
 * @param signer - The wallet that will sign and pay for the transaction
 * @param votingBoothAddress - The address of the VotingBooth contract
 * @param params - The vote relay request containing proof and vote parameters
 * @param nonce - Optional nonce override to avoid nonce conflicts
 * @returns The transaction receipt once mined
 */
export async function submitVote(
    signer: ethers.Wallet,
    votingBoothAddress: string,
    params: VoteRelayRequest,
    nonce?: number
): Promise<ethers.TransactionReceipt> {
    const votingBooth = new ethers.Contract(
        votingBoothAddress,
        VOTING_BOOTH_ABI,
        signer
    );

    const txOptions: Record<string, unknown> = {};
    if (nonce !== undefined) {
        txOptions.nonce = nonce;
    }

    const tx = await votingBooth.vote(
        params.proof.pA,
        params.proof.pB,
        params.proof.pC,
        params.ownershipRoot,
        params.balancesRoot,
        params.proposalId,
        params.voteChoice,
        params.tier,
        params.nullifier,
        txOptions
    );

    const receipt = await tx.wait();
    if (!receipt) {
        throw new Error("Transaction receipt is null - transaction may have been dropped");
    }

    return receipt;
}
