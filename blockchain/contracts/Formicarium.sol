// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Uncomment this line to use console.log
import "hardhat/console.sol";

contract Formicarium {
    address public owner;
    IERC20 public paymentToken;

    struct Printer {
        address ID;
        string printerDetails;
    }

    struct Order {
        address ID;
        address printerId;
        address customerId;
        uint256 minimalPrice;
        uint256 actualPrice;
        uint256 duration;
        uint256 startTime;
        uint256 expirationTime;
        bool isSigned;
        bool isCompletedProvider;
        bool isUncompleteCustomer;
        bytes feedbackAuth; // ERC-8004 feedbackAuth for reputation feedback
    }
    address[] public printerAddresses;    

    mapping(address => Printer) public printers;
    mapping(address => Order) public orders;
    mapping(address => address[]) public providerOrders;


    // Modifiers

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    modifier onlyPrinter() {
        require(printers[msg.sender].ID == msg.sender, "Only printer can call this function");
        _;
    }

    // Constructor

    constructor(address _paymentToken) {
        owner = msg.sender;
        paymentToken = IERC20(_paymentToken);
    }

    // Events

    event OrderCreated(address indexed orderId, address indexed printerId, uint256 minimalPrice, uint256 actualPrice, uint256 duration);
    event OrderSigned(address indexed orderId, address indexed printerId);
    event OrderStarted(address indexed orderId, address indexed printerId);
    event OrderCompleted(address indexed orderId, address indexed printerId);
    event FeedbackAuthStored(address indexed orderId, address indexed printerId, address indexed customerId);

    // Functions

    // Getter functions

    function getAllPrinters() public view returns (Printer[] memory) {
        Printer[] memory allPrinters = new Printer[](printerAddresses.length);
        for (uint256 i = 0; i < printerAddresses.length; i++) {
            allPrinters[i] = printers[printerAddresses[i]];
        }
        return allPrinters;
    }

    function getProviderOrders(address _printerId) public view returns (address[] memory) {
        return providerOrders[_printerId];
    }

    function getYourOrders() public view returns (Order[] memory) {
        uint256 count = 0;
        
        // First, count the number of orders placed by the caller
        for (uint256 i = 0; i < printerAddresses.length; i++) {
            address printer = printerAddresses[i];
            address[] storage providerOrderList = providerOrders[printer];
            for (uint256 j = 0; j < providerOrderList.length; j++) {
                if (orders[providerOrderList[j]].customerId == msg.sender) {
                    count++;
                }
            }
        }

        // Now, initialize the array with the correct size
        Order[] memory customerOrders = new Order[](count);
        uint256 index = 0; // Separate counter for populating the array

        // Populate the customerOrders array
        for (uint256 i = 0; i < printerAddresses.length; i++) {
            address printer = printerAddresses[i];
            address[] storage providerOrderList = providerOrders[printer];
            for (uint256 j = 0; j < providerOrderList.length; j++) {
                if (orders[providerOrderList[j]].customerId == msg.sender) {
                    customerOrders[index] = orders[providerOrderList[j]];
                    index++;  // Only increment after assignment
                }
            }
        }
        return customerOrders;
    }

    /**
     * @dev Retrieves the ERC-8004 feedbackAuth for a specific order
     * @param _orderId The ID of the order
     * @return The feedbackAuth bytes data for reputation feedback
     */
    function getFeedbackAuth(address _orderId) public view returns (bytes memory) {
        require(orders[_orderId].ID == _orderId, "Order does not exist");
        return orders[_orderId].feedbackAuth;
    }

    /**
     * @dev Checks if an order has feedbackAuth stored
     * @param _orderId The ID of the order
     * @return True if feedbackAuth is stored, false otherwise
     */
    function hasFeedbackAuth(address _orderId) public view returns (bool) {
        require(orders[_orderId].ID == _orderId, "Order does not exist");
        return orders[_orderId].feedbackAuth.length > 0;
    }

    // Setter functions

    function registerPrinter(string memory _printerDetails) public {
        require(printers[msg.sender].ID == address(0), "Printer already registered");
        printers[msg.sender] = Printer(msg.sender, _printerDetails);
        printerAddresses.push(msg.sender);
    }

    function createOrder(address _orderId, address _printerId, uint256 _minimalPrice, uint256 _actualPrice, uint256 _duration) public {
        require(orders[_orderId].ID == address(0), "Order already exists");
        require(_orderId != address(0), "Invalid order ID");
        require(printers[_printerId].ID == _printerId, "Printer does not exist");
        require(_minimalPrice > 0, "Price must be greater than 0");
        require(_actualPrice >= _minimalPrice, "Actual price must be greater than or equal to minimal price");
        require(_duration > 0, "Duration must be greater than 0");
        require(paymentToken.balanceOf(msg.sender) >= _actualPrice, "Insufficient balance");

        // Ensure sender has approved enough tokens for transfer
        require(paymentToken.allowance(msg.sender, address(this)) >= _actualPrice, "Contract not approved to transfer tokens");

        // Transfer tokens from user to smart contract
        require(paymentToken.transferFrom(msg.sender, address(this), _actualPrice), "Token transfer failed");

        // remove expired orders
        removeExpiredOrders(_printerId);

        orders[_orderId] = Order(_orderId, _printerId, msg.sender, _minimalPrice, _actualPrice, _duration, 0, block.timestamp + 5 minutes, false, false, false, "");
        providerOrders[_printerId].push(_orderId);

        emit OrderCreated(_orderId, _printerId, _minimalPrice, _actualPrice, _duration);
    }

    function getActiveOrders() public view returns (Order[] memory) {
        address[] storage allOrders = providerOrders[msg.sender];
        uint256 activeCount;

        // First, count active orders to allocate memory efficiently
        for (uint256 i = 0; i < allOrders.length; i++) {
            if (orders[allOrders[i]].isSigned && !orders[allOrders[i]].isCompletedProvider && orders[allOrders[i]].startTime == 0) {
                activeCount++;
            }
        }

        Order[] memory activeOrders = new Order[](activeCount);
        uint256 index = 0;

        for (uint256 i = 0; i < allOrders.length; i++) {
            if (orders[allOrders[i]].isSigned && !orders[allOrders[i]].isCompletedProvider && orders[allOrders[i]].startTime == 0)  {
                activeOrders[index++] = orders[allOrders[i]];
            }
        }

        return activeOrders;
    }

    function removeExpiredOrders(address _printerId) internal {
        address[] storage allOrders = providerOrders[_printerId];
        uint256 length = allOrders.length;
        uint256 writeIndex = 0;

        for (uint256 i = 0; i < length; i++) {
            address orderId = allOrders[i];
            if (!orders[orderId].isCompletedProvider && orders[orderId].expirationTime < block.timestamp) {
                delete orders[orderId]; // Free storage
            } else {
                allOrders[writeIndex++] = orderId;
            }
        }

        // Trim the array length
        while (allOrders.length > writeIndex) {
            allOrders.pop();
        }
    }

    function signOrder(address _orderId) public onlyPrinter {
        require(orders[_orderId].ID == _orderId, "Order does not exist");
        require(orders[_orderId].printerId == msg.sender, "Only service provider can sign order");
        require(block.timestamp < orders[_orderId].expirationTime, "Order expired");
        require(orders[_orderId].isSigned == false, "Order already signed");
        
        removeExpiredOrders(msg.sender);
        orders[_orderId].isSigned = true;
        emit OrderSigned(_orderId, msg.sender);
    }

    function calculateNextOrderId() internal view returns (address) {
        // get active orders by calling getActiveOrders
        Order[] memory activeOrders = getActiveOrders();
        // if there are no active orders, return 0
        if (activeOrders.length == 0) {
            return address(0);
        }
        // calculate the priority factor for each order
        uint256[] memory priorityFactors = new uint256[](activeOrders.length);
        for (uint256 i = 0; i < activeOrders.length; i++) {
            priorityFactors[i] = activeOrders[i].actualPrice / activeOrders[i].minimalPrice;
        }
        // find the order with the highest priority factor
        uint256 maxPriority = 0;
        uint256 maxIndex = 0;
        for (uint256 i = 0; i < priorityFactors.length; i++) {
            if (priorityFactors[i] > maxPriority) {
                maxPriority = priorityFactors[i];
                maxIndex = i;
            }
        }
        // return the order ID of the order with the highest priority factor
        return activeOrders[maxIndex].ID;
    }

    function executeNewOrder() public onlyPrinter {
        address _orderId = calculateNextOrderId();
        require(_orderId != address(0), "No active orders to execute");
        orders[_orderId].startTime = block.timestamp;
        emit OrderStarted(_orderId, msg.sender);
    }

    /**
     * @dev Completes an order by the service provider and stores ERC-8004 feedbackAuth
     * @param _orderId The ID of the order to complete
     * @param _feedbackAuth The ERC-8004 feedbackAuth bytes for reputation feedback
     * Requirements:
     * - Only the service provider can call this function
     * - Order must exist, be signed, and started
     * - Order must not be already completed
     * - Must be within the order duration
     * - FeedbackAuth cannot be empty
     */
    function completeOrderProvider(address _orderId, bytes memory _feedbackAuth) public onlyPrinter {
        require(orders[_orderId].ID == _orderId, "Order does not exist");
        require(orders[_orderId].printerId == msg.sender, "Only service provider can complete order");
        require(orders[_orderId].isSigned, "Order not signed");
        require(orders[_orderId].startTime != 0, "Order not started");
        require(!orders[_orderId].isCompletedProvider, "Order already completed");
        require(block.timestamp < orders[_orderId].startTime + orders[_orderId].duration, "Order duration expired");
        require(_feedbackAuth.length > 0, "FeedbackAuth cannot be empty");
        
        orders[_orderId].isCompletedProvider = true;
        orders[_orderId].feedbackAuth = _feedbackAuth;
        
        emit OrderCompleted(_orderId, msg.sender);
        emit FeedbackAuthStored(_orderId, msg.sender, orders[_orderId].customerId);
    }

    function reportUncompleteOrder(address _orderId) public {
        require(orders[_orderId].ID == _orderId, "Order does not exist");
        require(orders[_orderId].customerId == msg.sender, "Only customer can confirm order");
        require(orders[_orderId].isSigned, "Order not signed");
        require(orders[_orderId].isCompletedProvider, "Order not completed by provider");
        require(!orders[_orderId].isUncompleteCustomer, "Order already reported as uncomplete by customer");
        require(block.timestamp < orders[_orderId].startTime + orders[_orderId].duration + 5 minutes, "Report time expired");

        orders[_orderId].isUncompleteCustomer = false;
    }

    function refundOrderRequest(address _orderId) public {
        require(orders[_orderId].ID == _orderId, "Order does not exist");
        require(orders[_orderId].customerId == msg.sender, "Only customer can refund order request");
        require(!orders[_orderId].isSigned, "Order request already signed");
        require(block.timestamp >= orders[_orderId].expirationTime, "Order request is not expired yet");

        // Transfer tokens back to customer
        paymentToken.transfer(msg.sender, orders[_orderId].actualPrice);

        // Free storage
        delete orders[_orderId];
    }

    function transferFundsProvider(address _orderId) public {
        require(orders[_orderId].ID == _orderId, "Order does not exist");
        require(orders[_orderId].printerId == msg.sender, "Only service provider can transfer funds");
        require(orders[_orderId].isSigned, "Order not signed");
        require(orders[_orderId].isCompletedProvider, "Order not completed by provider");
        require(!orders[_orderId].isUncompleteCustomer, "Order reported as uncomplete by customer");
        require(block.timestamp >= orders[_orderId].startTime + orders[_orderId].duration + 5 minutes, "Reporting time not expired yet");

        // Transfer funds to provider
        require(paymentToken.transfer(msg.sender, orders[_orderId].actualPrice), "Token transfer failed");

        // Free storage
        delete orders[_orderId];
    }
}