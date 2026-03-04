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

## Mainnet Phase 2 Ceremony

For production deployment, run a multi-contributor Phase 2 ceremony instead of the single-contribution dev setup.

### 1. Compile the circuit and download Powers of Tau

```bash
npm run compile
mkdir -p build
curl -L -o build/pot16_final.ptau https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_16.ptau
```

This is the Hermez community ptau (54 contributors, pot16 supports up to 2^16 constraints).

### 2. Generate initial zkey

```bash
npx snarkjs groth16 setup build/PrivateVote.r1cs build/pot16_final.ptau build/circuit_0000.zkey
```

### 3. Multiple contributions

Each contribution adds independent entropy. Even if all but one contributor is compromised, the setup remains secure.

```bash
# Contribution 1 — interactive (type random keyboard input when prompted)
npx snarkjs zkey contribute build/circuit_0000.zkey build/circuit_0001.zkey \
  --name="contributor-1" -v

# Contribution 2 — OS entropy
npx snarkjs zkey contribute build/circuit_0001.zkey build/circuit_0002.zkey \
  --name="contributor-2" -v -e="$(head -c 256 /dev/urandom | base64)"

# Contribution 3 — another person / different machine
npx snarkjs zkey contribute build/circuit_0002.zkey build/circuit_0003.zkey \
  --name="contributor-3" -v
```

Add as many contributors as needed. Each one strengthens the ceremony.

### 4. Apply random beacon

Use a future block hash as a beacon — this proves no contributor could have predicted the final entropy. Announce the block number before it's mined, then use that hash:

```bash
npx snarkjs zkey beacon build/circuit_0003.zkey build/circuit_final.zkey \
  <block-hash-hex> 10 --name="final-beacon"
```

### 5. Verify the final zkey

```bash
npx snarkjs zkey verify build/PrivateVote.r1cs build/pot16_final.ptau build/circuit_final.zkey
```

### 6. Export verification key and Solidity verifier

```bash
npx snarkjs zkey export verificationkey build/circuit_final.zkey build/verification_key.json
npx snarkjs zkey export solidityverifier build/circuit_final.zkey build/Groth16Verifier.sol
```

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
