from web3 import Web3
import os
from dotenv import load_dotenv
import json
import asyncio
from langchain.tools import tool
import httpx
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from agents.agent_ai.erc8004_tools import ERC8004Client, format_agent_endpoint

load_dotenv()

print(os.getenv("ADDRESS"))

# Determine the relative path to the G-code file
base_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../blockchain/artifacts/contracts/Formicarium.sol/"))
sc_file_path = os.path.join(base_path, "Formicarium.json")

# Load ABI from JSON file
with open(sc_file_path, "r") as file:
    contract_data = json.load(file)

# Extract ABI
abi = contract_data["abi"]

RPC_URL = "https://sepolia.base.org"
web3 = Web3(Web3.HTTPProvider(RPC_URL))

contract_address = os.getenv("FORMICARIUM_TEST_ADDRESS")
printer_address = os.getenv("ADDRESS")
private_key = os.getenv("PRIVATE_KEY")
address_2 = os.getenv("ADDRESS2")
private_key_2 = os.getenv("PRIVATE_KEY2")
contract = web3.eth.contract(address=contract_address, abi=abi)

@tool("sign_order", return_direct=True)
def sign_order(order_id):
    """Sign an order with the provided ID.

    Args:
        order_id (str): Order ID (Ethereum address) to be signed.
    """
    checksum_order_id = web3.to_checksum_address(order_id)
    
    try:
        # Get the nonce for the printer address
        nonce = web3.eth.get_transaction_count(printer_address)

        # Build the transaction
        tx = contract.functions.signOrder(checksum_order_id).build_transaction({
            'from': printer_address,
            'gas': 200000,
            'gasPrice': web3.eth.gas_price,
            'nonce': nonce
        })

        # Sign the transaction using the private key
        signed_tx = web3.eth.account.sign_transaction(tx, private_key)

        # Log the signed transaction to inspect its attributes
        # print(f"Signed transaction: {signed_tx}")

        # Send the raw transaction (convert to hex if necessary)
        tx_hash = web3.eth.send_raw_transaction(signed_tx.raw_transaction)

        # Print the transaction hash
        print(f"Order {checksum_order_id} signed! Transaction hash: {web3.to_hex(tx_hash)}")

        return web3.to_hex(tx_hash)  # Return the transaction hash for confirmation

    except Exception as e:
        print(f"Error signing order {checksum_order_id}: {e}")
        return f"Error signing order: {e}"

# Function to execute a new order
@tool("execute_new_order", return_direct=True)
def execute_new_order():
    """Execute a new order.
    """
    try:
        nonce = web3.eth.get_transaction_count(printer_address)
        tx = contract.functions.executeNewOrder().build_transaction({
            'from': printer_address,
            'gas': 200000,
            'gasPrice': web3.eth.gas_price,
            'nonce': nonce
        })

        signed_tx = web3.eth.account.sign_transaction(tx, private_key)
        tx_hash = web3.eth.send_raw_transaction(signed_tx.raw_transaction)

        print(f"🚀 New order executed! Transaction hash: {web3.to_hex(tx_hash)}")

    except Exception as e:
        print(f"❌ Error executing new order: {e}")

# Function to complete an order as a provider
@tool("complete_order_provider", return_direct=True)
def complete_order_provider(order_id):
    """Complete an order as a provider.

    Args:
        order_id (_type_): _description_
    """
    checksum_order_id = web3.to_checksum_address(order_id)
    try:
        nonce = web3.eth.get_transaction_count(printer_address)
        tx = contract.functions.completeOrderProvider(checksum_order_id).build_transaction({
            'from': printer_address,
            'gas': 200000,
            'gasPrice': web3.eth.gas_price,
            'nonce': nonce
        })

        signed_tx = web3.eth.account.sign_transaction(tx, private_key)
        tx_hash = web3.eth.send_raw_transaction(signed_tx.raw_transaction)

        print(f"✅ Order {checksum_order_id} completed! Transaction hash: {web3.to_hex(tx_hash)}")

    except Exception as e:
        print(f"❌ Error completing order {checksum_order_id}: {e}")

