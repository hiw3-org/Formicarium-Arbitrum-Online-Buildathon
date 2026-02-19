/* eslint-disable */
"use client";

import {Button} from "@/components/ui/button";
import Navbar from "@/components/navbar/Navbar";
import Chat from "@/components/chat/chat";
import OrderSummary from "@/components/card/OrderSummary";
import ApproveCard from "@/components/card/Approve";

interface Props {
}

export default function Home(props: Props) {

    const predefinedResponses = [
        "Hello! How can I help you today?",
        "I'm just a simulated AI, but I can respond with predefined messages.",
        "Tell me more about what you're working on!",
        "That sounds interesting! Could you elaborate?",
    ];

    const handleApprove = () => {
        alert("You approved the image!");
    };

    const handleReject = () => {
        alert("You rejected the image.");
    };

    return (
        <div>
            {/* Navbar */}
            <Navbar brandText="formicarium"/>

            {/* Background Section */}
            <div
                className="w-screen min-h-screen bg-center bg-repeat pt-16"
                style={{backgroundImage: "url('/background.png')"}}
            >

                <div className="container mx-auto px-6 py-10">
                    <div className="grid grid-cols-2 gap-8 ">
                        {/* Left Column (Transparent) */}
                        <div className="bg-transparent md:col-span-1 p-0 rounded-lg shadow-md">
                            <Chat />
                        </div>

                        {/* Right Column (Image & Buttons) */}
                        <div className="md:col-span-1 w-6/7 max-w-lg min-w-[400px]">
                            <div className="pb-5">
                            <ApproveCard />
                            </div>
                            <div className="pb-5">
                            <ApproveCard />
                            </div>
                            <div className="pb-5">
                            <OrderSummary />
                            </div>


                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
