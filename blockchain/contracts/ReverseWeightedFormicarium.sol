// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {IReputationRegistry} from "./interfaces/IReputationRegistry.sol";

/**
 * @title ReverseAuction
 * @dev Unified reverse auction + Formicarium order lifecycle contract.
 *      Integrates ERC-8004 agent reputation for provider selection and
 *      feedbackAuth verification for post-service reputation updates.
 *
 * ── Full Lifecycle ──
 *   1. registerPrinter        — Provider links their ERC-8004 agent ID to their address.
 *                               msg.sender must own the agentId in the Identity Registry.
 *
 *   2. createAuction          — Buyer creates auction. maxPrice is locked in escrow immediately.
 *                               All eligibleAgentIds must belong to registered printers.
 *
 *   3. placeBid               — Eligible registered providers bid. Each bid is scored by a
 *                               weighted formula: w * reputation + (1-w) * price_competitiveness.
 *                               Only bids with a strictly higher score than the current best are accepted.
 *
 *   4. endAuction             — Ends bidding phase. If a winner exists → EXECUTION (equivalent to
 *                               "order signed" in Formicarium). If no bids → FINALIZED so buyer
 *                               can reclaim escrow via refundBuyer().
 *
 *   5. startExecution         — Winning provider signals start of service. Sets executionStartTime.
 *                               Provider must complete within serviceDuration from this point.
 *
 *   6. completeService        — Provider marks service done and submits ERC-8004 feedbackAuth.
 *                               Funds are NOT transferred immediately. State → COMPLETED_BY_PROVIDER.
 *                               Buyer's dispute window (DISPUTE_WINDOW) opens from this timestamp.
 *
 *   7. reportUncompleteOrder  — Buyer disputes within DISPUTE_WINDOW. State → DISPUTED.
 *                               Funds remain locked with no automated resolution in this version.
 *
 *   8. finalize               — Provider calls after DISPUTE_WINDOW with no dispute.
 *                               Transfers winningBid to provider, refunds excess to buyer.
 *                               State → FINALIZED.
 */
