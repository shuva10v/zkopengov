/**
 * 06 - Tier Configuration and Weight Verification
 *
 * Tests that tiers are correctly configured on-chain and that votes
 * from different tiers apply the correct voting weights.
 *
 * Verifies:
 *   - 5 tiers are configured
 *   - Each tier has correct min/max/weight values
 *   - packedConfig matches tierMin * 2^128 + tierMax
 *   - Votes from all tiers apply correct weights
 *   - getResults returns correct aggregate totals
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { deployContracts } from "../setup/deploy-contracts";
import { seedRegistrations } from "../setup/seed-registrations";
import { buildTestTrees } from "../setup/build-trees";
import { TEST_ACCOUNTS, TIER_CONFIGS } from "../setup/test-accounts";
import { initPoseidon, poseidonHash } from "../helpers/poseidon";
import { PoseidonMerkleTree } from "../helpers/tree-builder";
import { generateDummyProof } from "../helpers/proof-helpers";
import { bigintToBytes32 } from "../helpers/chain";

const PROPOSAL_TIER_TEST = ethers.keccak256(
  ethers.toUtf8Bytes("polkadot-opengov-tier-test")
);

describe("Tier Configuration and Weights", function () {
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
  });

  it("should have 5 tiers configured", async function () {
    const tierCount = await votingBooth.getTierCount();
    expect(tierCount).to.equal(5n);
  });

  it("each tier should have correct min/max/weight", async function () {
    for (let i = 0; i < TIER_CONFIGS.length; i++) {
      const tier = await votingBooth.tiers(i);
      expect(tier.minBalance).to.equal(TIER_CONFIGS[i].min);
      expect(tier.maxBalance).to.equal(TIER_CONFIGS[i].max);
      expect(tier.weight).to.equal(TIER_CONFIGS[i].weight);
    }
  });

  it("packedConfig should match tierMin * 2^128 + tierMax", async function () {
    const SHIFT = 1n << 128n;

    for (let i = 0; i < TIER_CONFIGS.length; i++) {
      const tier = await votingBooth.tiers(i);
      const expectedPacked =
        (TIER_CONFIGS[i].min << 128n) | TIER_CONFIGS[i].max;
      expect(tier.packedConfig).to.equal(expectedPacked);
    }
  });

  it("votes from different tiers should apply correct weights", async function () {
    const proof = generateDummyProof();
    const proposalIdBigInt = BigInt(PROPOSAL_TIER_TEST);

    // Alice (tier 0, weight 1) votes aye
    const aliceNullifier = poseidonHash(poseidon, F, [
      TEST_ACCOUNTS[0].secret,
      proposalIdBigInt,
    ]);
    await votingBooth.vote(
      proof.pA,
      proof.pB,
      proof.pC,
      ownershipRootBytes32,
      balancesRootBytes32,
      PROPOSAL_TIER_TEST,
      1, // aye
      0, // tier 0
      bigintToBytes32(aliceNullifier)
    );

    // Bob (tier 1, weight 3) votes aye
    const bobNullifier = poseidonHash(poseidon, F, [
      TEST_ACCOUNTS[1].secret,
      proposalIdBigInt,
    ]);
    await votingBooth.vote(
      proof.pA,
      proof.pB,
      proof.pC,
      ownershipRootBytes32,
      balancesRootBytes32,
      PROPOSAL_TIER_TEST,
      1, // aye
      1, // tier 1
      bigintToBytes32(bobNullifier)
    );

    // Charlie (tier 2, weight 6) votes nay
    const charlieNullifier = poseidonHash(poseidon, F, [
      TEST_ACCOUNTS[2].secret,
      proposalIdBigInt,
    ]);
    await votingBooth.vote(
      proof.pA,
      proof.pB,
      proof.pC,
      ownershipRootBytes32,
      balancesRootBytes32,
      PROPOSAL_TIER_TEST,
      0, // nay
      2, // tier 2
      bigintToBytes32(charlieNullifier)
    );

    // Diana (tier 3, weight 10) votes aye
    const dianaNullifier = poseidonHash(poseidon, F, [
      TEST_ACCOUNTS[3].secret,
      proposalIdBigInt,
    ]);
    await votingBooth.vote(
      proof.pA,
      proof.pB,
      proof.pC,
      ownershipRootBytes32,
      balancesRootBytes32,
      PROPOSAL_TIER_TEST,
      1, // aye
      3, // tier 3
      bigintToBytes32(dianaNullifier)
    );

    // Eve (tier 4, weight 15) votes abstain
    const eveNullifier = poseidonHash(poseidon, F, [
      TEST_ACCOUNTS[4].secret,
      proposalIdBigInt,
    ]);
    await votingBooth.vote(
      proof.pA,
      proof.pB,
      proof.pC,
      ownershipRootBytes32,
      balancesRootBytes32,
      PROPOSAL_TIER_TEST,
      2, // abstain
      4, // tier 4
      bigintToBytes32(eveNullifier)
    );

    // Verify per-tier results
    // Tier 0: Alice aye (weight 1)
    const [aye0, nay0, abstain0] = await votingBooth.getTierResults(
      PROPOSAL_TIER_TEST,
      0
    );
    expect(aye0).to.equal(1n);
    expect(nay0).to.equal(0n);
    expect(abstain0).to.equal(0n);

    // Tier 1: Bob aye (weight 3)
    const [aye1, nay1, abstain1] = await votingBooth.getTierResults(
      PROPOSAL_TIER_TEST,
      1
    );
    expect(aye1).to.equal(3n);
    expect(nay1).to.equal(0n);
    expect(abstain1).to.equal(0n);

    // Tier 2: Charlie nay (weight 6)
    const [aye2, nay2, abstain2] = await votingBooth.getTierResults(
      PROPOSAL_TIER_TEST,
      2
    );
    expect(aye2).to.equal(0n);
    expect(nay2).to.equal(6n);
    expect(abstain2).to.equal(0n);

    // Tier 3: Diana aye (weight 10)
    const [aye3, nay3, abstain3] = await votingBooth.getTierResults(
      PROPOSAL_TIER_TEST,
      3
    );
    expect(aye3).to.equal(10n);
    expect(nay3).to.equal(0n);
    expect(abstain3).to.equal(0n);

    // Tier 4: Eve abstain (weight 15)
    const [aye4, nay4, abstain4] = await votingBooth.getTierResults(
      PROPOSAL_TIER_TEST,
      4
    );
    expect(aye4).to.equal(0n);
    expect(nay4).to.equal(0n);
    expect(abstain4).to.equal(15n);
  });

  it("getResults should return correct aggregate totals", async function () {
    const results = await votingBooth.getResults(PROPOSAL_TIER_TEST);

    // Aye: Alice(1) + Bob(3) + Diana(10) = 14
    expect(results.totalAye).to.equal(14n);

    // Nay: Charlie(6) = 6
    expect(results.totalNay).to.equal(6n);

    // Abstain: Eve(15) = 15
    expect(results.totalAbstain).to.equal(15n);

    // Vote count: 5
    expect(results.voteCount).to.equal(5n);
  });
});
