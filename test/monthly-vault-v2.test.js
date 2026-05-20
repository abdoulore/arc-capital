const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MonthlyVaultV2", function () {
  async function deployFixture() {
    const [admin, user, operator] = await ethers.getSigners();
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const usdc = await ERC20Mock.deploy("Mock USDC", "USDC", admin.address, ethers.parseUnits("1000000", 6));
    const MonthlyVaultV2 = await ethers.getContractFactory("MonthlyVaultV2");
    const vault = await MonthlyVaultV2.deploy(await usdc.getAddress(), admin.address);
    await vault.grantRole(await vault.OPERATOR_ROLE(), operator.address);
    await usdc.mint(user.address, ethers.parseUnits("1000", 6));
    await usdc.mint(operator.address, ethers.parseUnits("1000", 6));
    return { admin, user, operator, usdc, vault };
  }

  it("deposits USDC and emits V2 deposit data", async function () {
    const { user, usdc, vault } = await deployFixture();
    const amount = ethers.parseUnits("100", 6);

    await usdc.connect(user).approve(await vault.getAddress(), amount);
    await expect(vault.connect(user).deposit(amount))
      .to.emit(vault, "MonthlyDeposit")
      .withArgs(user.address, amount, ethers.parseUnits("100", 6), ethers.parseUnits("1", 18));

    expect(await vault.shares(user.address)).to.equal(ethers.parseUnits("100", 6));
    expect(await vault.totalInvestorCapital()).to.equal(amount);
  });

  it("injects yield without minting new shares", async function () {
    const { user, operator, usdc, vault } = await deployFixture();
    const depositAmount = ethers.parseUnits("100", 6);
    const yieldAmount = ethers.parseUnits("10", 6);

    await usdc.connect(user).approve(await vault.getAddress(), depositAmount);
    await vault.connect(user).deposit(depositAmount);
    await usdc.connect(operator).approve(await vault.getAddress(), yieldAmount);

    await expect(vault.connect(operator).injectYield(yieldAmount))
      .to.emit(vault, "MonthlyYieldInjected")
      .withArgs(operator.address, yieldAmount, yieldAmount, depositAmount + yieldAmount);

    expect(await vault.totalShares()).to.equal(ethers.parseUnits("100", 6));
    expect(await vault.totalRoutedYield()).to.equal(yieldAmount);
  });

  it("applies penalty outside the withdrawal window", async function () {
    const { operator, user, usdc, vault } = await deployFixture();
    const amount = ethers.parseUnits("100", 6);
    const shareAmount = ethers.parseUnits("50", 6);

    await vault.connect(operator).configureMaxWithdraw(10000);
    await usdc.connect(user).approve(await vault.getAddress(), amount);
    await vault.connect(user).deposit(amount);
    await vault.connect(user).requestWithdraw(shareAmount);

    await expect(vault.connect(user).executeWithdraw())
      .to.emit(vault, "MonthlyWithdrawExecuted")
      .withArgs(
        user.address,
        1,
        shareAmount,
        ethers.parseUnits("50", 6),
        ethers.parseUnits("1", 6),
        ethers.parseUnits("49", 6),
        false,
      );
  });

  it("allows penalty-free withdrawals inside the window", async function () {
    const { operator, user, usdc, vault } = await deployFixture();
    const amount = ethers.parseUnits("100", 6);
    const shareAmount = ethers.parseUnits("50", 6);
    const latest = await ethers.provider.getBlock("latest");

    await vault.connect(operator).configureMaxWithdraw(10000);
    await vault.connect(operator).configureWithdrawalWindow(latest.timestamp, 7 * 24 * 60 * 60);
    await usdc.connect(user).approve(await vault.getAddress(), amount);
    await vault.connect(user).deposit(amount);
    await vault.connect(user).requestWithdraw(shareAmount);

    await expect(vault.connect(user).executeWithdraw())
      .to.emit(vault, "MonthlyWithdrawExecuted")
      .withArgs(
        user.address,
        1,
        shareAmount,
        ethers.parseUnits("50", 6),
        0,
        ethers.parseUnits("50", 6),
        true,
      );
  });
});
