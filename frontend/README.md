# zkOpenGov Frontend

React + Vite + TypeScript web UI for the ZK Private Voting system for Polkadot OpenGov.

## Features

- **Registration** -- Connect wallet, generate secret, register commitment on-chain
- **Voting** -- Select proposal, choose Aye/Nay/Abstain, generate ZK proof in-browser, submit via relayer
- **Results** -- View per-proposal voting results with tier breakdowns

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Environment Variables

Create a `.env` file (optional -- defaults work for local development):

```env
VITE_INDEXER_URL=http://localhost:3001
VITE_RELAYER_URL=http://localhost:3002
VITE_EVM_RPC=http://localhost:8545
VITE_REGISTRY_ADDRESS=0x...
VITE_VOTING_BOOTH_ADDRESS=0x...
```

## Demo Mode

When contract addresses are not configured, the app runs in demo mode:
- Registration simulates a transaction
- Voting generates a mock ZK proof with a simulated delay
- Results display realistic-looking demo data
- All core UI flows are functional without any backend services

## Architecture

```
src/
  lib/          -- Config, contracts, proposals, secret storage
  hooks/        -- React hooks for wallet, registration, voting, results
  components/   -- Reusable UI components
  pages/        -- Route pages (Home, Register, Vote, Results)
```

## Tech Stack

- React 18 + TypeScript
- Vite 5
- ethers.js v6
- React Router v6
- Vanilla CSS (dark theme)
