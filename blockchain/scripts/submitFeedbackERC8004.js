require("dotenv").config();
const hre = require("hardhat");

// ERC-8004 contract addresses on Base Sepolia
const IDENTITY_REGISTRY_ADDRESS = "0x7177a6867296406881E20d6647232314736Dd09A";
const REPUTATION_REGISTRY_ADDRESS = "0xB5048e3ef1DA4E04deB6f7d0423D06F63869e322";

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

// Helper function to create feedback authorization signature
async function createFeedbackAuth(agentWallet, agentId, clientAddress, indexLimit, expiryHours = 168) {
    const expiry = Math.floor(Date.now() / 1000) + (expiryHours * 3600);
    const chainId = 84532; // Base Sepolia chain ID
    
    // Pack FeedbackAuth struct
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
        agentId,
        clientAddress,
        indexLimit,
        expiry,
        chainId,
        IDENTITY_REGISTRY_ADDRESS,
        agentWallet.address
    ];
    
    const packed = hre.ethers.AbiCoder.defaultAbiCoder().encode(types, values);
    const structHash = hre.ethers.keccak256(packed);
    
    // Sign using EIP-191 personal_sign
    const messageHash = hre.ethers.hashMessage(hre.ethers.getBytes(structHash));
    const signature = await agentWallet.signMessage(hre.ethers.getBytes(structHash));
    
    // Combine: packed struct + signature (65 bytes)
    const feedbackAuth = packed + signature.slice(2); // Remove 0x from signature
    
    return feedbackAuth;
}

async function main() {
    // Get arguments
    const agentId = process.argv[2];
    const action = process.argv[3] || "sign"; // "sign" or "submit"
    
    if (!agentId) {
        console.log("\n📖 Usage:");
        console.log("  Step 1 (Agent signs auth):  npx hardhat run scripts/submitFeedbackERC8004.js <AGENT_ID> sign");
        console.log("  Step 2 (Customer submits):  npx hardhat run scripts/submitFeedbackERC8004.js <AGENT_ID> submit <AUTH_HEX>");
        console.log("\nExample:");
        console.log("  npx hardhat run scripts/submitFeedbackERC8004.js 1 sign");
        process.exit(1);
    }

    const provider = new hre.ethers.JsonRpcProvider("https://sepolia.base.org");
    
    if (action === "sign") {
        // STEP 1: Hardware agent signs feedback authorization
        const agentPrivateKey = process.env.PRIVATE_KEY;
        if (!agentPrivateKey) {
            throw new Error("PRIVATE_KEY is missing in .env file");
        }
        
        const agent = new hre.ethers.Wallet(agentPrivateKey, provider);
        
        // Dummy customer address (in real scenario, this would be the actual customer)
        const customerAddress = process.env.ADDRESS2 || "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1";
        
        console.log(`\n🔐 Hardware Agent Creating Feedback Authorization`);
        console.log(`Agent ID: ${agentId}`);
        console.log(`Agent Address: ${agent.address}`);
        console.log(`Customer Address: ${customerAddress}`);
        
        // Get last feedback index for this customer
        const reputationRegistry = new hre.ethers.Contract(
            REPUTATION_REGISTRY_ADDRESS,
            REPUTATION_REGISTRY_ABI,
            provider
        );
        
        const lastIndex = await reputationRegistry.getLastIndex(agentId, customerAddress);
        const nextIndex = Number(lastIndex) + 1;
        
        console.log(`Last feedback index: ${lastIndex}`);
        console.log(`Next feedback index: ${nextIndex}`);
        
        // Create feedback authorization (valid for 1 week)
        const feedbackAuth = await createFeedbackAuth(
            agent,
            agentId,
            customerAddress,
            nextIndex,
            168 // 1 week
        );
        
        console.log(`\n✅ Feedback Authorization Created!`);
        console.log(`Authorization (hex): ${feedbackAuth}`);
        console.log(`\n📋 Customer can now submit feedback using this authorization:`);
        console.log(`npx hardhat run scripts/submitFeedbackERC8004.js ${agentId} submit ${feedbackAuth}`);
        
    } else if (action === "submit") {
        // STEP 2: Customer submits feedback
        const feedbackAuthHex = process.argv[4];
        if (!feedbackAuthHex) {
            throw new Error("Feedback authorization hex is required for submit action");
        }
        
        // Use PRIVATE_KEY2 for customer (or you can use a different env var)
        const customerPrivateKey = process.env.PRIVATE_KEY2 || process.env.PRIVATE_KEY;
        if (!customerPrivateKey) {
            throw new Error("PRIVATE_KEY2 or PRIVATE_KEY is missing in .env file");
        }
        
        const customer = new hre.ethers.Wallet(customerPrivateKey, provider);
        
        console.log(`\n⭐ Customer Submitting Feedback`);
        console.log(`Customer Address: ${customer.address}`);
        console.log(`Agent ID: ${agentId}`);
        
        // Dummy feedback data
        const score = 85; // 0-100
        const tag1 = hre.ethers.encodeBytes32String("quality"); // Max 32 chars
        const tag2 = hre.ethers.encodeBytes32String("speed");   // Max 32 chars
        const fileUri = "ipfs://QmExampleHash123456789"; // Optional IPFS link
        const fileHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("example-file-content")); // 32 bytes
        
        console.log(`\nFeedback Details:`);
        console.log(`  Score: ${score}/100`);
        console.log(`  Tag 1: quality`);
        console.log(`  Tag 2: speed`);
        console.log(`  File URI: ${fileUri}`);
        
        // Connect to Reputation Registry
        const reputationRegistry = new hre.ethers.Contract(
            REPUTATION_REGISTRY_ADDRESS,
            REPUTATION_REGISTRY_ABI,
            customer
        );
        
        console.log(`\n📤 Submitting feedback transaction...`);
        
        // Submit feedback
        const tx = await reputationRegistry.giveFeedback(
            agentId,
            score,
            tag1,
            tag2,
            fileUri,
            fileHash,
            feedbackAuthHex
        );
        
        console.log(`Transaction hash: ${tx.hash}`);
        
        const receipt = await tx.wait();
        console.log(`✅ Feedback submitted in block ${receipt.blockNumber}`);
        console.log(`Explorer: https://sepolia.basescan.org/tx/${tx.hash}`);
        
        // Read back the feedback
        try {
            const lastIndex = await reputationRegistry.getLastIndex(agentId, customer.address);
            const feedback = await reputationRegistry.readFeedback(agentId, customer.address, lastIndex);
            
            console.log(`\n📊 Feedback Verification:`);
            console.log(`  Score: ${feedback[0]}/100`);
            console.log(`  Tag 1: ${hre.ethers.decodeBytes32String(feedback[1])}`);
            console.log(`  Tag 2: ${hre.ethers.decodeBytes32String(feedback[2])}`);
            console.log(`  Revoked: ${feedback[3]}`);
        } catch (e) {
            console.log(`\n⚠️  Could not verify feedback: ${e.message}`);
        }
        
    } else {
        throw new Error(`Unknown action: ${action}. Use 'sign' or 'submit'`);
    }
}

main().catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
});