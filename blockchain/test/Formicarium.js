import { expect } from "chai";
import hre from "hardhat";

describe("Formicarium", function () {
  let formicarium, paymentToken;
  let owner, printer, customer, otherAccount;

  beforeEach(async function () {
    [owner, printer, customer, otherAccount] = await hre.ethers.getSigners();

    // Deploy a mock ERC20 token
    const MockERC20 = await hre.ethers.deployContract("ERC20Mock", [
      "MockToken",
      "MTK",
      owner.address,
      hre.ethers.parseEther("1000"), // Mint initial supply to owner
    ]);
    paymentToken = await MockERC20.waitForDeployment();

    // Transfer tokens to customer so they can create an order
    await paymentToken.transfer(customer.address, hre.ethers.parseEther("100"));

    // Deploy Formicarium contract
    formicarium = await hre.ethers.deployContract("Formicarium", [paymentToken.target]);
    await formicarium.waitForDeployment();
});

  it("Should register a printer", async function () {
    const printerDetails = "High-Resolution 3D Printer";

    // Register printer
    await formicarium.connect(printer).registerPrinter(printerDetails);

    // Retrieve printer details
    const registeredPrinter = await formicarium.printers(printer.address);

    expect(registeredPrinter.ID).to.equal(printer.address);
    expect(registeredPrinter.printerDetails).to.equal(printerDetails);
  });

    it("Should create an order", async function () {
        // Register printer
        await formicarium.connect(printer).registerPrinter("Printer 1");

        // Approve tokens
        const orderPrice = hre.ethers.parseEther("10");
        await paymentToken.connect(customer).approve(formicarium.target, orderPrice);

        // Create order
        const orderId = hre.ethers.Wallet.createRandom().address; // Generate unique order ID
        const duration = 3600; // 1 hour

        await formicarium.connect(customer).createOrder(orderId, printer.address, orderPrice, orderPrice, duration);

        // Retrieve order details
        const order = await formicarium.orders(orderId);

        expect(order.ID).to.equal(orderId);
        expect(order.printerId).to.equal(printer.address);
        expect(order.customerId).to.equal(customer.address);
        expect(order.actualPrice).to.equal(orderPrice);
        expect(order.duration).to.equal(duration);
    });


  it("Should sign an order by printer", async function () {
    // Register printer
    await formicarium.connect(printer).registerPrinter("Printer 1");

    // Approve tokens
    const orderPrice = hre.ethers.parseEther("10");
    await paymentToken.connect(customer).approve(formicarium.target, orderPrice);

    // Create order
    const orderId = hre.ethers.Wallet.createRandom().address;
    await formicarium.connect(customer).createOrder(orderId, printer.address, orderPrice, orderPrice, 3600); 
    
    // Wait one minute
    await hre.network.provider.send("evm_increaseTime", [60]);

    // Sign order
    await formicarium.connect(printer).signOrder(orderId);

    // Verify that the order is signed
    const order = await formicarium.orders(orderId);
    expect(order.isSigned).to.be.true;
  });

  it("Should execute an order", async function () {
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

    // Execute order
    await formicarium.connect(printer).executeNewOrder()

    // Verify order start time is set
    const order = await formicarium.orders(orderId);
    expect(order.startTime).to.be.greaterThan(0);
  });

  it("Should complete an order by provider", async function () {
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

    // Execute order
    await formicarium.connect(printer).executeNewOrder()

    // Wait half an hour
    await hre.network.provider.send("evm_increaseTime", [1800]);

    // Complete order with feedbackAuth
    const feedbackAuth = hre.ethers.toUtf8Bytes("test-feedback-auth");
    await formicarium.connect(printer).completeOrderProvider(orderId, feedbackAuth);

    // Verify order completion
    const order = await formicarium.orders(orderId);
    expect(order.isCompletedProvider).to.be.true;
  });

  it("Should store and retrieve feedbackAuth", async function () {
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

    // Execute order
    await formicarium.connect(printer).executeNewOrder()

    // Wait half an hour
    await hre.network.provider.send("evm_increaseTime", [1800]);

    // Complete order with feedbackAuth
    const feedbackAuthData = "test-feedback-auth-for-erc8004";
    const feedbackAuth = hre.ethers.toUtf8Bytes(feedbackAuthData);
    await formicarium.connect(printer).completeOrderProvider(orderId, feedbackAuth);

    // Verify feedbackAuth is stored
    expect(await formicarium.hasFeedbackAuth(orderId)).to.be.true;
    
    // Retrieve and verify feedbackAuth content
    const storedFeedbackAuth = await formicarium.getFeedbackAuth(orderId);
    expect(hre.ethers.toUtf8String(storedFeedbackAuth)).to.equal(feedbackAuthData);
  });

  it("Should reject completion with empty feedbackAuth", async function () {
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

    // Execute order
    await formicarium.connect(printer).executeNewOrder()

    // Wait half an hour
    await hre.network.provider.send("evm_increaseTime", [1800]);

    // Try to complete order with empty feedbackAuth - should fail
    const emptyFeedbackAuth = "0x";
    await expect(
      formicarium.connect(printer).completeOrderProvider(orderId, emptyFeedbackAuth)
    ).to.be.revertedWith("FeedbackAuth cannot be empty");
  });

  it("Should allow refund of expired order", async function () {
    // Register printer
    await formicarium.connect(printer).registerPrinter("Printer 1");

    const initialBalance = await paymentToken.balanceOf(customer.address);

    // Approve tokens
    const orderPrice = hre.ethers.parseEther("10");
    await paymentToken.connect(customer).approve(formicarium.target, orderPrice);

    // Create order
    const orderId = hre.ethers.Wallet.createRandom().address;
    await formicarium.connect(customer).createOrder(orderId, printer.address, orderPrice, orderPrice, 3600);

    // Fast forward time beyond expiration
    await hre.network.provider.send("evm_increaseTime", [3600 + 300]); // +5 minutes buffer
    await hre.network.provider.send("evm_mine");

    // Request refund
    formicarium.connect(customer).refundOrderRequest(orderId);
    
    await hre.network.provider.send("evm_increaseTime", [360]); // +5 minutes buffer
    await hre.network.provider.send("evm_mine");

    // Check token balance (customer should get refunded)
    expect(await paymentToken.balanceOf(customer.address)).to.equal(initialBalance);
  });

  it("Should transfer funds to provider", async function () {
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

    // Execute order
    await formicarium.connect(printer).executeNewOrder()

    // Wait half an hour
    await hre.network.provider.send("evm_increaseTime", [1800]);

    // Complete order with feedbackAuth
    const feedbackAuth = hre.ethers.toUtf8Bytes("test-feedback-auth");
    await formicarium.connect(printer).completeOrderProvider(orderId, feedbackAuth);

    // Fast forward time beyond order duration + 5 min
    await hre.network.provider.send("evm_increaseTime", [1800 + 360]);
    await hre.network.provider.send("evm_mine");

    // Transfer funds to provider
    await formicarium.connect(printer).transferFundsProvider(orderId);

    // Verify provider received funds
    expect(await paymentToken.balanceOf(printer.address)).to.equal(orderPrice);
  });
});