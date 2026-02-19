require("dotenv").config();
const hre = require("hardhat");

// ERC-8004 contract addresses on Base Sepolia
const IDENTITY_REGISTRY_ADDRESS = "0x7177a6867296406881E20d6647232314736Dd09A";

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

async function main() {
    
    // Use PRIVATE_KEY for hardware agent, PRIVATE_KEY2 for design agent
    const agentPrivateKey = agentType === "design" ? process.env.PRIVATE_KEY2 : process.env.PRIVATE_KEY;
    const agentType = process.argv[2] || "hardware"; // hardware or design

    if (!agentPrivateKey) {
        throw new Error(`${agentType === "design" ? "PRIVATE_KEY2" : "PRIVATE_KEY"} is missing in .env file`);
    }

    // Connect to Base Sepolia
    const provider = new hre.ethers.JsonRpcProvider("https://sepolia.base.org");
    const agent = new hre.ethers.Wallet(agentPrivateKey, provider);

    console.log(`\n🤖 Registering ${agentType} agent on ERC-8004`);
    console.log(`Agent address: ${agent.address}`);

    // Create agent registration data according to ERC-8004 spec
    let registrationData;
    
    if (agentType === "hardware") {
        registrationData = {
            type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
            name: "Formicarium Hardware Agent",
            description: "3D printing service provider agent for Formicarium marketplace. Manages OctoPrint integration and order execution.",
            image: "",
            endpoints: [
                {
                    name: "agentWallet",
                    endpoint: agent.address,
                    version: "1.0.0"
                },
                {
                    name: "HTTP",
                    endpoint: "http://localhost:8001/api/hardware",
                    version: "1.0.0"
                }
            ],
            registrations: [],
            supportedTrust: ["reputation"]
        };
    } else if (agentType === "design") {
        registrationData = {
            type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
            name: "Formicarium Design Agent",
            description: "AI-powered 3D design agent for creating custom keychains and STL files for the Formicarium marketplace.",
            image: "",
            endpoints: [
                {
                    name: "agentWallet",
                    endpoint: agent.address,
                    version: "1.0.0"
                },
                {
                    name: "HTTP",
                    endpoint: "http://localhost:8000/api/design",
                    version: "1.0.0"
                }
            ],
            registrations: [],
            supportedTrust: ["reputation"]
        };
    } else {
        throw new Error("Agent type must be 'hardware' or 'design'");
    }

    // Encode as data URI (base64)
    const jsonString = JSON.stringify(registrationData);
    const base64Data = Buffer.from(jsonString).toString('base64');
    const tokenURI = `data:application/json;base64,${base64Data}`;

    console.log(`\n📝 Registration Data:`);
    console.log(JSON.stringify(registrationData, null, 2));

    // Connect to Identity Registry contract
    const identityRegistry = new hre.ethers.Contract(
        IDENTITY_REGISTRY_ADDRESS,
        IDENTITY_REGISTRY_ABI,
        agent
    );

    console.log(`\n📤 Sending registration transaction...`);
    
    // Register agent
    const tx = await identityRegistry.register(tokenURI);
    console.log(`Transaction hash: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

    // Extract agent ID from Transfer event (ERC-721)
    let agentId = null;
    for (const log of receipt.logs) {
        try {
            // Transfer event has 4 topics: event signature, from, to, tokenId
            if (log.topics.length === 4) {
                agentId = BigInt(log.topics[3]);
                break;
            }
        } catch (e) {
            // Skip if not the right log
        }
    }

    if (agentId === null) {
        console.log("⚠️  Could not extract agent ID from receipt");
        console.log("Check the transaction on BaseScan:");
        console.log(`https://sepolia.basescan.org/tx/${tx.hash}`);
    } else {
        console.log(`\n🎉 Agent registered successfully!`);
        console.log(`Agent ID: ${agentId.toString()}`);
        console.log(`Owner: ${agent.address}`);
        console.log(`Explorer: https://sepolia.basescan.org/tx/${tx.hash}`);
        
        // Verify registration
        try {
            const owner = await identityRegistry.ownerOf(agentId);
            const uri = await identityRegistry.tokenURI(agentId);
            
            console.log(`\n✅ Verification:`);
            console.log(`   Owner: ${owner}`);
            console.log(`   Token URI (first 100 chars): ${uri.substring(0, 100)}...`);
        } catch (e) {
            console.log(`\n⚠️  Verification failed: ${e.message}`);
        }
        
        console.log(`\n💾 IMPORTANT: Save this Agent ID for future operations!`);
        console.log(`   Agent ID: ${agentId.toString()}`);
    }
}

main().catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
});