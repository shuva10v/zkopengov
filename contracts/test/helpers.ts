import { ethers } from "hardhat";
import { Contract } from "ethers";
import * as path from "path";

// @ts-ignore — circomlibjs does not ship types
import { buildPoseidon } from "circomlibjs";
// @ts-ignore — snarkjs does not ship types
import * as snarkjs from "snarkjs";

// ---------------------------------------------------------------------------
// Tier configuration constants (in plancks, 1 DOT = 10^10 plancks)
// ---------------------------------------------------------------------------

export const PLANCKS_PER_DOT = 10_000_000_000n;

export interface TierDef {
  minBalance: bigint;
  maxBalance: bigint;
  weight: bigint;
}

export const TIER_DEFS: TierDef[] = [
  {
    minBalance: 1n * PLANCKS_PER_DOT,          // 1 DOT   = 10_000_000_000
    maxBalance: 100n * PLANCKS_PER_DOT,         // 100 DOT = 1_000_000_000_000
    weight: 1n,
  },
  {
    minBalance: 100n * PLANCKS_PER_DOT,         // 100 DOT
    maxBalance: 1_000n * PLANCKS_PER_DOT,       // 1 000 DOT
    weight: 3n,
  },
  {
    minBalance: 1_000n * PLANCKS_PER_DOT,       // 1 000 DOT
    maxBalance: 10_000n * PLANCKS_PER_DOT,      // 10 000 DOT
    weight: 6n,
  },
  {
    minBalance: 10_000n * PLANCKS_PER_DOT,      // 10 000 DOT
    maxBalance: 100_000n * PLANCKS_PER_DOT,     // 100 000 DOT
    weight: 10n,
  },
  {
    minBalance: 100_000n * PLANCKS_PER_DOT,     // 100 000 DOT
    maxBalance: (1n << 64n),                     // large sentinel value
    weight: 15n,
  },
];

// ---------------------------------------------------------------------------
// Vote choice constants
// ---------------------------------------------------------------------------

export const VOTE_NAY = 0;
export const VOTE_AYE = 1;
export const VOTE_ABSTAIN = 2;

// ---------------------------------------------------------------------------
// Circuit artifact paths
// ---------------------------------------------------------------------------

const CIRCUIT_BUILD_DIR = path.resolve(__dirname, "../../circuits/build");
const WASM_PATH = path.join(CIRCUIT_BUILD_DIR, "PrivateVote_js", "PrivateVote.wasm");
const ZKEY_PATH = path.join(CIRCUIT_BUILD_DIR, "circuit_final.zkey");

// ---------------------------------------------------------------------------
// Poseidon singleton
// ---------------------------------------------------------------------------

let poseidonInstance: any = null;
let poseidonF: any = null;

export async function getPoseidon() {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
    poseidonF = poseidonInstance.F;
  }
  return { poseidon: poseidonInstance, F: poseidonF };
}

/** Hash inputs using Poseidon and return as bigint */
export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const { poseidon, F } = await getPoseidon();
  return BigInt(F.toString(poseidon(inputs)));
}

// ---------------------------------------------------------------------------
// Poseidon Merkle Tree (matching circuit's MerkleProof template)
// ---------------------------------------------------------------------------

const TREE_DEPTH = 21;

export class TestMerkleTree {
  depth: number;
  leaves: bigint[];
  layers: bigint[][];
  zeroValues: bigint[];

  private constructor(depth: number, leaves: bigint[], zeroValues: bigint[], layers: bigint[][]) {
    this.depth = depth;
    this.leaves = leaves;
    this.zeroValues = zeroValues;
    this.layers = layers;
  }

  static async build(leaves: bigint[], depth: number = TREE_DEPTH): Promise<TestMerkleTree> {
    const { poseidon, F } = await getPoseidon();

    // Compute zero values chain: z[0] = 0, z[i] = Poseidon(z[i-1], z[i-1])
    const zeroValues: bigint[] = new Array(depth + 1);
    zeroValues[0] = 0n;
    for (let i = 1; i <= depth; i++) {
      zeroValues[i] = BigInt(F.toString(poseidon([zeroValues[i - 1], zeroValues[i - 1]])));
    }

    // Build layers bottom-up
    const layers: bigint[][] = new Array(depth + 1);
    layers[0] = [...leaves];

    for (let level = 0; level < depth; level++) {
      const currentLayer = layers[level];
      const nextLayer: bigint[] = [];
      const layerSize = Math.max(currentLayer.length, 1);

      for (let i = 0; i < layerSize; i += 2) {
        const left = i < currentLayer.length ? currentLayer[i] : zeroValues[level];
        const right = i + 1 < currentLayer.length ? currentLayer[i + 1] : zeroValues[level];
        nextLayer.push(BigInt(F.toString(poseidon([left, right]))));
      }

      // If we have no nodes at all at this level, use zero value
      if (nextLayer.length === 0) {
        nextLayer.push(BigInt(F.toString(poseidon([zeroValues[level], zeroValues[level]]))));
      }

      layers[level + 1] = nextLayer;
    }

    return new TestMerkleTree(depth, leaves, zeroValues, layers);
  }