# Function to transfer funds to the provider
@tool("transfer_funds_provider", return_direct=True)
def transfer_funds_provider(order_id):
    """Transfer funds to the provider.

    Args:
        order_id (_type_): _description_
    """
    try:
        nonce = web3.eth.get_transaction_count(printer_address)
        tx = contract.functions.transferFundsProivder(order_id).build_transaction({
            'from': printer_address,
            'gas': 200000,
            'gasPrice': web3.eth.gas_price,
            'nonce': nonce
        })

        signed_tx = web3.eth.account.sign_transaction(tx, private_key)
        tx_hash = web3.eth.send_raw_transaction(signed_tx.rawTransaction)

        print(f"💰 Funds transferred for order {order_id}! Transaction hash: {web3.to_hex(tx_hash)}")

    except Exception as e:
        print(f"❌ Error transferring funds for order {order_id}: {e}")
        
        
@tool("get_active_orders", return_direct=True)
def get_active_orders():
    """Retrieve the list of active orders for the current provider address."""
    try:
        # Call the getActiveOrders function in the contract
        active_orders = contract.functions.getActiveOrders().call({
            'from': printer_address  # Set the msg.sender in Solidity
        })
        
        # Process and return the orders
        if active_orders:
            return active_orders
        else:
            return "No active orders found, length 0."
    
    except Exception as e:
        print(f"Error fetching active orders for provider {printer_address}: {e}")
        return []

# Event Handler
async def handle_event(event):
    if event.event == "OrderCreated":
        # SPROŽIMO POSTOPEK PODPISA NAROČILA
            # - Prvo pogledamo ali parametri naročila ustrezajo (enako kot pri API klicu)
            # - Podpišemo na SC
        if event['args']['printerId'] == printer_address:
            prompt = f"[Event trigger], OrderCreated: {event['args']}"
            async with httpx.AsyncClient() as client:
                response = await client.post("http://localhost:8080/api/create_order_request", json={"prompt": prompt})
            if response.status_code != 200:
                print(f"Error processing chat request: {response.text}")
                return
            
    if event.event == "OrderStarted":
        if event['args']['printerId'] == printer_address:
            prompt = f"[Event trigger], OrderStarted: {event['args']}"
            async with httpx.AsyncClient() as client:
                response = await client.post("http://localhost:8080/api/create_order_request", json={"prompt": prompt})
            if response.status_code != 200:
                print(f"Error processing chat request: {response.text}")
                return
            # SPROŽIMO POSTOPEK TISKANJA
            # - Najdemo Gkodo
            # - Pošljemo Gkodo na printer
            # - Poženemo tiskanje


# async def listen_events():
#     print("Listening for events...")

#     latest_block = web3.eth.get_block('latest')["number"]

#     while True:
#         try:

#             # Get new logs from the latest block
#             new_logs = web3.eth.get_logs({
#                 "fromBlock": latest_block,
#                 "address": contract_address
#             })

#             # Check if new_logs is None
#             if new_logs is None:
#                 print("No logs returned")
#                 continue  # Skip this iteration

#             # Process the logs
#             for log in new_logs:
#                 # Check the event signature by matching the topic
#                 # First, try to decode for OrderCreated
               
#                 if log["topics"][0].hex() == web3.keccak(text="OrderCreated(address,address,uint256,uint256,uint256)").hex():
#                     event_data = contract.events.OrderCreated().process_log(log)
#                     await handle_event(event_data)

#                 # Next, check for OrderStarted
#                 elif log["topics"][0].hex() == web3.keccak(text="OrderStarted(address,address)").hex():
#                     event_data = contract.events.OrderStarted().process_log(log)
#                     await handle_event(event_data)

#             latest_block = web3.eth.get_block('latest')["number"] + 1  # Move to the next block

#         except Exception as e:
#             print(f"Error fetching events: {e}")

