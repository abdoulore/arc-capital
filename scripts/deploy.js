const { ethers } = require("hardhat");

const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const USDC_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

async function deploy(name, ...args) {
  const Factory = await ethers.getContractFactory(name);
  const contract = await Factory.deploy(...args);
  await contract.waitForDeployment();
  console.log(`${name}:`, await contract.getAddress());
  return contract;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const usdcAddress = process.env.USDC_ADDRESS || ARC_USDC_ADDRESS;
  const usdc = new ethers.Contract(usdcAddress, USDC_ABI, deployer);

  console.log("Deploying with:", deployer.address);
  console.log("USDC:", usdcAddress);

  const Vault = await ethers.getContractFactory("MonthlyVaultUpgradeable");
  const vaultImpl = await deploy("MonthlyVaultUpgradeable");

  const Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const initData = Vault.interface.encodeFunctionData("initialize", [usdcAddress]);
  const proxy = await Proxy.deploy(await vaultImpl.getAddress(), initData);
  await proxy.waitForDeployment();
  const vault = Vault.attach(await proxy.getAddress());
  console.log("MonthlyVault Proxy:", await proxy.getAddress());

  const strategy = await deploy("MockStrategy", usdcAddress, await vault.getAddress());

  await (await vault.setIdleBuffer(1000)).wait();
  await (await vault.setWithdrawLimit(5000)).wait();
  await (await vault.addStrategy(await strategy.getAddress(), 10000)).wait();

  const vaultFactory = await deploy("VaultFactory", usdcAddress, deployer.address);
  const longTermVault = await deploy("LongTermVault", usdcAddress, deployer.address, deployer.address);
  const dealFactory = await deploy("DealVaultFactory", usdcAddress, deployer.address);
  const marketplace = await deploy("Marketplace", usdcAddress);
  const yieldRouter = await deploy("YieldRouter", usdcAddress, deployer.address, deployer.address);
  const navOracle = await deploy("NAVOracle", deployer.address);

  const sampleDealAddress = await createSampleDeal(dealFactory);
  await maybeSeedLongTermReserve(usdc, longTermVault);
  await maybeSeedMarketplace(usdc, sampleDealAddress, marketplace);

  console.log("Configured monthly vault");
  console.log("Frontend environment:");
  console.log("NEXT_PUBLIC_USDC_ADDRESS=", usdcAddress);
  console.log("NEXT_PUBLIC_VAULT_ADDRESS=", await vault.getAddress());
  console.log("NEXT_PUBLIC_LONG_TERM_VAULT_ADDRESS=", await longTermVault.getAddress());
  console.log("NEXT_PUBLIC_VAULT_FACTORY_ADDRESS=", await vaultFactory.getAddress());
  console.log("NEXT_PUBLIC_DEAL_FACTORY_ADDRESS=", await dealFactory.getAddress());
  console.log("NEXT_PUBLIC_SAMPLE_DEAL_ADDRESS=", sampleDealAddress);
  console.log("NEXT_PUBLIC_MARKETPLACE_ADDRESS=", await marketplace.getAddress());
  console.log("NEXT_PUBLIC_YIELD_ROUTER_ADDRESS=", await yieldRouter.getAddress());
  console.log("NEXT_PUBLIC_NAV_ORACLE_ADDRESS=", await navOracle.getAddress());
}

async function createSampleDeal(dealFactory) {
  await (
    await dealFactory.createDeal(
      "Solar Credit Facility",
      "",
      ethers.parseUnits("750000", 6),
      ethers.parseUnits("250000", 6),
      ethers.parseUnits("1", 6),
      Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    )
  ).wait();
  const sampleDealAddress = await dealFactory.allDeals(0);
  console.log("Sample Deal:", sampleDealAddress);
  return sampleDealAddress;
}

async function maybeSeedLongTermReserve(usdc, longTermVault) {
  const reserveAmount = ethers.parseUnits(process.env.SEED_LONG_TERM_RESERVE_USDC || "0", 6);
  if (reserveAmount === 0n) return;
  await assertBalance(usdc, reserveAmount, "long-term reserve seed");
  await (await usdc.transfer(await longTermVault.getAddress(), reserveAmount)).wait();
  console.log("Seeded LongTermVault reserve:", ethers.formatUnits(reserveAmount, 6), "USDC");
}

async function maybeSeedMarketplace(usdc, sampleDealAddress, marketplace) {
  const seedAmount = ethers.parseUnits(process.env.SEED_SAMPLE_DEAL_USDC || "0", 6);
  if (seedAmount === 0n) return;

  await assertBalance(usdc, seedAmount, "sample deal seed");
  const sampleDeal = await ethers.getContractAt("DealVault", sampleDealAddress);
  await (await usdc.approve(sampleDealAddress, seedAmount)).wait();
  await (await sampleDeal.invest(seedAmount)).wait();
  await (await sampleDeal.setApprovalForAll(await marketplace.getAddress(), true)).wait();
  await (await marketplace.createListing(sampleDealAddress, 0, 500, ethers.parseUnits("1.05", 6))).wait();
  console.log("Seeded sample deal and marketplace listing");
}

async function assertBalance(usdc, amount, label) {
  const [deployer] = await ethers.getSigners();
  const balance = await usdc.balanceOf(deployer.address);
  if (balance < amount) {
    throw new Error(
      `Insufficient USDC for ${label}. Need ${ethers.formatUnits(amount, 6)}, have ${ethers.formatUnits(balance, 6)}.`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
