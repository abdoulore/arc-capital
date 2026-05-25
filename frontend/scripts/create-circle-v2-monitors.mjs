import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createPublicClient, decodeEventLog, http, parseAbiItem } from "viem";

loadEnvFile(path.resolve(process.cwd(), "..", ".env"));
loadEnvFile(path.resolve(process.cwd(), ".env"));

const BLOCKCHAIN = "ARC-TESTNET";
const ARC_TESTNET_CHAIN_ID = 5_042_002;
const RPC_URL = process.env.ARC_TESTNET_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network";
const DISCOVERY_FROM_BLOCK = BigInt(process.env.V2_MONITOR_FROM_BLOCK ?? process.env.V2_INDEXER_FROM_BLOCK ?? "0");
const DISCOVERY_TO_BLOCK = process.env.V2_MONITOR_TO_BLOCK ? BigInt(process.env.V2_MONITOR_TO_BLOCK) : undefined;
const DISCOVERY_CHUNK_SIZE = BigInt(process.env.V2_MONITOR_CHUNK_SIZE ?? "9000");
const API_KEY = process.env.CIRCLE_API_KEY;
const ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET;

const arcTestnet = {
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
};

const dealCreatedEvent = parseAbiItem(
  "event DealCreated(uint256 indexed dealId, address indexed dealVault, address indexed operator, string metadataId, uint256 targetRaise, uint256 minRaise, uint256 pricePerShare, uint256 closeTime)",
);

const dealVaultEvents = [
  "DealInvestment(uint256,address,uint256,uint256,uint256)",
  "DealRaiseClosed(uint256,address,uint256,uint256)",
  "DealRevenueDistributed(uint256,address,uint256,uint256)",
  "DealYieldClaimed(uint256,address,uint256)",
];

const baseContracts = [
  {
    name: "MonthlyVaultV2",
    description: "ArcCapitalV2MonthlyVault",
    address: process.env.NEXT_PUBLIC_MONTHLY_VAULT_V2_ADDRESS,
    events: [
      "MonthlyDeposit(address,uint256,uint256,uint256)",
      "MonthlyWithdrawRequested(address,uint256,uint256,uint256,uint256)",
      "MonthlyWithdrawExecuted(address,uint256,uint256,uint256,uint256,uint256,bool)",
      "MonthlyYieldInjected(address,uint256,uint256,uint256)",
    ],
  },
  {
    name: "LongTermVaultV2",
    description: "ArcCapitalV2LongTermVault",
    address: process.env.NEXT_PUBLIC_LONG_TERM_VAULT_V2_ADDRESS,
    events: [
      "FixedIncomePositionOpened(address,uint256,uint256,uint256,uint256,uint256,uint256)",
      "FixedIncomeYieldClaimed(address,uint256,uint256,uint256)",
      "FixedIncomeRedeemed(address,uint256,uint256,uint256)",
      "FixedIncomeEarlyExited(address,uint256,uint256,uint256)",
    ],
  },
  {
    name: "DealFactoryV2",
    description: "ArcCapitalV2DealFactory",
    address: process.env.NEXT_PUBLIC_DEAL_FACTORY_V2_ADDRESS,
    events: ["DealCreated(uint256,address,address,string,uint256,uint256,uint256,uint256)"],
  },
  {
    name: "MarketplaceV2",
    description: "ArcCapitalV2Marketplace",
    address: process.env.NEXT_PUBLIC_MARKETPLACE_V2_ADDRESS,
    events: [
      "MarketplaceListingCreated(uint256,uint256,address,address,uint256,uint256)",
      "MarketplaceListingFilled(uint256,uint256,address,address,uint256,uint256,uint256)",
      "MarketplaceListingCancelled(uint256,uint256,address,address,uint256)",
    ],
  },
].filter((contract) => isAddressLike(contract.address));

async function main() {
  if (!API_KEY) {
    throw new Error("Missing CIRCLE_API_KEY. Add it to .env or frontend/.env before running this script.");
  }

  const contracts = await buildContracts();

  if (contracts.length === 0) {
    console.log("No V2 contracts found. Set NEXT_PUBLIC_*_V2_ADDRESS env vars first.");
    return;
  }

  console.log("Using V2 contracts:");
  for (const contract of contracts) {
    console.log(`- ${contract.name}: ${contract.address}`);
  }

  const { initiateSmartContractPlatformClient } = await importSmartContractPlatformSdk();
  const scpClient = initiateSmartContractPlatformClient({
    apiKey: API_KEY,
    ...(ENTITY_SECRET ? { entitySecret: ENTITY_SECRET } : {}),
  });

  for (const contract of contracts) {
    await importContract(scpClient, contract);
    for (const eventSignature of contract.events) {
      await createMonitor(scpClient, contract, eventSignature);
    }
  }

  console.log("Circle V2 event monitor setup complete.");
}

