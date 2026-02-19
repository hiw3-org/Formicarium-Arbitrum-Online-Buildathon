const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * ERC-8004 Integration Test
 * 
 * Tests the full flow of:
 * 1. Registering Hardware Agent on ERC-8004 Identity Registry
 * 2. Registering Design Agent on ERC-8004 Identity Registry  
 * 3. Hardware Agent signing feedback authorization
 * 4. Customer submitting feedback to Reputation Registry
 * 5. Reading and verifying feedback
 * 
 * Run with: npx hardhat test test/ERC8004.test.js
 */

// ERC-8004 contract addresses on Base Sepolia
const IDENTITY_REGISTRY_ADDRESS = "0x7177a6867296406881E20d6647232314736Dd09A";
const REPUTATION_REGISTRY_ADDRESS = "0xB5048e3ef1DA4E04deB6f7d0423D06F63869e322";

// Identity Registry ABI
const IDENTITY_REGISTRY_ABI = [
    {
        "inputs": [{"name": "tokenURI", "type": "string"}],
        "name": "register",
        "outputs": [{"name": "agentId", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"name": "agentId", "type": "uint256"}],
        "name": "tokenURI",
        "outputs": [{"name": "", "type": "string"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"name": "agentId", "type": "uint256"}],
        "name": "ownerOf",
        "outputs": [{"name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
    }
];

// Reputation Registry ABI
const REPUTATION_REGISTRY_ABI = [
    {
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "score", "type": "uint8"},
            {"name": "tag1", "type": "bytes32"},
            {"name": "tag2", "type": "bytes32"},
            {"name": "fileuri", "type": "string"},
            {"name": "filehash", "type": "bytes32"},
            {"name": "feedbackAuth", "type": "bytes"}
        ],
        "name": "giveFeedback",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "clientAddress", "type": "address"}
        ],
        "name": "getLastIndex",
        "outputs": [{"name": "lastIndex", "type": "uint64"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "clientAddress", "type": "address"},
            {"name": "feedbackIndex", "type": "uint64"}
        ],
        "name": "readFeedback",
        "outputs": [
            {"name": "score", "type": "uint8"},
            {"name": "tag1", "type": "bytes32"},
            {"name": "tag2", "type": "bytes32"},
            {"name": "isRevoked", "type": "bool"}
        ],
        "stateMutability": "view",
        "type": "function"
    }
];