#         await asyncio.sleep(1)  # Avoid excessive polling
        
        
async def listen_events():
    print("Listening for events...")

    latest_block = web3.eth.get_block('latest')["number"]

    while True:
        try:

            # Get new logs from the latest block
            new_logs = web3.eth.get_logs({
                "fromBlock": latest_block,
                "address": contract_address
            })

            # Check if new_logs is None
            if new_logs is None:
                print("No logs returned")
                continue  # Skip this iteration

            # Process the logs
            for log in new_logs:       
                if log["topics"][0].hex() == web3.keccak(text="OrderCreated(address,address,uint256,uint256,uint256)").hex():
                    event_data = contract.events.OrderCreated().process_log(log)     
                if log["topics"][0].hex() == web3.keccak(text="OrderStarted(address,address)").hex():
                    event_data = contract.events.OrderStarted().process_log(log)
                    
                prompt = f"[Event trigger], blockchain: {event_data}"
                async with httpx.AsyncClient() as client:
                    response = await client.post("http://localhost:8080/api/create_order_request", json={"prompt": prompt})
                if response.status_code != 200:
                    print(f"Error processing chat request: {response.text}")
                    return

            latest_block = web3.eth.get_block('latest')["number"] + 1  # Move to the next block

        except Exception as e:
            print(f"Error fetching events: {e}")

        await asyncio.sleep(1)  # Avoid excessive polling


# ============ ERC-8004 Integration Tools ============

@tool("register_hardware_agent_erc8004", return_direct=True)
def register_hardware_agent_erc8004(name: str, description: str, printer_address: str) -> str:
    """
    Register the hardware agent on ERC-8004 Identity Registry with the same printer address.
    This should be done AFTER registering on the Formicarium contract.
    
    Args:
        name: Agent name (e.g., "Formicarium Hardware Agent - Printer #1")
        description: Agent description including printer capabilities
        printer_address: The printer's Ethereum address (same as used in Formicarium)
    """
    try:
        # Initialize ERC8004 client with the hardware agent's private key
        client = ERC8004Client(private_key=private_key)
        
        # Verify that the agent address matches the printer address
        if client.address.lower() != printer_address.lower():
            return f"Error: Agent address {client.address} doesn't match printer address {printer_address}. Use the same private key!"
        
        # Define skills and capabilities
        skills_list = [
            "3D printing",
            "FDM printing",
            "multi-material",
            "order fulfillment",
            "quality control"
        ]
        
        # Create endpoints
        endpoints = [
            format_agent_endpoint("agentWallet", client.address),
            format_agent_endpoint("HTTP", f"http://localhost:8080/api/hardware", "1.0.0"),
            format_agent_endpoint("FormiciariumPrinter", printer_address)
        ]
        
        # Create registration JSON
        registration_json = client.create_agent_registration_json(
            name=name,
            description=description,
            skills=skills_list,
            endpoints=endpoints,
            agent_wallet=client.address,
            supported_trust=["reputation"]
        )
        
        # Register agent on ERC-8004
        agent_id, tx_hash = client.register_agent(registration_json)
        
        return f"""
Hardware agent registered on ERC-8004!
Agent ID: {agent_id}
Printer Address: {printer_address}
Transaction: {tx_hash}
Explorer: https://sepolia.basescan.org/tx/{tx_hash}

IMPORTANT: Store this Agent ID for future feedback operations!
"""
        
    except Exception as e:
        return f"Failed to register hardware agent on ERC-8004: {str(e)}"


@tool("sign_feedback_authorization", return_direct=True)
def sign_feedback_authorization(agent_id: int, customer_address: str, expiry_hours: int = 168) -> str:
    """
    Sign a feedback authorization for a customer after completing their order.
    This allows the customer to submit feedback to the ERC-8004 Reputation Registry.
    
    Args:
        agent_id: Hardware agent's ERC-8004 agent ID
        customer_address: Customer's Ethereum address
        expiry_hours: Hours until authorization expires (default 168 = 1 week)
    """
    try:
        # Initialize ERC8004 client
        client = ERC8004Client(private_key=private_key)
        
        # Get the last feedback index for this customer
        last_index = client.reputation_registry.functions.getLastIndex(
            agent_id,
            web3.to_checksum_address(customer_address)
        ).call()
        
        # Create feedback authorization for next feedback (last_index + 1)
        feedback_auth = client.create_feedback_auth(
            agent_id=agent_id,
            client_address=customer_address,
            index_limit=last_index + 1,
            expiry_hours=expiry_hours
        )
        
        # Convert to hex for easy storage/transmission
        feedback_auth_hex = "0x" + feedback_auth.hex()
        
        return f"""
Feedback authorization signed!
Agent ID: {agent_id}
Customer: {customer_address}
Index Limit: {last_index + 1}
Expires in: {expiry_hours} hours
Authorization (hex): {feedback_auth_hex}

Give this authorization to the customer so they can submit feedback on ERC-8004!
"""
        
    except Exception as e:
        return f"Failed to sign feedback authorization: {str(e)}"