  getRoot(): bigint {
    return this.layers[this.depth][0];
  }

  getProof(leafIndex: number): { pathElements: bigint[]; pathIndices: number[] } {
    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];

    let currentIndex = leafIndex;

    for (let level = 0; level < this.depth; level++) {
      const isRight = currentIndex % 2;
      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

      const layer = this.layers[level];
      const sibling =
        siblingIndex < layer.length ? layer[siblingIndex] : this.zeroValues[level];

      pathElements.push(sibling);
      pathIndices.push(isRight);

      currentIndex = Math.floor(currentIndex / 2);
    }

    return { pathElements, pathIndices };
  }
}

// ---------------------------------------------------------------------------
// Voter state for test
// ---------------------------------------------------------------------------

export interface TestVoter {
  secret: bigint;
  address: bigint;
  balance: bigint;
  commitment: bigint;
}

/** Create a test voter with random secret and deterministic address/balance */
export async function createTestVoter(
  addressSeed: number,
  balance: bigint
): Promise<TestVoter> {
  // Use a deterministic but unique address
  const address = BigInt(addressSeed) + 1000n;
  // Random-ish secret (deterministic for reproducibility)
  const secret = BigInt("0x" + ethers.hexlify(ethers.randomBytes(31)).slice(2));
  const commitment = await poseidonHash([secret]);

  return { secret, address, balance, commitment };
}

// ---------------------------------------------------------------------------
// ZK Proof generation
// ---------------------------------------------------------------------------

export interface VoteProofInputs {
  voter: TestVoter;
  ownershipTree: TestMerkleTree;
  balancesTree: TestMerkleTree;
  ownershipLeafIndex: number;
  balancesLeafIndex: number;
  proposalId: bigint;
  voteChoice: number;
  tier: number;
  tierMin: bigint;
  tierMax: bigint;
}

export interface SolidityProof {
  pA: [bigint, bigint];
  pB: [[bigint, bigint], [bigint, bigint]];
  pC: [bigint, bigint];
  pubSignals: bigint[];
}