contract ReverseAuction is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ============ ENUMS ============

    /**
     * @dev Single enum tracks the entire auction + order lifecycle, replacing the multiple
     *      boolean flags used in Formicarium (isSigned, isCompletedProvider, isUncompleteCustomer).
     *
     * BIDDING              → Auction open; providers placing bids.
     * EXECUTION            → Winner selected (like "isSigned = true" in Formicarium); provider
     *                        must call startExecution() then completeService() within serviceDuration.
     * COMPLETED_BY_PROVIDER → Provider submitted work + feedbackAuth; buyer dispute window open.
     * DISPUTED             → Buyer filed dispute within window; funds locked, no auto-resolution.
     * FINALIZED            → Settled: funds paid to provider OR buyer reclaimed escrow (no winner).
     */
    enum AuctionState {
        BIDDING,
        EXECUTION,
        COMPLETED_BY_PROVIDER,
        DISPUTED,
        FINALIZED
    }

    // ============ STRUCTS ============

    /**
     * @dev A registered service provider linked to their ERC-8004 agent.
     *      Registration is a prerequisite for being listed as an eligible bidder.
     */
    struct Printer {
        address providerAddress;
        uint256 agentId;        // ERC-8004 Identity Registry token ID
        string printerDetails;
    }

    /**
     * @dev Full auction and order state in a single struct.
     *      Replaces the separate Auction and Order structs from the original contracts.
     */
    struct Auction {
        uint256 id;
        address buyer;
        string serviceDescriptionCid;  // IPFS CID of service requirements
        uint256 maxPrice;              // Maximum buyer will pay; also initial escrow amount
        uint256 auctionDuration;       // Bidding phase duration in seconds
        uint256 serviceDuration;       // Time provider has to complete service after startExecution (seconds)
        uint256 auctionStartTime;      // Block timestamp when auction was created
        uint256 executionStartTime;    // Set by startExecution(); 0 = provider has not started yet
        uint256 completionTime;        // Set by completeService(); 0 = not yet completed
        uint256[] eligibleAgentIds;    // ERC-8004 agent IDs allowed to bid (must be registered printers)
        uint256 winningAgentId;        // Agent ID of the winner (0 = no winner)
        uint256 winningBid;            // Winning bid amount
        AuctionState state;            // Current lifecycle state
        uint256 escrowAmount;          // Funds currently held in escrow by this contract
        uint256 reputationWeight;      // Reputation's share of bid score (0 = price only, 100 = reputation only)
        bytes feedbackAuth;            // ERC-8004 feedbackAuth stored on completeService()
    }
    
    /**
     * @dev A single bid placed in an auction.
     */
    struct Bid {
        address provider;
        uint256 agentId;
        uint256 amount;
        uint256 timestamp;
        uint256 reputation;  // ERC-8004 reputation score at bid time (0-100)
        uint256 score;       // Weighted score: reputation + price competitiveness (0-100)
    }

    // ============ CONSTANTS ============

    /// @dev Buyer's window to call reportUncompleteOrder() after provider calls completeService().
    ///      If no dispute is filed within this window, provider may call finalize() to collect funds.
    uint256 public constant DISPUTE_WINDOW = 1 hours;

    /// @dev Precision multiplier for bid score calculations (2 decimal places → range 0-10000).
    uint256 private constant SCORE_PRECISION = 100;

    // ============ STATE VARIABLES ============

    /// @dev Payment token (USDC or any ERC-20 used in the project).
    IERC20 public immutable USDC_TOKEN;

    /// @dev ERC-8004 Identity Registry — manages agent NFT ownership.
    IIdentityRegistry public immutable IDENTITY_REGISTRY;

    /// @dev ERC-8004 Reputation Registry — stores and queries agent reputation scores.
    IReputationRegistry public immutable REPUTATION_REGISTRY;

    /// @dev Auto-incrementing auction ID counter (public for frontend iteration).
    uint256 public auctionIdCounter;

    /// @dev Registered printers: provider address → Printer struct.
    mapping(address => Printer) public printers;

    /// @dev Reverse lookup: ERC-8004 agentId → registered provider address.
    ///      Enables O(1) check that a bidder is a registered printer for that agent.
    mapping(uint256 => address) public agentToProvider;

    /// @dev All auctions keyed by auction ID.
    mapping(uint256 => Auction) public auctions;

    /// @dev All bids per auction.
    mapping(uint256 => Bid[]) public auctionBids;

    /// @dev O(1) eligibility check during bidding: auctionId → agentId → isEligible.
    mapping(uint256 => mapping(uint256 => bool)) public isEligibleAgent;

    /// @dev Tracks the current winning bid amount for each auction.
    mapping(uint256 => uint256) public currentWinningBid;

    /// @dev Tracks the current highest weighted bid score for each auction.
    mapping(uint256 => uint256) public highestScore;
    
    // ============ EVENTS ============

    event PrinterRegistered(
        address indexed provider,
        uint256 indexed agentId,
        string printerDetails
    );

    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed buyer,
        string serviceDescriptionCid,
        uint256 maxPrice,
        uint256 auctionDuration,
        uint256 serviceDuration,
        uint256[] eligibleAgentIds,
        uint256 reputationWeight
    );

    event BidPlaced(
        uint256 indexed auctionId,
        address indexed provider,
        uint256 indexed agentId,
        uint256 bidAmount,
        uint256 reputation,
        uint256 score,
        uint256 timestamp
    );

    event AuctionEnded(
        uint256 indexed auctionId,
        uint256 indexed winningAgentId,
        uint256 winningBid
    );

    /// @dev Emitted when the winning provider calls startExecution().
    ///      Marks the start of the active service delivery period.
    event ExecutionStarted(
        uint256 indexed auctionId,
        uint256 indexed agentId,
        address indexed provider,
        uint256 executionStartTime
    );

    /// @dev Emitted when provider marks service complete. Buyer's dispute window opens.
    event ServiceCompleted(
        uint256 indexed auctionId,
        uint256 indexed agentId,
        address indexed provider,
        uint256 completionTime
    );

    /// @dev Emitted alongside ServiceCompleted. Buyer retrieves feedbackAuth to call
    ///      IReputationRegistry.giveFeedback() for on-chain reputation update.
    event FeedbackAuthStored(
        uint256 indexed auctionId,
        uint256 indexed agentId,
        address indexed buyer,
        bytes feedbackAuth
    );

    /// @dev Emitted when buyer disputes a completed order within the dispute window.
    event OrderDisputed(
        uint256 indexed auctionId,
        address indexed buyer
    );

    event FundsReleased(
        uint256 indexed auctionId,
        uint256 indexed agentId,
        address indexed recipient,
        uint256 amount
    );
    
    // ============ ERRORS ============

    error ZeroAddress();
    error InvalidAuctionDuration();
    error InvalidServiceDuration();
    error InvalidMaxPrice();
    error NoEligibleAgents();
    error InsufficientEscrow();
    error AuctionNotFound();
    error AuctionNotInState(AuctionState expected, AuctionState actual);
    error AgentNotEligible();
    error NotAgentOwner();
    error AgentNotFound();
    error BidTooHigh();
    error NotAuthorized();
    error InvalidServiceCid();
    error InvalidReputationWeight();
    error BidScoreNotCompetitive();
    error InvalidFeedbackAuth();
    error FeedbackAuthExpired();
    error InvalidSignature();
    error ExecutionNotStarted();
    error ExecutionAlreadyStarted();
    error ServiceDurationExpired();
    error DisputeWindowNotExpired();
    error DisputeWindowExpired();
    error PrinterNotRegistered();
    error PrinterAlreadyRegistered();
    error AgentNotOwnedByCaller();
    error AgentAlreadyRegistered();
    
    // ============ CONSTRUCTOR ============

    /**
     * @param usdcTokenAddress   Address of the ERC-20 payment token
     * @param identityRegistry   Address of the ERC-8004 Identity Registry
     * @param reputationRegistry Address of the ERC-8004 Reputation Registry
     */
    constructor(
        address usdcTokenAddress,
        address identityRegistry,
        address reputationRegistry
    ) {
        if (usdcTokenAddress == address(0)) revert ZeroAddress();
        if (identityRegistry == address(0)) revert ZeroAddress();
        if (reputationRegistry == address(0)) revert ZeroAddress();

        USDC_TOKEN = IERC20(usdcTokenAddress);
        IDENTITY_REGISTRY = IIdentityRegistry(identityRegistry);
        REPUTATION_REGISTRY = IReputationRegistry(reputationRegistry);
        auctionIdCounter = 0;
    }

    // ============ EXTERNAL FUNCTIONS ============

    // ── Step 1: Provider Registration ──────────────────────────────────────────────────────────

    /**
     * @dev Registers a printer with an associated ERC-8004 agent identity.
     *      msg.sender must own agentId in the ERC-8004 Identity Registry.
     *      Only registered printers' agents can be listed as eligible bidders in auctions.
     *      One address = one printer; one agentId = one printer.
     *
     * @param agentId        ERC-8004 agent token ID owned by msg.sender
     * @param printerDetails Human-readable description of printer/provider capabilities
     */
    function registerPrinter(uint256 agentId, string calldata printerDetails) external {
        if (IDENTITY_REGISTRY.ownerOf(agentId) != msg.sender) revert AgentNotOwnedByCaller();
        if (printers[msg.sender].providerAddress == msg.sender) revert PrinterAlreadyRegistered();
        if (agentToProvider[agentId] != address(0)) revert AgentAlreadyRegistered();

        printers[msg.sender] = Printer({
            providerAddress: msg.sender,
            agentId: agentId,
            printerDetails: printerDetails
        });
        agentToProvider[agentId] = msg.sender;

        emit PrinterRegistered(msg.sender, agentId, printerDetails);
    }

    // ── Step 2: Auction Creation ────────────────────────────────────────────────────────────────

    /**
     * @dev Creates a new reverse auction and locks maxPrice in escrow immediately.
     *      All eligibleAgentIds must exist in ERC-8004 AND be registered printers in this contract.
     *
     * @param serviceDescriptionCid IPFS CID of service requirements
     * @param maxPrice              Maximum price buyer will pay (entire amount locked as escrow)
     * @param auctionDuration       Duration of the bidding phase (seconds)
     * @param serviceDuration       Time provider has to complete service after startExecution (seconds)
     * @param eligibleAgentIds      ERC-8004 agent IDs allowed to bid (all must be registered printers)
     * @param reputationWeight      Reputation's weight in bid scoring (0 = price only, 100 = reputation only)
     * @return auctionId            The newly created auction ID
     */
    function createAuction(
        string calldata serviceDescriptionCid,
        uint256 maxPrice,
        uint256 auctionDuration,
        uint256 serviceDuration,
        uint256[] calldata eligibleAgentIds,
        uint256 reputationWeight
    ) external nonReentrant returns (uint256 auctionId) {
        if (auctionDuration == 0) revert InvalidAuctionDuration();
        if (serviceDuration == 0) revert InvalidServiceDuration();
        if (maxPrice == 0) revert InvalidMaxPrice();
        if (eligibleAgentIds.length == 0) revert NoEligibleAgents();
        if (bytes(serviceDescriptionCid).length == 0) revert InvalidServiceCid();
        if (reputationWeight > 100) revert InvalidReputationWeight();

        // All eligible agents must exist in ERC-8004 AND be registered printers here
        for (uint256 i = 0; i < eligibleAgentIds.length; i++) {
            if (!_agentExists(eligibleAgentIds[i])) revert AgentNotFound();
            if (agentToProvider[eligibleAgentIds[i]] == address(0)) revert PrinterNotRegistered();
        }

        if (USDC_TOKEN.allowance(msg.sender, address(this)) < maxPrice) revert InsufficientEscrow();
        if (USDC_TOKEN.balanceOf(msg.sender) < maxPrice) revert InsufficientEscrow();

        auctionId = ++auctionIdCounter;

        // Lock buyer's full maxPrice in escrow for the entire lifecycle.
        // No additional transfers occur until finalize() or refundBuyer().
        USDC_TOKEN.safeTransferFrom(msg.sender, address(this), maxPrice);

        Auction storage auction = auctions[auctionId];
        auction.id = auctionId;
        auction.buyer = msg.sender;
        auction.serviceDescriptionCid = serviceDescriptionCid;
        auction.maxPrice = maxPrice;
        auction.auctionDuration = auctionDuration;
        auction.serviceDuration = serviceDuration;
        auction.auctionStartTime = block.timestamp;
        auction.executionStartTime = 0;
        auction.completionTime = 0;
        auction.eligibleAgentIds = eligibleAgentIds;
        auction.winningAgentId = 0;
        auction.winningBid = 0;
        auction.state = AuctionState.BIDDING;
        auction.escrowAmount = maxPrice;
        auction.reputationWeight = reputationWeight;

        for (uint256 i = 0; i < eligibleAgentIds.length; i++) {
            isEligibleAgent[auctionId][eligibleAgentIds[i]] = true;
        }

        currentWinningBid[auctionId] = maxPrice;
        highestScore[auctionId] = 0;

        emit AuctionCreated(
            auctionId,
            msg.sender,
            serviceDescriptionCid,
            maxPrice,
            auctionDuration,
            serviceDuration,
            eligibleAgentIds,
            reputationWeight
        );
    }

    // ── Step 3: Bidding ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Places a bid in a reverse auction.
     *      Caller must own the specified agentId in ERC-8004 AND be a registered printer.
     *      Bids are scored by weighted reputation + price competitiveness.
     *      Only bids with a strictly higher score than the current leader are accepted.
     *
     * @param auctionId The auction to bid on
     * @param bidAmount Proposed service price in payment tokens (must be ≤ maxPrice)
     * @param agentId   ERC-8004 agent ID to bid with (must be caller's registered agent)
     */
    function placeBid(
        uint256 auctionId,
        uint256 bidAmount,
        uint256 agentId
    ) external {
        Auction storage auction = auctions[auctionId];

        if (auction.buyer == address(0)) revert AuctionNotFound();
        if (auction.state != AuctionState.BIDDING) revert AuctionNotInState(AuctionState.BIDDING, auction.state);
        if (block.timestamp > auction.auctionStartTime + auction.auctionDuration) revert AuctionNotInState(AuctionState.BIDDING, auction.state);
        if (msg.sender == auction.buyer) revert NotAuthorized();
        if (!isEligibleAgent[auctionId][agentId]) revert AgentNotEligible();
        if (bidAmount == 0) revert InvalidMaxPrice();
        if (bidAmount > auction.maxPrice) revert BidTooHigh();

        // Caller must currently own the agent in ERC-8004 and be its registered printer
        if (IDENTITY_REGISTRY.ownerOf(agentId) != msg.sender) revert NotAgentOwner();
        if (agentToProvider[agentId] != msg.sender) revert PrinterNotRegistered();

        // Fetch live reputation from ERC-8004 Reputation Registry.
        // Agents with no feedback history default to neutral score of 50.
        address[] memory emptyAddresses = new address[](0);
        (uint256 feedbackCount, uint256 averageScore) = REPUTATION_REGISTRY.getSummary(
            agentId,
            emptyAddresses,
            bytes32(0),
            bytes32(0)
        );
        uint256 reputation = feedbackCount > 0 ? averageScore : 50;

        uint256 score = _calculateScore(reputation, bidAmount, auction.maxPrice, auction.reputationWeight);

        // Only accept bids with a strictly higher weighted score than the current best
        if (auction.winningAgentId != 0 && score <= highestScore[auctionId]) {
            revert BidScoreNotCompetitive();
        }

        auctionBids[auctionId].push(Bid({
            provider: msg.sender,
            agentId: agentId,
            amount: bidAmount,
            timestamp: block.timestamp,
            reputation: reputation,
            score: score
        }));

        currentWinningBid[auctionId] = bidAmount;
        highestScore[auctionId] = score;
        auction.winningAgentId = agentId;
        auction.winningBid = bidAmount;

        emit BidPlaced(auctionId, msg.sender, agentId, bidAmount, reputation, score, block.timestamp);
    }

    // ── Step 4: End Auction (Auction → Order Transition) ───────────────────────────────────────

    /**
     * @dev Ends the bidding phase and transitions to the order execution phase.
     *
     * ── Auction → Order Transition ──
     * This is the boundary between the reverse auction and the Formicarium order lifecycle.
     * If a winner exists: state → EXECUTION. The winning provider is now treated as if the
     * order was "signed" in Formicarium — they are expected to call startExecution() next.
     * If no bids were placed: state → FINALIZED so buyer can reclaim escrow via refundBuyer().
     *
     * Can be called by anyone once auctionDuration has elapsed, or by the buyer at any time.
     *
     * @param auctionId The auction to end
     */
    function endAuction(uint256 auctionId) external {
        Auction storage auction = auctions[auctionId];

        if (auction.buyer == address(0)) revert AuctionNotFound();
        if (auction.state != AuctionState.BIDDING) revert AuctionNotInState(AuctionState.BIDDING, auction.state);

        bool timeExpired = block.timestamp > auction.auctionStartTime + auction.auctionDuration;
        bool isBuyer = msg.sender == auction.buyer;

        if (!timeExpired && !isBuyer) revert NotAuthorized();

        if (auction.winningAgentId != 0) {
            // ── Auction → EXECUTION ──
            // Winner determined. From here the flow mirrors Formicarium's order lifecycle
            // starting from the point where the order is signed (isSigned = true).
            auction.state = AuctionState.EXECUTION;
        } else {
            // No bids received — mark as FINALIZED so buyer can reclaim escrow
            auction.state = AuctionState.FINALIZED;
        }

        emit AuctionEnded(auctionId, auction.winningAgentId, auction.winningBid);
    }

    // ── Step 5: Execution Start ─────────────────────────────────────────────────────────────────

    /**
     * @dev Winning provider signals the start of service execution.
     *      Equivalent to executeNewOrder() in Formicarium — sets executionStartTime.
     *      Provider must call completeService() within serviceDuration from this timestamp.
     *
     * @param auctionId The auction ID
     */
    function startExecution(uint256 auctionId) external {
        Auction storage auction = auctions[auctionId];

        if (auction.buyer == address(0)) revert AuctionNotFound();
        if (auction.state != AuctionState.EXECUTION) revert AuctionNotInState(AuctionState.EXECUTION, auction.state);
        if (auction.executionStartTime != 0) revert ExecutionAlreadyStarted();

        // Only the current owner of the winning agent may start execution
        if (IDENTITY_REGISTRY.ownerOf(auction.winningAgentId) != msg.sender) revert NotAgentOwner();

        auction.executionStartTime = block.timestamp;

        emit ExecutionStarted(auctionId, auction.winningAgentId, msg.sender, block.timestamp);
    }

    // ── Step 6: Complete Service ────────────────────────────────────────────────────────────────

    /**
     * @dev Provider marks the service as complete and submits ERC-8004 feedbackAuth.
     *      Equivalent to completeOrderProvider() in Formicarium.
     *
     *      Funds are NOT transferred here. State → COMPLETED_BY_PROVIDER.
     *      Buyer's dispute window (DISPUTE_WINDOW) opens from completionTime.
     *      After the window expires with no dispute, provider calls finalize() to claim payment.
     *
     * ── FeedbackAuth ──
     * The feedbackAuth is verified per ERC-8004 and stored on-chain so the buyer can later
     * call IReputationRegistry.giveFeedback() to update the provider's on-chain reputation.
     *
     * @param auctionId    The auction ID
     * @param feedbackAuth ERC-8004 feedbackAuth (224 bytes params + 65 bytes signature = 289+ bytes)
     */
    function completeService(uint256 auctionId, bytes calldata feedbackAuth) external nonReentrant {
        Auction storage auction = auctions[auctionId];

        if (auction.buyer == address(0)) revert AuctionNotFound();
        if (auction.state != AuctionState.EXECUTION) revert AuctionNotInState(AuctionState.EXECUTION, auction.state);
        if (auction.executionStartTime == 0) revert ExecutionNotStarted();

        // Provider must complete within serviceDuration of calling startExecution()
        if (block.timestamp > auction.executionStartTime + auction.serviceDuration) revert ServiceDurationExpired();

        // Only the current owner of the winning agent may complete the service
        address currentOwner = IDENTITY_REGISTRY.ownerOf(auction.winningAgentId);
        if (msg.sender != currentOwner) revert NotAgentOwner();

        // ── FeedbackAuth Verification ──
        // Validates the ERC-8004 signature so buyer can later submit a reputation score.
        // See _verifyFeedbackAuth() for full spec details.
        _verifyFeedbackAuth(feedbackAuth, auction.winningAgentId, auction.buyer, currentOwner);

        // ── Transition: EXECUTION → COMPLETED_BY_PROVIDER ──
        // Buyer's dispute window (DISPUTE_WINDOW) starts from completionTime.
        auction.state = AuctionState.COMPLETED_BY_PROVIDER;
        auction.completionTime = block.timestamp;
        auction.feedbackAuth = feedbackAuth;

        emit ServiceCompleted(auctionId, auction.winningAgentId, msg.sender, block.timestamp);
        // Emit feedbackAuth so buyer can retrieve it from logs and submit reputation feedback
        emit FeedbackAuthStored(auctionId, auction.winningAgentId, auction.buyer, feedbackAuth);
    }

    // ── Step 7: Buyer Dispute (Optional) ───────────────────────────────────────────────────────

    /**
     * @dev Buyer disputes the completed service within the DISPUTE_WINDOW.
     *      Equivalent to reportUncompleteOrder() in Formicarium.
     *
     * ── Dispute Logic ──
     * Must be called within DISPUTE_WINDOW seconds of completionTime.
     * Transitions state to DISPUTED — escrow remains locked.
     * No automated fund distribution occurs in this version; resolution is handled externally.
     *
     * @param auctionId The auction ID
     */
    function reportUncompleteOrder(uint256 auctionId) external {
        Auction storage auction = auctions[auctionId];

        if (auction.buyer == address(0)) revert AuctionNotFound();
        if (auction.state != AuctionState.COMPLETED_BY_PROVIDER) {
            revert AuctionNotInState(AuctionState.COMPLETED_BY_PROVIDER, auction.state);
        }
        if (msg.sender != auction.buyer) revert NotAuthorized();
        if (block.timestamp > auction.completionTime + DISPUTE_WINDOW) revert DisputeWindowExpired();

        // ── Transition: COMPLETED_BY_PROVIDER → DISPUTED ──
        // Escrow remains locked; no automated fund distribution.
        auction.state = AuctionState.DISPUTED;

        emit OrderDisputed(auctionId, msg.sender);
    }

    // ── Step 8: Finalize (Payment Release) ─────────────────────────────────────────────────────

    /**
     * @dev Provider claims payment after the dispute window has passed without a buyer dispute.
     *      Equivalent to transferFundsProvider() in Formicarium.
     *
     *      Pays winningBid to the provider.
     *      Refunds any excess escrow (maxPrice - winningBid) to the buyer.
     *
     * @param auctionId The auction ID
     */
    function finalize(uint256 auctionId) external nonReentrant {
        Auction storage auction = auctions[auctionId];

        if (auction.buyer == address(0)) revert AuctionNotFound();
        if (auction.state != AuctionState.COMPLETED_BY_PROVIDER) {
            revert AuctionNotInState(AuctionState.COMPLETED_BY_PROVIDER, auction.state);
        }

        // Only the current owner of the winning agent may finalize
        if (IDENTITY_REGISTRY.ownerOf(auction.winningAgentId) != msg.sender) revert NotAgentOwner();

        // Dispute window must have fully elapsed with no buyer action
        if (block.timestamp <= auction.completionTime + DISPUTE_WINDOW) revert DisputeWindowNotExpired();

        uint256 paymentAmount = auction.winningBid;
        uint256 refundAmount = auction.escrowAmount - paymentAmount;

        auction.state = AuctionState.FINALIZED;
        auction.escrowAmount = 0;

        // Pay the provider for the completed service
        USDC_TOKEN.safeTransfer(msg.sender, paymentAmount);

        // Refund any unused escrow (maxPrice - winningBid) to the buyer
        if (refundAmount > 0) {
            USDC_TOKEN.safeTransfer(auction.buyer, refundAmount);
        }

        emit FundsReleased(auctionId, auction.winningAgentId, msg.sender, paymentAmount);
    }

    // ── Edge Case: No-Bid Refund ────────────────────────────────────────────────────────────────

    /**
     * @dev Buyer reclaims full escrow when the auction ended with no bids.
     *      State must be FINALIZED with winningAgentId == 0 (set by endAuction() when no bids).
     *      Equivalent to refundOrderRequest() in Formicarium for the unsigned order case.
     *
     * @param auctionId The auction ID
     */
    function refundBuyer(uint256 auctionId) external nonReentrant {
        Auction storage auction = auctions[auctionId];

        if (auction.buyer == address(0)) revert AuctionNotFound();
        if (msg.sender != auction.buyer) revert NotAuthorized();
        if (auction.state != AuctionState.FINALIZED) revert AuctionNotInState(AuctionState.FINALIZED, auction.state);
        if (auction.winningAgentId != 0) revert NotAuthorized(); // Has a winner — use finalize()
        if (auction.escrowAmount == 0) revert InsufficientEscrow();

        uint256 refundAmount = auction.escrowAmount;
        auction.escrowAmount = 0;

        USDC_TOKEN.safeTransfer(auction.buyer, refundAmount);

        emit FundsReleased(auctionId, 0, auction.buyer, refundAmount);
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @dev Returns the timestamp when bidding ends (auctionStartTime + auctionDuration).
     */
    function getAuctionEndTime(uint256 auctionId) external view returns (uint256) {
        if (auctions[auctionId].buyer == address(0)) revert AuctionNotFound();
        return auctions[auctionId].auctionStartTime + auctions[auctionId].auctionDuration;
    }

    /**
     * @dev Returns true if the auction is in BIDDING state and the deadline has not passed.
     */
    function isAuctionActive(uint256 auctionId) external view returns (bool) {
        Auction storage auction = auctions[auctionId];
        if (auction.buyer == address(0)) revert AuctionNotFound();
        return auction.state == AuctionState.BIDDING &&
               block.timestamp <= auction.auctionStartTime + auction.auctionDuration;
    }

    /**
     * @dev Returns the current leading bid amount.
     */
    function getCurrentWinningBid(uint256 auctionId) external view returns (uint256) {
        if (auctions[auctionId].buyer == address(0)) revert AuctionNotFound();
        return currentWinningBid[auctionId];
    }

    /**
     * @dev Returns the current highest weighted bid score.
     */
    function getCurrentHighestScore(uint256 auctionId) external view returns (uint256) {
        if (auctions[auctionId].buyer == address(0)) revert AuctionNotFound();
        return highestScore[auctionId];
    }

    /**
     * @dev Returns all bids placed on an auction.
     */
    function getAuctionBids(uint256 auctionId) external view returns (Bid[] memory) {
        if (auctions[auctionId].buyer == address(0)) revert AuctionNotFound();
        return auctionBids[auctionId];
    }

    /**
     * @dev Returns the number of bids placed on an auction.
     */
    function getBidCount(uint256 auctionId) external view returns (uint256) {
        if (auctions[auctionId].buyer == address(0)) revert AuctionNotFound();
        return auctionBids[auctionId].length;
    }

    /**
     * @dev Returns seconds remaining in the bidding phase (0 if expired).
     */
    function getTimeRemaining(uint256 auctionId) external view returns (uint256) {
        Auction storage auction = auctions[auctionId];
        if (auction.buyer == address(0)) revert AuctionNotFound();
        uint256 endTime = auction.auctionStartTime + auction.auctionDuration;
        if (block.timestamp >= endTime) return 0;
        return endTime - block.timestamp;
    }

    /**
     * @dev Returns the complete auction struct.
     */
    function getAuctionDetails(uint256 auctionId) external view returns (Auction memory) {
        if (auctions[auctionId].buyer == address(0)) revert AuctionNotFound();
        return auctions[auctionId];
    }

    /**
     * @dev Returns the stored ERC-8004 feedbackAuth for a completed auction.
     *      Buyer uses this to call IReputationRegistry.giveFeedback() for reputation update.
     */
    function getFeedbackAuth(uint256 auctionId) external view returns (bytes memory) {
        if (auctions[auctionId].buyer == address(0)) revert AuctionNotFound();
        return auctions[auctionId].feedbackAuth;
    }

    /**
     * @dev Returns true if feedbackAuth has been stored for this auction.
     */
    function hasFeedbackAuth(uint256 auctionId) external view returns (bool) {
        if (auctions[auctionId].buyer == address(0)) revert AuctionNotFound();
        return auctions[auctionId].feedbackAuth.length > 0;
    }

    /**
     * @dev Returns the timestamp by which the buyer must file a dispute.
     *      Returns 0 if service has not yet been completed.
     */
    function getDisputeDeadline(uint256 auctionId) external view returns (uint256) {
        if (auctions[auctionId].buyer == address(0)) revert AuctionNotFound();
        if (auctions[auctionId].completionTime == 0) return 0;
        return auctions[auctionId].completionTime + DISPUTE_WINDOW;
    }

    // ============ INTERNAL FUNCTIONS ============

    /**
     * @dev Checks agent existence without reverting by catching ownerOf() failure.
     */
    function _agentExists(uint256 agentId) internal view returns (bool) {
        try IDENTITY_REGISTRY.ownerOf(agentId) returns (address owner) {
            return owner != address(0);
        } catch {
            return false;
        }
    }

    /**
     * @dev Calculates the weighted bid score combining reputation and price competitiveness.
     *
     * Formula:
     *   score = w × reputation + (1 − w) × (1 − bidAmount/maxPrice) × 100
     *   where w = reputationWeight / 100
     *
     * Both components normalized to [0, 100]. Result is in [0, 10000] (2-decimal precision).
     * A higher score is better: higher reputation and lower bid price both increase score.
     */
    function _calculateScore(
        uint256 reputation,
        uint256 bidAmount,
        uint256 maxPrice,
        uint256 reputationWeight
    ) internal pure returns (uint256 score) {
        // Reputation already in [0, 100]
        uint256 normalizedReputation = reputation;

        // Price competitiveness: lower bid → higher score. Range [0, 100].
        // Formula: (maxPrice - bidAmount) * 100 / maxPrice
        uint256 normalizedBidScore = ((maxPrice - bidAmount) * SCORE_PRECISION) / maxPrice;

        // Weighted sum; divide by SCORE_PRECISION to keep result in [0, 10000]
        score = (reputationWeight * normalizedReputation +
                (SCORE_PRECISION - reputationWeight) * normalizedBidScore) / SCORE_PRECISION;
    }

    // ── FeedbackAuth decoded fields (avoids stack-too-deep in one large function) ──
    struct FeedbackAuthParams {
        uint256 agentId;
        address client;
        uint64  indexLimit;
        uint256 expiry;
        uint256 chainId;
        address identityRegistry;
        address signer;
    }

    /**
     * @dev Decodes the first 224 bytes of an ERC-8004 feedbackAuth blob.
     */
    function _decodeFeedbackAuth(bytes calldata feedbackAuth)
        internal
        pure
        returns (FeedbackAuthParams memory p)
    {
        (
            p.agentId,
            p.client,
            p.indexLimit,
            p.expiry,
            p.chainId,
            p.identityRegistry,
            p.signer
        ) = abi.decode(
            feedbackAuth[:224],
            (uint256, address, uint64, uint256, uint256, address, address)
        );
    }

    /**
     * @dev Verifies an ERC-8004 feedbackAuth blob before storing it on completeService().
     *
     * ── FeedbackAuth Format ──
     * Total length: 289+ bytes
     *   bytes [0:224]  → abi.encode(agentId, clientAddress, indexLimit, expiry,
     *                                chainId, identityRegistry, signerAddress)
     *   bytes [224:]   → 65-byte EIP-191 or ERC-1271 signature
     *
     * ── Checks Performed ──
     *  1. agentId          == winning agent in this auction
     *  2. clientAddress    == auction buyer
     *  3. expiry           >  block.timestamp  (not expired)
     *  4. chainId          == block.chainid    (no replay across chains)
     *  5. identityRegistry == address(IDENTITY_REGISTRY)
     *  6. Signature is valid: EIP-191 EOA recovery OR ERC-1271 smart-wallet check
     *  7. Signer is the agent owner or an approved operator (ERC-721 approval)
     */
    function _verifyFeedbackAuth(
        bytes calldata feedbackAuth,
        uint256 expectedAgentId,
        address expectedClient,
        address currentOwner
    ) internal view {
        if (feedbackAuth.length < 289) revert InvalidFeedbackAuth();

        // Decode into struct to keep this function's stack usage low
        FeedbackAuthParams memory p = _decodeFeedbackAuth(feedbackAuth);
        bytes memory signature = feedbackAuth[224:];

        // ── Context validation ──
        if (p.agentId != expectedAgentId)               revert InvalidFeedbackAuth();
        if (p.client  != expectedClient)                revert InvalidFeedbackAuth();
        if (p.expiry  <= block.timestamp)               revert FeedbackAuthExpired();
        if (p.chainId != block.chainid)                 revert InvalidFeedbackAuth();
        if (p.identityRegistry != address(IDENTITY_REGISTRY)) revert InvalidFeedbackAuth();

        // ── Signature verification ──
        // Reconstruct message hash using EIP-191 prefix (matches ERC-8004 spec)
        bytes32 messageHash = MessageHashUtils.toEthSignedMessageHash(
            keccak256(
                abi.encode(
                    p.agentId,
                    p.client,
                    p.indexLimit,
                    p.expiry,
                    p.chainId,
                    p.identityRegistry,
                    p.signer
                )
            )
        );

        // Verify signature — supports both EOA (ECDSA) and ERC-1271 smart contract wallets
        address recoveredSigner = ECDSA.recover(messageHash, signature);
        if (recoveredSigner != p.signer) {
            if (p.signer.code.length > 0) {
                // ERC-1271: smart contract wallet verification
                try IERC1271(p.signer).isValidSignature(messageHash, signature) returns (bytes4 magicValue) {
                    if (magicValue != IERC1271.isValidSignature.selector) revert InvalidSignature();
                } catch {
                    revert InvalidSignature();
                }
            } else {
                revert InvalidSignature();
            }
        }

        // ── Authorization check ──
        // Signer must be the agent owner or an approved ERC-721 operator
        if (p.signer != currentOwner) {
            bool isApproved = IDENTITY_REGISTRY.isApprovedForAll(currentOwner, p.signer) ||
                              IDENTITY_REGISTRY.getApproved(expectedAgentId) == p.signer;
            if (!isApproved) revert NotAgentOwner();
        }
    }
}