import Web3 from "web3";
import contractABI from "./Formicarium.json"; // Import ABI
import contractERC20ABI from "@openzeppelin/contracts/build/contracts/ERC20.json"; // Import ERC20 ABI

const RPC_URL = "https://sepolia.base.org"; // Base Sepolia RPC URL
const CONTRACT_ADDRESS = "0xa68d23AfC79A9acF2773a2dDd24412eDdf6E13d7"; // Replace with your contract address
const CONTRACT_ERC20_ADDRESS = "0x02BA94d06E5C9e6B7DB18eD80c475447939907b1";

// ERC-8004 Contract addresses on Base Sepolia
const IDENTITY_REGISTRY_ADDRESS = "0x7177a6867296406881E20d6647232314736Dd09A";
const REPUTATION_REGISTRY_ADDRESS = "0xB5048e3ef1DA4E04deB6f7d0423D06F63869e322";

// ERC-8004 Reputation Registry ABI (minimal required functions)
const REPUTATION_REGISTRY_ABI = [
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
    }
];

// Interface for decoded FeedbackAuth
interface FeedbackAuth {
    agentId: string;
    clientAddress: string;
    indexLimit: string;
    expiry: string;
    chainId: string;
    identityRegistry: string;
    signerAddress: string;
}

// Interface for pending feedback order
interface PendingFeedbackOrder {
    orderId: string;
    providerId: string;
    completedTimestamp: string;
    feedbackAuth: FeedbackAuth;
    currentIndex: string;
    canSubmitFeedback: boolean;
}

// Interface for feedback submission
interface FeedbackSubmission {
    score: number; // 0-100
    tag1?: string;
    tag2?: string;
    comment?: string;
    fileUri?: string;
    fileHash?: string;
}

// Interface for feedback result
interface FeedbackResult {
    success: boolean;
    transactionHash?: string;
    error?: string;
}

// Initialize Web3 provider
const web3 = new Web3(window.ethereum); // Use MetaMask provider

// Function to load contract (Read-only)
export function getContract() {
    return new web3.eth.Contract(contractABI.abi, CONTRACT_ADDRESS);
}

// Function to load ERC20 contract (Read-only)
export function getERC20Contract() {
    return new web3.eth.Contract(contractERC20ABI.abi, CONTRACT_ERC20_ADDRESS);
}

// Function to load ERC-8004 Reputation Registry contract (Read-only)
export function getReputationRegistryContract() {
    return new web3.eth.Contract(REPUTATION_REGISTRY_ABI, REPUTATION_REGISTRY_ADDRESS);
}

// ✅ Function to fetch the contract owner
export async function fetchContractOwner() {
    try {
        const contract = getContract();
        const owner = await contract.methods.owner().call();
        return owner;
    } catch (error) {
        console.error("Error fetching contract data:", error);
        return null;
    }
}

// ✅ Function to fetch orders (from the connected MetaMask address)
export async function fetchOrders(address:string) {
    try {
        const contract = getContract();
        console.log("Fetching orders from address:", address);
        const orders = await contract.methods.getYourOrders().call({ from: address });
        console.log(orders);
        return orders;
    } catch (error) {
        console.log("Error fetching orders data", error);
    }
}

// ✅ Function to fetch printers (read-only)
export async function fetchPrinters() {
    try {
        const contract = getContract();
        const printers = await contract.methods.getAllPrinters().call();
        console.log(printers);
        return printers;
    } catch (error) {
        console.log("Error fetching printer data", error);
    }
}

// ✅ Function to fetch ETH balance of a MetaMask address
export async function fetchBalanceETH(address) {
    try {
        if (!address) return null;
        const balanceWei = await web3.eth.getBalance(address);
        return web3.utils.fromWei(balanceWei, "ether"); // Convert from Wei to ETH
    } catch (error) {
        console.error("Error fetching ETH balance:", error);
        return null;
    }
}

export async function fetchBalanceERC20(address: string): Promise<number | null> {
    try {
        if (!address) return null;

        const contract = getERC20Contract();
        const balance: bigint | string = await contract.methods.balanceOf(address).call();

        // ✅ Ensure `balance` is properly converted
        return Number(web3.utils.fromWei(balance.toString(), "ether"));
    } catch (error) {
        console.error("Error fetching ERC20 balance:", error);
        return null;
    }
}

