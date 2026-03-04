/**
 * 02 - Tree Building
 *
 * Tests that Merkle trees can be correctly built from registered accounts
 * and that their roots can be submitted to the VotingRegistry.
 *
 * Verifies:
 *   - Ownership tree construction from address+commitment pairs
 *   - Balances tree construction from address+balance pairs
 *   - Valid Merkle proof generation for each leaf
 *   - Root submission to the registry
 *   - Root recognition by the registry
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { deployContracts } from "../setup/deploy-contracts";
import { seedRegistrations } from "../setup/seed-registrations";
import { buildTestTrees } from "../setup/build-trees";
import { TEST_ACCOUNTS } from "../setup/test-accounts";
import { initPoseidon, poseidonHash } from "../helpers/poseidon";
import { PoseidonMerkleTree } from "../helpers/tree-builder";
import { bigintToBytes32 } from "../helpers/chain";

describe("Tree Building", function () {
  let deployer: any;
  let signers: any[];
  let registry: any;
  let votingBooth: any;
  let poseidon: any;
  let F: any;
  let ownershipTree: PoseidonMerkleTree;
  let balancesTree: PoseidonMerkleTree;

  before(async function () {
    signers = await ethers.getSigners();
    deployer = signers[0];
    ({ poseidon, F } = await initPoseidon());

    // Deploy contracts
    ({ registry, votingBooth } = await deployContracts(deployer));

    // Register all test accounts
    await seedRegistrations(registry, TEST_ACCOUNTS, signers, poseidon, F);
  });

  it("should build ownership tree from registered accounts", async function () {
    ({ ownershipTree, balancesTree } = await buildTestTrees(
      TEST_ACCOUNTS,
      signers,
      poseidon,
      F
    ));

    // The ownership tree should have exactly 5 leaves
    expect(ownershipTree.getLeafCount()).to.equal(TEST_ACCOUNTS.length);

    // Root should be a non-zero value
    const root = ownershipTree.getRoot();
    expect(root).to.not.equal(0n);
  });

  it("should build balances tree from account balances", async function () {
    // The balances tree should have exactly 5 leaves
    expect(balancesTree.getLeafCount()).to.equal(TEST_ACCOUNTS.length);

    // Root should be a non-zero value
    const root = balancesTree.getRoot();
    expect(root).to.not.equal(0n);
  });

  it("should generate valid Merkle proofs for each account", async function () {
    for (let i = 0; i < TEST_ACCOUNTS.length; i++) {
      const account = TEST_ACCOUNTS[i];
      const signer = signers[account.signerIndex];
      const address = await signer.getAddress();
      const addressBigInt = BigInt(address);

      // Recompute the ownership leaf
      const commitment = poseidonHash(poseidon, F, [account.secret]);
      const ownershipLeaf = poseidonHash(poseidon, F, [
        addressBigInt,
        commitment,
      ]);

      // Get and verify ownership proof
      const ownershipProof = ownershipTree.getProof(i);
      expect(ownershipProof.pathElements.length).to.equal(20); // depth 20
      expect(ownershipProof.pathIndices.length).to.equal(20);
      expect(ownershipTree.verifyProof(ownershipLeaf, ownershipProof)).to.be
        .true;

      // Recompute the balances leaf
      const balancesLeaf = poseidonHash(poseidon, F, [
        addressBigInt,
        account.balance,
      ]);

      // Get and verify balances proof
      const balancesProof = balancesTree.getProof(i);
      expect(balancesProof.pathElements.length).to.equal(20);
      expect(balancesProof.pathIndices.length).to.equal(20);
      expect(balancesTree.verifyProof(balancesLeaf, balancesProof)).to.be.true;
    }
  });

  it("should submit ownership root to registry", async function () {
    const root = bigintToBytes32(ownershipTree.getRoot());

    const tx = await registry.submitOwnershipRoot(
      root,
      TEST_ACCOUNTS.length
    );
    await tx.wait();

    // Verify the latest root matches
    const latestRoot = await registry.latestOwnershipRoot();
    expect(latestRoot).to.equal(root);
  });

  it("should submit balances root to registry", async function () {
    const root = bigintToBytes32(balancesTree.getRoot());

    const tx = await registry.submitBalancesRoot(root, 1); // snapshot block 1
    await tx.wait();

    // Verify the latest root matches
    const latestRoot = await registry.latestBalancesRoot();
    expect(latestRoot).to.equal(root);
  });

  it("should recognize submitted roots as known", async function () {
    const ownershipRoot = bigintToBytes32(ownershipTree.getRoot());
    const balancesRoot = bigintToBytes32(balancesTree.getRoot());

    expect(await registry.isKnownOwnershipRoot(ownershipRoot)).to.be.true;
    expect(await registry.isKnownBalancesRoot(balancesRoot)).to.be.true;

    // Random root should NOT be known
    const fakeRoot =
      "0x" + "ab".repeat(32);
    expect(await registry.isKnownOwnershipRoot(fakeRoot)).to.be.false;
    expect(await registry.isKnownBalancesRoot(fakeRoot)).to.be.false;
  });

  it("ownership and balances trees should have same leaf count", async function () {
    expect(ownershipTree.getLeafCount()).to.equal(
      balancesTree.getLeafCount()
    );
  });
});
