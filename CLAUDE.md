# ZK Private Voting for Polkadot OpenGov

## Project Overview
Privacy-preserving tier-based voting layer for Polkadot OpenGov using ZK-SNARKs (Groth16).
Voters register on-chain, then cast private votes via ZK proofs proving balance-tier membership
without revealing identity.

**Hackathon:** DoraHacks Polkadot Solidity Hackathon (Feb 15 – Mar 24, 2026)
**Target:** Polkadot Hub (pallet-revive EVM)

## Architecture
- **Dual Merkle Tree Pattern** (Tornado Cash–inspired) with Poseidon hashing
- **Ownership Tree:** off-chain Poseidon tree from on-chain registration events
- **Balances Tree:** off-chain Poseidon tree from chain state snapshot (daily 0 UTC)
- **Nullifier:** `Poseidon(secret, proposalId)` — deterministic per (user, proposal)
- **Balance:** `free + reserved` from `system.account`
- **No conviction, no delegation, no liquid staking**

## Tier Configuration
| Tier | Range (DOT)    | Vote Weight |
|------|----------------|-------------|
| 0    | 1 – 100        | 1           |
| 1    | 100 – 1,000    | 3           |
| 2    | 1,000 – 10,000 | 6           |
| 3    | 10,000 – 100k  | 10          |
| 4    | 100,000+       | 15          |

## Components
```
A: ZK Circuits (Circom)        → circuits/
B: Indexing Service (TS)       → indexer/
C: Smart Contracts (Solidity)  → contracts/
D: Client Proof Library (TS)   → client-lib/
E: Relayer (TS)                → relayer/
F: Frontend (React)            → frontend/
```

## Dependency Graph
- A (circuits) → generates verifier.sol for C, WASM+zkey for D
- B (indexer) → independent, serves tree data for D/F
- C (contracts) → can use MockVerifier until A completes; ABIs needed by E/F
- D (client lib) → needs A artifacts + B API format
- E (relayer) → needs C ABIs
- F (frontend) → integrates all

## Key Technical Decisions
- Circuit: single `PrivateVote.circom` with depth-21 Merkle trees (~2M leaves)
- Poseidon hashing: circomlib in circuits, circomlibjs in JS (must match exactly)
- Privacy: indexer serves FULL tree dumps only (no per-address queries)
- Client rebuilds trees locally and computes own Merkle paths in-browser
- sr25519 verification mocked for hackathon (use msg.sender)
- Local dev: Hardhat + @parity/hardhat-polkadot (pallet-revive local node)

## Development Commands
```bash
# Circuits
cd circuits && npm run compile && npm run setup && npm run test

# Contracts
cd contracts && npx hardhat compile && npx hardhat test

# Indexer
cd indexer && npm run build && npm run test && npm run start

# Client lib
cd client-lib && npm run build && npm run test

# Relayer
cd relayer && npm run build && npm run start

# Frontend
cd frontend && npm run dev

# E2E
cd e2e && npx hardhat node & && npm run test
```

## Conventions
- TypeScript for all JS/TS code
- Solidity ^0.8.20 for contracts
- circom 2.x for circuits
- All Poseidon implementations must use circomlibjs for consistency
- ProposalId = keccak256(abi.encodePacked("polkadot-opengov", referendumIndex))
