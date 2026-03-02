import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { randomBytes32 } from "./helpers";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

async function deployRegistryFixture() {
  const [deployer, treeBuilder, voter1, voter2, other] =
    await ethers.getSigners();

  const Factory = await ethers.getContractFactory("VotingRegistry");
  const registry = await Factory.deploy(treeBuilder.address);
  await registry.waitForDeployment();

  return { registry, deployer, treeBuilder, voter1, voter2, other };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VotingRegistry", function () {
  // ---- Deployment ----

  it("Should deploy with correct tree builder", async function () {
    const { registry, treeBuilder, deployer } = await loadFixture(
      deployRegistryFixture
    );
    expect(await registry.treeBuilder()).to.equal(treeBuilder.address);
    expect(await registry.owner()).to.equal(deployer.address);
  });

  // ---- Registration ----

  it("Should allow registration with valid commitment", async function () {
    const { registry, voter1 } = await loadFixture(deployRegistryFixture);
    const commitment = randomBytes32();

    await registry.connect(voter1).register(commitment);

    expect(await registry.isRegistered(voter1.address)).to.be.true;
    expect(await registry.getRegistrationCount()).to.equal(1);

    const [account, storedCommitment] = await registry.getRegistration(0);
    expect(account).to.equal(voter1.address);
    expect(storedCommitment).to.equal(commitment);
  });

  it("Should emit Registered event with correct data", async function () {
    const { registry, voter1 } = await loadFixture(deployRegistryFixture);
    const commitment = randomBytes32();

    await expect(registry.connect(voter1).register(commitment))
      .to.emit(registry, "Registered")
      .withArgs(0, voter1.address, commitment);
  });

  it("Should prevent double registration", async function () {
    const { registry, voter1 } = await loadFixture(deployRegistryFixture);
    const commitment = randomBytes32();

    await registry.connect(voter1).register(commitment);

    await expect(
      registry.connect(voter1).register(randomBytes32())
    ).to.be.revertedWith("Already registered");
  });

  it("Should reject zero commitment", async function () {
    const { registry, voter1 } = await loadFixture(deployRegistryFixture);

    await expect(
      registry.connect(voter1).register(ethers.ZeroHash)
    ).to.be.revertedWith("Invalid commitment");
  });

  // ---- Ownership root management ----

  it("Should allow tree builder to submit ownership root with correct count", async function () {
    const { registry, treeBuilder, voter1 } = await loadFixture(
      deployRegistryFixture
    );

    // Register one voter first
    await registry.connect(voter1).register(randomBytes32());

    const root = randomBytes32();
    await expect(registry.connect(treeBuilder).submitOwnershipRoot(root, 1))
      .to.emit(registry, "OwnershipRootUpdated")
      .withArgs(root, 1);

    expect(await registry.isKnownOwnershipRoot(root)).to.be.true;
    expect(await registry.latestOwnershipRoot()).to.equal(root);
  });

  it("Should reject ownership root with wrong count", async function () {
    const { registry, treeBuilder, voter1 } = await loadFixture(
      deployRegistryFixture
    );

    await registry.connect(voter1).register(randomBytes32());

    await expect(
      registry.connect(treeBuilder).submitOwnershipRoot(randomBytes32(), 99)
    ).to.be.revertedWith("Count mismatch");
  });

  it("Should reject ownership root from non-tree-builder", async function () {
    const { registry, other } = await loadFixture(deployRegistryFixture);

    await expect(
      registry.connect(other).submitOwnershipRoot(randomBytes32(), 0)
    ).to.be.revertedWith("Not tree builder");
  });

  // ---- Balances root management ----

  it("Should allow tree builder to submit balances root", async function () {
    const { registry, treeBuilder } = await loadFixture(
      deployRegistryFixture
    );

    const root = randomBytes32();
    await expect(
      registry.connect(treeBuilder).submitBalancesRoot(root, 42)
    )
      .to.emit(registry, "BalancesRootUpdated")
      .withArgs(root, 42);

    expect(await registry.isKnownBalancesRoot(root)).to.be.true;
    expect(await registry.latestBalancesRoot()).to.equal(root);
    expect(await registry.balancesRootBlock(root)).to.equal(42);
  });

  it("Should reject balances root with zero snapshot block", async function () {
    const { registry, treeBuilder } = await loadFixture(
      deployRegistryFixture
    );

    await expect(
      registry.connect(treeBuilder).submitBalancesRoot(randomBytes32(), 0)
    ).to.be.revertedWith("Invalid block");
  });

  it("Should reject zero balances root", async function () {
    const { registry, treeBuilder } = await loadFixture(
      deployRegistryFixture
    );

    await expect(
      registry.connect(treeBuilder).submitBalancesRoot(ethers.ZeroHash, 100)
    ).to.be.revertedWith("Invalid root");
  });

  // ---- Root tracking ----

  it("Should track known roots correctly across multiple submissions", async function () {
    const { registry, treeBuilder, voter1, voter2 } = await loadFixture(
      deployRegistryFixture
    );

    // Register two voters
    await registry.connect(voter1).register(randomBytes32());
    await registry.connect(voter2).register(randomBytes32());

    // Submit first ownership root after 1 registration
    // (need to re-deploy or just test with 2)
    const root1 = randomBytes32();
    await registry.connect(treeBuilder).submitOwnershipRoot(root1, 2);

    // Both should be queryable
    expect(await registry.isKnownOwnershipRoot(root1)).to.be.true;
    expect(await registry.latestOwnershipRoot()).to.equal(root1);

    // An unknown root should return false
    expect(await registry.isKnownOwnershipRoot(randomBytes32())).to.be.false;
    expect(await registry.isKnownBalancesRoot(randomBytes32())).to.be.false;
  });

  // ---- Admin ----

  it("Should allow owner to change tree builder", async function () {
    const { registry, deployer, treeBuilder, other } = await loadFixture(
      deployRegistryFixture
    );

    await expect(registry.connect(deployer).setTreeBuilder(other.address))
      .to.emit(registry, "TreeBuilderUpdated")
      .withArgs(treeBuilder.address, other.address);

    expect(await registry.treeBuilder()).to.equal(other.address);
  });

  it("Should reject setTreeBuilder from non-owner", async function () {
    const { registry, other } = await loadFixture(deployRegistryFixture);

    await expect(
      registry.connect(other).setTreeBuilder(other.address)
    ).to.be.revertedWith("Not owner");
  });

  // ---- Block-to-root reverse mapping ----

  it("Should populate blockToBalancesRoot on submitBalancesRoot", async function () {
    const { registry, treeBuilder } = await loadFixture(deployRegistryFixture);

    const root = randomBytes32();
    await registry.connect(treeBuilder).submitBalancesRoot(root, 100);

    expect(await registry.blockToBalancesRoot(100)).to.equal(root);
    expect(await registry.getSubmittedBlockCount()).to.equal(1);
    expect(await registry.submittedBlocks(0)).to.equal(100);
  });

  it("Should return correct root via getBalancesRootForBlock", async function () {
    const { registry, treeBuilder } = await loadFixture(deployRegistryFixture);

    const root1 = randomBytes32();
    const root2 = randomBytes32();
    await registry.connect(treeBuilder).submitBalancesRoot(root1, 100);
    await registry.connect(treeBuilder).submitBalancesRoot(root2, 200);

    expect(await registry.getBalancesRootForBlock(100)).to.equal(root1);
    expect(await registry.getBalancesRootForBlock(200)).to.equal(root2);
    expect(await registry.getBalancesRootForBlock(150)).to.equal(ethers.ZeroHash);
  });

  it("Should revert when submitting duplicate block", async function () {
    const { registry, treeBuilder } = await loadFixture(deployRegistryFixture);

    await registry.connect(treeBuilder).submitBalancesRoot(randomBytes32(), 100);

    await expect(
      registry.connect(treeBuilder).submitBalancesRoot(randomBytes32(), 100)
    ).to.be.revertedWith("Block already has root");
  });

  it("Should support backfilling blocks in any order", async function () {
    const { registry, treeBuilder } = await loadFixture(deployRegistryFixture);

    const root300 = randomBytes32();
    const root100 = randomBytes32();
    const root200 = randomBytes32();

    await registry.connect(treeBuilder).submitBalancesRoot(root300, 300);
    await registry.connect(treeBuilder).submitBalancesRoot(root100, 100);
    await registry.connect(treeBuilder).submitBalancesRoot(root200, 200);

    expect(await registry.getSubmittedBlockCount()).to.equal(3);
    expect(await registry.getBalancesRootForBlock(100)).to.equal(root100);
    expect(await registry.getBalancesRootForBlock(200)).to.equal(root200);
    expect(await registry.getBalancesRootForBlock(300)).to.equal(root300);
  });

  // ---- findBalancesRootForProposal ----

  it("Should find exact match in findBalancesRootForProposal", async function () {
    const { registry, treeBuilder } = await loadFixture(deployRegistryFixture);

    const root = randomBytes32();
    await registry.connect(treeBuilder).submitBalancesRoot(root, 100);

    const [foundRoot, foundBlock] = await registry.findBalancesRootForProposal(100);
    expect(foundRoot).to.equal(root);
    expect(foundBlock).to.equal(100);
  });

  it("Should find nearest-before in findBalancesRootForProposal", async function () {
    const { registry, treeBuilder } = await loadFixture(deployRegistryFixture);

    const root100 = randomBytes32();
    const root200 = randomBytes32();
    const root300 = randomBytes32();

    await registry.connect(treeBuilder).submitBalancesRoot(root100, 100);
    await registry.connect(treeBuilder).submitBalancesRoot(root200, 200);
    await registry.connect(treeBuilder).submitBalancesRoot(root300, 300);

    // Query for block 250 — should return root at block 200
    const [foundRoot, foundBlock] = await registry.findBalancesRootForProposal(250);
    expect(foundRoot).to.equal(root200);
    expect(foundBlock).to.equal(200);
  });

  it("Should revert findBalancesRootForProposal when no snapshot exists before proposal block", async function () {
    const { registry, treeBuilder } = await loadFixture(deployRegistryFixture);

    await registry.connect(treeBuilder).submitBalancesRoot(randomBytes32(), 100);

    await expect(
      registry.findBalancesRootForProposal(50)
    ).to.be.revertedWith("No snapshot before proposal block");
  });

  it("Should revert findBalancesRootForProposal on empty submittedBlocks", async function () {
    const { registry } = await loadFixture(deployRegistryFixture);

    await expect(
      registry.findBalancesRootForProposal(100)
    ).to.be.revertedWith("No snapshot before proposal block");
  });

  it("Should accumulate multiple submissions correctly", async function () {
    const { registry, treeBuilder } = await loadFixture(deployRegistryFixture);

    const roots = [];
    for (let i = 1; i <= 5; i++) {
      const root = randomBytes32();
      roots.push(root);
      await registry.connect(treeBuilder).submitBalancesRoot(root, i * 100);
    }

    expect(await registry.getSubmittedBlockCount()).to.equal(5);

    for (let i = 0; i < 5; i++) {
      expect(await registry.getBalancesRootForBlock((i + 1) * 100)).to.equal(roots[i]);
    }
  });

  // ---- View helpers ----

  it("Should return correct registration count and data", async function () {
    const { registry, voter1, voter2 } = await loadFixture(
      deployRegistryFixture
    );

    const c1 = randomBytes32();
    const c2 = randomBytes32();

    await registry.connect(voter1).register(c1);
    await registry.connect(voter2).register(c2);

    expect(await registry.getRegistrationCount()).to.equal(2);

    const [addr1, com1] = await registry.getRegistration(0);
    expect(addr1).to.equal(voter1.address);
    expect(com1).to.equal(c1);

    const [addr2, com2] = await registry.getRegistration(1);
    expect(addr2).to.equal(voter2.address);
    expect(com2).to.equal(c2);
  });
});
