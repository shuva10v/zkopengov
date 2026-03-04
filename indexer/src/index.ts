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
import { hasCachedBalances, loadCachedBalances, saveCachedBalances, listCachedBlocks } from "./cache";
import { generateMockRegistrations, RegistrationEvent, fetchRegistrations, listenForRegistrations } from "./chain/event-listener";
import { submitOwnershipRoot, submitBalancesRoot, registerProposal } from "./submitter/root-submitter";
import { uploadBalancesTree as uploadBalancesTreeToS3, uploadOwnershipTree as uploadOwnershipTreeToS3 } from "./submitter/s3-uploader";
import {
  IndexerState,
  OwnershipLeafData,
  BalancesLeafData,
  createDefaultState,
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

  // Upload to S3
  if (config.s3Bucket && state.ownershipTreeData) {
    await uploadOwnershipTreeToS3(state.ownershipTreeData);
  }
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
  state.balancesTreeData = { root: state.balancesRoot, snapshotBlock, leaves };
  state.balancesTreeUpdatedAt = new Date().toISOString();

  console.log(
    `[indexer] Balances tree built: root=${state.balancesRoot.slice(0, 20)}..., leaves=${leaves.length}`
  );
}

/**
 * Handle a new registration event by inserting into the existing ownership tree
 * incrementally (no full rebuild needed), then submit the updated root on-chain.
 */
async function handleNewRegistration(event: RegistrationEvent): Promise<void> {
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
    index: state.ownershipTreeData ? state.ownershipTreeData.leaves.length : 0,
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

  // Upload updated tree to S3
  if (config.s3Bucket && state.ownershipTreeData) {
    await uploadOwnershipTreeToS3(state.ownershipTreeData);
  }

  // Submit updated ownership root on-chain
  await submitOwnershipRootOnChain();
}

/**
 * Submit the current ownership root on-chain.
 */
