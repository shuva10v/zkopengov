import { ethers } from "hardhat";

/**
 * Tier configuration (in plancks, 1 DOT = 10^10 plancks):
 *
 *   Tier 0:  1 - 100 DOT       weight  1
 *   Tier 1:  100 - 1,000 DOT   weight  3
 *   Tier 2:  1,000 - 10,000    weight  6
 *   Tier 3:  10,000 - 100,000  weight 10
 *   Tier 4:  100,000+          weight 15
 */
const PLANCKS_PER_DOT = 10_000_000_000n;

const TIERS = [
  { min: 1n * PLANCKS_PER_DOT, max: 100n * PLANCKS_PER_DOT, weight: 1n },
  { min: 100n * PLANCKS_PER_DOT, max: 1_000n * PLANCKS_PER_DOT, weight: 3n },
  {
    min: 1_000n * PLANCKS_PER_DOT,
    max: 10_000n * PLANCKS_PER_DOT,
    weight: 6n,
  },
  {
    min: 10_000n * PLANCKS_PER_DOT,
    max: 100_000n * PLANCKS_PER_DOT,
    weight: 10n,
  },
  {
    min: 100_000n * PLANCKS_PER_DOT,
    max: 1n << 64n, // large sentinel
    weight: 15n,
  },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // 1. Deploy Groth16Verifier
  const VerifierFactory = await ethers.getContractFactory("Groth16Verifier");
  const verifier = await VerifierFactory.deploy();
  await verifier.waitForDeployment();
  const verifierAddr = await verifier.getAddress();
  console.log("Groth16Verifier deployed to:", verifierAddr);

  // 2. Deploy VotingRegistry
  //    Using deployer as the initial tree builder; change later via setTreeBuilder().
  const RegistryFactory = await ethers.getContractFactory("VotingRegistry");
  const registry = await RegistryFactory.deploy(deployer.address);
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("VotingRegistry deployed to:", registryAddr);

  // 3. Deploy VotingBooth
  const BoothFactory = await ethers.getContractFactory("VotingBooth");
  const booth = await BoothFactory.deploy(verifierAddr, registryAddr);
  await booth.waitForDeployment();
  const boothAddr = await booth.getAddress();
  console.log("VotingBooth deployed to:", boothAddr);

  // 4. Configure tiers
  console.log("\nConfiguring tiers...");
  for (let i = 0; i < TIERS.length; i++) {
    const tier = TIERS[i];
    const tx = await booth.configureTier(tier.min, tier.max, tier.weight);
    await tx.wait();
    console.log(
      `  Tier ${i}: min=${tier.min} max=${tier.max} weight=${tier.weight}`
    );
  }

  console.log("\nDeployment complete!");
  console.log("---");
  console.log("Verifier :", verifierAddr);
  console.log("Registry :", registryAddr);
  console.log("Booth    :", boothAddr);
  console.log("Tiers    :", TIERS.length);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