async function buildContracts() {
  const dealVaults = new Set(dealVaultAddresses().map((address) => address.toLowerCase()));
  for (const address of await discoverDealVaultAddresses()) {
    dealVaults.add(address.toLowerCase());
  }

  const dealVaultContracts = [...dealVaults].map((address, index) => ({
    name: `DealVaultV2${index + 1}`,
    description: "ArcCapitalV2DealVault",
    address,
    events: dealVaultEvents,
  }));

  return [...baseContracts, ...dealVaultContracts].filter((contract) => isAddressLike(contract.address));
}

async function discoverDealVaultAddresses() {
  const factoryAddress = process.env.NEXT_PUBLIC_DEAL_FACTORY_V2_ADDRESS;
  if (!isAddressLike(factoryAddress)) return [];

  const client = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL) });
  const latest = DISCOVERY_TO_BLOCK ?? await client.getBlockNumber();
  const discovered = new Set();

  console.log(`Discovering deal vaults from factory events: ${factoryAddress}`);
  for (let fromBlock = DISCOVERY_FROM_BLOCK; fromBlock <= latest; fromBlock += DISCOVERY_CHUNK_SIZE + BigInt(1)) {
    const toBlock = minBigInt(fromBlock + DISCOVERY_CHUNK_SIZE, latest);
    const logs = await client.getLogs({ address: factoryAddress, event: dealCreatedEvent, fromBlock, toBlock });
    for (const log of logs) {
      const decoded = decodeEventLog({ abi: [dealCreatedEvent], data: log.data, topics: log.topics });
      const dealVault = decoded.args?.dealVault;
      if (isAddressLike(dealVault)) discovered.add(dealVault);
    }
  }

  if (discovered.size > 0) {
    console.log(`Discovered ${discovered.size} deal vault monitor target(s).`);
  }

  return [...discovered];
}

async function importContract(scpClient, contract) {
  try {
    await scpClient.importContract({
      address: contract.address,
      blockchain: BLOCKCHAIN,
      idempotencyKey: crypto.randomUUID(),
      name: contract.name,
      description: contract.description,
    });
    console.log(`Imported ${contract.name}: ${contract.address}`);
  } catch (error) {
    if (isCircleCode(error, 175004) || includesMessage(error, "duplicate") || includesMessage(error, "already")) {
      console.log(`Import exists for ${contract.name}: ${contract.address}`);
      return;
    }
    throw annotate(error, `Import failed for ${contract.name} (${contract.address})`);
  }
}

async function createMonitor(scpClient, contract, eventSignature) {
  try {
    await scpClient.createEventMonitor({
      blockchain: BLOCKCHAIN,
      contractAddress: contract.address,
      eventSignature,
      idempotencyKey: crypto.randomUUID(),
    });
    console.log(`Created monitor: ${contract.name} ${eventSignature}`);
  } catch (error) {
    if (isCircleCode(error, 175302) || includesMessage(error, "duplicate") || includesMessage(error, "already")) {
      console.log(`Monitor exists: ${contract.name} ${eventSignature}`);
      return;
    }
    throw annotate(error, `Monitor failed for ${contract.name} ${eventSignature}`);
  }
}

async function importSmartContractPlatformSdk() {
  try {
    return await import("@circle-fin/smart-contract-platform");
  } catch {
    throw new Error(
      "Missing @circle-fin/smart-contract-platform. Run `npm install` in frontend after pulling this change.",
    );
  }
}

function dealVaultAddresses() {
  return (process.env.DEAL_VAULT_V2_ADDRESSES ?? process.env.NEXT_PUBLIC_DEAL_VAULT_V2_ADDRESSES ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(isAddressLike);
}

function isAddressLike(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function minBigInt(a, b) {
  return a < b ? a : b;
}

function isCircleCode(error, code) {
  return error?.code === code || error?.response?.data?.code === code || error?.data?.code === code;
}

function includesMessage(error, text) {
  const message = `${error?.message ?? ""} ${JSON.stringify(error?.response?.data ?? error?.data ?? {})}`.toLowerCase();
  return message.includes(text.toLowerCase());
}

function annotate(error, prefix) {
  const circleDetails = error?.response?.data ? ` ${JSON.stringify(error.response.data)}` : "";
  error.message = `${prefix}: ${error.message}${circleDetails}`;
  return error;
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const raw = fs.readFileSync(file, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

main().catch((error) => {
  console.error(safeErrorMessage(error));
  process.exitCode = 1;
});

function safeErrorMessage(error) {
  if (!error || typeof error !== "object") return String(error);
  const responseData = error.response?.data ?? error.data;
  const circlePayload = responseData ? ` ${JSON.stringify(responseData)}` : "";
  return `${error.message ?? "Circle monitor setup failed."}${circlePayload}`;
}
