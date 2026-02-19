"""
ERC-8004 Trustless Agents Integration Module
Integrates with deployed ERC-8004 contracts on Base Sepolia
"""

from web3 import Web3
from eth_account import Account
from eth_account.messages import encode_defunct
import json
import os
from typing import Dict, Optional, List, Tuple
from datetime import datetime, timedelta
import base64

# Base Sepolia RPC
BASE_SEPOLIA_RPC = "https://sepolia.base.org"

# Deployed ERC-8004 contracts on Base Sepolia (from reference implementation)
IDENTITY_REGISTRY_ADDRESS = "0x7177a6867296406881E20d6647232314736Dd09A"
REPUTATION_REGISTRY_ADDRESS = "0xB5048e3ef1DA4E04deB6f7d0423D06F63869e322"

# ABIs for ERC-8004 contracts
IDENTITY_REGISTRY_ABI = [
    {
        "inputs": [{"name": "tokenURI", "type": "string"}],
        "name": "register",
        "outputs": [{"name": "agentId", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"name": "agentId", "type": "uint256"}, {"name": "tokenURI", "type": "string"}],
        "name": "_setTokenURI",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"name": "agentId", "type": "uint256"}],
        "name": "tokenURI",
        "outputs": [{"name": "", "type": "string"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"name": "agentId", "type": "uint256"}],
        "name": "ownerOf",
        "outputs": [{"name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "key", "type": "string"}
        ],
        "name": "getMetadata",
        "outputs": [{"name": "value", "type": "bytes"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "key", "type": "string"},
            {"name": "value", "type": "bytes"}
        ],
        "name": "setMetadata",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
]

REPUTATION_REGISTRY_ABI = [
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
    },
    {
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "feedbackIndex", "type": "uint64"}
        ],
        "name": "revokeFeedback",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"name": "agentId", "type": "uint256"},
            {"name": "clientAddress", "type": "address"},
            {"name": "feedbackIndex", "type": "uint64"}
        ],
        "name": "readFeedback",
        "outputs": [
            {"name": "score", "type": "uint8"},
            {"name": "tag1", "type": "bytes32"},
            {"name": "tag2", "type": "bytes32"},
            {"name": "isRevoked", "type": "bool"}
        ],
        "stateMutability": "view",
        "type": "function"
    },
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
        "inputs": [],
        "name": "getIdentityRegistry",
        "outputs": [{"name": "registry", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
    }
]


