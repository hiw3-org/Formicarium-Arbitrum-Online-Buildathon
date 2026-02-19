"use client";

import { Button } from "@/components/ui/button";
import { useGlobalContext } from "@/contexts/GlobalContext";

import {placeOrder} from "@/lib/blockchain"



export default function OrderSummary() {
    const { orderDimensions, orderQuantity, orderPrice, orderID, printerID, walletAddress , orderDuration} = useGlobalContext();

    function handlePlaceOrder() {
        //Check if all order details are correct
        if (orderDimensions.length !== 3) {
            alert("Please define the dimensions of your order");
            return;
        }
        if (orderQuantity <= 0) {
            alert("Please define the quantity of your order");
            return;
        }
        if (orderPrice <= 0) {
            alert("Please define the price of your order");
            return;
        }
        if (orderID === "") {
            alert("Please define the ID of your order");
            return;
        }
        if (printerID === "") {
            alert("Please define the printerID of your order");
            return;
        }
        if (!walletAddress) {
            alert("Please connect your wallet");
            return;
        }
        //CLC order duration
        placeOrder(walletAddress, orderID, printerID, orderPrice, orderPrice, orderDuration).then((result) => {
            if (result) {
                alert("Order placed successfully");
            } else {
                alert("Order failed");
            }
        });

    }

    return (
        <div className="bg-[#ebbf3a] p-5 rounded-lg shadow-md flex border-4 border-[#68510A] w-full max-w-2xl">
            <div className="flex flex-col w-full">
                {/* Order Summary Title */}
                <div className="p-2 font-bold text-[24px] text-center">Order Summary</div>

                {/* Instruction */}
                <div className="p-2 text-[12px] text-center">
                    Check the dimensions and quantity. If that is not right, define the changes in the Chat.
                </div>

                {/* Dimensions Section */}
                <div className="p-2 pb-0">
                    <p className="text-[16px]">Dimensions</p>
                    <div className="text-[20px] flex flex-row items-end space-x-2">
                        <div className="bg-[#eab71a] px-6 py-1 rounded-md text-black text-center">{orderDimensions[0]}</div>
                        <div className="pb-1">x</div>
                        <div className="bg-[#eab71a] px-6 py-1 rounded-md text-black text-center">{orderDimensions[1]}</div>
                        <div className="pb-1">x</div>
                        <div className="bg-[#eab71a] px-6 py-1 rounded-md text-black text-center">{orderDimensions[2]}</div>
                        <div className="pb-1">mm</div>
                    </div>
                </div>

                {/* Quantity Section */}
                <div className="flex flex-row w-full p-2 pb-0 items-center text-[16px]">
                    <p className="font-semibold">Quantity:</p>
                    <p className="text-black font-semibold pl-4">{orderQuantity}</p>
                </div>

                {/* Price & Fee Section */}
                <div className="grid grid-cols-2 items-center w-full bg-[#D9D9D9] p-3 rounded-md border-2 border-black border-opacity-20">
                    {/* Left Column (Price & Fee) */}
                    <div className="flex flex-col space-y-2">
                        {/* Price Section */}
                        <div>
                            <p className="text-black">Price for your product:</p>
                            <p className="text-black text-[24px]">${orderPrice.toFixed(2)}</p>
                        </div>
                    </div>

                    {/* Right Column (Button) */}
                    <div className="flex justify-end items-end">
                        <Button
                            onClick={handlePlaceOrder}
                            className="bg-[#eab71a] text-black font-bold py-2 px-6 rounded-sm shadow-md transition border border-black pl-10 pr-10"
                        >
                            BUY
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
