/**
 * ZK OpenGov Indexer — Entry Point.
 *
 * Off-chain service that:
 *   1. Builds two Poseidon Merkle trees (Ownership + Balances)
 *   2. Serves full tree data via REST API (privacy-preserving)
 *   3. Submits tree roots on-chain
 *
 * Supports two modes:
 *   - Live mode: connects to Polkadot chain and reads real data
 *   - Demo mode: generates mock data for hackathon testing
 */

// @ts-ignore — circomlibjs does not ship types
import { buildPoseidon } from "circomlibjs";
import * as cron from "node-cron";
import { ethers } from "ethers";

import { config } from "./config";
import { PoseidonMerkleTree } from "./trees/PoseidonMerkleTree";
import { buildOwnershipTree, Registration } from "./trees/ownership-tree";
import { buildBalancesTree } from "./trees/balances-tree";
import { generateMockBalances } from "./chain/balance-fetcher";
import { hasCachedBalances, loadCachedBalances, saveCachedBalances } from "./cache";
import { generateMockRegistrations, RegistrationEvent, fetchRegistrations, listenForRegistrations } from "./chain/event-listener";
import { submitOwnershipRoot, submitBalancesRoot } from "./submitter/root-submitter";
import {
  IndexerState,
  OwnershipLeafData,
  BalancesLeafData,
  createDefaultState,
  startServer,
} from "./api/server";

/** Global mutable state shared between the indexer loop and the API */
let state: IndexerState = createDefaultState();

/** References to the current trees so we can update them incrementally */
let ownershipTree: PoseidonMerkleTree | null = null;
let balancesTree: PoseidonMerkleTree | null = null;

/** Track registrations for rebuilding ownership tree data */
let currentRegistrations: RegistrationEvent[] = [];

/** Poseidon instance (initialized once at startup) */
let poseidon: any = null;

/**
 * Build or rebuild the ownership tree from scratch.
 */
async function rebuildOwnershipTree(
  registrations: RegistrationEvent[]
): Promise<void> {
  console.log(
    `[indexer] Building ownership tree with ${registrations.length} registrations...`
  );

  const regs: Registration[] = registrations.map((r) => ({
    address: r.address,
    commitment: r.commitment,
  }));

  ownershipTree = await buildOwnershipTree(regs, poseidon, config.treeDepth);

  // Build leaf data for the API response
  const leaves: OwnershipLeafData[] = registrations.map((r, i) => ({
    index: i,
    address: r.address,
    commitment: r.commitment,
  }));

  state.ownershipRoot = ownershipTree.getRoot().toString();
  state.registrationCount = ownershipTree.getLeafCount();
  state.ownershipTreeData = { leaves };
  state.ownershipTreeUpdatedAt = new Date().toISOString();

  console.log(
    `[indexer] Ownership tree built: root=${state.ownershipRoot.slice(0, 20)}..., leaves=${state.registrationCount}`
  );
}

/**
 * Build or rebuild the balances tree from a snapshot.
 */
async function rebuildBalancesTree(
  balances: Map<string, bigint>,
  snapshotBlock: number
): Promise<void> {
  console.log(
    `[indexer] Building balances tree with ${balances.size} accounts (snapshot block ${snapshotBlock})...`
  );

  balancesTree = await buildBalancesTree(balances, poseidon, config.treeDepth);

  // Build leaf data for the API response
  // Sort addresses deterministically (same order as the tree builder)
  const sortedAddresses = Array.from(balances.keys()).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  const leaves: BalancesLeafData[] = sortedAddresses.map((addr, i) => ({
    index: i,
    address: addr,
    balance: balances.get(addr)!.toString(),
  }));

  state.balancesRoot = balancesTree.getRoot().toString();
  state.snapshotBlock = snapshotBlock;
  state.balancesTreeData = { leaves };
  state.balancesTreeUpdatedAt = new Date().toISOString();

  console.log(
    `[indexer] Balances tree built: root=${state.balancesRoot.slice(0, 20)}..., leaves=${leaves.length}`
  );
}

/**
 * Handle a new registration event by inserting into the existing ownership tree
 * incrementally (no full rebuild needed).
 */
function handleNewRegistration(event: RegistrationEvent): void {
  if (!ownershipTree || !poseidon) {
    console.warn("[indexer] Cannot handle registration — tree not initialized");
    return;
  }

  const F = poseidon.F;
  const addrBigInt = BigInt(event.address);
  const commitBigInt = BigInt(event.commitment);
  const leafHash = poseidon([addrBigInt, commitBigInt]);
  const leaf = BigInt(F.toString(leafHash));

  ownershipTree.insert(leaf);
  currentRegistrations.push(event);

  // Update API state
  const newLeaf: OwnershipLeafData = {
    index: event.index,
    address: event.address,
    commitment: event.commitment,
  };

  if (state.ownershipTreeData) {
    state.ownershipTreeData.leaves.push(newLeaf);
  }

  state.ownershipRoot = ownershipTree.getRoot().toString();
  state.registrationCount = ownershipTree.getLeafCount();
  state.ownershipTreeUpdatedAt = new Date().toISOString();

  console.log(
    `[indexer] Registration added incrementally: index=${event.index}, new root=${state.ownershipRoot.slice(0, 20)}...`
  );
}

/**
 * Submit roots on-chain (only in live mode with configured keys).
 */
