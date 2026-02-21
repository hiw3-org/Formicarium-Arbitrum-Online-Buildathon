![Formicarium Logo](assets/banner.png)

# Formicarium

Formicarium is a decentralized platform where an AI agent coordinates a fleet of autonomous machines and robots to manufacture customized products. Users interact with an AI agent via a chat interface to define their product specifications, which are then fulfilled by registered 3D printing service providers through an on-chain reverse auction marketplace with reputation-weighted bidding.

🌐 Live App: [https://formicarium.vercel.app](https://formicarium.vercel.app/dashboard/chat)

---

## Deployed Contracts — Arbitrum One

| Contract | Address |
|---|---|
| `Formicarium` | `0xC6CF9FA1624eD0B78fd3a6449f66eB3435a7Fa8e` |
| `ReverseAuction` | `0x81b737B20aB88fB4B33db282946Db5a3B16930d4` |

---

## Features

- **AI-driven Customization** — Users interact with an AI agent (built with CDP AgentKit) via chat to define product specifications.
- **2D to 3D Model Conversion** — The AI generates a 2D rendering and an STL file for 3D printing, which is converted to G-code for the printer.
- **Reverse Auction Marketplace** — Buyers post service requests with a maximum price. Registered providers compete by placing bids scored on both price competitiveness and on-chain reputation (ERC-8004). The best-scoring bid wins.
- **ERC-8004 Reputation Integration** — Provider reputation scores from the ERC-8004 Identity and Reputation Registries are factored into bid scoring. After service completion, buyers can submit on-chain reputation feedback via a signed `feedbackAuth` blob.
- **Configurable Reputation Weight** — Buyers control how much weight (0–100) reputation has relative to price when scoring bids, enabling fully price-driven or fully reputation-driven auctions.
- **Escrow & Dispute System** — The buyer's max price is locked in escrow at auction creation. After service completion, a 1-hour dispute window opens. If no dispute is filed, the provider finalizes and receives the winning bid amount; any excess is refunded to the buyer.
- **Blockchain-powered Payments** — Transactions are settled in USDC, ensuring secure and trustless fund management throughout the full order lifecycle.
- **Real-time Order Tracking** — Customers can monitor their orders, including livestreams of their products being manufactured.

---

## Smart Contracts

### `Formicarium.sol`
The original order-book contract. Buyers create orders for specific registered printers, which providers sign and execute. Supports priority-based order scheduling (higher price premium = higher priority).

### `ReverseWeightedFormicarium.sol` (`ReverseAuction`)
The new reverse auction contract with full ERC-8004 integration. Replaces the direct order model with a competitive bidding system.

**Full Lifecycle:**

| Step | Function | Who Calls |
|---|---|---|
| 1 | `registerPrinter` | Provider — links their ERC-8004 agent ID to their address |
| 2 | `createAuction` | Buyer — sets max price (locked as escrow), duration, eligible agents, reputation weight |
| 3 | `placeBid` | Provider — bids scored by `w × reputation + (1−w) × price_competitiveness` |
| 4 | `endAuction` | Buyer (early) or anyone (after duration) — transitions to EXECUTION or FINALIZED |
| 5 | `startExecution` | Winning provider — signals start of service |
| 6 | `completeService` | Winning provider — submits work + ERC-8004 `feedbackAuth`; opens dispute window |
| 7 | `reportUncompleteOrder` | Buyer — disputes within 1-hour window; funds remain locked |
| 8 | `finalize` | Winning provider — claims payment after dispute window with no dispute |

**Auction States:** `BIDDING → EXECUTION → COMPLETED_BY_PROVIDER → FINALIZED` (or `DISPUTED`)

---

## How It Works

1. **User Interaction** — Customers describe their desired product to the AI agent via chat.
2. **AI Processing** — The AI generates a 2D rendering and an STL file. STL is converted to G-code for the 3D printer.
3. **Reverse Auction** — A buyer creates an on-chain auction specifying their max price, eligible providers (by ERC-8004 agent ID), and how much weight to give reputation vs. price. Providers place competing bids.
4. **Provider Selection** — The highest-scored bid wins. Score combines reputation (from ERC-8004) and price competitiveness using the buyer's chosen weight.
5. **Manufacturing Execution** — The winning provider starts execution and the autonomous 3D printer produces the order.
6. **Order Tracking** — Users monitor order status and view a live feed of the printing process.
7. **Payment & Reputation** — After the dispute window passes, the provider claims the winning bid. The buyer uses the stored `feedbackAuth` to submit an on-chain reputation score for the provider.

---

## Prerequisites

- Node.js & npm
- Python 3.9+
- Hardhat
- FastAPI
- Next.js
- OctoPrint
- AgentKit

---

## Blockchain Setup

### Install dependencies

```bash
cd blockchain
npm install
```

### Configure environment

Create `blockchain/.env`:

```
PRIVATE_KEY=<deployer private key for testnets>
PRIVATE_KEY_MAIN=<deployer private key for mainnet>

USDC_ADDRESS=<USDC token address on target network>
IDENTITY_REGISTRY_ADDRESS=<ERC-8004 Identity Registry address>
REPUTATION_REGISTRY_ADDRESS=<ERC-8004 Reputation Registry address>

# Optional: override default public RPC
ARBITRUM_MAIN_RPC=
```

**ERC-8004 addresses on Base Sepolia:**
- Identity Registry: `0x7177a6867296406881E20d6647232314736Dd09A`
- Reputation Registry: `0xB5048e3ef1DA4E04deB6f7d0423D06F63869e322`

### Compile

```bash
npx hardhat compile
```

### Deploy

```bash
# Arbitrum One (mainnet) — uses real USDC
npx hardhat ignition deploy ignition/modules/deployMain.js --network arbitrumOne

# Arbitrum Sepolia (testnet) — deploys mock ERC20
npx hardhat ignition deploy ignition/modules/deployTest.js --network arbitrumSepolia
```

### Run tests

```bash
# ReverseAuction contract (81 tests, runs against forked Base Sepolia)
npx hardhat test test/ReverseAuction.test.js

# Formicarium contract
npx hardhat test test/Formicarium.js
npx hardhat test test/FormicariumAdvanced.js

# ERC-8004 integration (requires PRIVATE_KEY and PRIVATE_KEY2 in .env)
npx hardhat test test/ERC8004.test.js
```

The `ReverseAuction` test suite covers 81 cases across the full auction lifecycle — provider registration, auction creation, bidding with weighted scoring, execution, `feedbackAuth` signature verification, disputes, finalization, refunds, and all view functions.

---

## Supported Networks

| Network | Chain ID |
|---|---|
| Arbitrum One | 42161 |
| Arbitrum Sepolia | 421614 |
| Base Mainnet | 8453 |
| Base Sepolia | 84532 |
