/**
 * 05 - Multi-Proposal Voting
 *
 * Tests that users can vote on multiple proposals independently.
 * Each proposal has its own nullifier space, so the same user can
 * vote once per proposal.
 *
 * Verifies:
 *   - Same user can vote on different proposals
 *   - Different proposal IDs produce different nullifiers
 *   - Both votes are recorded independently
 *   - Multiple users can vote on multiple proposals
 *   - Tallies remain independent per proposal
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
const PROPOSAL_2 = ethers.keccak256(ethers.toUtf8Bytes("polkadot-opengov-2"));

describe("Multi-Proposal Voting", function () {
  let deployer: any;
  let signers: any[];
  let registry: any;
  let votingBooth: any;
  let poseidon: any;
  let F: any;
  let ownershipRootBytes32: string;
  let balancesRootBytes32: string;

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

    // Alice votes aye on proposal 1
    const alice = TEST_ACCOUNTS[0];
    const proof = generateDummyProof();
    const nullifier1 = poseidonHash(poseidon, F, [
      alice.secret,
      BigInt(PROPOSAL_1),
    ]);
    await votingBooth.vote(
      proof.pA,
      proof.pB,
      proof.pC,
      ownershipRootBytes32,
      balancesRootBytes32,
      PROPOSAL_1,
      1, // aye
      alice.expectedTier,
      bigintToBytes32(nullifier1)
    );
  });

  it("should allow Alice to vote on proposal 2 (different nullifier)", async function () {
    const alice = TEST_ACCOUNTS[0];
    const proof = generateDummyProof();

    const nullifier2 = poseidonHash(poseidon, F, [
      alice.secret,
      BigInt(PROPOSAL_2),
    ]);
    const nullifier2Bytes32 = bigintToBytes32(nullifier2);

    // This should succeed because PROPOSAL_2 is a different proposal
    const tx = await votingBooth.vote(
      proof.pA,
      proof.pB,
      proof.pC,
      ownershipRootBytes32,
      balancesRootBytes32,
      PROPOSAL_2,
      0, // nay
      alice.expectedTier,
      nullifier2Bytes32
    );
    await tx.wait();

    // Verify the nullifier is recorded for proposal 2
    expect(
      await votingBooth.nullifierUsed(PROPOSAL_2, nullifier2Bytes32)
    ).to.be.true;
  });

  it("should compute different nullifier for different proposal", async function () {
    const alice = TEST_ACCOUNTS[0];

    const nullifier1 = poseidonHash(poseidon, F, [
      alice.secret,
      BigInt(PROPOSAL_1),
    ]);
    const nullifier2 = poseidonHash(poseidon, F, [
      alice.secret,
      BigInt(PROPOSAL_2),
    ]);

    // Nullifiers for different proposals must differ
    expect(nullifier1).to.not.equal(nullifier2);
  });

  it("should record both votes independently", async function () {
    // Alice's vote on proposal 1 (aye, tier 0)
    const [aye1, nay1, abstain1] = await votingBooth.getTierResults(
      PROPOSAL_1,
      0
    );
    expect(aye1).to.equal(1n); // weight 1
    expect(nay1).to.equal(0n);

    // Alice's vote on proposal 2 (nay, tier 0)
    const [aye2, nay2, abstain2] = await votingBooth.getTierResults(
      PROPOSAL_2,
      0
    );
    expect(aye2).to.equal(0n);
    expect(nay2).to.equal(1n); // weight 1
  });

  it("should allow Bob to vote on both proposals", async function () {
    const bob = TEST_ACCOUNTS[1];
    const proof = generateDummyProof();

    // Bob votes aye on proposal 1
    const bobNullifier1 = poseidonHash(poseidon, F, [
      bob.secret,
      BigInt(PROPOSAL_1),
    ]);
    await votingBooth.vote(
      proof.pA,
      proof.pB,
      proof.pC,
      ownershipRootBytes32,
      balancesRootBytes32,
      PROPOSAL_1,
      1, // aye
      bob.expectedTier,
      bigintToBytes32(bobNullifier1)
    );

    // Bob votes nay on proposal 2
    const bobNullifier2 = poseidonHash(poseidon, F, [
      bob.secret,
      BigInt(PROPOSAL_2),
    ]);
    await votingBooth.vote(
      proof.pA,
      proof.pB,
      proof.pC,
      ownershipRootBytes32,
      balancesRootBytes32,
      PROPOSAL_2,
      0, // nay
      bob.expectedTier,
      bigintToBytes32(bobNullifier2)
    );

    // Verify Bob's nullifiers are recorded
    expect(
      await votingBooth.nullifierUsed(
        PROPOSAL_1,
        bigintToBytes32(bobNullifier1)
      )
    ).to.be.true;
    expect(
      await votingBooth.nullifierUsed(
        PROPOSAL_2,
        bigintToBytes32(bobNullifier2)
      )
    ).to.be.true;
  });

  it("proposal 1 and proposal 2 tallies are independent", async function () {
    // Proposal 1: Alice (tier 0, aye, weight 1) + Bob (tier 1, aye, weight 3)
    const results1 = await votingBooth.getResults(PROPOSAL_1);
    expect(results1.totalAye).to.equal(4n); // 1 + 3
    expect(results1.totalNay).to.equal(0n);
    expect(results1.totalAbstain).to.equal(0n);
    expect(results1.voteCount).to.equal(2n);

    // Proposal 2: Alice (tier 0, nay, weight 1) + Bob (tier 1, nay, weight 3)
    const results2 = await votingBooth.getResults(PROPOSAL_2);
    expect(results2.totalAye).to.equal(0n);
    expect(results2.totalNay).to.equal(4n); // 1 + 3
    expect(results2.totalAbstain).to.equal(0n);
    expect(results2.voteCount).to.equal(2n);
  });
});
