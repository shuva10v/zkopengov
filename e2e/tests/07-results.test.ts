/**
 * 07 - Results Aggregation
 *
 * Tests that the VotingBooth correctly aggregates voting results
 * across tiers and vote choices.
 *
 * Verifies:
 *   - getResults returns correct aggregate aye/nay/abstain
 *   - getTierResults returns correct per-tier breakdown
 *   - totalVotes returns correct count
 *   - Results for an unvoted proposal return all zeros
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

const PROPOSAL_RESULTS = ethers.keccak256(
  ethers.toUtf8Bytes("polkadot-opengov-results")
);
const PROPOSAL_UNVOTED = ethers.keccak256(
  ethers.toUtf8Bytes("polkadot-opengov-unvoted")
);

describe("Results Aggregation", function () {
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

    // Cast a mix of votes on PROPOSAL_RESULTS:
    //   Alice  (tier 0, weight 1)  -> aye
    //   Bob    (tier 1, weight 3)  -> nay
    //   Charlie(tier 2, weight 6)  -> aye
    //   Diana  (tier 3, weight 10) -> abstain
    //   Eve    (tier 4, weight 15) -> nay
    const proof = generateDummyProof();
    const proposalBigInt = BigInt(PROPOSAL_RESULTS);

    const voteData: Array<{
      account: (typeof TEST_ACCOUNTS)[0];
      choice: number;
    }> = [
      { account: TEST_ACCOUNTS[0], choice: 1 }, // Alice: aye
      { account: TEST_ACCOUNTS[1], choice: 0 }, // Bob: nay
      { account: TEST_ACCOUNTS[2], choice: 1 }, // Charlie: aye
      { account: TEST_ACCOUNTS[3], choice: 2 }, // Diana: abstain
      { account: TEST_ACCOUNTS[4], choice: 0 }, // Eve: nay
    ];

    for (const { account, choice } of voteData) {
      const nullifier = poseidonHash(poseidon, F, [
        account.secret,
        proposalBigInt,
      ]);
      await votingBooth.vote(
        proof.pA,
        proof.pB,
        proof.pC,
        ownershipRootBytes32,
        balancesRootBytes32,
        PROPOSAL_RESULTS,
        choice,
        account.expectedTier,
        bigintToBytes32(nullifier)
      );
    }
  });

  it("getResults returns correct aggregate aye/nay/abstain", async function () {
    const results = await votingBooth.getResults(PROPOSAL_RESULTS);

    // Aye: Alice(1) + Charlie(6) = 7
    expect(results.totalAye).to.equal(7n);

    // Nay: Bob(3) + Eve(15) = 18
    expect(results.totalNay).to.equal(18n);

    // Abstain: Diana(10) = 10
    expect(results.totalAbstain).to.equal(10n);
  });

  it("getTierResults returns correct per-tier breakdown", async function () {
    // Tier 0: Alice voted aye (weight 1)
    const [aye0, nay0, abstain0] = await votingBooth.getTierResults(
      PROPOSAL_RESULTS,
      0
    );
    expect(aye0).to.equal(1n);
    expect(nay0).to.equal(0n);
    expect(abstain0).to.equal(0n);

    // Tier 1: Bob voted nay (weight 3)
    const [aye1, nay1, abstain1] = await votingBooth.getTierResults(
      PROPOSAL_RESULTS,
      1
    );
    expect(aye1).to.equal(0n);
    expect(nay1).to.equal(3n);
    expect(abstain1).to.equal(0n);

    // Tier 2: Charlie voted aye (weight 6)
    const [aye2, nay2, abstain2] = await votingBooth.getTierResults(
      PROPOSAL_RESULTS,
      2
    );
    expect(aye2).to.equal(6n);
    expect(nay2).to.equal(0n);
    expect(abstain2).to.equal(0n);

    // Tier 3: Diana voted abstain (weight 10)
    const [aye3, nay3, abstain3] = await votingBooth.getTierResults(
      PROPOSAL_RESULTS,
      3
    );
    expect(aye3).to.equal(0n);
    expect(nay3).to.equal(0n);
    expect(abstain3).to.equal(10n);

    // Tier 4: Eve voted nay (weight 15)
    const [aye4, nay4, abstain4] = await votingBooth.getTierResults(
      PROPOSAL_RESULTS,
      4
    );
    expect(aye4).to.equal(0n);
    expect(nay4).to.equal(15n);
    expect(abstain4).to.equal(0n);
  });

  it("totalVotes returns correct count", async function () {
    const total = await votingBooth.totalVotes(PROPOSAL_RESULTS);
    expect(total).to.equal(5n); // 5 voters
  });

  it("results for unvoted proposal returns all zeros", async function () {
    const results = await votingBooth.getResults(PROPOSAL_UNVOTED);
    expect(results.totalAye).to.equal(0n);
    expect(results.totalNay).to.equal(0n);
    expect(results.totalAbstain).to.equal(0n);
    expect(results.voteCount).to.equal(0n);

    // Per-tier results should also be zero
    for (let t = 0; t < 5; t++) {
      const [aye, nay, abstain] = await votingBooth.getTierResults(
        PROPOSAL_UNVOTED,
        t
      );
      expect(aye).to.equal(0n);
      expect(nay).to.equal(0n);
      expect(abstain).to.equal(0n);
    }

    // Total vote count should also be zero
    const total = await votingBooth.totalVotes(PROPOSAL_UNVOTED);
    expect(total).to.equal(0n);
  });
});