// ✅ Function to post an order using MetaMask account
export async function placeOrder(address:string ,orderID:string, printerID:string, minPrice:number, actualPrice:number, duration:number) {
    try {
        const contract = getContract();
        const minPriceInt = (minPrice*1e18).toFixed(0);
        const actualPriceInt = (actualPrice*1e18).toFixed(0);
        const orderDurationSeconds = (duration * 3600).toFixed(0); // Convert minutes to seconds


        //Approve to spend ERC20 tokens
        const erc20Contract = getERC20Contract();
        const approveTx = await erc20Contract.methods.approve(CONTRACT_ADDRESS, actualPriceInt).send({ from: address });
        console.log("Approved to spend ERC20 tokens:", approveTx.transactionHash);

        console.log("Posting order from address:", address);
        const tx = await contract.methods.createOrder(orderID, printerID, minPriceInt, actualPriceInt, orderDurationSeconds).send({ from: address });

        console.log("Transaction hash:", tx.transactionHash);
        return tx.transactionHash;
    } catch (error) {
        console.log("Error sending order data", error);
    }
}

// ✅ Function to decode FeedbackAuth bytes
function decodeFeedbackAuth(feedbackAuthBytes: string): FeedbackAuth | null {
    try {
        // Remove '0x' prefix if present
        const cleanBytes = feedbackAuthBytes.startsWith('0x') ? feedbackAuthBytes.slice(2) : feedbackAuthBytes;
        
        // FeedbackAuth struct is encoded as:
        // uint256 agentId (32 bytes)
        // address clientAddress (32 bytes, padded)
        // uint64 indexLimit (32 bytes, padded)
        // uint256 expiry (32 bytes)
        // uint256 chainId (32 bytes)
        // address identityRegistry (32 bytes, padded)
        // address signerAddress (32 bytes, padded)
        // + signature (65 bytes) - we don't need this for decoding
        
        // Each field is 32 bytes (64 hex chars)
        if (cleanBytes.length < 224) { // 7 * 32 * 2 = 448 hex chars minimum for struct
            console.error("FeedbackAuth bytes too short");
            return null;
        }
        
        const structBytes = '0x' + cleanBytes.slice(0, 224); // First 224 hex chars (7 * 32 bytes)
        
        // Decode using web3 ABI decoder
        const decoded = web3.eth.abi.decodeParameters(
            ['uint256', 'address', 'uint64', 'uint256', 'uint256', 'address', 'address'],
            structBytes
        );
        
        return {
            agentId: decoded[0].toString(),
            clientAddress: decoded[1],
            indexLimit: decoded[2].toString(),
            expiry: decoded[3].toString(),
            chainId: decoded[4].toString(),
            identityRegistry: decoded[5],
            signerAddress: decoded[6]
        };
    } catch (error) {
        console.error("Error decoding FeedbackAuth:", error);
        return null;
    }
}

// ✅ Function to check if user has pending feedback to submit
export async function checkPendingFeedback(userAddress: string): Promise<PendingFeedbackOrder[]> {
    try {
        if (!userAddress) return [];
        
        const contract = getContract();
        const reputationContract = getReputationRegistryContract();
        
        // Get all orders for the user
        const orders = await contract.methods.getYourOrders().call({ from: userAddress });
        
        const pendingFeedbackOrders: PendingFeedbackOrder[] = [];
        
        for (const orderId of orders) {
            try {
                // Get order details
                const order = await contract.methods.orders(orderId).call();
                
                // Check if order is completed (status = 3)
                const isCompleted = order[5] === '3'; // status is 6th field (index 5)
                
                if (!isCompleted) continue;
                
                // Check if order has feedback auth
                const hasFeedbackAuth = await contract.methods.hasFeedbackAuth(orderId).call();
                
                if (!hasFeedbackAuth) continue;
                
                // Get feedback auth
                const feedbackAuthBytes = await contract.methods.getFeedbackAuth(orderId).call();
                
                if (!feedbackAuthBytes || feedbackAuthBytes === '0x') continue;
                
                // Decode feedback auth
                const decodedAuth = decodeFeedbackAuth(feedbackAuthBytes);
                
                if (!decodedAuth) continue;
                
                // Check if feedback auth is for this user
                if (decodedAuth.clientAddress.toLowerCase() !== userAddress.toLowerCase()) continue;
                
                // Get current index for this user-provider pair from ERC-8004
                const currentIndex = await reputationContract.methods.getLastIndex(
                    decodedAuth.agentId,
                    userAddress
                ).call();
                
                // Check if user can submit feedback (indexLimit > currentIndex)
                const indexLimit = parseInt(decodedAuth.indexLimit);
                const currentIndexNum = parseInt(currentIndex.toString());
                const canSubmitFeedback = indexLimit > currentIndexNum;
                
                // Check if feedback auth is not expired
                const now = Math.floor(Date.now() / 1000);
                const expiry = parseInt(decodedAuth.expiry);
                const isNotExpired = now < expiry;
                
                if (canSubmitFeedback && isNotExpired) {
                    pendingFeedbackOrders.push({
                        orderId: orderId,
                        providerId: order[3], // providerId is 4th field (index 3)
                        completedTimestamp: order[6], // completedAt is 7th field (index 6)
                        feedbackAuth: decodedAuth,
                        currentIndex: currentIndex.toString(),
                        canSubmitFeedback: true
                    });
                }
                
            } catch (orderError) {
                console.error(`Error processing order ${orderId}:`, orderError);
                continue;
            }
        }
        
        console.log(`Found ${pendingFeedbackOrders.length} orders with pending feedback`);
        return pendingFeedbackOrders;
        
    } catch (error) {
        console.error("Error checking pending feedback:", error);
        return [];
    }
}

