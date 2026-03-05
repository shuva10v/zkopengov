/**
 * Ad-hoc script: download balances tree JSONs from S3, rebuild Merkle trees,
 * and submit the roots to the on-chain VotingRegistry.
 *
 * Usage:
 *   npx ts-node script/backfill-roots.ts
 *
 * Requires env vars: REGISTRY_ADDRESS, TREE_BUILDER_KEY, EVM_RPC,
 *   S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
 */

import { ethers } from "ethers";
// @ts-ignore — circomlibjs does not ship types
import { buildPoseidon } from "circomlibjs";
import { buildBalancesTree } from "../src/trees/balances-tree";
import { submitBalancesRoot } from "../src/submitter/root-submitter";
import { config } from "../src/config";

const BLOCKS_TO_BACKFILL = [12865645, 12891136, 12938506];

async function main() {
  if (!config.registryAddress || !config.treeBuilderPrivateKey) {
    throw new Error("REGISTRY_ADDRESS and TREE_BUILDER_KEY must be set");
  }

  const provider = new ethers.JsonRpcProvider(config.evmRpc);
  const signer = new ethers.Wallet(config.treeBuilderPrivateKey, provider);

  console.log("Initializing Poseidon...");
  const poseidon = await buildPoseidon();

  for (const block of BLOCKS_TO_BACKFILL) {
    const url = `https://${config.s3Bucket}.s3.${config.s3Region}.amazonaws.com/balances-trees/${block}.json`;
    console.log(`\nFetching ${url}...`);

    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`Failed to fetch block ${block}: HTTP ${resp.status}`);
      continue;
    }

    const data = await resp.json() as { leaves: Array<{ address: string; balance: string }> };
    if (!data.leaves || data.leaves.length === 0) {
      console.error(`No leaves in block ${block} JSON`);
      continue;
    }

    console.log(`Building balances tree for block ${block} (${data.leaves.length} leaves)...`);
    const balances = new Map<string, bigint>();
    for (const leaf of data.leaves) {
      balances.set(leaf.address, BigInt(leaf.balance));
    }

    const tree = await buildBalancesTree(balances, poseidon, config.treeDepth);
    const root = tree.getRoot();
    console.log(`Root: ${root}`);

    const receipt = await submitBalancesRoot(signer, config.registryAddress, root, block);
    if (receipt) {
      console.log(`Submitted root for block ${block} in tx block ${receipt.blockNumber}`);
    } else {
      console.log(`Block ${block} already submitted, skipped`);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
