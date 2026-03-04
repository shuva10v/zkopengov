/**
 * Deploy all contracts to the local Hardhat node for E2E testing.
 *
 * Deploys:
 *   1. Groth16Verifier (MockVerifier -- always returns true)
 *   2. VotingRegistry (with deployer as initial tree builder)
 *   3. VotingBooth (linked to verifier and registry)
 *
 * Then configures 5 voting tiers on the VotingBooth.
 */

import { ethers } from "hardhat";
import { TIER_CONFIGS } from "./test-accounts";

export async function deployContracts(deployer: any): Promise<{
  verifier: any;
  registry: any;
  votingBooth: any;
}> {
  // 1. Deploy MockVerifier (Groth16Verifier that always returns true)
  const VerifierFactory = await ethers.getContractFactory(
    "Groth16Verifier",
    deployer
  );
  const verifier = await VerifierFactory.deploy();
  await verifier.waitForDeployment();

  // 2. Deploy VotingRegistry with deployer as the tree builder
  const deployerAddress = await deployer.getAddress();
  const RegistryFactory = await ethers.getContractFactory(
    "VotingRegistry",
    deployer
  );
  const registry = await RegistryFactory.deploy(deployerAddress);
  await registry.waitForDeployment();

  // 3. Deploy VotingBooth linked to verifier and registry
  const verifierAddress = await verifier.getAddress();
  const registryAddress = await registry.getAddress();
  const VotingBoothFactory = await ethers.getContractFactory(
    "VotingBooth",
    deployer
  );
  const votingBooth = await VotingBoothFactory.deploy(
    verifierAddress,
    registryAddress
  );
  await votingBooth.waitForDeployment();

  // 4. Configure all 5 tiers
  for (const tier of TIER_CONFIGS) {
    const tx = await votingBooth.configureTier(tier.min, tier.max, tier.weight);
    await tx.wait();
  }

  return { verifier, registry, votingBooth };
}
