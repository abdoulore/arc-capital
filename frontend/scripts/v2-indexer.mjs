import fs from "node:fs";
import path from "node:path";
import { createPublicClient, decodeEventLog, http, parseAbiItem } from "viem";

loadEnvFile(path.resolve(process.cwd(), "..", ".env"));
loadEnvFile(path.resolve(process.cwd(), ".env"));

const ARC_TESTNET_CHAIN_ID = 5_042_002;
const RPC_URL = process.env.ARC_TESTNET_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network";
const INGEST_URL = process.env.V2_INDEXER_INGEST_URL ?? "http://localhost:3000/api/v2/indexer/events";
const INDEXER_WEBHOOK_SECRET = process.env.INDEXER_WEBHOOK_SECRET;
const FROM_BLOCK = BigInt(process.env.V2_INDEXER_FROM_BLOCK ?? "0");
const TO_BLOCK = process.env.V2_INDEXER_TO_BLOCK ? BigInt(process.env.V2_INDEXER_TO_BLOCK) : undefined;
const CHUNK_SIZE = BigInt(process.env.V2_INDEXER_CHUNK_SIZE ?? "1000");
const USDC_DECIMAL_SCALE = BigInt(1_000_000);
const SHARE_DECIMAL_SCALE = BigInt(1_000_000);

const arcTestnet = {
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
};

const configuredContracts = [
  { source: "monthlyVault", address: process.env.NEXT_PUBLIC_MONTHLY_VAULT_V2_ADDRESS ?? process.env.NEXT_PUBLIC_VAULT_ADDRESS },
  { source: "longTermVault", address: process.env.NEXT_PUBLIC_LONG_TERM_VAULT_V2_ADDRESS ?? process.env.NEXT_PUBLIC_LONG_TERM_VAULT_ADDRESS },
  { source: "dealFactory", address: process.env.NEXT_PUBLIC_DEAL_FACTORY_V2_ADDRESS ?? process.env.NEXT_PUBLIC_DEAL_FACTORY_ADDRESS },
  { source: "marketplace", address: process.env.NEXT_PUBLIC_MARKETPLACE_V2_ADDRESS ?? process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS },
  { source: "sampleDeal", address: process.env.NEXT_PUBLIC_SAMPLE_DEAL_ADDRESS },
].filter((item) => isAddressLike(item.address));

const eventDefinitions = [
  parseAbiItem("event MonthlyDeposit(address indexed user, uint256 assets, uint256 shares, uint256 pricePerShareAfter)"),
  parseAbiItem("event MonthlyWithdrawRequested(address indexed user, uint256 indexed requestId, uint256 shares, uint256 grossAssets, uint256 requestTime)"),
  parseAbiItem("event MonthlyWithdrawExecuted(address indexed user, uint256 indexed requestId, uint256 shares, uint256 grossAssets, uint256 penalty, uint256 netAssets, bool inWindow)"),
  parseAbiItem("event MonthlyYieldInjected(address indexed operator, uint256 amount, uint256 routedYieldAfter, uint256 navAfter)"),
  parseAbiItem("event Deposit(address indexed user, uint256 amount, uint256 shares)"),
  parseAbiItem("event Withdraw(address indexed user, uint256 amount)"),
  parseAbiItem("event WithdrawRequested(address indexed user, uint256 shares)"),
  parseAbiItem("event FixedIncomePositionOpened(address indexed user, uint256 indexed positionId, uint256 principal, uint256 duration, uint256 apyBps, uint256 start, uint256 maturity)"),
  parseAbiItem("event FixedIncomeYieldClaimed(address indexed user, uint256 indexed positionId, uint256 amount, uint256 lastClaimAfter)"),
  parseAbiItem("event FixedIncomeRedeemed(address indexed user, uint256 indexed positionId, uint256 principal, uint256 yieldPaid)"),
  parseAbiItem("event FixedIncomeEarlyExited(address indexed user, uint256 indexed positionId, uint256 returnedPrincipal, uint256 penalty)"),
  parseAbiItem("event Deposited(address indexed user, uint256 indexed positionId, uint256 amount, uint256 duration, uint256 apyBps)"),
  parseAbiItem("event YieldClaimed(address indexed user, uint256 indexed positionId, uint256 amount)"),
  parseAbiItem("event Redeemed(address indexed user, uint256 indexed positionId, uint256 principal)"),
  parseAbiItem("event EarlyExited(address indexed user, uint256 indexed positionId, uint256 returnedPrincipal, uint256 penalty)"),
  parseAbiItem("event Invested(address indexed investor, uint256 assets, uint256 shares)"),
  parseAbiItem("event RevenueDistributed(address indexed source, uint256 amount)"),
  parseAbiItem("event YieldClaimed(address indexed investor, uint256 amount)"),
  parseAbiItem("event RaiseClosed()"),
  parseAbiItem("event DealCreated(uint256 indexed dealId, address indexed dealVault, address indexed operator, string metadataId, uint256 targetRaise, uint256 minRaise, uint256 pricePerShare, uint256 closeTime)"),
  parseAbiItem("event DealInvestment(uint256 indexed dealId, address indexed investor, uint256 assets, uint256 shares, uint256 totalRaisedAfter)"),
  parseAbiItem("event DealRaiseClosed(uint256 indexed dealId, address indexed operator, uint256 totalRaised, uint256 closedAt)"),
  parseAbiItem("event DealRevenueDistributed(uint256 indexed dealId, address indexed operator, uint256 amount, uint256 accRevenuePerShareAfter)"),
  parseAbiItem("event DealYieldClaimed(uint256 indexed dealId, address indexed investor, uint256 amount)"),
  parseAbiItem("event ListingCreated(uint256 indexed listingId, address indexed seller, address indexed token, uint256 dealId, uint256 amount, uint256 pricePerShare)"),
  parseAbiItem("event MarketplaceListingCreated(uint256 indexed listingId, uint256 indexed dealId, address indexed seller, address token, uint256 amount, uint256 pricePerShare)"),
  parseAbiItem("event MarketplaceListingFilled(uint256 indexed listingId, uint256 indexed dealId, address indexed buyer, address seller, uint256 amount, uint256 totalPrice, uint256 amountRemaining)"),
  parseAbiItem("event MarketplaceListingCancelled(uint256 indexed listingId, uint256 indexed dealId, address indexed seller, address token, uint256 returnedShares)"),
  parseAbiItem("event ListingFilled(uint256 indexed listingId, address indexed buyer, uint256 amount, uint256 totalPrice)"),
  parseAbiItem("event ListingCancelled(uint256 indexed listingId)"),
];

