const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("DealVaultV2", function () {
  async function deployFixture() {
    const [admin, operator, investor, secondInvestor] = await ethers.getSigners();
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const usdc = await ERC20Mock.deploy("Mock USDC", "USDC", admin.address, ethers.parseUnits("1000000", 6));
    const DealVaultFactoryV2 = await ethers.getContractFactory("DealVaultFactoryV2");
    const factory = await DealVaultFactoryV2.deploy(await usdc.getAddress(), admin.address);
    await factory.grantRole(await factory.OPERATOR_ROLE(), operator.address);
    await usdc.mint(investor.address, ethers.parseUnits("1000", 6));
    await usdc.mint(secondInvestor.address, ethers.parseUnits("1000", 6));
    await usdc.mint(operator.address, ethers.parseUnits("1000", 6));
    return { admin, operator, investor, secondInvestor, usdc, factory };
  }

  async function createDeal(fixture) {
    const { operator, factory } = fixture;
    const latest = await ethers.provider.getBlock("latest");
    const tx = await factory.connect(operator).createDeal(
      "Northstar Solar Income Pool",
      "deal-metadata-001",
      "ipfs://deal",
      ethers.parseUnits("500", 6),
      ethers.parseUnits("100", 6),
      ethers.parseUnits("10", 6),
      latest.timestamp + 30 * 24 * 60 * 60,
    );
    const receipt = await tx.wait();
    const event = receipt.logs.map((log) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return undefined;
      }
    }).find((log) => log?.name === "DealCreated");
    const dealAddress = event.args.dealVault;
    const deal = await ethers.getContractAt("DealVaultV2", dealAddress);
    return { deal, dealAddress };
  }

  it("creates a deal with stable ID and metadata linkage", async function () {
    const fixture = await deployFixture();
    const { operator, factory } = fixture;
    const latest = await ethers.provider.getBlock("latest");

    await expect(factory.connect(operator).createDeal(
      "Northstar Solar Income Pool",
      "deal-metadata-001",
      "ipfs://deal",
      ethers.parseUnits("500", 6),
      ethers.parseUnits("100", 6),
      ethers.parseUnits("10", 6),
      latest.timestamp + 30 * 24 * 60 * 60,
    ))
      .to.emit(factory, "DealCreated")
      .withArgs(
        0,
        anyValue,
        operator.address,
        "deal-metadata-001",
        ethers.parseUnits("500", 6),
        ethers.parseUnits("100", 6),
        ethers.parseUnits("10", 6),
        latest.timestamp + 30 * 24 * 60 * 60,
      );

    expect(await factory.dealCount()).to.equal(1);
  });

  it("accepts investments and emits raised total", async function () {
    const fixture = await deployFixture();
    const { investor, usdc } = fixture;
    const { deal } = await createDeal(fixture);
    const amount = ethers.parseUnits("100", 6);

    await usdc.connect(investor).approve(await deal.getAddress(), amount);
    await expect(deal.connect(investor).invest(amount))
      .to.emit(deal, "DealInvestment")
      .withArgs(0, investor.address, amount, 10, amount);

    expect(await deal.getShareBalance(investor.address)).to.equal(10);
    expect(await deal.totalRaised()).to.equal(amount);
  });

  it("closes a deal and prevents new investment", async function () {
    const fixture = await deployFixture();
    const { operator, investor, usdc } = fixture;
    const { deal } = await createDeal(fixture);
    const amount = ethers.parseUnits("100", 6);

    await usdc.connect(investor).approve(await deal.getAddress(), amount);
    await deal.connect(investor).invest(amount);

    await expect(deal.connect(operator).closeRaise())
      .to.emit(deal, "DealRaiseClosed")
      .withArgs(0, operator.address, amount, anyValue);

    await expect(deal.connect(investor).invest(amount)).to.be.revertedWith("Raise closed");
  });

  it("distributes and claims revenue pro rata", async function () {
    const fixture = await deployFixture();
    const { operator, investor, secondInvestor, usdc } = fixture;
    const { deal } = await createDeal(fixture);
    const amount = ethers.parseUnits("100", 6);
    const revenue = ethers.parseUnits("30", 6);

    await usdc.connect(investor).approve(await deal.getAddress(), amount);
    await usdc.connect(secondInvestor).approve(await deal.getAddress(), amount);
    await deal.connect(investor).invest(amount);
    await deal.connect(secondInvestor).invest(amount);

    await usdc.connect(operator).approve(await deal.getAddress(), revenue);
    await expect(deal.connect(operator).distributeRevenue(revenue))
      .to.emit(deal, "DealRevenueDistributed")
      .withArgs(0, operator.address, revenue, anyValue);

    expect(await deal.pendingYield(investor.address)).to.equal(ethers.parseUnits("15", 6));
    await expect(deal.connect(investor).claimYield())
      .to.emit(deal, "DealYieldClaimed")
      .withArgs(0, investor.address, ethers.parseUnits("15", 6));
  });

  it("rejects investment after funding deadline", async function () {
    const fixture = await deployFixture();
    const { investor, usdc } = fixture;
    const { deal } = await createDeal(fixture);
    const amount = ethers.parseUnits("100", 6);

    await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine");
    await usdc.connect(investor).approve(await deal.getAddress(), amount);

    await expect(deal.connect(investor).invest(amount)).to.be.revertedWith("Raise closed");
  });
});
