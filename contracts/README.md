# ZK OpenGov Contracts

Smart contracts for ZK Private Voting on Polkadot OpenGov.

## Contracts

| Contract | Description |
|---|---|
| `Groth16Verifier.sol` | Mock verifier (always returns true). Will be replaced with the real snarkjs-generated verifier after circuit compilation. |
| `VotingRegistry.sol` | Voter registration (commitment submission) and Merkle tree root management for ownership and balances trees. |
| `VotingBooth.sol` | Vote submission with ZK proof verification and weighted tallying across tiers. |

## Setup

```bash
npm install
```

## Compile

```bash
npm run compile
```

## Test

```bash
npm test
```

## Deploy

Local (requires a running Hardhat node via `npx hardhat node`):

```bash
npm run deploy:local
```

Polkadot Hub Testnet (uncomment network config in `hardhat.config.ts` first):

```bash
npm run deploy:testnet
```

## Tier Configuration

| Tier | DOT Range | Weight |
|------|-----------|--------|
| 0 | 1 - 100 | 1 |
| 1 | 100 - 1,000 | 3 |
| 2 | 1,000 - 10,000 | 6 |
| 3 | 10,000 - 100,000 | 10 |
| 4 | 100,000+ | 15 |

## Architecture

1. Voters call `VotingRegistry.register(commitment)` with their Poseidon hash commitment.
2. An off-chain tree builder computes Merkle trees and submits roots via `submitOwnershipRoot()` and `submitBalancesRoot()`.
3. Voters generate a ZK proof off-chain and call `VotingBooth.vote()` which verifies the Groth16 proof and records the weighted vote.
4. Anyone can read results via `getResults()` or `getTierResults()`.
