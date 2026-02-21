![Formicarium Logo](assets/banner.png)

# Formicarium

Formicarium is a decentralized platform where an AI agent coordinates a fleet of autonomous machines and robots to manufacture customized products. This system integrates AI-driven user interactions with a blockchain-based marketplace, allowing users to seamlessly request and receive 3D-printed products.

🌐Live App: [https://formicarium.vercel.app](https://formicarium.vercel.app/dashboard/chat)


Deployed Addresses Arbitrum One:

MainModule#Formicarium - 0xC6CF9FA1624eD0B78fd3a6449f66eB3435a7Fa8e
MainModule#ReverseAuction - 0x81b737B20aB88fB4B33db282946Db5a3B16930d4

## Features

- AI-driven Customization: Users interact with an AI agent (developed with CDP AgentKit) via a chat interface to define their product specifications.
- 2D to 3D Model Conversion: AI generates a 2D rendering of the requested design and an STL file for 3D printing.
- Decentralized Marketplace: Smart contracts facilitate transactions between users and autonomous manufacturing machines.
- Blockchain-powered Transactions: Customers lock funds in USDC tokens, ensuring secure and trustless service execution.
- Optimized Order Execution: Machines evaluate price and queue positions, enabling users to accelerate order processing by providing additional funds.
- Real-time Order Tracking: Customers can monitor their orders, including livestreams of their products being manufactured.

## How It Works

1. User Interaction: Customers describe their desired product to the AI agent via chat.
2. AI Processing: The AI generates a 2D rendering and an STL file for 3D printing. STL code is transformed into G-code for the 3D printer.
3. Marketplace Engagement: Smart contracts manage the bidding and agreement process between users and service providers.
4. Manufacturing Execution: The autonomous 3D printer utlizies G-code for printing ordered products.
5. Order Tracking: Users can monitor the order status and view a live feed of the printing process.
6. Payment Release: Upon successful order completion, locked funds are released to the service provider.

### Prerequisites

- Node.js & npm
- Python 3.9+
- Hardhat
- FastAPI
- Next.js
- OctoPrint
- AgentKit


Copmprehensive tests:

lukal@lukapc:~/Dev/Formicarium-Arbitrum-Online-Buildathon/blockchain$ npx hardhat test test/ReverseAuction.test.js


  ReverseAuction
    registerPrinter
      ✔ stores printer details correctly
      ✔ creates agentToProvider mapping
      ✔ emits PrinterRegistered (1236ms)
      ✔ reverts AgentNotOwnedByCaller if caller does not own the agent
      ✔ reverts PrinterAlreadyRegistered on duplicate registration
      ✔ reverts AgentAlreadyRegistered if agent already linked to another printer (504ms)
    createAuction
      ✔ locks escrow and stores auction correctly (3106ms)
      ✔ increments auctionIdCounter for each auction (5766ms)
      ✔ emits AuctionCreated (2955ms)
      ✔ reverts InvalidAuctionDuration if auctionDuration is 0 (127ms)
      ✔ reverts InvalidServiceDuration if serviceDuration is 0 (250ms)
      ✔ reverts InvalidMaxPrice if maxPrice is 0 (128ms)
      ✔ reverts NoEligibleAgents if eligibleAgentIds is empty (126ms)
      ✔ reverts InvalidServiceCid if CID is empty (124ms)
      ✔ reverts InvalidReputationWeight if weight > 100 (124ms)
      ✔ reverts PrinterNotRegistered if eligible agent is not a registered printer (758ms)
      ✔ reverts InsufficientEscrow if allowance is too low (127ms)
    placeBid
      ✔ accepts first bid and stores winner (1485ms)
      ✔ replaces winner when a better-scored bid arrives (2429ms)
      ✔ reverts BidScoreNotCompetitive for equal or worse score (1250ms)
      ✔ emits BidPlaced (1185ms)
      ✔ reverts AuctionNotFound for invalid auction id (123ms)
      ✔ reverts AgentNotEligible for an agent not in eligibleAgentIds (1123ms)
      ✔ reverts BidTooHigh if bid exceeds maxPrice
      ✔ reverts NotAgentOwner if caller does not own the agent
      ✔ reverts AuctionNotInState after auction duration expires
      ✔ all bids are stored even when winner changes (2125ms)
    endAuction
      ✔ buyer can end auction early with a winner → EXECUTION (4046ms)
      ✔ anyone can end after duration expires (4039ms)
      ✔ transitions to FINALIZED when no bids placed (2987ms)
      ✔ reverts NotAuthorized if non-buyer calls before expiry (2826ms)
      ✔ reverts AuctionNotInState if called twice (4136ms)
      ✔ emits AuctionEnded with winner info (4086ms)
    startExecution
      ✔ winning provider starts execution and sets timestamp (130ms)
      ✔ emits ExecutionStarted
      ✔ reverts AuctionNotInState if not in EXECUTION (3938ms)
      ✔ reverts ExecutionAlreadyStarted on second call
      ✔ reverts NotAgentOwner if caller is not the winning agent owner
    completeService
      ✔ provider completes service and state → COMPLETED_BY_PROVIDER (1776ms)
      ✔ stores feedbackAuth retrievable via getFeedbackAuth (1638ms)
      ✔ emits ServiceCompleted and FeedbackAuthStored (1565ms)
      ✔ reverts AuctionNotInState if called after already completed (1498ms)
      ✔ reverts ExecutionNotStarted if startExecution was never called (3593ms)
      ✔ reverts ServiceDurationExpired if called after serviceDuration
      ✔ reverts NotAgentOwner if caller is not the winning agent owner
      ✔ reverts InvalidFeedbackAuth if blob is too short (<289 bytes)
      ✔ reverts FeedbackAuthExpired for an already-expired feedbackAuth
      ✔ reverts InvalidFeedbackAuth for wrong agentId in blob
      ✔ reverts InvalidFeedbackAuth for wrong client in blob
      ✔ reverts InvalidSignature when blob is signed by the wrong key
    reportUncompleteOrder
      ✔ buyer disputes within window → state DISPUTED
      ✔ emits OrderDisputed
      ✔ reverts NotAuthorized if caller is not the buyer
      ✔ reverts DisputeWindowExpired after the window closes
      ✔ reverts AuctionNotInState if called twice
    finalize
      ✔ pays winningBid to provider and refunds excess to buyer (132ms)
      ✔ sets state to FINALIZED and clears escrow (135ms)
      ✔ emits FundsReleased (131ms)
      ✔ reverts DisputeWindowNotExpired if called too early (5159ms)
      ✔ reverts NotAgentOwner if caller is not winning agent owner
      ✔ reverts AuctionNotInState if order was disputed (5029ms)
    refundBuyer
      ✔ refunds full escrow to buyer when no bids placed (3055ms)
      ✔ emits FundsReleased for the refund (2945ms)
      ✔ reverts NotAuthorized if caller is not the buyer (2833ms)
      ✔ reverts AuctionNotInState if auction is still in BIDDING (2974ms)
      ✔ reverts NotAuthorized if auction had a winner (must use finalize) (5728ms)
      ✔ reverts InsufficientEscrow on double refund (2789ms)
    View functions
      ✔ getAuctionEndTime returns auctionStartTime + auctionDuration (132ms)
      ✔ isAuctionActive is true during bidding window
      ✔ isAuctionActive is false after expiry
      ✔ getCurrentWinningBid returns maxPrice before any bid
      ✔ getCurrentWinningBid updates after a bid (1001ms)
      ✔ getBidCount increments with each bid (1147ms)
      ✔ getTimeRemaining returns 0 after expiry
      ✔ getDisputeDeadline returns 0 before service completion
      ✔ getDisputeDeadline returns completionTime + DISPUTE_WINDOW after completion (5168ms)
      ✔ getAuctionBids returns all placed bids (4958ms)
      ✔ view functions revert AuctionNotFound for unknown id (127ms)
    Score calculation
      ✔ price-only mode (reputationWeight=0): lower bid always wins (5364ms)
      ✔ reputation-only mode (reputationWeight=100): higher reputation wins regardless of price (4344ms)
      ✔ mixed mode: high reputation outweighs worse price (5190ms)


  81 passing (10m)