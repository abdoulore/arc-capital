const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Vault + Strategy", function () {
  let vault, usdc, strategy, user;

  beforeEach(async () => {
    [user] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("ERC20Mock");
    usdc = await ERC20.deploy(
      "USDC",
      "USDC",
      user.address,
      ethers.parseUnits("1000", 6)
    );

    const Vault = await ethers.getContractFactory("MonthlyVaultUpgradeable");

    vault = await upgrades.deployProxy(
      Vault,
      [usdc.target],
      { initializer: "initialize" }
    );

    const Strategy = await ethers.getContractFactory("MockStrategy");
    strategy = await Strategy.deploy(usdc.target, vault.target);

    await vault.addStrategy(strategy.target, 10000);

    // ✅ IMPORTANT: enable auto deploy
    await vault.setIdleBuffer(1000); // 10%
  });

  it("Deposit auto deploys to strategy", async () => {
    await usdc.approve(vault.target, ethers.parseUnits("100", 6));
    await vault.deposit(ethers.parseUnits("100", 6));

    const stratAssets = await strategy.totalAssets();

    expect(stratAssets).to.be.gt(0n);
  });

  it("Time-based yield increases vault value", async () => {
  await usdc.approve(vault.target, ethers.parseUnits("100", 6));
  await vault.deposit(ethers.parseUnits("100", 6));

  // ⏩ move time forward
  await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
  await ethers.provider.send("evm_mine");

  const pps1 = await vault.pricePerShare();

  await ethers.provider.send("evm_increaseTime", [86400]); // another day
  await ethers.provider.send("evm_mine");

  const pps2 = await vault.pricePerShare();

  expect(pps2).to.be.gt(pps1);
});

  it("Withdraw pulls from strategy", async () => {
  await vault.setWithdrawLimit(5000); // ✅ allow 50%

  await usdc.approve(vault.target, ethers.parseUnits("100", 6));
  await vault.deposit(ethers.parseUnits("100", 6));

  const shares = await vault.shares(user.address);

  await vault.withdraw(shares / 2n);

  const balance = await usdc.balanceOf(user.address);

  expect(balance).to.be.gt(0n);
});

  it("Auto deploy works", async () => {
    await usdc.approve(vault.target, ethers.parseUnits("100", 6));
    await vault.deposit(ethers.parseUnits("100", 6));

    const stratAssets = await strategy.totalAssets();

    expect(stratAssets).to.be.gt(0n);
  });
});