const client = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL) });

async function main() {
  if (configuredContracts.length === 0) {
    console.log("No configured contracts found. Set NEXT_PUBLIC_* contract addresses first.");
    return;
  }

  const latest = TO_BLOCK ?? await client.getBlockNumber();
  console.log(`Ingest target: ${sanitizeUrl(INGEST_URL)}`);
  console.log(`Scanning ${configuredContracts.length} contract(s) from block ${FROM_BLOCK} to ${latest} in chunks of ${CHUNK_SIZE}.`);
  let accepted = 0;
  let inserted = 0;
  for (let fromBlock = FROM_BLOCK; fromBlock <= latest; fromBlock += CHUNK_SIZE + BigInt(1)) {
    const toBlock = minBigInt(fromBlock + CHUNK_SIZE, latest);
    const events = [];
    for (const contract of configuredContracts) {
      const logs = await client.getLogs({ address: contract.address, fromBlock, toBlock });
      for (const log of logs) {
        const normalized = normalizeLog(log);
        if (normalized) events.push(normalized);
      }
    }
    if (events.length === 0) continue;
    const result = await submitEvents(events);
    accepted += result.accepted ?? events.length;
    inserted += result.inserted ?? 0;
    console.log(`Indexed blocks ${fromBlock}-${toBlock}: ${events.length} events, ${result.inserted ?? 0} inserted.`);
  }

  console.log(`Done. Accepted ${accepted} events, inserted ${inserted}.`);
}

function normalizeLog(log) {
  for (const abiItem of eventDefinitions) {
    try {
      const decoded = decodeEventLog({ abi: [abiItem], data: log.data, topics: log.topics });
      return {
        chainId: ARC_TESTNET_CHAIN_ID,
        contractAddress: log.address,
        eventName: decoded.eventName,
        txHash: log.transactionHash,
        logIndex: log.logIndex,
        blockNumber: log.blockNumber.toString(),
        actorWallet: inferActor(decoded.args),
        payload: serializeArgs(decoded.args),
      };
    } catch {
      // Try the next known event signature.
    }
  }
  return undefined;
}

async function submitEvents(events) {
  const response = await fetch(INGEST_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(INDEXER_WEBHOOK_SECRET ? { "x-indexer-secret": INDEXER_WEBHOOK_SECRET } : {}),
    },
    body: JSON.stringify({ events }),
  });
  if (!response.ok) {
    throw new Error(`Indexer ingest failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

function inferActor(args) {
  return args?.user ?? args?.investor ?? args?.seller ?? args?.buyer ?? args?.source;
}

function serializeArgs(args) {
  return Object.fromEntries(
    Object.entries(args ?? {}).map(([key, value]) => {
      if (key === "shares" || key === "shareAmount") return [key, sharesFromRaw(value)];
      if (isUsdcLikeKey(key)) return [key, usdcFromRaw(value)];
      return [key, serializeValue(value)];
    }),
  );
}

function serializeValue(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, serializeValue(nested)]));
  }
  return value;
}

function isUsdcLikeKey(key) {
  return new Set(["amount", "assets", "grossAssets", "netAssets", "penalty", "principal", "totalPrice", "returnedPrincipal"]).has(key);
}

function usdcFromRaw(value) {
  if (typeof value !== "bigint") return value;
  const whole = value / USDC_DECIMAL_SCALE;
  const fraction = value % USDC_DECIMAL_SCALE;
  return `${whole.toString()}.${fraction.toString().padStart(6, "0")}`;
}

function sharesFromRaw(value) {
  if (typeof value !== "bigint") return value;
  const whole = value / SHARE_DECIMAL_SCALE;
  const fraction = value % SHARE_DECIMAL_SCALE;
  return `${whole.toString()}.${fraction.toString().padStart(6, "0").replace(/0+$/, "") || "0"}`;
}

function minBigInt(a, b) {
  return a < b ? a : b;
}

function isAddressLike(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function sanitizeUrl(value) {
  return value.replace(/(secret=)[^&\s]+/i, "$1[hidden]");
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
  console.error(error);
  process.exitCode = 1;
});