// ✅ Function to get order details with feedback auth info
export async function getOrderWithFeedbackInfo(orderId: string, userAddress: string) {
    try {
        const contract = getContract();
        const reputationContract = getReputationRegistryContract();
        
        // Get order details
        const order = await contract.methods.orders(orderId).call();
        
        // Check if order has feedback auth
        const hasFeedbackAuth = await contract.methods.hasFeedbackAuth(orderId).call();
        
        let feedbackInfo: {
            feedbackAuth: FeedbackAuth;
            currentIndex: string;
            canSubmitFeedback: boolean;
            isExpired: boolean;
            expiryDate: string;
        } | null = null;
        
        if (hasFeedbackAuth) {
            // Get feedback auth
            const feedbackAuthBytes = await contract.methods.getFeedbackAuth(orderId).call();
            
            if (feedbackAuthBytes && feedbackAuthBytes !== '0x') {
                // Decode feedback auth
                const decodedAuth = decodeFeedbackAuth(feedbackAuthBytes);
                
                if (decodedAuth && decodedAuth.clientAddress.toLowerCase() === userAddress.toLowerCase()) {
                    // Get current index
                    const currentIndex = await reputationContract.methods.getLastIndex(
                        decodedAuth.agentId,
                        userAddress
                    ).call();
                    
                    const indexLimit = parseInt(decodedAuth.indexLimit);
                    const currentIndexNum = parseInt(currentIndex.toString());
                    const canSubmitFeedback = indexLimit > currentIndexNum;
                    
                    // Check expiry
                    const now = Math.floor(Date.now() / 1000);
                    const expiry = parseInt(decodedAuth.expiry);
                    const isNotExpired = now < expiry;
                    
                    feedbackInfo = {
                        feedbackAuth: decodedAuth,
                        currentIndex: currentIndex.toString(),
                        canSubmitFeedback: canSubmitFeedback && isNotExpired,
                        isExpired: !isNotExpired,
                        expiryDate: new Date(expiry * 1000).toISOString()
                    };
                }
            }
        }
        
        return {
            orderId,
            order,
            feedbackInfo
        };
        
    } catch (error) {
        console.error("Error getting order with feedback info:", error);
        return null;
    }
}

// ✅ Helper function to convert string to bytes32
function stringToBytes32(str: string): string {
    if (!str) return "0x0000000000000000000000000000000000000000000000000000000000000000";
    
    // Convert string to bytes and pad to 32 bytes
    const bytes = web3.utils.asciiToHex(str);
    return web3.utils.padRight(bytes, 64); // 64 hex chars = 32 bytes
}

