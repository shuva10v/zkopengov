# zkOpenGov — Private Voting for Polkadot OpenGov

Privacy-preserving tier-based voting layer for Polkadot OpenGov using ZK-SNARKs.

## Overview

zkOpenGov enables anonymous voting on OpenGov referenda. Voters register on-chain (identity verified), then cast private votes via Groth16 ZK proofs that prove balance-tier membership without revealing identity or exact balance.

### How It Works

1. **Register:** Connect your Polkadot wallet, generate a secret, and register your commitment on-chain
2. **Vote:** Select a proposal, choose Aye/Nay/Abstain — a ZK proof is generated in your browser proving you belong to a balance tier without revealing your address
3. **Privacy:** Your vote is submitted through a relayer, so your identity is never linked to your vote on-chain

### Tier-Based Weighting

Instead of 1-token-1-vote (which favors whales), votes are weighted by balance tier:

| Tier | Balance Range (DOT) | Vote Weight |
|------|---------------------|-------------|
| 0    | 1 – 100             | 1           |
| 1    | 100 – 1,000         | 3           |
| 2    | 1,000 – 10,000      | 6           |
| 3    | 10,000 – 100,000    | 10          |
| 4    | 100,000+            | 15          |

A 100k DOT holder gets 15x weight (not 1000x) over a 100 DOT holder.

## Architecture

```
┌─────────────────┐
│  ZK Circuits     │  Circom (Groth16)
│  (Poseidon hash) │
└────────┬────────┘
         │ verifier.sol, WASM, zkey
         ▼
┌────────┐  ┌──────────┐  ┌────────────┐
│Indexer │→ │ Contracts │←─│Client Lib  │
│(trees) │  │(Solidity) │  │(proof gen) │
└────────┘  └─────┬─────┘  └────────────┘
                  │                │
            ┌─────┴─────┐         │
            │  Relayer   │         │
            └─────┬──────┘         │
                  └────────┬───────┘
                     ┌─────┴─────┐
                     │ Frontend  │
                     │ (React)   │
                     └───────────┘
```

## Components

| Component | Directory | Description |
|-----------|-----------|-------------|
| ZK Circuits | `circuits/` | Circom circuit proving tier membership + vote binding |
| Smart Contracts | `contracts/` | VotingRegistry, VotingBooth, Groth16Verifier |
| Indexing Service | `indexer/` | Builds Poseidon Merkle trees, serves via REST API |
| Client Proof Library | `client-lib/` | Browser-compatible proof generation library |
| Relayer | `relayer/` | Submits votes on behalf of users (gas abstraction) |
| Frontend | `frontend/` | React UI for registration, voting, results |

## Quick Start

### Prerequisites

- Node.js >= 18
- circom 2.x (`npm install -g circom`)
- snarkjs (`npm install -g snarkjs`)

### Setup

```bash
# Install all dependencies
npm install

# Build circuits (critical path)
cd circuits && npm run build

# Compile contracts
cd contracts && npx hardhat compile

# Start indexer (demo mode)
cd indexer && npm run dev

# Start frontend
cd frontend && npm run dev
```

### Testing

```bash
# Circuit tests
cd circuits && npm test

# Contract tests
cd contracts && npx hardhat test

# Indexer tests
cd indexer && npm test

# E2E tests (requires local node)
cd e2e && npm test
```

## Deployed Contracts (Polkadot Hub Testnet)

| Contract | Address |
|----------|---------|
| Groth16Verifier | `0xbC2b672Fd34fE4Dce6030E3F4e7D5c954956143C` |
| VotingRegistry | `0xc7975897681dAcD692cC163f1961452248c5cf74` |
| VotingBooth | `0x29bdC61A2E2D48F412f53Ffe6102A5bd12CF66AF` |

- **Network:** Polkadot Hub Testnet (chain ID 420420417)
- **RPC:** `https://services.polkadothub-rpc.com/testnet`
- **Compiler:** resolc 1.0.0 (PolkaVM)

## Privacy Model

- **Registration** is public (on-chain) — links your address to a commitment
- **Voting** is private:
  - ZK proof reveals only: tier, vote choice, nullifier (no address)
  - Nullifier = `Poseidon(secret, proposalId)` — deterministic but unlinkable across proposals
  - Full tree data is downloaded by all clients (no per-address queries to indexer)
  - Proof generation happens entirely in the browser
  - Vote submitted through relayer (no address link)

## Hackathon

Built for DoraHacks Polkadot Solidity Hackathon (Feb 15 – Mar 24, 2026).
Target: Polkadot Hub (pallet-revive EVM).

## License

MIT
