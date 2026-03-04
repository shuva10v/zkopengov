# ZK OpenGov Relayer

A relay service for the ZK Private Voting system on Polkadot OpenGov. This service accepts vote proofs from users and submits them to the VotingBooth contract on-chain, paying gas on behalf of voters. This preserves voter privacy by decoupling the voter's address from the vote transaction.

## Architecture

The relayer acts as a simple HTTP intermediary between the voter's browser and the on-chain VotingBooth contract:

1. **Voter** generates a ZK proof locally in their browser
2. **Voter** sends the proof to the relayer via `POST /api/v1/relay`
3. **Relayer** validates the proof format and performs on-chain pre-checks
4. **Relayer** submits the vote transaction using its own wallet (paying gas)
5. **Voter** receives the transaction hash as confirmation

Because the relayer's wallet submits the transaction, the voter's address never appears on-chain in connection with the vote.

## Setup

```bash
npm install
```

## Configuration

Set the following environment variables (or use defaults for local development):

| Variable | Default | Description |
|---|---|---|
| `EVM_RPC` | `http://localhost:8545` | EVM RPC endpoint |
| `VOTING_BOOTH_ADDRESS` | (empty) | VotingBooth contract address |
| `REGISTRY_ADDRESS` | (empty) | VotingRegistry contract address |
| `RELAYER_PRIVATE_KEY` | Hardhat account #0 | Private key for the relayer wallet |
| `PORT` | `3002` | HTTP server port |

## Running

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## API

### POST /api/v1/relay

Submit a vote proof for on-chain relay.

**Request Body:**
```json
{
    "proof": {
        "pA": ["0x...", "0x..."],
        "pB": [["0x...", "0x..."], ["0x...", "0x..."]],
        "pC": ["0x...", "0x..."]
    },
    "ownershipRoot": "0x...",
    "balancesRoot": "0x...",
    "proposalId": "0x...",
    "voteChoice": 1,
    "tier": 2,
    "nullifier": "0x..."
}
```

**Response:**
```json
{
    "success": true,
    "txHash": "0x..."
}
```

### GET /api/v1/health

Health check endpoint.

**Response:**
```json
{
    "status": "ok",
    "address": "0x...",
    "balance": "1.0",
    "pendingTxs": 0
}
```

## Testing

```bash
npm test
```

## Security Considerations

- The relayer never learns *who* is voting because the proof is zero-knowledge.
- The relayer cannot forge votes because it does not have the voter's private data.
- The relayer can only submit valid proofs; the on-chain verifier rejects invalid ones.
- Nullifiers prevent double-voting even if the relayer attempts to replay a proof.
- The relayer logs nullifier hashes and transaction statuses but never any PII.