describe("ERC-8004 Integration Tests", function () {
    let identityRegistry;
    let reputationRegistry;
    let hardwareAgent;
    let designAgent;
    let customer;
    let hardwareAgentId;
    let designAgentId;
    let feedbackAuth;
    let feedbackIndex;
    
    before(async function () {
        // This test requires a forked Base Sepolia network
        // Configure in hardhat.config.js
        
        // Get signers - use actual wallets from .env
        const privateKey = process.env.PRIVATE_KEY;
        const privateKey2 = process.env.PRIVATE_KEY2;
        
        if (!privateKey || !privateKey2) {
            throw new Error("Both PRIVATE_KEY and PRIVATE_KEY2 required in .env file for ERC721 compatibility");
        }
        
        // Use real keys for proper ERC721 compatibility
        const provider = ethers.provider;
        hardwareAgent = new ethers.Wallet(privateKey, provider);
        designAgent = new ethers.Wallet(privateKey2, provider);
        
        // Customer can use one of the default hardhat accounts (they're already EOAs)
        [customer] = await ethers.getSigners();
        
        console.log("\n📋 Test Accounts:");
        console.log(`  Hardware Agent: ${hardwareAgent.address}`);
        console.log(`  Design Agent:   ${designAgent.address}`);
        console.log(`  Customer:       ${customer.address}`);
        
        // Connect to contracts
        identityRegistry = new ethers.Contract(
            IDENTITY_REGISTRY_ADDRESS,
            IDENTITY_REGISTRY_ABI,
            ethers.provider
        );
        
        reputationRegistry = new ethers.Contract(
            REPUTATION_REGISTRY_ADDRESS,
            REPUTATION_REGISTRY_ABI,
            ethers.provider
        );
    });
    
    describe("Agent Registration", function () {
        it("Should register Hardware Agent on ERC-8004 Identity Registry", async function () {
            this.timeout(30000); // Increase timeout for fork requests
            
            const registrationData = {
                type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
                name: "Formicarium Hardware Agent (Test)",
                description: "3D printing service provider agent for Formicarium marketplace",
                image: "",
                endpoints: [
                    { name: "agentWallet", endpoint: hardwareAgent.address, version: "1.0.0" },
                    { name: "HTTP", endpoint: "http://localhost:8001/api/hardware", version: "1.0.0" }
                ],
                registrations: [],
                supportedTrust: ["reputation"]
            };
            
            const jsonString = JSON.stringify(registrationData);
            const base64Data = Buffer.from(jsonString).toString('base64');
            const tokenURI = `data:application/json;base64,${base64Data}`;
            
            console.log("\n  📝 Registering Hardware Agent...");
            const tx = await identityRegistry.connect(hardwareAgent).register(tokenURI);
            const receipt = await tx.wait();
            
            // Extract agent ID from Transfer event
            let agentId = null;
            for (const log of receipt.logs) {
                try {
                    if (log.topics.length === 4) {
                        agentId = BigInt(log.topics[3]);
                        break;
                    }
                } catch (e) {
                    // Skip
                }
            }
            
            expect(agentId).to.not.be.null;
            console.log(`  ✅ Hardware Agent registered with ID: ${agentId}`);
            
            // Store for later tests
            hardwareAgentId = agentId;
            
            // Verify ownership
            const owner = await identityRegistry.ownerOf(agentId);
            expect(owner).to.equal(hardwareAgent.address);
            
            // Verify token URI
            const uri = await identityRegistry.tokenURI(agentId);
            expect(uri).to.equal(tokenURI);
        });
        
        it("Should register Design Agent on ERC-8004 Identity Registry", async function () {
            this.timeout(30000);
            
            const registrationData = {
                type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
                name: "Formicarium Design Agent (Test)",
                description: "AI-powered 3D design agent for creating custom keychains",
                image: "",
                endpoints: [
                    { name: "agentWallet", endpoint: designAgent.address, version: "1.0.0" },
                    { name: "HTTP", endpoint: "http://localhost:8000/api/design", version: "1.0.0" }
                ],
                registrations: [],
                supportedTrust: ["reputation"]
            };
            
            const jsonString = JSON.stringify(registrationData);
            const base64Data = Buffer.from(jsonString).toString('base64');
            const tokenURI = `data:application/json;base64,${base64Data}`;
            
            console.log("\n  📝 Registering Design Agent...");
            const tx = await identityRegistry.connect(designAgent).register(tokenURI);
            const receipt = await tx.wait();
            
            let agentId = null;
            for (const log of receipt.logs) {
                try {
                    if (log.topics.length === 4) {
                        agentId = BigInt(log.topics[3]);
                        break;
                    }
                } catch (e) {
                    // Skip
                }
            }
            
            expect(agentId).to.not.be.null;
            console.log(`  ✅ Design Agent registered with ID: ${agentId}`);
            
            designAgentId = agentId;
            
            const owner = await identityRegistry.ownerOf(agentId);
            expect(owner).to.equal(designAgent.address);
        });
    });
    
    describe("Feedback Flow", function () {
        it("Should create feedback authorization from Hardware Agent", async function () {
            this.timeout(30000);
            
            expect(hardwareAgentId).to.not.be.undefined;
            
            const lastIndex = await reputationRegistry.getLastIndex(hardwareAgentId, customer.address);
            const nextIndex = Number(lastIndex) + 1;
            
            console.log(`\n  🔐 Creating feedback authorization for customer: ${customer.address}`);
            console.log(`     Next feedback index: ${nextIndex}`);
            
            // Create feedback authorization
            const expiry = Math.floor(Date.now() / 1000) + (168 * 3600); // 1 week
            const chainId = 84532; // Base Sepolia
            
            const types = [
                'uint256',  // agentId
                'address',  // clientAddress
                'uint64',   // indexLimit
                'uint256',  // expiry
                'uint256',  // chainId
                'address',  // identityRegistry
                'address'   // signerAddress
            ];
            
            const values = [
                hardwareAgentId,
                customer.address,
                nextIndex,
                expiry,
                chainId,
                IDENTITY_REGISTRY_ADDRESS,
                hardwareAgent.address
            ];
            
            const packed = ethers.AbiCoder.defaultAbiCoder().encode(types, values);
            const structHash = ethers.keccak256(packed);
            const signature = await hardwareAgent.signMessage(ethers.getBytes(structHash));
            const feedbackAuthBytes = packed + signature.slice(2);
            
            console.log(`  ✅ Feedback authorization created (${feedbackAuthBytes.length} chars)`);
            
            feedbackAuth = feedbackAuthBytes;
            feedbackIndex = nextIndex;
        });
        
        it("Should submit feedback from customer to Hardware Agent", async function () {
            this.timeout(30000);
            
            expect(feedbackAuth).to.not.be.undefined;
            
            const score = 92;
            const tag1 = ethers.encodeBytes32String("excellent");
            const tag2 = ethers.encodeBytes32String("fast");
            const fileUri = "ipfs://QmTestHash123456789";
            const fileHash = ethers.keccak256(ethers.toUtf8Bytes("test-file-content"));
            
            console.log(`\n  ⭐ Customer submitting feedback:`);
            console.log(`     Score: ${score}/100`);
            console.log(`     Tags: excellent, fast`);
            
            const tx = await reputationRegistry.connect(customer).giveFeedback(
                hardwareAgentId,
                score,
                tag1,
                tag2,
                fileUri,
                fileHash,
                feedbackAuth
            );
            
            const receipt = await tx.wait();
            console.log(`  ✅ Feedback submitted in block ${receipt.blockNumber}`);
            
            expect(receipt.status).to.equal(1);
        });
        
        it("Should read and verify the submitted feedback", async function () {
            this.timeout(30000);
            
            console.log(`\n  📊 Reading feedback for Agent ID ${hardwareAgentId}, index ${feedbackIndex}`);
            
            const feedback = await reputationRegistry.readFeedback(
                hardwareAgentId,
                customer.address,
                feedbackIndex
            );
            
            console.log(`     Score: ${feedback[0]}/100`);
            console.log(`     Tag 1: ${ethers.decodeBytes32String(feedback[1])}`);
            console.log(`     Tag 2: ${ethers.decodeBytes32String(feedback[2])}`);
            console.log(`     Revoked: ${feedback[3]}`);
            
            expect(feedback[0]).to.equal(92);
            expect(ethers.decodeBytes32String(feedback[1])).to.equal("excellent");
            expect(ethers.decodeBytes32String(feedback[2])).to.equal("fast");
            expect(feedback[3]).to.equal(false);
        });
    });
    
    after(function () {
        console.log("\n" + "=".repeat(70));
        console.log("✅ All ERC-8004 tests passed!");
        console.log("=".repeat(70));
        console.log("\nSummary:");
        console.log(`  ✓ Hardware Agent ID: ${hardwareAgentId}`);
        console.log(`  ✓ Design Agent ID:   ${designAgentId}`);
        console.log(`  ✓ Feedback submitted and verified`);
        console.log("\n");
    });
});