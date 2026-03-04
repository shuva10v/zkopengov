/**
 * Seed voter registrations on the VotingRegistry contract.
 *
 * For each test account, computes commitment = Poseidon(secret) and calls
 * registry.register(commitment) from the account's signer.
 */

import { poseidonHash } from "../helpers/poseidon";
import { TestAccount } from "./test-accounts";

/**
 * Register all test accounts on the VotingRegistry.
 *
 * @param registry  - The deployed VotingRegistry contract instance
 * @param accounts  - Array of TestAccount definitions
 * @param signers   - Hardhat signers (index 0 = deployer, 1+ = test accounts)
 * @param poseidon  - The circomlibjs Poseidon hash function
 * @param F         - The circomlibjs finite field
 */
export async function seedRegistrations(
  registry: any,
  accounts: TestAccount[],
  signers: any[],
  poseidon: any,
  F: any
): Promise<void> {
  for (const account of accounts) {
    const signer = signers[account.signerIndex];

    // Compute commitment = Poseidon(secret)
    const commitment = poseidonHash(poseidon, F, [account.secret]);

    // Convert to bytes32 hex string
    const commitmentHex =
      "0x" + commitment.toString(16).padStart(64, "0");

    // Register from the account's signer
    const tx = await registry.connect(signer).register(commitmentHex);
    await tx.wait();
  }
}