async function submitOwnershipRootOnChain(): Promise<void> {
  if (
    config.demoMode ||
    !config.registryAddress ||
    !config.treeBuilderPrivateKey ||
    !ownershipTree
  ) {
    console.log("[indexer] Skipping ownership root submission (demo mode or missing config)");
    return;
  }

  try {
    const provider = new ethers.JsonRpcProvider(config.evmRpc);
    const signer = new ethers.Wallet(config.treeBuilderPrivateKey, provider);

    await submitOwnershipRoot(
      signer,
      config.registryAddress,
      ownershipTree.getRoot(),
      currentRegistrations.length
    );
  } catch (err) {
    console.error("[indexer] Failed to submit ownership root:", err);
  }
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
    // Submit ownership root
    await submitOwnershipRootOnChain();

    // Submit balances root
    if (balancesTree) {
      const provider = new ethers.JsonRpcProvider(config.evmRpc);
      const signer = new ethers.Wallet(config.treeBuilderPrivateKey, provider);

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
 * Post-rebuild actions: submit roots on-chain and upload tree data to S3.
 */
async function postBalancesTreeActions(
  blockNumber: number,
  treeData: object
): Promise<void> {
  await submitRoots();

  if (config.s3Bucket) {
    await uploadBalancesTreeToS3(blockNumber, treeData);
  }
}

/**
 * Sync proposals from Subscan and register them on-chain.
 * Fetches the latest 50 referenda, computes proposalId for each,
 * and registers any that are not yet on-chain.
 */
async function syncProposals(): Promise<void> {
  if (
    config.demoMode ||
    !config.registryAddress ||
    !config.treeBuilderPrivateKey
  ) {
    console.log("[indexer] Skipping proposal sync (demo mode or missing config)");
    return;
  }

  console.log("[indexer] Syncing proposals from Subscan...");

  try {
    // Use Asset Hub Subscan — block numbers match our balances snapshots
    const maxRetries = 5;
    let resp: Response | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      resp = await fetch("https://assethub-polkadot.api.subscan.io/api/scan/referenda/referendums", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row: 50, page: 0, order: "desc" }),
      });

      if (resp.status !== 429) break;

      const delay = attempt * 2000;
      console.warn(`[indexer] Subscan returned 429, retrying in ${delay / 1000}s (attempt ${attempt}/${maxRetries})...`);
      await new Promise((r) => setTimeout(r, delay));
    }

    if (!resp || !resp.ok) {
      console.warn(`[indexer] Subscan API returned ${resp?.status ?? 'no response'}, skipping proposal sync`);
      return;
    }

    const data = (await resp.json()) as { data?: { list?: Array<{ referendum_index: number; created_block: number }> } };
    const referenda = data?.data?.list;
    if (!Array.isArray(referenda) || referenda.length === 0) {
      console.log("[indexer] No referenda found from Subscan");
      return;
    }

    const provider = new ethers.JsonRpcProvider(config.evmRpc);
    const signer = new ethers.Wallet(config.treeBuilderPrivateKey, provider);

    let registered = 0;
    for (const ref of referenda) {
      const referendumIndex = ref.referendum_index;
      const createdAtBlock = ref.created_block;

      if (typeof referendumIndex !== "number" || typeof createdAtBlock !== "number" || createdAtBlock === 0) {
        continue;
      }

      // Skip proposals before our earliest available balances snapshot
      if (config.minProposalBlock > 0 && createdAtBlock < config.minProposalBlock) {
        continue;
      }

      // proposalId = keccak256(...) % BN254_FIELD_PRIME
      // Reduced modulo the BN254 scalar field so on-chain bytes32 matches the circuit signal.
      const rawHash = ethers.solidityPackedKeccak256(
        ["string", "uint256"],
        ["polkadot-opengov", referendumIndex]
      );
      const BN254_FIELD_PRIME = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
      const proposalId = "0x" + (BigInt(rawHash) % BN254_FIELD_PRIME).toString(16).padStart(64, "0");

      try {
        const receipt = await registerProposal(signer, config.registryAddress, proposalId, createdAtBlock);
        if (receipt) registered++;
      } catch (err) {
        console.warn(`[indexer] Failed to register proposal #${referendumIndex}:`, (err as Error).message);
      }
    }

    console.log(`[indexer] Proposal sync complete: ${registered} newly registered out of ${referenda.length}`);
  } catch (err) {
    console.error("[indexer] Proposal sync failed:", err);
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

    // Poll for new registrations (pallet-revive doesn't support eth_newFilter)
    const lastIndex = registrations.length > 0
      ? registrations[registrations.length - 1].index
      : -1;
    listenForRegistrations(
      provider,
      config.registryAddress,
      handleNewRegistration,
      lastIndex
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

    // Check cache: exact block match, or fall back to most recent cached snapshot
    if (hasCachedBalances(blockNumber)) {
      console.log(`[indexer] Found cached balances for block ${blockNumber}`);
      const balances = loadCachedBalances(blockNumber)!;
      await rebuildBalancesTree(balances, blockNumber);
    } else {
      const cachedBlocks = listCachedBlocks();
      if (cachedBlocks.length > 0) {
        const latest = cachedBlocks[0]; // sorted descending
        const blocksStale = blockNumber - latest;
        console.log(
          `[indexer] No cache for block ${blockNumber}, using most recent cache (block ${latest}, ${blocksStale} blocks behind)`
        );
        const staleBalances = loadCachedBalances(latest)!;
        await rebuildBalancesTree(staleBalances, latest);

        // Only background-refresh if cache is more than ~6 hours old (~3600 blocks at 6s)
        if (blocksStale > 3600) {
          console.log(`[indexer] Cache is stale (${blocksStale} blocks), refreshing in background...`);
          fetchAllBalances(config.polkadotRpc, hash).then(async (balances) => {
            saveCachedBalances(blockNumber, hash, balances);
            await rebuildBalancesTree(balances, blockNumber);
            await postBalancesTreeActions(blockNumber, state.balancesTreeData!);
            console.log(`[indexer] Swapped to fresh balances from block ${blockNumber}`);
          }).catch((err) => {
            console.error("[indexer] Background balance fetch failed:", err);
          });
        } else {
          console.log(`[indexer] Cache is recent enough, skipping background refresh (next refresh at midnight UTC)`);
        }
      } else {
        console.log(`[indexer] No cache found, fetching from chain...`);
        const balances = await fetchAllBalances(config.polkadotRpc, hash);
        saveCachedBalances(blockNumber, hash, balances);
        await rebuildBalancesTree(balances, blockNumber);
      }
    }
  } catch (err) {
    console.error("[indexer] Failed to fetch balances from chain:", err);
    throw err; // crash so Docker restarts the container
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
        const balances = await fetchAllBalances(config.polkadotRpc, hash);
        saveCachedBalances(blockNumber, hash, balances);
        await rebuildBalancesTree(balances, blockNumber);
      }
      await postBalancesTreeActions(blockNumber, state.balancesTreeData!);
    } catch (err) {
      console.error("[indexer] Scheduled rebuild failed:", err);
    }
  });

  // Submit roots and upload tree data after initial build
  await postBalancesTreeActions(state.snapshotBlock, state.balancesTreeData!);

  // Sync proposals from Subscan after initial tree build
  await syncProposals();

  // Schedule proposal sync every 30 minutes
  cron.schedule("*/30 * * * *", async () => {
    console.log("[indexer] Scheduled proposal sync...");
    await syncProposals();
  });
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
