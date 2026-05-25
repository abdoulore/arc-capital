import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_RPC_URL } from "@/lib/arc";
import { arcCapitalContracts, isConfiguredAddress } from "@/lib/contracts";
import { normalizeArcLog } from "@/lib/v2-event-adapters";
import { getV2IndexerCursor, getV2PollDealVaultAddresses, ingestV2Events, updateV2IndexerCursor } from "@/lib/v2-store";

export const dynamic = "force-dynamic";

const CURSOR_NAME = "arc-v2-poller";
const MAX_BLOCKS = BigInt(process.env.V2_POLLER_MAX_BLOCKS ?? "500");
const ZERO = BigInt(0);
const ONE = BigInt(1);

const arcTestnet = {
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_TESTNET_RPC_URL] } },
  testnet: true,
} as const;

export async function GET(request: NextRequest) {
  return runPoll(request);
}

export async function POST(request: NextRequest) {
  return runPoll(request);
}

async function runPoll(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET_RPC_URL) });
  const latest = await client.getBlockNumber();
  const fallbackFrom = initialFromBlock(latest);
  const cursor = await getV2IndexerCursor(CURSOR_NAME, fallbackFrom - ONE);
  const fromBlock = cursor + ONE;

  if (fromBlock > latest) {
    return NextResponse.json({ status: "live", accepted: 0, inserted: 0, fromBlock: fromBlock.toString(), toBlock: latest.toString() });
  }

  const toBlock = minBigInt(fromBlock + MAX_BLOCKS - ONE, latest);
  const addresses = await pollAddresses();
  const blockTimestamps = new Map<bigint, string>();
  const events = [];

  for (const address of addresses) {
    const logs = await client.getLogs({ address, fromBlock, toBlock });
    for (const log of logs) {
      const blockTimestamp = await getBlockTimestamp(client, blockTimestamps, log.blockNumber);
      const normalized = normalizeArcLog(log, blockTimestamp);
      if (normalized) events.push(normalized);
    }
  }

  const result = events.length > 0 ? await ingestV2Events(events) : { status: "live", accepted: 0, inserted: 0, skipped: 0 };
  await updateV2IndexerCursor(CURSOR_NAME, toBlock);

  return NextResponse.json({
    ...result,
    fromBlock: fromBlock.toString(),
    toBlock: toBlock.toString(),
    latestBlock: latest.toString(),
    contractCount: addresses.length,
  });
}

async function pollAddresses() {
  const fixed = [
    arcCapitalContracts.monthlyVaultV2,
    arcCapitalContracts.longTermVaultV2,
    arcCapitalContracts.dealFactoryV2,
    arcCapitalContracts.marketplaceV2,
  ].filter(isConfiguredAddress);
  const dealVaults = await getV2PollDealVaultAddresses();
  return [...new Set([...fixed, ...dealVaults].map((address) => address.toLowerCase() as Address))];
}

async function getBlockTimestamp(client: ReturnType<typeof createPublicClient>, cache: Map<bigint, string>, blockNumber: bigint | null) {
  if (blockNumber === null) return undefined;
  const cached = cache.get(blockNumber);
  if (cached) return cached;
  const block = await client.getBlock({ blockNumber });
  const timestamp = new Date(Number(block.timestamp) * 1000).toISOString();
  cache.set(blockNumber, timestamp);
  return timestamp;
}

function initialFromBlock(latest: bigint) {
  const configured = process.env.V2_POLLER_FROM_BLOCK ?? process.env.V2_INDEXER_FROM_BLOCK;
  if (configured && /^\d+$/.test(configured)) return BigInt(configured);
  const lookback = BigInt(process.env.V2_POLLER_INITIAL_LOOKBACK ?? "5000");
  return latest > lookback ? latest - lookback : ZERO;
}

function isAuthorized(request: NextRequest) {
  const webhookSecret = process.env.INDEXER_WEBHOOK_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const querySecret = request.nextUrl.searchParams.get("secret");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(
    (webhookSecret && querySecret === webhookSecret) ||
      (webhookSecret && bearer === webhookSecret) ||
      (cronSecret && querySecret === cronSecret) ||
      (cronSecret && bearer === cronSecret),
  );
}

function minBigInt(a: bigint, b: bigint) {
  return a < b ? a : b;
}
