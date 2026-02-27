# ZK OpenGov Circuits

Zero-knowledge circuits for private voting on Polkadot OpenGov using Groth16 (BN254).

## Overview

The `PrivateVote` circuit proves that a voter:

1. Owns an address registered in the Ownership Merkle tree (depth 20, ~1M leaves)
2. Has a certain balance in the Balances Merkle tree (depth 20)
3. The balance falls within a specific tier range
4. The nullifier is correctly derived from `Poseidon(secret, proposalId)` to prevent double voting
5. The vote choice is valid (0=nay, 1=aye, 2=abstain)

## Prerequisites

- [circom](https://docs.circom.io/getting-started/installation/) 2.x
- [snarkjs](https://github.com/iden3/snarkjs) (installed via npm)
- Node.js >= 16

## Setup

```bash
npm install
```

## Build

Compile the circuit, run trusted setup, and export the Solidity verifier:

```bash
npm run build
```

Or run each step individually:

```bash
npm run compile          # Compile circuit to R1CS + WASM
npm run setup            # Powers of tau + phase 2 ceremony
npm run export-verifier  # Generate Groth16Verifier.sol
```

## Test

Generate test fixtures and run the test suite:

```bash
npm run generate-fixtures
npm test
```

Tests require the circuit to be compiled first (`npm run compile`).

## Circuit Signals

### Public Inputs (7)

| Signal | Description |
|--------|-------------|
| `ownershipRoot` | Merkle root of the ownership tree |
| `balancesRoot` | Merkle root of the balances tree |
| `proposalId` | Unique proposal identifier |
| `voteChoice` | 0=nay, 1=aye, 2=abstain |
| `tier` | Tier index (0-4), bound via `tierConfig` |
| `nullifier` | `Poseidon(secret, proposalId)` |
| `tierConfig` | Packed: `tierMin * 2^128 + tierMax` |

### Private Inputs

| Signal | Description |
|--------|-------------|
| `secret` | Voter's secret (used for commitment and nullifier) |
| `address` | Voter's address |
| `balance` | Voter's DOT balance |
| `ownershipPathElements[20]` | Merkle proof siblings for ownership tree |
| `ownershipPathIndices[20]` | Merkle proof path bits for ownership tree |
| `balancesPathElements[20]` | Merkle proof siblings for balances tree |
| `balancesPathIndices[20]` | Merkle proof path bits for balances tree |
| `tierMin` | Lower bound of the tier (inclusive) |
| `tierMax` | Upper bound of the tier (exclusive) |

## Tier Configuration

| Tier | Range (DOT) | Vote Weight |
|------|-------------|-------------|
| 0 | 1 - 100 | 1 |
| 1 | 100 - 1,000 | 3 |
| 2 | 1,000 - 10,000 | 6 |
| 3 | 10,000 - 100,000 | 10 |
| 4 | 100,000+ | 15 |

## Output Artifacts

After a full build, the `build/` directory contains:

- `PrivateVote.r1cs` - Rank-1 constraint system
- `PrivateVote_js/PrivateVote.wasm` - WASM witness generator
- `PrivateVote.sym` - Debug symbols
- `circuit_final.zkey` - Proving key (Groth16)
- `verification_key.json` - Verification key
- `Groth16Verifier.sol` - Solidity on-chain verifier

## Witness Generation

```bash
node scripts/generate-witness.js input-example.json build/witness.wtns
```

## Architecture

```
PrivateVote.circom
  |-- lib/MerkleProof.circom   (Poseidon Merkle proof verifier)
  |-- lib/RangeProof.circom    (Balance range check)
  |-- circomlib/poseidon        (Poseidon hash)
  |-- circomlib/comparators     (LessThan)
  |-- circomlib/bitify          (Num2Bits)
```