@tool("get_hardware_agent_feedback", return_direct=True) 
def get_hardware_agent_feedback(agent_id: int, customer_address: str, feedback_index: int = 0) -> str:
    """
    Retrieve feedback submitted for the hardware agent from ERC-8004 Reputation Registry.
    
    Args:
        agent_id: Hardware agent's ERC-8004 agent ID
        customer_address: Customer's Ethereum address
        feedback_index: Feedback index (default 0 for first feedback)
    """
    try:
        client = ERC8004Client()
        feedback = client.get_agent_feedback(agent_id, customer_address, feedback_index)
        
        if "error" in feedback:
            return f"No feedback found or error: {feedback['error']}"
        
        return f"""
Feedback for Agent ID {agent_id} from {customer_address} (index {feedback_index}):
Score: {feedback['score']}/100
Tag 1: {feedback['tag1'].hex()}
Tag 2: {feedback['tag2'].hex()}
Revoked: {feedback['is_revoked']}
"""
        
    except Exception as e:
        return f"Failed to retrieve feedback: {str(e)}"


@tool("submit_customer_feedback", return_direct=True)
def submit_customer_feedback(
    customer_private_key: str,
    agent_id: int, 
    score: int,
    feedback_auth_hex: str,
    tag1: str = "",
    tag2: str = "",
    file_uri: str = "",
    file_hash_hex: str = ""
) -> str:
    """
    Submit feedback to ERC-8004 Reputation Registry as a customer.
    The hardware agent must first provide you with a signed feedback authorization.
    
    Args:
        customer_private_key: Customer's private key
        agent_id: Hardware agent's ERC-8004 agent ID
        score: Score 0-100
        feedback_auth_hex: Feedback authorization from hardware agent (hex string starting with 0x)
        tag1: Optional tag (e.g., "quality")
        tag2: Optional tag (e.g., "speed")
        file_uri: Optional IPFS/HTTP URI with proof/photos
        file_hash_hex: Optional 32-byte file hash (hex string)
    """
    try:
        # Convert feedback auth from hex
        if not feedback_auth_hex.startswith("0x"):
            return "feedback_auth_hex must start with 0x"
        
        feedback_auth = bytes.fromhex(feedback_auth_hex[2:])
        
        # Prepare file hash if provided
        file_hash_bytes = None
        if file_hash_hex:
            fh = file_hash_hex[2:] if file_hash_hex.startswith("0x") else file_hash_hex
            if len(fh) != 64:
                return "file_hash_hex must be 32 bytes (64 hex chars)"
            file_hash_bytes = bytes.fromhex(fh)
        
        # Initialize client with customer's key
        client = ERC8004Client(private_key=customer_private_key)
        
        # Submit feedback
        tx_hash = client.submit_feedback(
            agent_id=agent_id,
            score=score,
            feedback_auth=feedback_auth,
            tag1=tag1,
            tag2=tag2,
            file_uri=file_uri,
            file_hash=file_hash_bytes
        )
        
        return f"""
Feedback submitted successfully!
Agent ID: {agent_id}
Score: {score}/100
Transaction: {tx_hash}
Explorer: https://sepolia.basescan.org/tx/{tx_hash}

Your feedback is now recorded on the ERC-8004 Reputation Registry!
"""
        
    except Exception as e:
        return f"Failed to submit feedback: {str(e)}"


@tool("get_erc8004_hardware_agent_info", return_direct=True)
def get_erc8004_hardware_agent_info(agent_id: int) -> str:
    """
    Get information about the hardware agent from ERC-8004 Identity Registry.
    
    Args:
        agent_id: The ERC-8004 agent ID to query
    """
    try:
        client = ERC8004Client()
        info = client.get_agent_info(agent_id)
        return json.dumps(info, indent=2)
    except Exception as e:
        return f"Failed to get agent info: {str(e)}"


# # Run Listener
# async def reconnect():
#     while True:
#         try:
#             await listen_events()
#         except Exception as e:
#             print(f"WebSocket connection lost: {e}. Reconnecting in 5 seconds...")
#             await asyncio.sleep(5)


# asyncio.run(reconnect())
