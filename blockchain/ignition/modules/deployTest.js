require("dotenv").config();
const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const TestModule = buildModule("TestModule", (m) => {
  const walletAddress      = process.env.ADDRESS;
  const identityRegistry   = process.env.IDENTITY_REGISTRY_ADDRESS;
  const reputationRegistry = process.env.REPUTATION_REGISTRY_ADDRESS;

  if (!walletAddress)      throw new Error("ADDRESS is missing in .env");
  if (!identityRegistry)   throw new Error("IDENTITY_REGISTRY_ADDRESS is missing in .env");
  if (!reputationRegistry) throw new Error("REPUTATION_REGISTRY_ADDRESS is missing in .env");

  console.log(`Minting initial tokens to:   ${walletAddress}`);
  console.log(`Using IdentityRegistry at:   ${identityRegistry}`);
  console.log(`Using ReputationRegistry at: ${reputationRegistry}`);

  // Deploy mock ERC20 token (1,000,000 tokens) — use BigInt to avoid ethers import
  const paymentToken = m.contract("ERC20Mock", [
    "MockToken",
    "MTK",
    walletAddress,
    1_000_000n * 10n ** 18n,
  ]);

  // Legacy order-book contract
  const formicarium = m.contract("Formicarium", [paymentToken]);

  // Reverse auction contract with ERC-8004 reputation integration
  const reverseAuction = m.contract("ReverseAuction", [
    paymentToken,
    identityRegistry,
    reputationRegistry,
  ]);

  return { paymentToken, formicarium, reverseAuction };
});

module.exports = TestModule;