class ERC8004Client:
    """Client for interacting with ERC-8004 contracts"""
    
    def __init__(self, private_key: Optional[str] = None, rpc_url: str = BASE_SEPOLIA_RPC):
        """
        Initialize ERC-8004 client
        
        Args:
            private_key: Private key for signing transactions (optional, for read-only use)
            rpc_url: RPC endpoint URL
        """
        self.web3 = Web3(Web3.HTTPProvider(rpc_url))
        self.private_key = private_key
        
        if private_key:
            self.account = Account.from_key(private_key)
            self.address = self.account.address
        else:
            self.account = None
            self.address = None
            
        # Contract instances
        self.identity_registry = self.web3.eth.contract(
            address=Web3.to_checksum_address(IDENTITY_REGISTRY_ADDRESS),
            abi=IDENTITY_REGISTRY_ABI
        )
        
        self.reputation_registry = self.web3.eth.contract(
            address=Web3.to_checksum_address(REPUTATION_REGISTRY_ADDRESS),
            abi=REPUTATION_REGISTRY_ABI
        )
        
    def create_agent_registration_json(
        self,
        name: str,
        description: str,
        skills: List[str],
        endpoints: List[Dict[str, str]],
        agent_wallet: str,
        supported_trust: Optional[List[str]] = None
    ) -> str:
        """
        Create agent registration JSON according to ERC-8004 spec
        
        Args:
            name: Agent name
            description: Agent description
            skills: List of skills
            endpoints: List of endpoint dicts with 'name', 'endpoint', 'version'
            agent_wallet: Agent wallet address
            supported_trust: List of supported trust models
            
        Returns:
            JSON string for agent registration
        """
        registration = {
            "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
            "name": name,
            "description": description,
            "image": "",  # Optional: Add image URL if available
            "endpoints": endpoints,
            "registrations": [],  # Will be filled after registration
            "supportedTrust": supported_trust or ["reputation"]
        }
        
        return json.dumps(registration)
    
    def register_agent(
        self,
        registration_json: str,
        metadata: Optional[Dict[str, bytes]] = None
    ) -> Tuple[int, str]:
        """
        Register agent with ERC-8004 Identity Registry
        
        Args:
            registration_json: Agent registration JSON
            metadata: Optional metadata dict {key: value}
            
        Returns:
            Tuple of (agent_id, transaction_hash)
        """
        if not self.account:
            raise ValueError("Private key required for registration")
            
        # Encode registration JSON as data URI
        encoded = base64.b64encode(registration_json.encode()).decode()
        token_uri = f"data:application/json;base64,{encoded}"
        
        # Build transaction
        nonce = self.web3.eth.get_transaction_count(self.address)
        
        tx = self.identity_registry.functions.register(token_uri).build_transaction({
            'from': self.address,
            'gas': 500000,
            'gasPrice': self.web3.eth.gas_price,
            'nonce': nonce
        })
        
        # Sign and send
        signed_tx = self.account.sign_transaction(tx)
        tx_hash = self.web3.eth.send_raw_transaction(signed_tx.raw_transaction)
        
        # Wait for receipt to get agent ID
        receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash)
        
        # Parse agent ID from logs (Transfer event from ERC-721)
        agent_id = None
        for log in receipt['logs']:
            try:
                # Transfer event has tokenId as third indexed parameter
                if len(log['topics']) >= 4:
                    agent_id = int.from_bytes(log['topics'][3], byteorder='big')
                    break
            except:
                continue
                
        if agent_id is None:
            raise ValueError("Failed to extract agent ID from transaction receipt")
            
        return agent_id, self.web3.to_hex(tx_hash)
    
    def get_agent_info(self, agent_id: int) -> Dict:
        """
        Get agent information from registry
        
        Args:
            agent_id: Agent ID to query
            
        Returns:
            Dict with agent info
        """
        try:
            token_uri = self.identity_registry.functions.tokenURI(agent_id).call()
            owner = self.identity_registry.functions.ownerOf(agent_id).call()
            
            # Decode data URI if present
            registration_data = None
            if token_uri.startswith("data:application/json;base64,"):
                encoded = token_uri.split(",")[1]
                decoded = base64.b64decode(encoded).decode()
                registration_data = json.loads(decoded)
            
            return {
                "agent_id": agent_id,
                "owner": owner,
                "token_uri": token_uri,
                "registration_data": registration_data
            }
        except Exception as e:
            return {"error": str(e)}
    
    def create_feedback_auth(
        self,
        agent_id: int,
        client_address: str,
        index_limit: int = 1,
        expiry_hours: int = 24
    ) -> bytes:
        """
        Create and sign feedback authorization for ERC-8004 Reputation Registry
        
        Args:
            agent_id: Agent ID receiving feedback
            client_address: Address authorized to give feedback
            index_limit: Maximum feedback index (for replay protection)
            expiry_hours: Hours until expiration
            
        Returns:
            Signed feedback authorization bytes
        """
        if not self.account:
            raise ValueError("Private key required for signing")
            
        # Calculate expiry timestamp
        expiry = int((datetime.now() + timedelta(hours=expiry_hours)).timestamp())
        
        # Get chain ID
        chain_id = self.web3.eth.chain_id
        
        # Pack FeedbackAuth struct
        # struct FeedbackAuth {
        #     uint256 agentId;
        #     address clientAddress;
        #     uint64 indexLimit;
        #     uint256 expiry;
        #     uint256 chainId;
        #     address identityRegistry;
        #     address signerAddress;
        # }
        
        # Encode the struct
        struct_data = self.web3.codec.encode(
            ['uint256', 'address', 'uint64', 'uint256', 'uint256', 'address', 'address'],
            [
                agent_id,
                Web3.to_checksum_address(client_address),
                index_limit,
                expiry,
                chain_id,
                Web3.to_checksum_address(IDENTITY_REGISTRY_ADDRESS),
                self.address
            ]
        )
        
        # Hash the struct
        struct_hash = Web3.keccak(struct_data)
        
        # Sign using EIP-191
        message = encode_defunct(struct_hash)
        signed = self.account.sign_message(message)
        
        # Pack: struct_data + signature (65 bytes: r(32) + s(32) + v(1))
        feedback_auth = struct_data + signed.signature
        
        return feedback_auth
    
    def submit_feedback(
        self,
        agent_id: int,
        score: int,
        feedback_auth: bytes,
        tag1: Optional[str] = None,
        tag2: Optional[str] = None,
        file_uri: str = "",
        file_hash: Optional[bytes] = None
    ) -> str:
        """
        Submit feedback to reputation registry
        
        Args:
            agent_id: Agent ID
            score: Score 0-100
            feedback_auth: Signed feedback authorization
            tag1: Optional tag 1
            tag2: Optional tag 2
            file_uri: Optional IPFS/HTTP URI
            file_hash: Optional file hash
            
        Returns:
            Transaction hash
        """
        if not self.account:
            raise ValueError("Private key required for feedback submission")
            
        # Convert tags to bytes32
        tag1_bytes = Web3.to_bytes(text=tag1 or "").ljust(32, b'\x00')
        tag2_bytes = Web3.to_bytes(text=tag2 or "").ljust(32, b'\x00')
        
        # File hash
        file_hash_bytes = file_hash or b'\x00' * 32
        
        # Build transaction
        nonce = self.web3.eth.get_transaction_count(self.address)
        
        tx = self.reputation_registry.functions.giveFeedback(
            agent_id,
            score,
            tag1_bytes,
            tag2_bytes,
            file_uri,
            file_hash_bytes,
            feedback_auth
        ).build_transaction({
            'from': self.address,
            'gas': 500000,
            'gasPrice': self.web3.eth.gas_price,
            'nonce': nonce
        })
        
        # Sign and send
        signed_tx = self.account.sign_transaction(tx)
        tx_hash = self.web3.eth.send_raw_transaction(signed_tx.raw_transaction)
        
        # Wait for confirmation
        self.web3.eth.wait_for_transaction_receipt(tx_hash)
        
        return self.web3.to_hex(tx_hash)
    
    def get_agent_feedback(self, agent_id: int, client_address: str, index: int) -> Dict:
        """
        Get feedback for an agent
        
        Args:
            agent_id: Agent ID
            client_address: Client address
            index: Feedback index
            
        Returns:
            Dict with feedback info
        """
        try:
            result = self.reputation_registry.functions.readFeedback(
                agent_id,
                Web3.to_checksum_address(client_address),
                index
            ).call()
            
            return {
                "score": result[0],
                "tag1": result[1],
                "tag2": result[2],
                "is_revoked": result[3]
            }
        except Exception as e:
            return {"error": str(e)}


def format_agent_endpoint(name: str, endpoint: str, version: str = "1.0.0") -> Dict[str, str]:
    """
    Format agent endpoint according to ERC-8004 spec
    
    Args:
        name: Endpoint name (e.g., "A2A", "MCP", "agentWallet")
        endpoint: Endpoint URL or address
        version: Version string
        
    Returns:
        Formatted endpoint dict
    """
    return {
        "name": name,
        "endpoint": endpoint,
        "version": version
    }