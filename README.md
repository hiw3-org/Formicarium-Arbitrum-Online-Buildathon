![Formicarium Logo](assets/banner.png)

# Formicarium

Formicarium is a decentralized platform where an AI agent coordinates a fleet of autonomous machines and robots to manufacture customized products. Users interact with an AI agent via a chat interface to define their product specifications, which are then fulfilled by registered 3D printing service providers through an on-chain reverse auction marketplace with reputation-weighted bidding.

🌐 Live App: [https://formicarium.vercel.app](https://formicarium.vercel.app/dashboard/chat)

---

## Deployed Contracts — Arbitrum One

| Contract | Address |
|---|---|
| `Formicarium` | [0xe89174fF9b99675eE0bE93b9d57722CF5c4F054d](https://arbiscan.io/address/0xe89174fF9b99675eE0bE93b9d57722CF5c4F054d) |
| `ReverseAuction` | [0xD66896E2DC3eDDD32d1C1523f08cB79175031E0C](https://arbiscan.io/address/0xD66896E2DC3eDDD32d1C1523f08cB79175031E0C) |

<!-- **Arbitrum Sepolia (testnet):**

| Contract | Address |
|---|---|
| `Formicarium` | `TODO with new one` |
| `ERC20 (mock)` | `TODO with new one` |

--- -->

## Features

- **AI-driven Customization** — Users interact with an AI agent (built with CDP AgentKit) via chat to define product specifications.
- **2D to 3D Model Conversion** — The AI generates a 2D rendering and an STL file, converted to G-code for the printer.
- **Reverse Auction Marketplace** — Buyers post service requests with a maximum price. Registered providers compete by placing bids scored on both price and on-chain reputation (ERC-8004). The best-scoring bid wins.
- **ERC-8004 Reputation Integration** — Provider reputation scores are factored into bid scoring. After service completion, buyers submit on-chain feedback via a signed `feedbackAuth` blob.
- **Configurable Reputation Weight** — Buyers control how much weight (0–100) reputation has versus price, enabling fully price-driven or fully reputation-driven auctions.
- **Escrow & Dispute System** — The buyer's max price is locked in escrow at auction creation. After service completion a 1-hour dispute window opens. If no dispute is filed, the provider finalizes and receives the winning bid; excess is refunded to the buyer.
- **Blockchain-powered Payments** — Transactions are settled in USDC, ensuring secure and trustless fund management.
- **Real-time Order Tracking** — Customers monitor their orders with live feeds of the printing process.

---

## Smart Contracts

### `Formicarium.sol`
The original order-book contract. Buyers create orders for specific registered printers; providers sign and execute them. Supports priority-based scheduling (higher price premium = higher priority).

### `ReverseWeightedFormicarium.sol` (`ReverseAuction`)
The reverse auction contract with full ERC-8004 reputation integration.

**Full Lifecycle:**

| Step | Function | Who Calls |
|---|---|---|
| 1 | `registerPrinter` | Provider — links their ERC-8004 agent ID to their address |
| 2 | `createAuction` | Buyer — sets max price (locked as escrow), duration, eligible agents, reputation weight |
| 3 | `placeBid` | Provider — bids scored by `w × reputation + (1−w) × price_competitiveness` |
| 4 | `endAuction` | Buyer (early) or anyone (after duration expires) |
| 5 | `startExecution` | Winning provider — signals start of service |
| 6 | `completeService` | Winning provider — submits work + ERC-8004 `feedbackAuth` |
| 7 | `reportUncompleteOrder` | Buyer — disputes within 1-hour window; funds remain locked |
| 8 | `finalize` | Winning provider — claims payment after dispute window |

**Auction States:** `BIDDING → EXECUTION → COMPLETED_BY_PROVIDER → FINALIZED` (or `DISPUTED`)

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│   Next.js UI    │────▶│   Agents API     │────▶│  Blockchain (Arb)  │
│  (port 3000)    │     │  FastAPI :8000   │     │  ReverseAuction    │
└─────────────────┘     └──────────────────┘     │  Formicarium       │
                                │                └────────────────────┘
                                ▼
                        ┌──────────────────┐     ┌────────────────────┐
                        │  Hardware API    │────▶│  3D Printer        │
                        │  FastAPI :8080   │     │  (OctoPrint)       │
                        └──────────────────┘     └────────────────────┘
```

---

## Prerequisites

- Node.js & npm
- Python 3.9+ with [Poetry](https://python-poetry.org/docs/)
- Hardhat
- OctoPrint (for hardware agent)
- PrusaSlicer (for G-code generation)

---

## Setup & Running

### 1. Agents API

The AI agent handles user chat, generates designs, and interacts with the smart contracts.

```bash
cd agents
poetry install
```

Create `agents/.env`:
```
CDP_API_KEY_NAME=<your CDP API key name>
CDP_API_KEY_PRIVATE_KEY=<your CDP API key private key>
OPENAI_API_KEY=<your OpenAI API key>
```

```bash
poetry run python api/main.py
# Runs on http://localhost:8000
```

**Endpoints:**
- `POST /agent/chat` — Chat with the AI agent
- `POST /agent/get-image` — Retrieve generated design images
- `GET /routes` — List all available endpoints

**Agent capabilities:** DALL-E design generation, STL file creation, G-code generation, smart contract interaction (order creation, printer listing), ERC-8004 reputation tools.

---

### 2. Hardware Agent

The hardware agent runs on the 3D printer machine. It listens for blockchain events, manages the printer via OctoPrint, and calculates print costs.

```bash
cd hardware
poetry install
```

Create `hardware/.env`:
```
CDP_API_KEY_NAME=<your CDP API key name>
CDP_API_KEY_PRIVATE_KEY=<your CDP API key private key>
OPENAI_API_KEY=<your OpenAI API key>
```

Update `hardware/agent_ai/config.py` with your local paths:
```python
prusa_slicer_path = "/path/to/prusa-slicer"
FORMICARIUM_SC_ADDRESS = "0xC6CF9FA1624eD0B78fd3a6449f66eB3435a7Fa8e"  # Arbitrum One
```

```bash
poetry run python api/main.py
# Runs on http://localhost:8080
```

**Capabilities:** Blockchain event listening, order signing and execution, OctoPrint integration (printer status, job management), electricity cost estimation.

---

### 3. Frontend (Next.js)

The main user-facing application with chat interface, order tracking, and 3D model viewer.

```bash
cd frontend/shadcn-nextjs-boilerplate
npm install
npm run init   # installs shadcn components
```

Create `frontend/shadcn-nextjs-boilerplate/.env.local`:
```
OPENAI_API_KEY=<your OpenAI API key>
NEXT_PUBLIC_SUPABASE_URL=<your Supabase URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your Supabase anon key>
STRIPE_SECRET_KEY=<your Stripe secret key>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<your Stripe publishable key>
```

```bash
npm run dev
# Runs on http://localhost:3000
```

---

### 4. Blockchain

```bash
cd blockchain
npm install
```

Create `blockchain/.env`:
```
PRIVATE_KEY=<deployer key for testnets>
PRIVATE_KEY_MAIN=<deployer key for mainnet>

USDC_ADDRESS=<USDC address on target network>
IDENTITY_REGISTRY_ADDRESS=<ERC-8004 Identity Registry>
REPUTATION_REGISTRY_ADDRESS=<ERC-8004 Reputation Registry>

# ERC-8004 on Base Sepolia (for tests):
# IDENTITY_REGISTRY_ADDRESS=0x7177a6867296406881E20d6647232314736Dd09A
# REPUTATION_REGISTRY_ADDRESS=0xB5048e3ef1DA4E04deB6f7d0423D06F63869e322

ADDRESS=<your wallet address, for deployTest only>
```

**Compile:**
```bash
npx hardhat compile
```

**Deploy:**
```bash
# Arbitrum One (mainnet)
npx hardhat ignition deploy ignition/modules/deployMain.js --network arbitrumOne

# Arbitrum Sepolia (testnet, deploys mock token)
npx hardhat ignition deploy ignition/modules/deployTest.js --network arbitrumSepolia
```

**Test:**
```bash
# ReverseAuction — 81 tests (runs against forked Base Sepolia)
npx hardhat test test/ReverseAuction.test.js

# Formicarium
npx hardhat test test/Formicarium.js
npx hardhat test test/FormicariumAdvanced.js

# ERC-8004 integration (requires PRIVATE_KEY + PRIVATE_KEY2 in .env)
npx hardhat test test/ERC8004.test.js
```

The `ReverseAuction` suite covers 81 cases: provider registration, auction creation, weighted bid scoring, execution, `feedbackAuth` signature verification, disputes, finalization, refunds, and all view functions — tested against the real ERC-8004 contracts on the forked network.

---

## Quick Start (all services)

```bash
# Terminal 1 — Agents API
cd agents && poetry install && poetry run python api/main.py

# Terminal 2 — Hardware Agent
cd hardware && poetry install && poetry run python api/main.py

# Terminal 3 — Frontend
cd frontend/shadcn-nextjs-boilerplate && npm install && npm run init && npm run dev
```

---

## Supported Networks

| Network | Chain ID |
|---|---|
| Arbitrum One | 42161 |
| Arbitrum Sepolia | 421614 |
| Base Mainnet | 8453 |
| Base Sepolia | 84532 |