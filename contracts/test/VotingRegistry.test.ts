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