async function submitRoots(): Promise<void> {
  if (
    config.demoMode ||
    !config.registryAddress ||
    !config.treeBuilderPrivateKey
  ) {
    console.log("[indexer] Skipping root submission (demo mode or missing config)");
    return;
  }

  try {
    const provider = new ethers.JsonRpcProvider(config.evmRpc);
    const signer = new ethers.Wallet(config.treeBuilderPrivateKey, provider);

    if (ownershipTree) {
      await submitOwnershipRoot(
        signer,
        config.registryAddress,
        ownershipTree.getRoot(),
        ownershipTree.getLeafCount()
      );
    }

    if (balancesTree) {
      await submitBalancesRoot(
        signer,
        config.registryAddress,
        balancesTree.getRoot(),
        state.snapshotBlock
      );
    }
  } catch (err) {
    console.error("[indexer] Failed to submit roots:", err);
  }
}

/**
 * Run the indexer in demo mode with mock data.
 */
async function runDemoMode(): Promise<void> {
  console.log("[indexer] Running in DEMO mode with mock data");

  // Generate mock registrations
  const mockRegistrations = generateMockRegistrations(config.demoAccountCount);
  currentRegistrations = mockRegistrations;
  await rebuildOwnershipTree(mockRegistrations);

  // Generate mock balances
  const mockBalances = generateMockBalances(config.demoAccountCount);
  await rebuildBalancesTree(mockBalances, 0);
}

/**
 * Run the indexer in live mode connected to the chain.
 */
async function runLiveMode(): Promise<void> {
  console.log("[indexer] Running in LIVE mode");

  const provider = new ethers.JsonRpcProvider(config.evmRpc);

  // Fetch existing registrations
  if (config.registryAddress) {
    const registrations = await fetchRegistrations(
      provider,
      config.registryAddress
    );
    currentRegistrations = registrations;
    await rebuildOwnershipTree(registrations);

    // Set up real-time event listener for incremental updates
    listenForRegistrations(
      provider,
      config.registryAddress,
      handleNewRegistration
    );
  } else {
    console.warn("[indexer] No registry address configured, using empty ownership tree");
    await rebuildOwnershipTree([]);
  }

  // Fetch balances from Polkadot chain (or load from cache).
  try {
    const { connectToChain, getFirstBlockOfToday, getLatestFinalizedBlock } =
      await import("./chain/polkadot-rpc");
    const { fetchAllBalances } = await import("./chain/balance-fetcher");

    const api = await connectToChain();

    let hash: string;
    let blockNumber: number;

    if (config.useArchiveNode) {
      console.log("[indexer] Using archive node — snapshotting at first block of today");
      ({ hash, number: blockNumber } = await getFirstBlockOfToday());
    } else {
      console.log("[indexer] Using pruned node — snapshotting at latest finalized block");
      ({ hash, number: blockNumber } = await getLatestFinalizedBlock());
    }

    // Check cache first
    if (hasCachedBalances(blockNumber)) {
      console.log(`[indexer] Found cached balances for block ${blockNumber}`);
      const balances = loadCachedBalances(blockNumber)!;
      await rebuildBalancesTree(balances, blockNumber);
    } else {
      console.log(`[indexer] No cache for block ${blockNumber}, fetching from chain...`);
      const balances = await fetchAllBalances(api, hash);
      saveCachedBalances(blockNumber, hash, balances);
      await rebuildBalancesTree(balances, blockNumber);
    }
  } catch (err) {
    console.warn(
      "[indexer] Could not connect to Polkadot chain, using mock balances:",
      err
    );
    const mockBalances = generateMockBalances();
    await rebuildBalancesTree(mockBalances, 0);
  }

  // Schedule daily balances rebuild at midnight UTC
  cron.schedule("0 0 * * *", async () => {
    console.log("[indexer] Scheduled balances tree rebuild...");
    try {
      const { connectToChain, getFirstBlockOfToday, getLatestFinalizedBlock } =
        await import("./chain/polkadot-rpc");
      const { fetchAllBalances } = await import("./chain/balance-fetcher");

      const api = await connectToChain();

      let hash: string;
      let blockNumber: number;

      if (config.useArchiveNode) {
        ({ hash, number: blockNumber } = await getFirstBlockOfToday());
      } else {
        ({ hash, number: blockNumber } = await getLatestFinalizedBlock());
      }

      if (hasCachedBalances(blockNumber)) {
        console.log(`[indexer] Found cached balances for block ${blockNumber}`);
        const balances = loadCachedBalances(blockNumber)!;
        await rebuildBalancesTree(balances, blockNumber);
      } else {
        const balances = await fetchAllBalances(api, hash);
        saveCachedBalances(blockNumber, hash, balances);
        await rebuildBalancesTree(balances, blockNumber);
      }
      await submitRoots();
    } catch (err) {
      console.error("[indexer] Scheduled rebuild failed:", err);
    }
  });

  // Submit roots after initial build
  await submitRoots();
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  console.log("=== ZK OpenGov Indexer ===");
  console.log(`Tree depth: ${config.treeDepth}`);
  console.log(`Max leaves: ${2 ** config.treeDepth}`);
  console.log(`Demo mode: ${config.demoMode}`);

  // Initialize Poseidon
  console.log("[indexer] Initializing Poseidon hash function...");
  poseidon = await buildPoseidon();
  console.log("[indexer] Poseidon initialized");

  // Build trees
  if (config.demoMode) {
    await runDemoMode();
  } else {
    await runLiveMode();
  }

  // Start REST API
  startServer(() => state);

  console.log("\n[indexer] Indexer is running. Press Ctrl+C to stop.");
}

// Run
main().catch((err) => {
  console.error("[indexer] Fatal error:", err);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[indexer] Shutting down...");
  try {
    const { disconnectFromChain } = await import("./chain/polkadot-rpc");
    await disconnectFromChain();
  } catch {
    // Ignore — may not be connected
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[indexer] Received SIGTERM, shutting down...");
  process.exit(0);
});
