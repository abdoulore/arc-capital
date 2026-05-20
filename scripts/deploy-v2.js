const fs = require("node:fs");
const path = require("node:path");
const { ethers, network } = require("hardhat");

const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const ARC_TESTNET_CHAIN_ID = 5042002;

async function deploy(name, ...args) {
  const Factory = await ethers.getContractFactory(name);
  const contract = await Factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`${name}: ${address}`);
  return contract;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const usdcAddress = process.env.USDC_ADDRESS || process.env.NEXT_PUBLIC_USDC_ADDRESS || ARC_USDC_ADDRESS;
  const treasury = process.env.TREASURY_WALLET || deployer.address;
  const admin = process.env.ADMIN_WALLET || deployer.address;
  const operator = process.env.OPERATOR_WALLET || admin;

  console.log("Arc Capital V2 deployment");
  console.log("Network:", network.name);
  console.log("Chain ID:", network.config.chainId);
  console.log("Deployer:", deployer.address);
  console.log("Admin:", admin);
  console.log("Operator:", operator);
  console.log("Treasury:", treasury);
  console.log("USDC:", usdcAddress);

  if (network.config.chainId && network.config.chainId !== ARC_TESTNET_CHAIN_ID) {
    console.warn(`Warning: expected Arc Testnet chain ID ${ARC_TESTNET_CHAIN_ID}, got ${network.config.chainId}.`);
  }

  const monthlyVault = await deploy("MonthlyVaultV2", usdcAddress, admin);
  const longTermVault = await deploy("LongTermVaultV2", usdcAddress, treasury, admin);
  const dealFactory = await deploy("DealVaultFactoryV2", usdcAddress, admin);
  const marketplace = await deploy("MarketplaceV2", usdcAddress, admin);
  const yieldRouter = await deploy("YieldRouter", usdcAddress, treasury, admin);
  const navOracle = await deploy("NAVOracle", admin);

  await grantOperatorIfNeeded(monthlyVault, operator);
  await grantOperatorIfNeeded(longTermVault, operator);
  await grantOperatorIfNeeded(dealFactory, operator);
  await grantOperatorIfNeeded(marketplace, operator);
  await grantOperatorIfNeeded(yieldRouter, operator);

  const registry = {
    version: "v2",
    network: network.name,
    chainId: network.config.chainId ?? ARC_TESTNET_CHAIN_ID,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    admin,
    operator,
    treasury,
    contracts: {
      usdc: usdcAddress,
      monthlyVault: await monthlyVault.getAddress(),
      longTermVault: await longTermVault.getAddress(),
      dealFactory: await dealFactory.getAddress(),
      marketplace: await marketplace.getAddress(),
      yieldRouter: await yieldRouter.getAddress(),
      navOracle: await navOracle.getAddress(),
    },
  };

  writeRegistry(registry);
  printFrontendEnv(registry);
}

async function grantOperatorIfNeeded(contract, operator) {
  const role = await contract.OPERATOR_ROLE().catch(() => undefined);
  if (!role) return;
  if (await contract.hasRole(role, operator)) return;
  const tx = await contract.grantRole(role, operator);
  await tx.wait();
  console.log(`Granted OPERATOR_ROLE on ${await contract.getAddress()} to ${operator}`);
}

function writeRegistry(registry) {
  const outputDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outputDir, { recursive: true });
  const file = path.join(outputDir, `${registry.network}-${registry.chainId}-v2.json`);
  fs.writeFileSync(file, `${JSON.stringify(registry, null, 2)}\n`);
  console.log("Deployment registry:", file);
}

function printFrontendEnv(registry) {
  console.log("\nFrontend / Vercel env:");
  console.log(`NEXT_PUBLIC_USDC_ADDRESS=${registry.contracts.usdc}`);
  console.log(`NEXT_PUBLIC_VAULT_ADDRESS=${registry.contracts.monthlyVault}`);
  console.log(`NEXT_PUBLIC_LONG_TERM_VAULT_ADDRESS=${registry.contracts.longTermVault}`);
  console.log(`NEXT_PUBLIC_DEAL_FACTORY_ADDRESS=${registry.contracts.dealFactory}`);
  console.log(`NEXT_PUBLIC_MARKETPLACE_ADDRESS=${registry.contracts.marketplace}`);
  console.log(`NEXT_PUBLIC_MONTHLY_VAULT_V2_ADDRESS=${registry.contracts.monthlyVault}`);
  console.log(`NEXT_PUBLIC_LONG_TERM_VAULT_V2_ADDRESS=${registry.contracts.longTermVault}`);
  console.log(`NEXT_PUBLIC_DEAL_FACTORY_V2_ADDRESS=${registry.contracts.dealFactory}`);
  console.log(`NEXT_PUBLIC_MARKETPLACE_V2_ADDRESS=${registry.contracts.marketplace}`);
  console.log(`NEXT_PUBLIC_YIELD_ROUTER_ADDRESS=${registry.contracts.yieldRouter}`);
  console.log(`NEXT_PUBLIC_NAV_ORACLE_ADDRESS=${registry.contracts.navOracle}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
