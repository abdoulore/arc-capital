const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

const YEAR = 365 * 24 * 60 * 60;
const MONTH = 30 * 24 * 60 * 60;

describe("LongTermVaultV2", function () {
  async function deployFixture() {
    const [admin, user, operator, treasury] = await ethers.getSigners();
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const usdc = await ERC20Mock.deploy("Mock USDC", "USDC", admin.address, ethers.parseUnits("1000000", 6));
    const LongTermVaultV2 = await ethers.getContractFactory("LongTermVaultV2");
    const vault = await LongTermVaultV2.deploy(await usdc.getAddress(), treasury.address, admin.address);
    await vault.grantRole(await vault.OPERATOR_ROLE(), operator.address);
    await usdc.mint(user.address, ethers.parseUnits("1000", 6));
    await usdc.mint(await vault.getAddress(), ethers.parseUnits("1000", 6));
    return { admin, user, operator, treasury, usdc, vault };
  }

  it("opens a fixed-income position with maturity metadata", async function () {
    const { user, usdc, vault } = await deployFixture();
    const amount = ethers.parseUnits("100", 6);

    await usdc.connect(user).approve(await vault.getAddress(), amount);
    await expect(vault.connect(user).deposit(amount, YEAR))
      .to.emit(vault, "FixedIncomePositionOpened")
      .withArgs(user.address, 0, amount, YEAR, 800, anyValue, anyValue);

    const ids = await vault.getUserPositions(user.address);
    expect(ids).to.deep.equal([0n]);
    const position = await vault.positions(0);
    expect(position.maturity - position.start).to.equal(YEAR);
  });

  it("claims deterministic monthly yield", async function () {
    const { user, usdc, vault } = await deployFixture();
    const amount = ethers.parseUnits("100", 6);

    await usdc.connect(user).approve(await vault.getAddress(), amount);
    await vault.connect(user).deposit(amount, YEAR);
    await ethers.provider.send("evm_increaseTime", [MONTH]);
    await ethers.provider.send("evm_mine");

    const expectedYield = amount * 800n * BigInt(MONTH) / (10000n * BigInt(YEAR));
    await expect(vault.connect(user).claimYield(0))
      .to.emit(vault, "FixedIncomeYieldClaimed")
      .withArgs(user.address, 0, expectedYield, await currentTimestampRoundedToClaim(vault, 0));
  });

  it("redeems principal and yield at maturity", async function () {
    const { user, usdc, vault } = await deployFixture();
    const amount = ethers.parseUnits("100", 6);

    await usdc.connect(user).approve(await vault.getAddress(), amount);
    await vault.connect(user).deposit(amount, YEAR);
    await ethers.provider.send("evm_increaseTime", [YEAR]);
    await ethers.provider.send("evm_mine");

    const expectedYield = amount * 800n * BigInt(12 * MONTH) / (10000n * BigInt(YEAR));
    await expect(vault.connect(user).redeemAtMaturity(0))
      .to.emit(vault, "FixedIncomeRedeemed")
      .withArgs(user.address, 0, amount, expectedYield);
  });

  it("supports early exit with penalty preview", async function () {
    const { user, treasury, usdc, vault } = await deployFixture();
    const amount = ethers.parseUnits("100", 6);

    await usdc.connect(user).approve(await vault.getAddress(), amount);
    await vault.connect(user).deposit(amount, YEAR);

    const [returnedPrincipal, penalty] = await vault.previewEarlyExit(0);
    expect(returnedPrincipal).to.equal(ethers.parseUnits("90", 6));
    expect(penalty).to.equal(ethers.parseUnits("10", 6));

    await expect(vault.connect(user).earlyExit(0))
      .to.emit(vault, "FixedIncomeEarlyExited")
      .withArgs(user.address, 0, returnedPrincipal, penalty);
    expect(await usdc.balanceOf(treasury.address)).to.equal(penalty);
  });

  it("emits operator on tranche configuration", async function () {
    const { operator, vault } = await deployFixture();

    await expect(vault.connect(operator).configureTranche(YEAR, 900, true))
      .to.emit(vault, "FixedIncomeTrancheConfigured")
      .withArgs(operator.address, YEAR, 900, true);
  });
});

async function currentTimestampRoundedToClaim(vault, positionId) {
  const position = await vault.positions(positionId);
  const latest = await ethers.provider.getBlock("latest");
  return position.lastClaim + BigInt(Math.floor((latest.timestamp - Number(position.lastClaim)) / MONTH) * MONTH);
}