// ✅ Function to submit feedback to ERC-8004 Reputation Registry
export async function submitFeedback(
    orderId: string,
    userAddress: string,
    feedback: FeedbackSubmission
): Promise<FeedbackResult> {
    try {
        // Validate input
        if (!orderId || !userAddress || !feedback) {
            return { success: false, error: "Missing required parameters" };
        }

        if (feedback.score < 0 || feedback.score > 100) {
            return { success: false, error: "Score must be between 0 and 100" };
        }

        // Get order with feedback info
        const orderInfo = await getOrderWithFeedbackInfo(orderId, userAddress);
        
        if (!orderInfo || !orderInfo.feedbackInfo) {
            return { success: false, error: "Order not found or no feedback authorization available" };
        }

        if (!orderInfo.feedbackInfo.canSubmitFeedback) {
            if (orderInfo.feedbackInfo.isExpired) {
                return { success: false, error: "Feedback authorization has expired" };
            }
            return { success: false, error: "Cannot submit feedback - already submitted or invalid authorization" };
        }

        const { feedbackAuth } = orderInfo.feedbackInfo;
        
        // Prepare feedback parameters
        const agentId = feedbackAuth.agentId;
        const score = Math.floor(feedback.score); // Ensure integer
        const tag1 = stringToBytes32(feedback.tag1 || "");
        const tag2 = stringToBytes32(feedback.tag2 || "");
        const fileUri = feedback.fileUri || "";
        
        // Calculate file hash if comment is provided but no fileUri
        let fileHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
        if (feedback.comment && !feedback.fileUri) {
            // Create a simple hash of the comment
            fileHash = web3.utils.keccak256(feedback.comment);
        } else if (feedback.fileHash) {
            // Use provided file hash
            fileHash = feedback.fileHash.startsWith('0x') ? feedback.fileHash : '0x' + feedback.fileHash;
        }

        // Get the original feedbackAuth bytes from the order
        const contract = getContract();
        const feedbackAuthBytes = await contract.methods.getFeedbackAuth(orderId).call();
        
        if (!feedbackAuthBytes || feedbackAuthBytes === '0x') {
            return { success: false, error: "Feedback authorization not found in order" };
        }

        // Get reputation contract
        const reputationContract = getReputationRegistryContract();
        
        console.log("🔄 Submitting feedback to ERC-8004...");
        console.log(`Agent ID: ${agentId}`);
        console.log(`Score: ${score}/100`);
        console.log(`Tag 1: ${feedback.tag1 || 'none'}`);
        console.log(`Tag 2: ${feedback.tag2 || 'none'}`);
        
        // Submit feedback transaction
        const tx = await reputationContract.methods.giveFeedback(
            agentId,
            score,
            tag1,
            tag2,
            fileUri,
            fileHash,
            feedbackAuthBytes
        ).send({ 
            from: userAddress,
            gas: 300000 // Increased gas limit for feedback submission
        });

        console.log("✅ Feedback submitted successfully!");
        console.log("Transaction hash:", tx.transactionHash);

        return {
            success: true,
            transactionHash: tx.transactionHash
        };

    } catch (error: any) {
        console.error("❌ Error submitting feedback:", error);
        
        // Parse common error messages
        let errorMessage = "Failed to submit feedback";
        
        if (error.message) {
            if (error.message.includes("FeedbackAuth expired")) {
                errorMessage = "Feedback authorization has expired";
            } else if (error.message.includes("FeedbackAuth already used")) {
                errorMessage = "Feedback has already been submitted for this order";
            } else if (error.message.includes("Invalid signature")) {
                errorMessage = "Invalid feedback authorization signature";
            } else if (error.message.includes("User denied")) {
                errorMessage = "Transaction was cancelled by user";
            } else if (error.message.includes("insufficient funds")) {
                errorMessage = "Insufficient funds for transaction";
            } else {
                errorMessage = error.message;
            }
        }

        return {
            success: false,
            error: errorMessage
        };
    }
}

// ✅ Function to submit feedback for a specific order (convenience wrapper)
export async function submitOrderFeedback(
    orderId: string,
    userAddress: string,
    score: number,
    tag1?: string,
    tag2?: string,
    comment?: string
): Promise<FeedbackResult> {
    return submitFeedback(orderId, userAddress, {
        score,
        tag1,
        tag2,
        comment
    });
}

// ✅ Function to check if feedback can be submitted for an order
export async function canSubmitFeedbackForOrder(orderId: string, userAddress: string): Promise<boolean> {
    try {
        const orderInfo = await getOrderWithFeedbackInfo(orderId, userAddress);
        return orderInfo?.feedbackInfo?.canSubmitFeedback || false;
    } catch (error) {
        console.error("Error checking feedback eligibility:", error);
        return false;
    }
}
