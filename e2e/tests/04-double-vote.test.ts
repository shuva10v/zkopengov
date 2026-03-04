/**
 * 04 - Double Vote Prevention
 *
 * Tests that the same nullifier cannot be used twice for the same proposal.
 * The VotingBooth must reject duplicate nullifiers to prevent double-voting.
 *
 * Verifies:
 *   - Same nullifier on same proposal is rejected
 *   - Revert message is "Already voted"
 *   - Tally does not change on rejected votes
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { deployContracts } from "../setup/deploy-contracts";
import { seedRegistrations } from "../setup/seed-registrations";
import { buildTestTrees } from "../setup/build-trees";
import { TEST_ACCOUNTS } from "../setup/test-accounts";
import { initPoseidon, poseidonHash } from "../helpers/poseidon";
import { PoseidonMerkleTree } from "../helpers/tree-builder";
import { generateDummyProof } from "../helpers/proof-helpers";
import { bigintToBytes32 } from "../helpers/chain";

const PROPOSAL_1 = ethers.keccak256(ethers.toUtf8Bytes("polkadot-opengov-1"));

describe("Double Vote Prevention", function () {
  let deployer: any;
  let signers: any[];
  let registry: any;
  let votingBooth: any;
  let poseidon: any;
  let F: any;
  let ownershipRootBytes32: string;
  let balancesRootBytes32: string;
  let aliceNullifierBytes32: string;

  before(async function () {
    signers = await ethers.getSigners();
    deployer = signers[0];
    ({ poseidon, F } = await initPoseidon());

    // Deploy contracts
    ({ registry, votingBooth } = await deployContracts(deployer));

    // Register all test accounts
    await seedRegistrations(registry, TEST_ACCOUNTS, signers, poseidon, F);

    // Build and submit trees
    const { ownershipTree, balancesTree } = await buildTestTrees(
      TEST_ACCOUNTS,
      signers,
      poseidon,
      F
    );

    ownershipRootBytes32 = bigintToBytes32(ownershipTree.getRoot());
    balancesRootBytes32 = bigintToBytes32(balancesTree.getRoot());

    await registry.submitOwnershipRoot(
      ownershipRootBytes32,
      TEST_ACCOUNTS.length
    );
    await registry.submitBalancesRoot(balancesRootBytes32, 1);

    // Alice votes first (aye, tier 0)
    const alice = TEST_ACCOUNTS[0];
    const proof = generateDummyProof();
    const proposalIdBigInt = BigInt(PROPOSAL_1);
    const nullifier = poseidonHash(poseidon, F, [
      alice.secret,
      proposalIdBigInt,
    ]);
    aliceNullifierBytes32 = bigintToBytes32(nullifier);

    await votingBooth.vote(
      proof.pA,
      proof.pB,
      proof.pC,
      ownershipRootBytes32,
      balancesRootBytes32,
      PROPOSAL_1,
      1, // aye
      alice.expectedTier,
      aliceNullifierBytes32
    );
  });

  it("should reject same nullifier for same proposal", async function () {
    const proof = generateDummyProof();
    const alice = TEST_ACCOUNTS[0];

    // Attempt to submit the same nullifier again (even with different vote choice)
    await expect(
      votingBooth.vote(
        proof.pA,
        proof.pB,
        proof.pC,
        ownershipRootBytes32,
        balancesRootBytes32,
        PROPOSAL_1,
        0, // nay (different choice, same nullifier)
        alice.expectedTier,
        aliceNullifierBytes32
      )
    ).to.be.revertedWith("Already voted");
  });

  it("should revert with 'Already voted' message", async function () {
    const proof = generateDummyProof();
    const alice = TEST_ACCOUNTS[0];

    // Verify the exact revert message
    await expect(
      votingBooth.vote(
        proof.pA,
        proof.pB,
        proof.pC,
        ownershipRootBytes32,
        balancesRootBytes32,
        PROPOSAL_1,
        2, // abstain (yet another choice, same nullifier)
        alice.expectedTier,
        aliceNullifierBytes32
      )
    ).to.be.revertedWith("Already voted");
  });

  it("should not change tally on rejected vote", async function () {
    // Record the tally before the rejected attempt
    const [ayeBefore, nayBefore, abstainBefore] =
      await votingBooth.getTierResults(PROPOSAL_1, 0);
    const totalBefore = await votingBooth.totalVotes(PROPOSAL_1);

    // Attempt the duplicate vote (expect it to revert)
    const proof = generateDummyProof();
    const alice = TEST_ACCOUNTS[0];
    try {
      await votingBooth.vote(
        proof.pA,
        proof.pB,
        proof.pC,
        ownershipRootBytes32,
        balancesRootBytes32,
        PROPOSAL_1,
        1,
        alice.expectedTier,
        aliceNullifierBytes32
      );
    } catch {
      // Expected to revert
    }

    // Verify tally is unchanged
    const [ayeAfter, nayAfter, abstainAfter] =
      await votingBooth.getTierResults(PROPOSAL_1, 0);
    const totalAfter = await votingBooth.totalVotes(PROPOSAL_1);

    expect(ayeAfter).to.equal(ayeBefore);
    expect(nayAfter).to.equal(nayBefore);
    expect(abstainAfter).to.equal(abstainBefore);
    expect(totalAfter).to.equal(totalBefore);
  });
});
