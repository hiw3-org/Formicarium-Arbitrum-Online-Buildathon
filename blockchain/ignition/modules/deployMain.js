require("dotenv").config();
const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const MainModule = buildModule("MainModule", (m) => {
  const usdc               = process.env.USDC_ADDRESS;
  const identityRegistry   = process.env.IDENTITY_REGISTRY_ADDRESS;
  const reputationRegistry = process.env.REPUTATION_REGISTRY_ADDRESS;

  if (!usdc)               throw new Error("USDC_ADDRESS is missing in .env");
  if (!identityRegistry)   throw new Error("IDENTITY_REGISTRY_ADDRESS is missing in .env");
  if (!reputationRegistry) throw new Error("REPUTATION_REGISTRY_ADDRESS is missing in .env");

  console.log(`Using USDC at:               ${usdc}`);
  console.log(`Using IdentityRegistry at:   ${identityRegistry}`);
  console.log(`Using ReputationRegistry at: ${reputationRegistry}`);


  // Legacy order-book contract
  const formicarium = m.contract("Formicarium", [usdc]);

  // Reverse auction contract with ERC-8004 reputation integration
  const reverseAuction = m.contract("ReverseAuction", [
    usdc,
    identityRegistry,
    reputationRegistry,
  ]);

  return { formicarium, reverseAuction };
});

module.exports = MainModule;
