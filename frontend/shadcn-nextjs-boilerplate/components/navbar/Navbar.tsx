"use client";

import { useGlobalContext } from "@/contexts/GlobalContext";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import { Syncopate } from "next/font/google";
import { ethers } from "ethers";

const syncopate = Syncopate({ weight: "700", subsets: ["latin"] });

const BASE_SEPOLIA_CHAIN_ID = "0x14A34"; // Hexadecimal for 1337702
const BASE_SEPOLIA_PARAMS = {
    chainId: BASE_SEPOLIA_CHAIN_ID,
    chainName: "Base Sepolia Testnet",
    nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://sepolia.base.org"],
    blockExplorerUrls: ["https://sepolia.basescan.org"],
};

export default function Navbar(props: { brandText: string }) {
    const { walletAddress, setWalletAddress } = useGlobalContext(); // Access global state

    const connectWallet = async () => {
        if (typeof window.ethereum !== "undefined") {
            try {
                const provider = new ethers.BrowserProvider(window.ethereum);
                const accounts = await provider.send("eth_requestAccounts", []);
                setWalletAddress(accounts[0]); // Set wallet in context

                const network = await provider.getNetwork();
                if (network.chainId !== BigInt(parseInt(BASE_SEPOLIA_CHAIN_ID, 16))) {
                    await switchToBaseSepolia();
                }
            } catch (error) {
                console.error("Error connecting wallet:", error);
            }
        } else {
            alert("MetaMask is not installed. Please install it to connect.");
        }
    };

    const switchToBaseSepolia = async () => {
        try {
            await window.ethereum.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: BASE_SEPOLIA_CHAIN_ID }],
            });
        } catch (switchError: any) {
            if (switchError.code === 4902) {
                try {
                    await window.ethereum.request({
                        method: "wallet_addEthereumChain",
                        params: [BASE_SEPOLIA_PARAMS],
                    });
                } catch (addError) {
                    console.error("Failed to add Base Sepolia network:", addError);
                }
            } else {
                console.error("Failed to switch network:", switchError);
            }
        }
    };

    return (
        <nav className="fixed left-0 right-0 z-50 flex items-center px-6 py-3 bg-white/0 backdrop-blur-md shadow-md dark:bg-black/50">
            <div className="flex items-center space-x-3">
                <Image src="/logo.png" alt="Logo" width={40} height={40} className="w-10 h-10 rounded-lg" />
                <Link href="/" className={`${syncopate.className} text-[#eab71a] text-center font-bold flex items-center`} style={{ fontSize: "13px" }}>
                    {props.brandText}
                </Link>
            </div>

            <div className="flex items-center space-x-6 ml-auto">
                <Link href="/dashboard/chat/" className="text-[#FDFFFE] hover:text-[#EAB71A] transition">Chat</Link>
                <Link href="/dashboard/production/" className="text-[#FDFFFE] hover:text-[#EAB71A] transition">Production</Link>
                <Link href="/dashboard/help/" className="text-[#FDFFFE] hover:text-[#EAB71A] transition">Help</Link>

                {walletAddress ? (
                    <div className="flex items-center space-x-2">
                        {/*<Image src="/base-sepolia-icon.png" alt="Base Sepolia" width={20} height={20} />*/}
                        <span className="text-[#eab71a] font-bold">
                            {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                        </span>
                    </div>
                ) : (
                    <Button
                        onClick={connectWallet}
                        className="bg-black text-white font-bold py-2 px-4 rounded-md shadow-md border border-white hover:bg-[#eab71a] hover:text-black transition duration-300"
                    >
                        Connect Wallet
                    </Button>
                )}
            </div>
        </nav>
    );
}
