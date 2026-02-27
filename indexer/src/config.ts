/**
 * Configuration for the ZK OpenGov Indexer.
 *
 * All values can be overridden via environment variables.
 * BigInt tier boundaries are expressed in plancks (1 DOT = 10^10 plancks).
 */

export interface Tier {
  id: number;
  min: bigint;
  max: bigint;
  weight: number;
}

export interface Config {
  /** Polkadot native RPC (WebSocket) */
  polkadotRpc: string;
  /** EVM-compatible RPC for reading contract events */
  evmRpc: string;
  /** VotingRegistry contract address (EVM) */
  registryAddress: string;
  /** Private key of the tree-builder account that submits roots */
  treeBuilderPrivateKey: string;
  /** Depth of both Merkle trees (max 2^depth leaves) */
  treeDepth: number;
  /** HTTP port for the REST API */
  port: number;
  /** Whether to run in demo mode with mock data (no chain connection) */
  demoMode: boolean;
  /** Number of mock accounts to generate in demo mode */
  demoAccountCount: number;
  /** Use an archive node — enables querying at the first block of today.
   *  When false, uses the latest finalized block instead (works on pruned nodes). */
  useArchiveNode: boolean;
  /** Balance tier configuration */
  tiers: Tier[];
}

export const config: Config = {
  polkadotRpc: process.env.POLKADOT_RPC || "wss://polkadot-rpc.dwellir.com",
  evmRpc: process.env.EVM_RPC || "http://localhost:8545",
  registryAddress: process.env.REGISTRY_ADDRESS || "",
  treeBuilderPrivateKey: process.env.TREE_BUILDER_KEY || "",
  treeDepth: parseInt(process.env.TREE_DEPTH || "20", 10),
  port: parseInt(process.env.PORT || "3001", 10),
  demoMode: process.env.DEMO_MODE === "true" || (!process.env.POLKADOT_RPC && !process.env.REGISTRY_ADDRESS),
  demoAccountCount: parseInt(process.env.DEMO_ACCOUNT_COUNT || "15", 10),
  useArchiveNode: process.env.USE_ARCHIVE_NODE !== "false",
  tiers: [
    {
      id: 0,
      min: 10_000_000_000n,                 // 1 DOT
      max: 1_000_000_000_000n,              // 100 DOT
      weight: 1,
    },
    {
      id: 1,
      min: 1_000_000_000_000n,              // 100 DOT
      max: 10_000_000_000_000n,             // 1,000 DOT
      weight: 3,
    },
    {
      id: 2,
      min: 10_000_000_000_000n,             // 1,000 DOT
      max: 100_000_000_000_000n,            // 10,000 DOT
      weight: 6,
    },
    {
      id: 3,
      min: 100_000_000_000_000n,            // 10,000 DOT
      max: 1_000_000_000_000_000n,          // 100,000 DOT
      weight: 10,
    },
    {
      id: 4,
      min: 1_000_000_000_000_000n,          // 100,000 DOT
      max: BigInt("0xffffffffffffffffffffffffffffffff"),
      weight: 15,
    },
  ],
};
