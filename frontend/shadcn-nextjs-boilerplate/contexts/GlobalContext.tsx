"use client";

import {createContext, useContext, useState, ReactNode, useEffect} from "react";
import {fetchBalanceERC20, fetchBalanceETH, fetchContractOwner, fetchOrders, fetchPrinters} from "@/lib/blockchain";

// Define message structure
interface ChatMessage {
    message: string;
    role: string;
}

// Define context type
interface GlobalContextProps {
    walletAddress: string | null;
    setWalletAddress: (address: string | null) => void;
    messages: ChatMessage[];
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    contractOwner: string | null;
    productionOrders:any|null;
    productionPrinters:any|null;
    image2Dmodel : string|null;
    setImage2Dmodel : (image:string|null) => void;
    imageSTLmodel : string|null;
    setImageSTLmodel : (image:string|null) => void;
    stlModel : string|null;
    setSTLModel : (model:string|null) => void;

    balanceETH: bigint | null;
    setBalanceETH: (balance: bigint | null) => void;
    balanceERC20: bigint | null;
    setBalanceERC20: (balance: bigint | null) => void;

    orderDimensions: number[];
    setOrderDimensions: (dimensions: number[]) => void;
    orderQuantity: number;
    setOrderQuantity: (quantity: number) => void;
    orderPrice: number;
    setOrderPrice: (price: number) => void;
    orderFee: number;
    setOrderFee: (fee: number) => void;
    orderDuration: number;
    setOrderDuration: (duration: number) => void;

    orderID: string;
    setOrderID: (orderID: string) => void;
    printerID: string;
    setPrinterID: (printerID: string) => void;

}

// Create context
const GlobalContext = createContext<GlobalContextProps | undefined>(undefined);

// Provider component
export function GlobalProvider({ children }: { children: ReactNode }) {
    const [walletAddress, setWalletAddress] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]); // Store chat messages
    const [contractOwner, setContractOwner] = useState<string | null>(null);

    const [productionOrders, setProductionOrders] = useState<any | null>(null);
    const [productionPrinters, setProductionPrinters] = useState<any | null>(null);

    const [image2Dmodel, setImage2Dmodel] = useState<string | null>(null);
    const [imageSTLmodel, setImageSTLmodel] = useState<string | null>(null);
    const [stlModel, setSTLModel] = useState<string | null>(null);

    const [balanceETH, setBalanceETH] = useState<bigint | null>(null);
    const [balanceERC20, setBalanceERC20] = useState<bigint | null>(null);

    const [orderDimensions, setOrderDimensions] = useState<number[]>([10, 10, 5]);
    const [orderQuantity, setOrderQuantity] = useState<number>(1);
    const [orderPrice, setOrderPrice] = useState<number>(13.42);
    const [orderDuration, setOrderDuration] = useState<number>(0);
    const [orderFee, setOrderFee] = useState<number>(0.07);
    const [orderID, setOrderID] = useState<string>("");
    const [printerID, setPrinterID] = useState<string>("");




    function parseOrderDetails(responseText) {
        // Regular expressions to extract values
        const orderIdPattern = /orderId:\s*(0x[a-fA-F0-9]+)/;
        const printerIdPattern = /printerId:\s*(0x[a-fA-F0-9]+)/;
        const minimalPricePattern = /minimalPrice:\s*([\d.]+)/;
        const durationPattern = /duration:\s*([\d.]+)/;
        const dimensionsPattern = /dimensions:\s*\[([\d,\s]+)\]/;
        const numberOfProductsPattern = /numberOfProducts:\s*(\d+)/;

        // Extract values using regex
        const orderIdMatch = responseText.match(orderIdPattern);
        const printerIdMatch = responseText.match(printerIdPattern);
        const minimalPriceMatch = responseText.match(minimalPricePattern);
        const durationMatch = responseText.match(durationPattern);
        const dimensionsMatch = responseText.match(dimensionsPattern);
        const numberOfProductsMatch = responseText.match(numberOfProductsPattern);

        // Convert extracted values
        return {
            orderId: orderIdMatch ? orderIdMatch[1] : null,
            printerId: printerIdMatch ? printerIdMatch[1] : null,
            minimalPrice: minimalPriceMatch ? parseFloat(minimalPriceMatch[1]) : null,
            duration: durationMatch ? parseFloat(durationMatch[1]) : null,
            dimensions: dimensionsMatch ? dimensionsMatch[1].split(',').map(dim => parseInt(dim.trim())) : null,
            numberOfProducts: numberOfProductsMatch ? parseInt(numberOfProductsMatch[1]) : null
        };
    }

    //Parse the response text to get the order details
    useEffect(() => {
        if (messages.length === 0) return;
        const orderDetails = parseOrderDetails(messages[messages.length - 1].message);
        console.log(orderDetails);
        //If order dimensions are found, update the context
        if (orderDetails.dimensions) {
            setOrderDimensions(orderDetails.dimensions);
        }
        //If the number of products is found, update the context
        if (orderDetails.numberOfProducts) {
            setOrderQuantity(orderDetails.numberOfProducts);
        }
        //If the minimal price is found, update the context
        if (orderDetails.minimalPrice) {
            setOrderPrice(orderDetails.minimalPrice);
        }
        //If the orderID is found, update the context
        if (orderDetails.orderId) {
            setOrderID(orderDetails.orderId);
        }
        //If the printerID is found, update the context
        if (orderDetails.printerId) {
            setPrinterID(orderDetails.printerId);
        }
        //If the duration is found, update the context
        if (orderDetails.duration) {
            setOrderDuration(orderDetails.duration);
        }


    }, [messages]);

    // Fetch contract data when app starts
    useEffect(() => {
        if (!walletAddress) return;
        console.log("Fetching data for wallet address:", walletAddress);
        fetchContractOwner().then((owner) => setContractOwner(owner as string | null));
        fetchPrinters().then((printers) => setProductionPrinters(printers));
        fetchOrders(walletAddress).then((orders) => setProductionOrders(orders));

        fetchBalanceETH(walletAddress).then((balance) => setBalanceETH(balance as bigint | null));
        fetchBalanceERC20(walletAddress).then((balance) => setBalanceERC20(balance as bigint | null));

    }, [walletAddress]);

    return (
        <GlobalContext.Provider value={{
            walletAddress,
            setWalletAddress,
            messages, setMessages,
            contractOwner,
            productionOrders,
            productionPrinters,
            image2Dmodel,
            setImage2Dmodel,
            stlModel,
            setSTLModel,
            imageSTLmodel,
            setImageSTLmodel,
            balanceETH,
            setBalanceETH,
            balanceERC20,
            setBalanceERC20,
            orderDimensions,
            setOrderDimensions,
            orderQuantity,
            setOrderQuantity,
            orderPrice,
            setOrderPrice,
            orderFee,
            setOrderFee,
            orderID,
            setOrderID,
            printerID,
            setPrinterID,
            orderDuration,
            setOrderDuration
        }}>
            {children}
        </GlobalContext.Provider>
    );
}

// Custom hook to use GlobalContext
export function useGlobalContext() {
    const context = useContext(GlobalContext);
    if (!context) {
        throw new Error("useGlobalContext must be used within a GlobalProvider");
    }
    return context;
}
