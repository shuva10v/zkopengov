# ZK OpenGov Indexer

Off-chain indexing service for the ZK Private Voting system on Polkadot OpenGov.

## Overview

The indexer builds and maintains two Poseidon Merkle trees:

1. **Ownership Tree** — built from `Registered` events emitted by the VotingRegistry contract. Each leaf is `Poseidon(address, commitment)`.
2. **Balances Tree** — built from a chain state snapshot. Each leaf is `Poseidon(address, balance)`.

It serves full tree data via a REST API and submits tree roots on-chain.

### Privacy Model

The indexer **never** serves per-address queries. Clients download the full tree and find their own leaf locally. This prevents the indexer from learning which address is preparing to vote.

## Quick Start

```bash
# Install dependencies
npm install

# Run in demo mode (mock data, no chain connection needed)
DEMO_MODE=true npm run dev

# Run tests
npm test

# Build for production
npm run build
npm start
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `POLKADOT_RPC` | `wss://rpc.polkadot.io` | Polkadot WebSocket RPC |
| `EVM_RPC` | `http://localhost:8545` | EVM JSON-RPC endpoint |
| `REGISTRY_ADDRESS` | (empty) | VotingRegistry contract address |
| `TREE_BUILDER_KEY` | (empty) | Private key for root submissions |
| `TREE_DEPTH` | `20` | Merkle tree depth (max 2^20 leaves) |
| `PORT` | `3001` | REST API port |
| `DEMO_MODE` | auto | Force demo mode with mock data |
| `DEMO_ACCOUNT_COUNT` | `15` | Number of mock accounts in demo |

## API Endpoints

```
GET /api/v1/status           — Indexer status and tree roots
GET /api/v1/ownership-tree   — Full ownership tree dump
GET /api/v1/balances-tree    — Full balances tree dump
GET /api/v1/tiers            — Balance tier configuration
```

## Architecture

```
src/
  index.ts              — Entry point and scheduler
  config.ts             — Configuration
  trees/
    PoseidonMerkleTree.ts  — Incremental Poseidon Merkle tree (circomlibjs)
    ownership-tree.ts      — Build from registration events
    balances-tree.ts       — Build from chain state
  chain/
    polkadot-rpc.ts        — Polkadot.js API wrapper
    balance-fetcher.ts     — Account balance enumeration
    event-listener.ts      — VotingRegistry event listener
  submitter/
    root-submitter.ts      — Submit roots on-chain
  api/
    server.ts              — Express server setup
    routes.ts              — REST API routes
```

## Balance Tiers

| Tier | Range (DOT) | Weight |
|------|-------------|--------|
| 0 | 1 – 100 | 1 |
| 1 | 100 – 1,000 | 3 |
| 2 | 1,000 – 10,000 | 6 |
| 3 | 10,000 – 100,000 | 10 |
| 4 | 100,000+ | 15 |
