/**
 * 01 - Registration Flow
 *
 * Tests the full voter registration lifecycle on the VotingRegistry contract:
 *   - Deploying all contracts
 *   - Registering with valid commitments
 *   - Event emission
 *   - Duplicate registration prevention
 *   - Registration count tracking
 *   - Commitment storage verification
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { deployContracts } from "../setup/deploy-contracts";
import { TEST_ACCOUNTS, TIER_CONFIGS } from "../setup/test-accounts";
import { initPoseidon, poseidonHash } from "../helpers/poseidon";

describe("Registration Flow", function () {
  let deployer: any;
  let signers: any[];
  let verifier: any;
  let registry: any;
  let votingBooth: any;
  let poseidon: any;
  let F: any;

  before(async function () {
    signers = await ethers.getSigners();
    deployer = signers[0];
    ({ poseidon, F } = await initPoseidon());
  });

  it("should deploy all contracts successfully", async function () {
    ({ verifier, registry, votingBooth } = await deployContracts(deployer));

    // Verify all contracts have addresses (are deployed)
    const verifierAddr = await verifier.getAddress();
    const registryAddr = await registry.getAddress();
    const boothAddr = await votingBooth.getAddress();

    expect(verifierAddr).to.be.properAddress;
    expect(registryAddr).to.be.properAddress;
    expect(boothAddr).to.be.properAddress;

    // Verify VotingBooth is linked to the correct verifier and registry
    expect(await votingBooth.verifier()).to.equal(verifierAddr);
    expect(await votingBooth.registry()).to.equal(registryAddr);

    // Verify tiers were configured
    const tierCount = await votingBooth.getTierCount();
    expect(tierCount).to.equal(5n);
  });

  it("should allow Alice to register with valid commitment", async function () {
    const alice = TEST_ACCOUNTS[0]; // Alice
    const aliceSigner = signers[alice.signerIndex];

    // Compute commitment = Poseidon(secret)
    const commitment = poseidonHash(poseidon, F, [alice.secret]);
    const commitmentHex =
      "0x" + commitment.toString(16).padStart(64, "0");

    // Register
    const tx = await registry.connect(aliceSigner).register(commitmentHex);
    await tx.wait();

    // Verify registration was successful
    const aliceAddress = await aliceSigner.getAddress();
    const registered = await registry.isRegistered(aliceAddress);
    expect(registered).to.be.true;
  });

  it("should emit Registered event with correct data", async function () {
    const bob = TEST_ACCOUNTS[1]; // Bob
    const bobSigner = signers[bob.signerIndex];
    const bobAddress = await bobSigner.getAddress();

    // Compute commitment
    const commitment = poseidonHash(poseidon, F, [bob.secret]);
    const commitmentHex =
      "0x" + commitment.toString(16).padStart(64, "0");

    // Register and check event
    await expect(registry.connect(bobSigner).register(commitmentHex))
      .to.emit(registry, "Registered")
      .withArgs(1, bobAddress, commitmentHex); // index 1 (Alice was 0)
  });

  it("should mark Alice as registered", async function () {
    const aliceSigner = signers[TEST_ACCOUNTS[0].signerIndex];
    const aliceAddress = await aliceSigner.getAddress();
    expect(await registry.isRegistered(aliceAddress)).to.be.true;
  });

  it("should prevent Alice from registering again", async function () {
    const alice = TEST_ACCOUNTS[0];
    const aliceSigner = signers[alice.signerIndex];

    const commitment = poseidonHash(poseidon, F, [alice.secret]);
    const commitmentHex =
      "0x" + commitment.toString(16).padStart(64, "0");

    await expect(
      registry.connect(aliceSigner).register(commitmentHex)
    ).to.be.revertedWith("Already registered");
  });

  it("should allow all 5 test accounts to register", async function () {
    // Alice (index 0) and Bob (index 1) are already registered.
    // Register Charlie, Diana, and Eve.
    for (let i = 2; i < TEST_ACCOUNTS.length; i++) {
      const account = TEST_ACCOUNTS[i];
      const signer = signers[account.signerIndex];

      const commitment = poseidonHash(poseidon, F, [account.secret]);
      const commitmentHex =
        "0x" + commitment.toString(16).padStart(64, "0");

      const tx = await registry.connect(signer).register(commitmentHex);
      await tx.wait();

      const address = await signer.getAddress();
      expect(await registry.isRegistered(address)).to.be.true;
    }
  });

  it("should track correct registration count", async function () {
    const count = await registry.getRegistrationCount();
    expect(count).to.equal(BigInt(TEST_ACCOUNTS.length));
  });

  it("should store correct commitment for each account", async function () {
    for (let i = 0; i < TEST_ACCOUNTS.length; i++) {
      const account = TEST_ACCOUNTS[i];
      const signer = signers[account.signerIndex];
      const expectedAddress = await signer.getAddress();

      // Compute expected commitment
      const expectedCommitment = poseidonHash(poseidon, F, [account.secret]);
      const expectedCommitmentHex =
        "0x" + expectedCommitment.toString(16).padStart(64, "0");

      // Read from contract
      const [storedAddress, storedCommitment] =
        await registry.getRegistration(i);

      expect(storedAddress).to.equal(expectedAddress);
      expect(storedCommitment).to.equal(expectedCommitmentHex);
    }
  });
});
