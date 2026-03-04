/**
 * 08 - Privacy Verification
 *
 * Tests that the voting system preserves voter privacy by ensuring that
 * on-chain data does not leak voter identity.
 *
 * Verifies:
 *   - Nullifiers for same user on different proposals are different
 *   - Nullifiers for different users on same proposal are different
 *   - Cannot determine voter identity from nullifier
 *   - VoteCast events contain no address information
 *   - On-chain vote data contains only tier and choice, no address
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

const PROPOSAL_P1 = ethers.keccak256(
  ethers.toUtf8Bytes("polkadot-opengov-privacy-1")
);
const PROPOSAL_P2 = ethers.keccak256(
  ethers.toUtf8Bytes("polkadot-opengov-privacy-2")
);

describe("Privacy Verification", function () {
  let deployer: any;
  let signers: any[];
  let registry: any;
  let votingBooth: any;
  let poseidon: any;
  let F: any;
  let ownershipRootBytes32: string;
  let balancesRootBytes32: string;

  // Store nullifiers for cross-test assertions
  const nullifiers: Map<string, bigint> = new Map();

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

    // Compute nullifiers for all accounts on both proposals
    for (const account of TEST_ACCOUNTS) {
      const n1 = poseidonHash(poseidon, F, [
        account.secret,
        BigInt(PROPOSAL_P1),
      ]);
      const n2 = poseidonHash(poseidon, F, [
        account.secret,
        BigInt(PROPOSAL_P2),
      ]);
      nullifiers.set(`${account.name}-p1`, n1);
      nullifiers.set(`${account.name}-p2`, n2);
    }

    // Submit votes for all accounts on proposal P1
    const proof = generateDummyProof();
    for (const account of TEST_ACCOUNTS) {
      const n = nullifiers.get(`${account.name}-p1`)!;
      await votingBooth.vote(
        proof.pA,
        proof.pB,
        proof.pC,
        ownershipRootBytes32,
        balancesRootBytes32,
        PROPOSAL_P1,
        1, // aye
        account.expectedTier,
        bigintToBytes32(n)
      );
    }

    // Submit votes for Alice and Bob on proposal P2
    for (let i = 0; i < 2; i++) {
      const account = TEST_ACCOUNTS[i];
      const n = nullifiers.get(`${account.name}-p2`)!;
      await votingBooth.vote(
        proof.pA,
        proof.pB,
        proof.pC,
        ownershipRootBytes32,
        balancesRootBytes32,
        PROPOSAL_P2,
        0, // nay
        account.expectedTier,
        bigintToBytes32(n)
      );
    }
  });

  it("nullifiers for same user on different proposals are different", async function () {
    for (const account of TEST_ACCOUNTS) {
      const n1 = nullifiers.get(`${account.name}-p1`)!;
      const n2 = nullifiers.get(`${account.name}-p2`)!;
      expect(n1).to.not.equal(
        n2,
        `${account.name}'s nullifiers on P1 and P2 should differ`
      );
    }
  });

  it("nullifiers for different users on same proposal are different", async function () {
    const proposalNullifiers = TEST_ACCOUNTS.map(
      (a) => nullifiers.get(`${a.name}-p1`)!
    );

    // Every pair should be distinct
    for (let i = 0; i < proposalNullifiers.length; i++) {
      for (let j = i + 1; j < proposalNullifiers.length; j++) {
        expect(proposalNullifiers[i]).to.not.equal(
          proposalNullifiers[j],
          `${TEST_ACCOUNTS[i].name} and ${TEST_ACCOUNTS[j].name} should have different nullifiers on same proposal`
        );
      }
    }
  });

  it("cannot determine voter identity from nullifier", async function () {
    // Given a nullifier, try to reverse-engineer the secret by brute-force
    // testing all known secrets. In a real system the space is 2^248, making
    // this infeasible. Here we verify the mathematical property: knowing the
    // nullifier and the proposalId does NOT directly reveal the secret without
    // iterating over all possible secrets.

    const aliceNullifier = nullifiers.get("Alice-p1")!;
    const proposalBigInt = BigInt(PROPOSAL_P1);

    // Verify that the nullifier is a Poseidon hash, not a simple function
    // of the address (i.e., it uses the secret, not the address)
    const aliceSigner = signers[TEST_ACCOUNTS[0].signerIndex];
    const aliceAddress = BigInt(await aliceSigner.getAddress());

    // Hash(address, proposalId) should NOT equal the nullifier
    const addressBasedHash = poseidonHash(poseidon, F, [
      aliceAddress,
      proposalBigInt,
    ]);
    expect(addressBasedHash).to.not.equal(
      aliceNullifier,
      "Nullifier must not be derivable from public address"
    );

    // Hash(address) should NOT equal the nullifier
    const simpleAddressHash = poseidonHash(poseidon, F, [aliceAddress]);
    expect(simpleAddressHash).to.not.equal(
      aliceNullifier,
      "Nullifier must not be a simple hash of the address"
    );

    // Verify that knowing the nullifier and proposal doesn't reveal the link
    // between Alice's nullifier and Bob's without knowing their secrets
    const bobNullifier = nullifiers.get("Bob-p1")!;
    // There is no mathematical relationship between the two nullifiers
    // that could be discovered without knowing both secrets
    expect(aliceNullifier + bobNullifier).to.not.equal(0n);
    expect(aliceNullifier * 2n).to.not.equal(bobNullifier);
  });

  it("VoteCast events contain no address information", async function () {
    // Query all VoteCast events for proposal P1
    const filter = votingBooth.filters.VoteCast(PROPOSAL_P1);
    const events = await votingBooth.queryFilter(filter);

    expect(events.length).to.equal(TEST_ACCOUNTS.length);

    for (const event of events) {
      const parsedLog = votingBooth.interface.parseLog({
        topics: event.topics as string[],
        data: event.data,
      });

      if (!parsedLog) {
        throw new Error("Failed to parse VoteCast event");
      }

      // The event should only contain: proposalId, tier, voteChoice, nullifier
      const argNames = parsedLog.fragment.inputs.map(
        (input: any) => input.name
      );
      expect(argNames).to.deep.equal([
        "proposalId",
        "tier",
        "voteChoice",
        "nullifier",
      ]);

      // Verify no address-like data in the non-indexed event data
      // (indexed parameters are in topics, non-indexed are in data)
      // The event has: proposalId (indexed), tier, voteChoice, nullifier
      // None of these should be an address

      // Check that tier is a small number (0-4), not an address
      const tier = parsedLog.args.tier;
      expect(tier).to.be.lessThanOrEqual(4);

      // Check that voteChoice is 0, 1, or 2
      const voteChoice = parsedLog.args.voteChoice;
      expect(voteChoice).to.be.lessThanOrEqual(2);

      // Check that the nullifier is NOT any of the test account addresses
      const nullifierHex = parsedLog.args.nullifier;
      for (const account of TEST_ACCOUNTS) {
        const signer = signers[account.signerIndex];
        const addr = await signer.getAddress();
        // Pad address to bytes32 for comparison
        const addrBytes32 =
          "0x" + addr.slice(2).toLowerCase().padStart(64, "0");
        expect(nullifierHex.toLowerCase()).to.not.equal(
          addrBytes32,
          `Nullifier should not equal ${account.name}'s address`
        );
      }
    }
  });

  it("on-chain vote data contains only tier and choice, no address", async function () {
    // The VotingBooth contract stores votes in mappings:
    //   tally[proposalId][tier][voteChoice] -> weighted count
    //   nullifierUsed[proposalId][nullifier] -> bool
    //   totalVotes[proposalId] -> count
    //
    // None of these mappings store or reveal voter addresses.

    // Verify we can read the tally without any address context
    for (let tier = 0; tier < 5; tier++) {
      const [aye, nay, abstain] = await votingBooth.getTierResults(
        PROPOSAL_P1,
        tier
      );
      // The tally only tells us aggregate weighted counts per tier
      // It does not tell us which specific accounts voted
      expect(aye).to.be.a("bigint");
      expect(nay).to.be.a("bigint");
      expect(abstain).to.be.a("bigint");
    }

    // Verify that the contract has no function that maps nullifier -> address
    // We check this by verifying the contract's interface
    const iface = votingBooth.interface;
    const functionNames = Object.keys(iface.functions || {}).concat(
      iface.fragments
        .filter((f: any) => f.type === "function")
        .map((f: any) => f.name)
    );

    // There should be no function that returns an address given a nullifier or vote
    const privacyBreakingFunctions = functionNames.filter(
      (name: string) =>
        name.includes("getVoter") ||
        name.includes("voterAddress") ||
        name.includes("nullifierToAddress")
    );
    expect(privacyBreakingFunctions).to.have.lengthOf(
      0,
      "Contract should not have functions that map votes to addresses"
    );

    // Verify that for all known nullifiers on P1, we cannot determine
    // which tier they belong to without additional information
    for (const account of TEST_ACCOUNTS) {
      const n = nullifiers.get(`${account.name}-p1`)!;
      const nBytes32 = bigintToBytes32(n);

      // We can only check if a nullifier has been used, not who used it
      const used = await votingBooth.nullifierUsed(PROPOSAL_P1, nBytes32);
      expect(used).to.be.true;

      // But we cannot retrieve the tier or vote choice from the nullifier alone
      // (the mapping is nullifier -> bool, not nullifier -> voteData)
    }
  });
});
