require("dotenv").config();
const hre = require("hardhat");

async function main() {
    const formicariumAddress = process.env.FORMICARIUM_TEST_ADDRESS;
    const printerPrivateKey = process.env.PRIVATE_KEY;
    const printerAddress = process.env.ADDRESS;

    if (!formicariumAddress || !printerPrivateKey || !printerAddress) {
        throw new Error("Missing environment variables! Ensure FORMICARIUM_TEST_ADDRESS, PRINTER_PRIVATE_KEY, and PRINTER_ADDRESS are set in .env file");
    }

    // Connect to the blockchain using the printer's private key
    const provider = hre.ethers.provider;
    const printer = new hre.ethers.Wallet(printerPrivateKey, provider);

    console.log(`Using printer account: ${printer.address}`);

    // Load the Formicarium contract
    const formicarium = await hre.ethers.getContractAt("Formicarium", formicariumAddress, printer);

    // Fetch all orders assigned to this provider
    console.log("🔄 Fetching provider's orders...");
    const orderIds = await formicarium.getProviderOrders(printerAddress);

    if (orderIds.length === 0) {
        console.log("⚠️ No active orders found for this provider. Exiting...");
        return;
    }

    console.log(`📌 Found ${orderIds.length} orders. Checking which need execution and completion...`);

    const currentTime = Math.floor(Date.now() / 1000); // Get current block timestamp

    for (let orderId of orderIds) {
        const orderData = await formicarium.orders(orderId);

        // Destructure order details
        const {
            ID,
            duration,
            startTime,
            isSigned,
            isCompletedProvider
        } = orderData;

        const completionDeadline = Number(startTime) + Number(duration);

        if (isSigned && !isCompletedProvider && startTime != 0 && currentTime <= completionDeadline) {
            console.log(`🚀 Marking order as completed...`);
            try {
                // Create a dummy feedbackAuth for demonstration
                // In a real scenario, this would be properly generated according to ERC-8004 spec
                const feedbackAuth = hre.ethers.toUtf8Bytes("dummy-feedback-auth-placeholder");
                
                const tx = await formicarium.connect(printer).completeOrderProvider(orderId, feedbackAuth);
                await tx.wait();
                console.log(`✅ Order ${orderId} successfully marked as completed with feedbackAuth!`);
            } catch (error) {
                console.error(`❌ Failed to complete order ${orderId}:`, error.message);
            }
            return; // Stop script after completing one order
        }
    }

    console.log("🎯 No orders were completed this run.");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});