/** Generate a real Groth16 proof for a vote */
export async function generateVoteProof(inputs: VoteProofInputs): Promise<SolidityProof> {
  const { voter, ownershipTree, balancesTree, ownershipLeafIndex, balancesLeafIndex } = inputs;

  // Compute nullifier = Poseidon(secret, proposalId)
  const nullifier = await poseidonHash([voter.secret, inputs.proposalId]);

  // Get Merkle proofs
  const ownershipProof = ownershipTree.getProof(ownershipLeafIndex);
  const balancesProof = balancesTree.getProof(balancesLeafIndex);

  // Pack tier config
  const tierConfig = inputs.tierMin * (1n << 128n) + inputs.tierMax;

  // Build circuit inputs (all as strings for snarkjs)
  const circuitInputs: Record<string, string | string[]> = {
    // Public inputs
    ownershipRoot: ownershipTree.getRoot().toString(),
    balancesRoot: balancesTree.getRoot().toString(),
    proposalId: inputs.proposalId.toString(),
    voteChoice: inputs.voteChoice.toString(),
    tier: inputs.tier.toString(),
    nullifier: nullifier.toString(),
    tierConfig: tierConfig.toString(),
    // Private inputs
    secret: voter.secret.toString(),
    address: voter.address.toString(),
    balance: voter.balance.toString(),
    ownershipPathElements: ownershipProof.pathElements.map((e) => e.toString()),
    ownershipPathIndices: ownershipProof.pathIndices.map((i) => i.toString()),
    balancesPathElements: balancesProof.pathElements.map((e) => e.toString()),
    balancesPathIndices: balancesProof.pathIndices.map((i) => i.toString()),
    tierMin: inputs.tierMin.toString(),
    tierMax: inputs.tierMax.toString(),
  };

  // Generate proof using snarkjs
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    WASM_PATH,
    ZKEY_PATH
  );

  // Convert to Solidity format (swap pi_b coordinates for BN254 pairing)
  const pA: [bigint, bigint] = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
  const pB: [[bigint, bigint], [bigint, bigint]] = [
    [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
    [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
  ];
  const pC: [bigint, bigint] = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];
  const pubSignalsBigInt = publicSignals.map((s: string) => BigInt(s));

  return { pA, pB, pC, pubSignals: pubSignalsBigInt };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// BN254 scalar field size
const BN254_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Generate a pseudo-random bytes32 value. */
export function randomBytes32(): string {
  return ethers.hexlify(ethers.randomBytes(32));
}

/**
 * Generate a random field element that is valid for BN254 circuit inputs.
 * Returns as bytes32 hex string.
 * Values must be < r (the BN254 scalar field) to avoid silent modular reduction
 * in the circuit, which would cause a mismatch with the contract's uint256 value.
 */
export function randomFieldElement(): string {
  // Generate random value and reduce mod r
  const raw = BigInt(ethers.hexlify(ethers.randomBytes(32)));
  const reduced = raw % BN254_R;
  return bigintToBytes32(reduced);
}

/** Pack minBalance and maxBalance the same way VotingBooth does. */
export function packTierConfig(minBalance: bigint, maxBalance: bigint): bigint {
  return (minBalance << 128n) | maxBalance;
}

/** Convert a bigint to a bytes32 hex string */
export function bigintToBytes32(value: bigint): string {
  return "0x" + value.toString(16).padStart(64, "0");
}

// ---------------------------------------------------------------------------
// Deployment fixture
// ---------------------------------------------------------------------------

/**
 * Deploy all three contracts and configure the standard 5 tiers.
 * Returns contract instances and useful signers.
 */
export async function deployFullSetup() {
  const [deployer, treeBuilder, voter1, voter2, voter3, other] =
    await ethers.getSigners();

  // Deploy Groth16Verifier (real)
  const VerifierFactory = await ethers.getContractFactory("Groth16Verifier");
  const verifier = await VerifierFactory.deploy();
  await verifier.waitForDeployment();

  // Deploy VotingRegistry
  const RegistryFactory = await ethers.getContractFactory("VotingRegistry");
  const registry = await RegistryFactory.deploy(treeBuilder.address);
  await registry.waitForDeployment();

  // Deploy VotingBooth
  const BoothFactory = await ethers.getContractFactory("VotingBooth");
  const booth = await BoothFactory.deploy(
    await verifier.getAddress(),
    await registry.getAddress()
  );
  await booth.waitForDeployment();

  // Configure all 5 tiers
  for (const tier of TIER_DEFS) {
    await booth.configureTier(tier.minBalance, tier.maxBalance, tier.weight);
  }

  return {
    verifier,
    registry,
    booth,
    deployer,
    treeBuilder,
    voter1,
    voter2,
    voter3,
    other,
  };
}

/**
 * Set up a full voting scenario with real Merkle trees and ZK proofs.
 * Creates test voters, builds ownership and balances trees, submits roots to registry.
 */
/** Default snapshot block used in test fixtures */
export const TEST_SNAPSHOT_BLOCK = 1000;

export async function setupRealVotingState(
  registry: Contract,
  treeBuilder: any,
  voterConfigs: Array<{ addressSeed: number; balance: bigint }>
) {
  const voters: TestVoter[] = [];

  for (const config of voterConfigs) {
    const voter = await createTestVoter(config.addressSeed, config.balance);
    voters.push(voter);
  }

  // Build ownership tree: each leaf = Poseidon(address, commitment)
  const ownershipLeaves: bigint[] = [];
  for (const voter of voters) {
    const leaf = await poseidonHash([voter.address, voter.commitment]);
    ownershipLeaves.push(leaf);
  }
  const ownershipTree = await TestMerkleTree.build(ownershipLeaves);

  // Build balances tree: each leaf = Poseidon(address, balance)
  const balancesLeaves: bigint[] = [];
  for (const voter of voters) {
    const leaf = await poseidonHash([voter.address, voter.balance]);
    balancesLeaves.push(leaf);
  }
  const balancesTree = await TestMerkleTree.build(balancesLeaves);

  // Submit roots to registry (as bytes32)
  const ownershipRootHex = bigintToBytes32(ownershipTree.getRoot());
  const balancesRootHex = bigintToBytes32(balancesTree.getRoot());

  // Register voters with their commitments
  // Note: In real system, voters register themselves. For testing, we use the treeBuilder
  // to directly submit the roots. Registrations are needed for count validation.
  const signers = await ethers.getSigners();
  for (let i = 0; i < voters.length; i++) {
    const commitmentHex = bigintToBytes32(voters[i].commitment);
    await registry.connect(signers[i + 2]).register(commitmentHex); // offset by 2 (deployer, treeBuilder)
  }

  const regCount = await registry.getRegistrationCount();
  await registry
    .connect(treeBuilder)
    .submitOwnershipRoot(ownershipRootHex, regCount);

  await registry
    .connect(treeBuilder)
    .submitBalancesRoot(balancesRootHex, 1000);

  return {
    voters,
    ownershipTree,
    balancesTree,
    ownershipRootHex,
    balancesRootHex,
  };
}
