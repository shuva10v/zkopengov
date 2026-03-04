# ZK OpenGov Client Library

Browser-compatible TypeScript library for generating ZK proofs for private voting on Polkadot OpenGov.

## Overview

All proof generation happens client-side (in the browser). The library:

1. Downloads full tree data from the Indexer API (privacy-preserving: same data for all users)
2. Finds the user's leaf locally
3. Rebuilds Poseidon Merkle trees
4. Computes Merkle paths
5. Calls the snarkjs WASM prover to generate a Groth16 proof

## Installation

```bash
npm install
```

## Build

```bash
npm run build
```

## Test

```bash
# Run all tests
npm test

# Run unit tests only (excludes prover integration tests)
npm run test:unit
```

## Usage

### Registration

```typescript
import { generateRegistrationData } from 'zk-opengov-client-lib';

// Generate a secret and commitment for registration
const { secret, commitment } = await generateRegistrationData();

// Store `secret` securely (e.g., browser localStorage, encrypted)
// Submit `commitment` to the registration contract
```

### Voting

```typescript
import { generateVoteProof } from 'zk-opengov-client-lib';

const proof = await generateVoteProof({
    secret: storedSecret,          // bigint from registration
    address: '1234...abcd',        // hex address (no 0x prefix)
    proposalId: '0x00...01',       // bytes32 hex
    voteChoice: 1,                 // 0=nay, 1=aye, 2=abstain
    indexerUrl: 'https://indexer.example.com',
});

// Submit proof.proof and proof.publicInputs to the voting contract
```

### Tier Lookup

```typescript
import { determineTier, TIERS } from 'zk-opengov-client-lib';

// 1 DOT = 10^10 plancks
const tier = determineTier(50_000_000_000_000n); // 5000 DOT -> Tier 2
console.log(tier.weight); // 6
```

## Architecture

```
src/
  index.ts            - Public API exports
  prover.ts           - snarkjs wrapper, main proof generation
  tree-client.ts      - Fetch tree data from indexer API
  merkle-tree.ts      - Rebuild Poseidon Merkle tree locally
  input-formatter.ts  - Format circuit inputs from tree proofs
  commitment.ts       - Generate secret, compute commitment
  nullifier.ts        - Compute nullifier for proposal
  poseidon.ts         - Poseidon wrapper (circomlibjs)
  tiers.ts            - Tier determination from balance
  types.ts            - Shared types
```

## Privacy Model

The library downloads the **entire** ownership and balances trees from the indexer. It never makes per-address queries. This ensures the indexer cannot learn which address is generating a proof.

## Circuit Artifacts

The prover expects two files served from the frontend:

- `/PrivateVote.wasm` - Circuit WASM
- `/circuit_final.zkey` - Proving key

Custom paths can be passed to `generateVoteProof()`.

## Tier System

| Tier | DOT Range       | Weight |
|------|-----------------|--------|
| 0    | 1 - 100         | 1      |
| 1    | 100 - 1,000     | 3      |
| 2    | 1,000 - 10,000  | 6      |
| 3    | 10,000 - 100,000| 10     |
| 4    | 100,000+        | 15     |
