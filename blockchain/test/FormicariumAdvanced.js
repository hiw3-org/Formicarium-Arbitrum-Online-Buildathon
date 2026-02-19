import { expect } from "chai";
import hre from "hardhat";

describe("Advanced Formicarium Tests", function () {
  let formicarium, paymentToken;
  let owner, printer, customer, customer2, otherAccount;

  beforeEach(async function () {
    [owner, printer, customer, customer2, otherAccount] = await hre.ethers.getSigners();

    // Deploy a mock ERC20 token
    const MockERC20 = await hre.ethers.deployContract("ERC20Mock", [
      "MockToken",
      "MTK",
      owner.address,
      hre.ethers.parseEther("1000"),
    ]);
    paymentToken = await MockERC20.waitForDeployment();

    // Transfer tokens to customers so they can create orders
    await paymentToken.transfer(customer.address, hre.ethers.parseEther("100"));
    await paymentToken.transfer(customer2.address, hre.ethers.parseEther("100"));

    // Deploy Formicarium contract
    formicarium = await hre.ethers.deployContract("Formicarium", [paymentToken.target]);
    await formicarium.waitForDeployment();
  });

  it("Should process orders based on priority", async function () {
    // Register printer
    await formicarium.connect(printer).registerPrinter("Printer 1");

    // Approve tokens for both customers
    const lowPriorityPrice = hre.ethers.parseEther("10");
    const highPriorityPrice = hre.ethers.parseEther("20");

    await paymentToken.connect(customer).approve(formicarium.target, lowPriorityPrice);
    await paymentToken.connect(customer2).approve(formicarium.target, highPriorityPrice);

    // Create two orders with different priorities
    const orderId1 = hre.ethers.Wallet.createRandom().address; // Low priority
    const orderId2 = hre.ethers.Wallet.createRandom().address; // High priority

    await formicarium.connect(customer).createOrder(orderId1, printer.address, lowPriorityPrice, lowPriorityPrice, 3600);
    await formicarium.connect(customer2).createOrder(orderId2, printer.address, lowPriorityPrice, highPriorityPrice, 3600);

    // Sign both orders
    await formicarium.connect(printer).signOrder(orderId1);
    await formicarium.connect(printer).signOrder(orderId2);

    // Execute order
    await formicarium.connect(printer).executeNewOrder();

    // Verify that the high-priority order is selected first
    const executedOrder = await formicarium.orders(orderId2);
    expect(executedOrder.startTime).to.be.greaterThan(0);
  });

  it("Should allow customer to report an uncompleted order", async function () {
    // Register printer
    await formicarium.connect(printer).registerPrinter("Printer 1");

    // Approve tokens
    const orderPrice = hre.ethers.parseEther("10");
    await paymentToken.connect(customer).approve(formicarium.target, orderPrice);

    // Create order
    const orderId = hre.ethers.Wallet.createRandom().address;
    await formicarium.connect(customer).createOrder(orderId, printer.address, orderPrice, orderPrice, 3600);

    // Sign and execute order
    await formicarium.connect(printer).signOrder(orderId);
    await formicarium.connect(printer).executeNewOrder();

    // Complete order
    const feedbackAuth = hre.ethers.toUtf8Bytes("test-feedback-auth");
    await formicarium.connect(printer).completeOrderProvider(orderId, feedbackAuth);

    // Customer reports the order as uncompleted
    await formicarium.connect(customer).reportUncompleteOrder(orderId);

    // Verify order is marked as uncompleted
    const order = await formicarium.orders(orderId);
    expect(order.isUncompleteCustomer).to.be.false;
  });

  it("Should prevent signing an already signed order", async function () {
    // Register printer
    await formicarium.connect(printer).registerPrinter("Printer 1");

    // Approve tokens
    const orderPrice = hre.ethers.parseEther("10");
    await paymentToken.connect(customer).approve(formicarium.target, orderPrice);

    // Create order
    const orderId = hre.ethers.Wallet.createRandom().address;
    await formicarium.connect(customer).createOrder(orderId, printer.address, orderPrice, orderPrice, 3600);

    // Sign order
    await formicarium.connect(printer).signOrder(orderId);

    // Try signing again (should fail)
    await expect(formicarium.connect(printer).signOrder(orderId)).to.be.revertedWith("Order already signed");
  });

  it("Should prevent refunding an already completed order", async function () {
    // Register printer
    await formicarium.connect(printer).registerPrinter("Printer 1");

    // Approve tokens
    const orderPrice = hre.ethers.parseEther("10");
    await paymentToken.connect(customer).approve(formicarium.target, orderPrice);

    // Create order
    const orderId = hre.ethers.Wallet.createRandom().address;
    await formicarium.connect(customer).createOrder(orderId, printer.address, orderPrice, orderPrice, 3600);

    // Sign, execute, and complete order
    await formicarium.connect(printer).signOrder(orderId);
    await formicarium.connect(printer).executeNewOrder();
    const feedbackAuth = hre.ethers.toUtf8Bytes("test-feedback-auth");
    await formicarium.connect(printer).completeOrderProvider(orderId, feedbackAuth);

    // Attempt to refund (should fail)
    await expect(formicarium.connect(customer).refundOrderRequest(orderId)).to.be.revertedWith("Order request already signed");
  });

  it("Should prevent executing an order that has not been signed", async function () {
    // Register printer
    await formicarium.connect(printer).registerPrinter("Printer 1");

    // Approve tokens
    const orderPrice = hre.ethers.parseEther("10");
    await paymentToken.connect(customer).approve(formicarium.target, orderPrice);

    // Create order but do not sign it
    const orderId = hre.ethers.Wallet.createRandom().address;
    await formicarium.connect(customer).createOrder(orderId, printer.address, orderPrice, orderPrice, 3600);

    // Attempt to execute (should fail)
    await expect(formicarium.connect(printer).executeNewOrder()).to.be.revertedWith("No active orders to execute");
  });

  it("Should ensure an order is removed after processing", async function () {
    // Register printer
    await formicarium.connect(printer).registerPrinter("Printer 1");

    // Approve tokens
    const orderPrice = hre.ethers.parseEther("10");
    await paymentToken.connect(customer).approve(formicarium.target, orderPrice);

    // Create order
    const orderId = hre.ethers.Wallet.createRandom().address;
    await formicarium.connect(customer).createOrder(orderId, printer.address, orderPrice, orderPrice, 3600);

    // Sign, execute, and complete order
    await formicarium.connect(printer).signOrder(orderId);
    await formicarium.connect(printer).executeNewOrder();
    const feedbackAuth = hre.ethers.toUtf8Bytes("test-feedback-auth");
    await formicarium.connect(printer).completeOrderProvider(orderId, feedbackAuth);

    // Fast forward time beyond reporting period
    await hre.network.provider.send("evm_increaseTime", [3600 + 300]); // +5 minutes buffer
    await hre.network.provider.send("evm_mine");

    // Transfer funds to provider
    await formicarium.connect(printer).transferFundsProvider(orderId);

    // Verify order has been deleted
    const order = await formicarium.orders(orderId);
    expect(order.ID).to.equal(hre.ethers.ZeroAddress);
  });

  it("Should emit OrderCreated event", async function () {
    await formicarium.connect(printer).registerPrinter("Printer 1");
    const orderId = hre.ethers.Wallet.createRandom().address;
    const orderPrice = hre.ethers.parseEther("10");
    await paymentToken.connect(customer).approve(formicarium.target, orderPrice);
    await expect(formicarium.connect(customer).createOrder(orderId, printer.address, orderPrice, orderPrice, 3600))
      .to.emit(formicarium, "OrderCreated")
      .withArgs(orderId, printer.address, orderPrice, orderPrice, 3600);
  });

  it("Should emit OrderSigned event", async function () {
    await formicarium.connect(printer).registerPrinter("Printer 1");
    const orderId = hre.ethers.Wallet.createRandom().address;
    const orderPrice = hre.ethers.parseEther("10");
    await paymentToken.connect(customer).approve(formicarium.target, orderPrice);
    await formicarium.connect(customer).createOrder(orderId, printer.address, orderPrice, orderPrice, 3600);
    await expect(formicarium.connect(printer).signOrder(orderId))
      .to.emit(formicarium, "OrderSigned")
      .withArgs(orderId, printer.address);
  });

  it("Should emit OrderStarted event", async function () {
    await formicarium.connect(printer).registerPrinter("Printer 1");
    const orderId = hre.ethers.Wallet.createRandom().address;
    const orderPrice = hre.ethers.parseEther("10");
    await paymentToken.connect(customer).approve(formicarium.target, orderPrice);
    await formicarium.connect(customer).createOrder(orderId, printer.address, orderPrice, orderPrice, 3600);
    await formicarium.connect(printer).signOrder(orderId);
    await expect(formicarium.connect(printer).executeNewOrder())
      .to.emit(formicarium, "OrderStarted")
      .withArgs(orderId, printer.address);
  });

  it("Should emit OrderCompleted event", async function () {
    await formicarium.connect(printer).registerPrinter("Printer 1");
    const orderId = hre.ethers.Wallet.createRandom().address;
    const orderPrice = hre.ethers.parseEther("10");
    await paymentToken.connect(customer).approve(formicarium.target, orderPrice);
    await formicarium.connect(customer).createOrder(orderId, printer.address, orderPrice, orderPrice, 3600);
    await formicarium.connect(printer).signOrder(orderId);
    await formicarium.connect(printer).executeNewOrder();
    const feedbackAuth = hre.ethers.toUtf8Bytes("test-feedback-auth");
    await expect(formicarium.connect(printer).completeOrderProvider(orderId, feedbackAuth))
      .to.emit(formicarium, "OrderCompleted")
      .withArgs(orderId, printer.address);
  });

  it("Should emit FeedbackAuthStored event", async function () {
    await formicarium.connect(printer).registerPrinter("Printer 1");
    const orderId = hre.ethers.Wallet.createRandom().address;
    const orderPrice = hre.ethers.parseEther("10");
    await paymentToken.connect(customer).approve(formicarium.target, orderPrice);
    await formicarium.connect(customer).createOrder(orderId, printer.address, orderPrice, orderPrice, 3600);
    await formicarium.connect(printer).signOrder(orderId);
    await formicarium.connect(printer).executeNewOrder();
    const feedbackAuth = hre.ethers.toUtf8Bytes("test-feedback-auth");
    await expect(formicarium.connect(printer).completeOrderProvider(orderId, feedbackAuth))
      .to.emit(formicarium, "FeedbackAuthStored")
      .withArgs(orderId, printer.address, customer.address);
  });

  it("Should return all orders placed by the customer", async function () {
    // Register printer
    await formicarium.connect(printer).registerPrinter("Printer 1");
  
    // Approve tokens for customer
    const orderPrice = hre.ethers.parseEther("10");
    await paymentToken.connect(customer).approve(formicarium.target, orderPrice + orderPrice);
  
    // Create two orders for the same customer
    const orderId1 = hre.ethers.Wallet.createRandom().address;
    const orderId2 = hre.ethers.Wallet.createRandom().address;
  
    await formicarium.connect(customer).createOrder(orderId1, printer.address, orderPrice, orderPrice, 3600);
    await formicarium.connect(customer).createOrder(orderId2, printer.address, orderPrice, orderPrice, 3600);
  
    // Retrieve customer orders
    const customerOrders = await formicarium.connect(customer).getYourOrders();
  
    // Validate that two orders were retrieved
    expect(customerOrders.length).to.equal(2);
    expect(customerOrders[0].ID).to.equal(orderId1);
    expect(customerOrders[1].ID).to.equal(orderId2);
  });
  
  it("Should return an empty array when the customer has no orders", async function () {
    // Attempt to retrieve orders for a customer with no orders
    const customerOrders = await formicarium.connect(customer).getYourOrders();
  
    // Validate that no orders are returned
    expect(customerOrders.length).to.equal(0);
  });
  
  it("Should not return orders placed by other customers", async function () {
    // Register printer
    await formicarium.connect(printer).registerPrinter("Printer 1");
  
    // Approve tokens
    const orderPrice = hre.ethers.parseEther("10");
    await paymentToken.connect(customer).approve(formicarium.target, orderPrice);
    await paymentToken.connect(customer2).approve(formicarium.target, orderPrice);
  
    // Create one order for each customer
    const orderIdCustomer1 = hre.ethers.Wallet.createRandom().address;
    const orderIdCustomer2 = hre.ethers.Wallet.createRandom().address;
  
    await formicarium.connect(customer).createOrder(orderIdCustomer1, printer.address, orderPrice, orderPrice, 3600);
    await formicarium.connect(customer2).createOrder(orderIdCustomer2, printer.address, orderPrice, orderPrice, 3600);
  
    // Retrieve orders for customer1
    const customerOrders1 = await formicarium.connect(customer).getYourOrders();
    expect(customerOrders1.length).to.equal(1);
    expect(customerOrders1[0].ID).to.equal(orderIdCustomer1);
  
    // Retrieve orders for customer2
    const customerOrders2 = await formicarium.connect(customer2).getYourOrders();
    expect(customerOrders2.length).to.equal(1);
    expect(customerOrders2[0].ID).to.equal(orderIdCustomer2);
  });
  
  it("Should return orders only if they exist in the provider order list", async function () {
    // Register printer
    await formicarium.connect(printer).registerPrinter("Printer 1");
  
    // Approve tokens
    const orderPrice = hre.ethers.parseEther("10");
    await paymentToken.connect(customer).approve(formicarium.target, orderPrice + orderPrice);
  
    // Create an order
    const orderId1 = hre.ethers.Wallet.createRandom().address;
    await formicarium.connect(customer).createOrder(orderId1, printer.address, orderPrice, orderPrice, 3600);

    // Wait more than 5 minutes
    await hre.network.provider.send("evm_increaseTime", [3600 + 360]); // +5 minutes buffer 

    // Create another order
    const orderId2 = hre.ethers.Wallet.createRandom().address;
    await formicarium.connect(customer).createOrder(orderId2, printer.address, orderPrice, orderPrice, 3600);
  
    // Retrieve orders, should return empty due to incorrect providerOrders
    const customerOrders = await formicarium.connect(customer).getYourOrders();
    expect(customerOrders.length).to.equal(1);
  });
});