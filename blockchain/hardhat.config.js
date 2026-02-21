import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";

dotenv.config();

export default {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  networks: {
    hardhat: {
      forking: {
        url: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
        // Optional: pin to a specific block for reproducibility
        // blockNumber: 14390000
      },
      chainId: 84532, // Keep Base Sepolia chain ID for signature compatibility
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 84532,
    },
    baseSepolia: {
      url: `https://sepolia.base.org`, // Base Sepolia RPC
      accounts: [process.env.PRIVATE_KEY],
      chainId: 84532, // Base Sepolia chain ID
    },
    baseMain: {
      url: `https://mainnet.base.org`, // Base Mainnet RPC
      accounts: [process.env.PRIVATE_KEY_MAIN],
      chainId: 8453, // Base Mainnet chain ID
    },
    arbitrumSepolia: {
      url: `https://sepolia-rollup.arbitrum.io/rpc`, // Arbitrum Sepolia RPC
      accounts: [process.env.PRIVATE_KEY],
      chainId: 421614, // Arbitrum Sepolia chain ID
    },
  },
};
