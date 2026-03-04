/**
 * 03 - Single Vote
 *
 * Tests the complete single-vote flow:
 *   - Computing a nullifier for a specific user and proposal
 *   - Submitting a vote with a mock proof
 *   - Event emission
 *   - Nullifier recording
 *   - Tally updates with correct tier weights
 *   - Total vote count tracking
 *
 * Setup: all 5 accounts registered, trees built, roots submitted.
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

// Deterministic proposal IDs
const PROPOSAL_1 = ethers.keccak256(ethers.toUtf8Bytes("polkadot-opengov-1"));

describe("Single Vote", function () {
  let deployer: any;
  let signers: any[];
  let verifier: any;
  let registry: any;
  let votingBooth: any;
  let poseidon: any;
  let F: any;
  let ownershipTree: PoseidonMerkleTree;
  let balancesTree: PoseidonMerkleTree;
  let ownershipRootBytes32: string;
  let balancesRootBytes32: string;

  before(async function () {
    signers = await ethers.getSigners();
    deployer = signers[0];
    ({ poseidon, F } = await initPoseidon());

    // Deploy contracts
    ({ verifier, registry, votingBooth } = await deployContracts(deployer));

    // Register all test accounts
    await seedRegistrations(registry, TEST_ACCOUNTS, signers, poseidon, F);

    // Build and submit trees
    ({ ownershipTree, balancesTree } = await buildTestTrees(
      TEST_ACCOUNTS,
      signers,
      poseidon,
      F
    ));

    ownershipRootBytes32 = bigintToBytes32(ownershipTree.getRoot());
    balancesRootBytes32 = bigintToBytes32(balancesTree.getRoot());

    await registry.submitOwnershipRoot(
      ownershipRootBytes32,
      TEST_ACCOUNTS.length
    );
    await registry.submitBalancesRoot(balancesRootBytes32, 1);
  });

  it("should compute correct nullifier for Alice on proposal 1", async function () {
    const alice = TEST_ACCOUNTS[0];

    // nullifier = Poseidon(secret, proposalId)
    const proposalIdBigInt = BigInt(PROPOSAL_1);
    const nullifier = poseidonHash(poseidon, F, [
      alice.secret,
      proposalIdBigInt,
    ]);

    // Nullifier should be a non-zero field element
    expect(nullifier).to.not.equal(0n);

    // Nullifier should be deterministic (compute again and verify)
    const nullifier2 = poseidonHash(poseidon, F, [
      alice.secret,
      proposalIdBigInt,
    ]);
    expect(nullifier).to.equal(nullifier2);
  });

  it("should submit Alice's vote (aye) with mock proof", async function () {
    const alice = TEST_ACCOUNTS[0];
    const proof = generateDummyProof();

    // Compute nullifier
    const proposalIdBigInt = BigInt(PROPOSAL_1);
    const nullifier = poseidonHash(poseidon, F, [
      alice.secret,
      proposalIdBigInt,
    ]);
    const nullifierBytes32 = bigintToBytes32(nullifier);

    // Vote: aye (1), tier 0
    const voteChoice = 1; // aye
    const tier = alice.expectedTier; // 0

    // Submit vote (anyone can relay; we use deployer)
    const tx = await votingBooth.vote(
      proof.pA,
      proof.pB,
      proof.pC,
      ownershipRootBytes32,
      balancesRootBytes32,
      PROPOSAL_1,
      voteChoice,
      tier,
      nullifierBytes32
    );
    await tx.wait();

    // If we get here, the vote was accepted
    expect(true).to.be.true;
  });

  it("should emit VoteCast event", async function () {
    // We need to submit a fresh vote to check the event.
    // Use Bob (index 1) for this test.
    const bob = TEST_ACCOUNTS[1];
    const proof = generateDummyProof();

    const proposalIdBigInt = BigInt(PROPOSAL_1);
    const nullifier = poseidonHash(poseidon, F, [
      bob.secret,
      proposalIdBigInt,
    ]);
    const nullifierBytes32 = bigintToBytes32(nullifier);

    const voteChoice = 1; // aye
    const tier = bob.expectedTier; // 1

    await expect(
      votingBooth.vote(
        proof.pA,
        proof.pB,
        proof.pC,
        ownershipRootBytes32,
        balancesRootBytes32,
        PROPOSAL_1,
        voteChoice,
        tier,
        nullifierBytes32
      )
    )
      .to.emit(votingBooth, "VoteCast")
      .withArgs(PROPOSAL_1, tier, voteChoice, nullifierBytes32);
  });

  it("should record nullifier as used", async function () {
    const alice = TEST_ACCOUNTS[0];
    const proposalIdBigInt = BigInt(PROPOSAL_1);
    const nullifier = poseidonHash(poseidon, F, [
      alice.secret,
      proposalIdBigInt,
    ]);
    const nullifierBytes32 = bigintToBytes32(nullifier);

    const used = await votingBooth.nullifierUsed(
      PROPOSAL_1,
      nullifierBytes32
    );
    expect(used).to.be.true;
  });

  it("should update tally correctly (tier 0 aye += weight 1)", async function () {
    // Alice voted aye in tier 0 (weight 1)
    // Bob voted aye in tier 1 (weight 3)

    // Check tier 0 results
    const [aye0, nay0, abstain0] = await votingBooth.getTierResults(
      PROPOSAL_1,
      0
    );
    expect(aye0).to.equal(1n); // Alice's weight = 1
    expect(nay0).to.equal(0n);
    expect(abstain0).to.equal(0n);

    // Check tier 1 results
    const [aye1, nay1, abstain1] = await votingBooth.getTierResults(
      PROPOSAL_1,
      1
    );
    expect(aye1).to.equal(3n); // Bob's weight = 3
    expect(nay1).to.equal(0n);
    expect(abstain1).to.equal(0n);
  });

  it("should increment total votes", async function () {
    const total = await votingBooth.totalVotes(PROPOSAL_1);
    expect(total).to.equal(2n); // Alice + Bob
  });
});
