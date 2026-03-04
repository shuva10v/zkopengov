# ZK OpenGov Contracts

Smart contracts for ZK Private Voting on Polkadot OpenGov.

## Contracts

| Contract | Description |
|---|---|
| `Groth16Verifier.sol` | Mock verifier (always returns true). Will be replaced with the real snarkjs-generated verifier after circuit compilation. |
| `VotingRegistry.sol` | Voter registration (commitment submission), Merkle tree root management, and block-to-root reverse lookup for finding the correct balances snapshot for a proposal. |
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

## Deployed Contracts (Polkadot Hub Testnet)

| Contract | Address |
|----------|---------|
| Groth16Verifier | `0x1E8139d14c7dE8703dEfB9eAb6aDAdC7B572b8a9` |
| VotingRegistry | `0xC5a08D782CA60Bc69BddE400332bA595543bDc5E` |
| VotingBooth | `0xec99cd6cb7B9469B7CA9c918EB6481EDb08aed71` |

- **Network:** Polkadot Hub Testnet (chain ID 420420417)
- **RPC:** `https://eth-rpc-testnet.polkadot.io/`

## Architecture

1. Voters call `VotingRegistry.register(commitment)` with their Poseidon hash commitment.
2. An off-chain tree builder computes Merkle trees and submits roots via `submitOwnershipRoot()` and `submitBalancesRoot()`.
3. Each `submitBalancesRoot()` also records a reverse mapping (`blockToBalancesRoot`) so clients can look up which snapshot root applies to a given proposal block via `findBalancesRootForProposal()`.
4. Voters generate a ZK proof off-chain and call `VotingBooth.vote()` which verifies the Groth16 proof and records the weighted vote.
5. Anyone can read results via `getResults()` or `getTierResults()`.
