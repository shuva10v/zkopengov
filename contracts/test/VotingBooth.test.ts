import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {
  deployFullSetup,
  setupRealVotingState,
  generateVoteProof,
  randomBytes32,
  randomFieldElement,
  bigintToBytes32,
  TIER_DEFS,
  PLANCKS_PER_DOT,
  VOTE_AYE,
  VOTE_NAY,
  VOTE_ABSTAIN,
  TEST_SNAPSHOT_BLOCK,
} from "./helpers";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VotingBooth", function () {
  // Proof generation is CPU-intensive, increase timeout
  this.timeout(120_000);

  // ---- Deployment ----

  it("Should deploy with correct verifier and registry", async function () {
    const { booth, verifier, registry } = await loadFixture(deployFullSetup);

    expect(await booth.verifier()).to.equal(await verifier.getAddress());
    expect(await booth.registry()).to.equal(await registry.getAddress());
  });

  // ---- Tier configuration ----

  it("Should allow configuring tiers", async function () {
    const { booth } = await loadFixture(deployFullSetup);

    expect(await booth.getTierCount()).to.equal(TIER_DEFS.length);

    for (let i = 0; i < TIER_DEFS.length; i++) {
      const [minBal, maxBal, weight, packed] = await booth.tiers(i);
      expect(minBal).to.equal(TIER_DEFS[i].minBalance);
      expect(maxBal).to.equal(TIER_DEFS[i].maxBalance);
      expect(weight).to.equal(TIER_DEFS[i].weight);

      const expectedPacked =
        (TIER_DEFS[i].minBalance << 128n) | TIER_DEFS[i].maxBalance;
      expect(packed).to.equal(expectedPacked);
    }
  });

  it("Should emit TierConfigured event", async function () {
    const [deployer] = await ethers.getSigners();

    const VerifierF = await ethers.getContractFactory("Groth16Verifier");
    const verifier = await VerifierF.deploy();

    const RegistryF = await ethers.getContractFactory("VotingRegistry");
    const registry = await RegistryF.deploy(deployer.address);

    const BoothF = await ethers.getContractFactory("VotingBooth");
    const booth = await BoothF.deploy(
      await verifier.getAddress(),
      await registry.getAddress()
    );

    await expect(booth.configureTier(100n, 200n, 5n))
      .to.emit(booth, "TierConfigured")
      .withArgs(0, 100n, 200n, 5n);
  });

  it("Should reject configureTier from non-owner", async function () {
    const { booth, other } = await loadFixture(deployFullSetup);

    await expect(
      booth.connect(other).configureTier(1n, 2n, 1n)
    ).to.be.revertedWith("Not owner");
  });

  // ---- Voting with real ZK proofs ----

  it("Should accept valid vote with real ZK proof", async function () {
    const { booth, registry, treeBuilder, voter1 } = await loadFixture(
      deployFullSetup
    );

    // 50 DOT balance → tier 0
    const balance = 50n * PLANCKS_PER_DOT;
    const { voters, ownershipTree, balancesTree, ownershipRootHex, balancesRootHex } =
      await setupRealVotingState(registry, treeBuilder, [
        { addressSeed: 1, balance },
      ]);

    const proposalId = BigInt(randomFieldElement());
    const proposalIdHex = bigintToBytes32(proposalId);

    // Register proposal so VotingBooth accepts this proposalId
    await registry.connect(treeBuilder).registerProposal(proposalIdHex, TEST_SNAPSHOT_BLOCK);

    const proof = await generateVoteProof({
      voter: voters[0],
      ownershipTree,
      balancesTree,
      ownershipLeafIndex: 0,
      balancesLeafIndex: 0,
      proposalId,
      voteChoice: VOTE_AYE,
      tier: 0,
      tierMin: TIER_DEFS[0].minBalance,
      tierMax: TIER_DEFS[0].maxBalance,
    });

    const nullifierHex = bigintToBytes32(proof.pubSignals[5]);

    await booth
      .connect(voter1)
      .vote(
        proof.pA,
        proof.pB,
        proof.pC,
        ownershipRootHex,
        balancesRootHex,
        proposalIdHex,
        VOTE_AYE,
        0,
        nullifierHex
      );

    expect(await booth.totalVotes(proposalIdHex)).to.equal(1);
    expect(await booth.nullifierUsed(proposalIdHex, nullifierHex)).to.be.true;
  });

  it("Should emit VoteCast event", async function () {
    const { booth, registry, treeBuilder, voter1 } = await loadFixture(
      deployFullSetup
    );

    const balance = 50n * PLANCKS_PER_DOT;
    const { voters, ownershipTree, balancesTree, ownershipRootHex, balancesRootHex } =
      await setupRealVotingState(registry, treeBuilder, [
        { addressSeed: 10, balance },
      ]);

    const proposalId = BigInt(randomFieldElement());
    const proposalIdHex = bigintToBytes32(proposalId);
    await registry.connect(treeBuilder).registerProposal(proposalIdHex, TEST_SNAPSHOT_BLOCK);

    const proof = await generateVoteProof({
      voter: voters[0],
      ownershipTree,
      balancesTree,
      ownershipLeafIndex: 0,
      balancesLeafIndex: 0,
      proposalId,
      voteChoice: VOTE_AYE,
      tier: 0,
      tierMin: TIER_DEFS[0].minBalance,
      tierMax: TIER_DEFS[0].maxBalance,
    });

    const nullifierHex = bigintToBytes32(proof.pubSignals[5]);

    await expect(
      booth
        .connect(voter1)
        .vote(
          proof.pA,
          proof.pB,
          proof.pC,
          ownershipRootHex,
          balancesRootHex,
          proposalIdHex,
          VOTE_AYE,
          0,
          nullifierHex
        )
    )
      .to.emit(booth, "VoteCast")
      .withArgs(proposalIdHex, 0, VOTE_AYE, nullifierHex);
  });

  // ---- Voting (rejection cases) ----

  it("Should reject double vote (same nullifier)", async function () {
    const { booth, registry, treeBuilder, voter1 } = await loadFixture(
      deployFullSetup
    );

    const balance = 50n * PLANCKS_PER_DOT;
    const { voters, ownershipTree, balancesTree, ownershipRootHex, balancesRootHex } =
      await setupRealVotingState(registry, treeBuilder, [
        { addressSeed: 20, balance },
      ]);

    const proposalId = BigInt(randomFieldElement());
    const proposalIdHex = bigintToBytes32(proposalId);
    await registry.connect(treeBuilder).registerProposal(proposalIdHex, TEST_SNAPSHOT_BLOCK);

    const proof = await generateVoteProof({
      voter: voters[0],
      ownershipTree,
      balancesTree,
      ownershipLeafIndex: 0,
      balancesLeafIndex: 0,
      proposalId,
      voteChoice: VOTE_AYE,
      tier: 0,
      tierMin: TIER_DEFS[0].minBalance,
      tierMax: TIER_DEFS[0].maxBalance,
    });

    const nullifierHex = bigintToBytes32(proof.pubSignals[5]);

    // First vote succeeds
    await booth
      .connect(voter1)
      .vote(
        proof.pA,
        proof.pB,
        proof.pC,
        ownershipRootHex,
        balancesRootHex,
        proposalIdHex,
        VOTE_AYE,
        0,
        nullifierHex
      );

    // Second vote with same nullifier should fail
    await expect(
      booth
        .connect(voter1)
        .vote(
          proof.pA,
          proof.pB,
          proof.pC,
          ownershipRootHex,
          balancesRootHex,
          proposalIdHex,
          VOTE_AYE,
          0,
          nullifierHex
        )
    ).to.be.revertedWith("Already voted");
  });

  it("Should reject unknown ownership root", async function () {
    const { booth, registry, treeBuilder, voter1 } = await loadFixture(
      deployFullSetup
    );

    await setupRealVotingState(registry, treeBuilder, [
      { addressSeed: 30, balance: 50n * PLANCKS_PER_DOT },
    ]);

    const fakeOwnershipRoot = randomBytes32();
    const balancesRoot = await registry.latestBalancesRoot();
    const proposalId = randomBytes32();
    await registry.connect(treeBuilder).registerProposal(proposalId, TEST_SNAPSHOT_BLOCK);

    await expect(
      booth
        .connect(voter1)
        .vote(
          [0n, 0n],
          [[0n, 0n], [0n, 0n]],
          [0n, 0n],
          fakeOwnershipRoot,
          balancesRoot,
          proposalId,
          VOTE_AYE,
          0,
          randomBytes32()
        )
    ).to.be.revertedWith("Unknown ownership root");
  });

  it("Should reject wrong balances root for proposal", async function () {
    const { booth, registry, treeBuilder, voter1 } = await loadFixture(
      deployFullSetup
    );

    await setupRealVotingState(registry, treeBuilder, [
      { addressSeed: 40, balance: 50n * PLANCKS_PER_DOT },
    ]);

    const ownershipRoot = await registry.latestOwnershipRoot();
    const fakeBalancesRoot = randomBytes32();
    const proposalId = randomBytes32();
    await registry.connect(treeBuilder).registerProposal(proposalId, TEST_SNAPSHOT_BLOCK);

    await expect(
      booth
        .connect(voter1)
        .vote(
          [0n, 0n],
          [[0n, 0n], [0n, 0n]],
          [0n, 0n],
          ownershipRoot,
          fakeBalancesRoot,
          proposalId,
          VOTE_AYE,
          0,
          randomBytes32()
        )
    ).to.be.revertedWith("Wrong balances root for proposal");
  });

  it("Should reject invalid tier", async function () {
    const { booth, registry, treeBuilder, voter1 } = await loadFixture(
      deployFullSetup
    );

    const { ownershipRootHex, balancesRootHex } =
      await setupRealVotingState(registry, treeBuilder, [
        { addressSeed: 50, balance: 50n * PLANCKS_PER_DOT },
      ]);

    const invalidTier = TIER_DEFS.length; // out of bounds
    const proposalId = randomBytes32();
    await registry.connect(treeBuilder).registerProposal(proposalId, TEST_SNAPSHOT_BLOCK);

    await expect(
      booth
        .connect(voter1)
        .vote(
          [0n, 0n],
          [[0n, 0n], [0n, 0n]],
          [0n, 0n],
          ownershipRootHex,
          balancesRootHex,
          proposalId,
          VOTE_AYE,
          invalidTier,
          randomBytes32()
        )
    ).to.be.revertedWith("Invalid tier");
  });

  it("Should reject invalid vote choice (> 2)", async function () {
    const { booth, registry, treeBuilder, voter1 } = await loadFixture(
      deployFullSetup
    );

    const { ownershipRootHex, balancesRootHex } =
      await setupRealVotingState(registry, treeBuilder, [
        { addressSeed: 60, balance: 50n * PLANCKS_PER_DOT },
      ]);

    const proposalId = randomBytes32();
    await registry.connect(treeBuilder).registerProposal(proposalId, TEST_SNAPSHOT_BLOCK);

    await expect(
      booth
        .connect(voter1)
        .vote(
          [0n, 0n],
          [[0n, 0n], [0n, 0n]],
          [0n, 0n],
          ownershipRootHex,
          balancesRootHex,
          proposalId,
          3, // invalid
          0,
          randomBytes32()
        )
    ).to.be.revertedWith("Invalid vote choice");
  });

  // ---- Tallying with real proofs ----

  it("Should tally correctly across multiple votes in different tiers", async function () {
    const { booth, registry, treeBuilder, voter1, voter2, voter3 } =
      await loadFixture(deployFullSetup);

    // voter0: 50 DOT (tier 0, weight 1)
    // voter1: 500 DOT (tier 1, weight 3)
    // voter2: 5000 DOT (tier 2, weight 6)
    const { voters, ownershipTree, balancesTree, ownershipRootHex, balancesRootHex } =
      await setupRealVotingState(registry, treeBuilder, [
        { addressSeed: 100, balance: 50n * PLANCKS_PER_DOT },
        { addressSeed: 101, balance: 500n * PLANCKS_PER_DOT },
        { addressSeed: 102, balance: 5000n * PLANCKS_PER_DOT },
      ]);

    const proposalId = BigInt(randomFieldElement());
    const proposalIdHex = bigintToBytes32(proposalId);
    await registry.connect(treeBuilder).registerProposal(proposalIdHex, TEST_SNAPSHOT_BLOCK);

    // voter0 votes AYE in tier 0 (weight 1)
    const proof0 = await generateVoteProof({
      voter: voters[0],
      ownershipTree,
      balancesTree,
      ownershipLeafIndex: 0,
      balancesLeafIndex: 0,
      proposalId,
      voteChoice: VOTE_AYE,
      tier: 0,
      tierMin: TIER_DEFS[0].minBalance,
      tierMax: TIER_DEFS[0].maxBalance,
    });

    await booth.connect(voter1).vote(
      proof0.pA, proof0.pB, proof0.pC,
      ownershipRootHex, balancesRootHex,
      proposalIdHex, VOTE_AYE, 0,
      bigintToBytes32(proof0.pubSignals[5])
    );

    // voter1 votes NAY in tier 1 (weight 3)
    const proof1 = await generateVoteProof({
      voter: voters[1],
      ownershipTree,
      balancesTree,
      ownershipLeafIndex: 1,
      balancesLeafIndex: 1,
      proposalId,
      voteChoice: VOTE_NAY,
      tier: 1,
      tierMin: TIER_DEFS[1].minBalance,
      tierMax: TIER_DEFS[1].maxBalance,
    });

    await booth.connect(voter2).vote(
      proof1.pA, proof1.pB, proof1.pC,
      ownershipRootHex, balancesRootHex,
      proposalIdHex, VOTE_NAY, 1,
      bigintToBytes32(proof1.pubSignals[5])
    );

    // voter2 votes AYE in tier 2 (weight 6)
    const proof2 = await generateVoteProof({
      voter: voters[2],
      ownershipTree,
      balancesTree,
      ownershipLeafIndex: 2,
      balancesLeafIndex: 2,
      proposalId,
      voteChoice: VOTE_AYE,
      tier: 2,
      tierMin: TIER_DEFS[2].minBalance,
      tierMax: TIER_DEFS[2].maxBalance,
    });

    await booth.connect(voter3).vote(
      proof2.pA, proof2.pB, proof2.pC,
      ownershipRootHex, balancesRootHex,
      proposalIdHex, VOTE_AYE, 2,
      bigintToBytes32(proof2.pubSignals[5])
    );

    expect(await booth.totalVotes(proposalIdHex)).to.equal(3);

    const [totalAye, totalNay, totalAbstain, voteCount] =
      await booth.getResults(proposalIdHex);

    // AYE: tier0(1) + tier2(6) = 7
    expect(totalAye).to.equal(7);
    // NAY: tier1(3)
    expect(totalNay).to.equal(3);
    // ABSTAIN: 0
    expect(totalAbstain).to.equal(0);
    expect(voteCount).to.equal(3);
  });

  it("Should return correct per-tier results", async function () {
    const { booth, registry, treeBuilder, voter1, voter2 } =
      await loadFixture(deployFullSetup);

    // Both voters in tier 0
    const { voters, ownershipTree, balancesTree, ownershipRootHex, balancesRootHex } =
      await setupRealVotingState(registry, treeBuilder, [
        { addressSeed: 200, balance: 50n * PLANCKS_PER_DOT },
        { addressSeed: 201, balance: 80n * PLANCKS_PER_DOT },
      ]);

    const proposalId = BigInt(randomFieldElement());
    const proposalIdHex = bigintToBytes32(proposalId);
    await registry.connect(treeBuilder).registerProposal(proposalIdHex, TEST_SNAPSHOT_BLOCK);

    // voter0 votes AYE
    const proof0 = await generateVoteProof({
      voter: voters[0],
      ownershipTree,
      balancesTree,
      ownershipLeafIndex: 0,
      balancesLeafIndex: 0,
      proposalId,
      voteChoice: VOTE_AYE,
      tier: 0,
      tierMin: TIER_DEFS[0].minBalance,
      tierMax: TIER_DEFS[0].maxBalance,
    });

    await booth.connect(voter1).vote(
      proof0.pA, proof0.pB, proof0.pC,
      ownershipRootHex, balancesRootHex,
      proposalIdHex, VOTE_AYE, 0,
      bigintToBytes32(proof0.pubSignals[5])
    );

    // voter1 votes NAY
    const proof1 = await generateVoteProof({
      voter: voters[1],
      ownershipTree,
      balancesTree,
      ownershipLeafIndex: 1,
      balancesLeafIndex: 1,
      proposalId,
      voteChoice: VOTE_NAY,
      tier: 0,
      tierMin: TIER_DEFS[0].minBalance,
      tierMax: TIER_DEFS[0].maxBalance,
    });

    await booth.connect(voter2).vote(
      proof1.pA, proof1.pB, proof1.pC,
      ownershipRootHex, balancesRootHex,
      proposalIdHex, VOTE_NAY, 0,
      bigintToBytes32(proof1.pubSignals[5])
    );

    const [aye, nay, abstain] = await booth.getTierResults(proposalIdHex, 0);
    expect(aye).to.equal(TIER_DEFS[0].weight);   // 1
    expect(nay).to.equal(TIER_DEFS[0].weight);   // 1
    expect(abstain).to.equal(0);
  });

  it("Should allow same voter to vote on different proposals", async function () {
    const { booth, registry, treeBuilder, voter1 } = await loadFixture(
      deployFullSetup
    );

    const balance = 50n * PLANCKS_PER_DOT;
    const { voters, ownershipTree, balancesTree, ownershipRootHex, balancesRootHex } =
      await setupRealVotingState(registry, treeBuilder, [
        { addressSeed: 300, balance },
      ]);

    const proposalA = BigInt(randomFieldElement());
    const proposalB = BigInt(randomFieldElement());
    const proposalAHex = bigintToBytes32(proposalA);
    const proposalBHex = bigintToBytes32(proposalB);
    await registry.connect(treeBuilder).registerProposal(proposalAHex, TEST_SNAPSHOT_BLOCK);
    await registry.connect(treeBuilder).registerProposal(proposalBHex, TEST_SNAPSHOT_BLOCK);

    // Vote on proposal A
    const proofA = await generateVoteProof({
      voter: voters[0],
      ownershipTree,
      balancesTree,
      ownershipLeafIndex: 0,
      balancesLeafIndex: 0,
      proposalId: proposalA,
      voteChoice: VOTE_AYE,
      tier: 0,
      tierMin: TIER_DEFS[0].minBalance,
      tierMax: TIER_DEFS[0].maxBalance,
    });

    await booth.connect(voter1).vote(
      proofA.pA, proofA.pB, proofA.pC,
      ownershipRootHex, balancesRootHex,
      proposalAHex, VOTE_AYE, 0,
      bigintToBytes32(proofA.pubSignals[5])
    );

    // Vote on proposal B (different proposal → different nullifier)
    const proofB = await generateVoteProof({
      voter: voters[0],
      ownershipTree,
      balancesTree,
      ownershipLeafIndex: 0,
      balancesLeafIndex: 0,
      proposalId: proposalB,
      voteChoice: VOTE_NAY,
      tier: 0,
      tierMin: TIER_DEFS[0].minBalance,
      tierMax: TIER_DEFS[0].maxBalance,
    });

    await booth.connect(voter1).vote(
      proofB.pA, proofB.pB, proofB.pC,
      ownershipRootHex, balancesRootHex,
      proposalBHex, VOTE_NAY, 0,
      bigintToBytes32(proofB.pubSignals[5])
    );

    expect(await booth.totalVotes(proposalAHex)).to.equal(1);
    expect(await booth.totalVotes(proposalBHex)).to.equal(1);

    const [ayeA] = await booth.getResults(proposalAHex);
    expect(ayeA).to.equal(TIER_DEFS[0].weight); // 1

    const [, nayB] = await booth.getResults(proposalBHex);
    expect(nayB).to.equal(TIER_DEFS[0].weight); // 1
  });

  // ---- Proposal registration enforcement ----

  it("Should reject vote for unregistered proposal", async function () {
    const { booth, registry, treeBuilder, voter1 } = await loadFixture(
      deployFullSetup
    );

    const { ownershipRootHex, balancesRootHex } =
      await setupRealVotingState(registry, treeBuilder, [
        { addressSeed: 400, balance: 50n * PLANCKS_PER_DOT },
      ]);

    const unregisteredProposal = randomBytes32();

    await expect(
      booth
        .connect(voter1)
        .vote(
          [0n, 0n],
          [[0n, 0n], [0n, 0n]],
          [0n, 0n],
          ownershipRootHex,
          balancesRootHex,
          unregisteredProposal,
          VOTE_AYE,
          0,
          randomBytes32()
        )
    ).to.be.revertedWith("Proposal not registered");
  });

  it("Should reject balancesRoot that is newer than the proposal", async function () {
    const { booth, registry, treeBuilder, voter1 } = await loadFixture(
      deployFullSetup
    );

    const { ownershipRootHex } =
      await setupRealVotingState(registry, treeBuilder, [
        { addressSeed: 500, balance: 50n * PLANCKS_PER_DOT },
      ]);

    // Submit a second balancesRoot at a later block
    const laterRoot = randomBytes32();
    await registry.connect(treeBuilder).submitBalancesRoot(laterRoot, 2000);

    // Register proposal at block 500 (before snapshot block 1000)
    // The closest snapshot <= 500 doesn't exist, so this should revert
    const proposalId = randomBytes32();
    await registry.connect(treeBuilder).registerProposal(proposalId, 500);

    await expect(
      booth
        .connect(voter1)
        .vote(
          [0n, 0n],
          [[0n, 0n], [0n, 0n]],
          [0n, 0n],
          ownershipRootHex,
          laterRoot,
          proposalId,
          VOTE_AYE,
          0,
          randomBytes32()
        )
    ).to.be.revertedWith("No snapshot before proposal block");
  });
});
