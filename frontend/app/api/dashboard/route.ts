import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, isAddress, parseAbiItem, type Address, type Hash } from "viem";
import {
  DEAL_FACTORY_ABI,
  DEAL_FACTORY_ADDRESS,
  DEAL_VAULT_ABI,
  LONG_TERM_VAULT_ABI,
  LONG_TERM_VAULT_ADDRESS,
  MARKETPLACE_ABI,
  MARKETPLACE_ADDRESS,
  SAMPLE_DEAL_ADDRESS,
  USDC_ABI,
  USDC_ADDRESS,
  VAULT_ABI,
  VAULT_ADDRESS,
} from "@/app/constants";
import { addDashboardSnapshot, getDashboardSnapshots, getDeals, type DealMetadata } from "@/lib/admin-store";
import { getLogsInChunks } from "@/lib/chain-logs";
import { ARC_TESTNET_RPC_URL, arcTestnet } from "@/lib/network";
import { formatTokenAmount } from "@/lib/utils";

const client = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_TESTNET_RPC_URL),
});

const WAD = BigInt(10) ** BigInt(18);
const SAMPLE_DEAL_SEED_SHARES = BigInt(249_500);
const SAMPLE_DEAL_SEED_INVESTMENT = BigInt(250_000_000_000);
const USDC_UNIT = "USDC" as const;
const SHARES_UNIT = "shares" as const;

type PositionTuple = readonly [
  Address,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  boolean,
];

type ActivityRow = {
  id: string;
  blockNumber?: bigint;
  hash?: Hash;
  action: string;
  amount?: bigint;
  amountLabel?: string;
  amountUnit?: "USDC" | "shares";
  secondaryAmount?: bigint;
  secondaryLabel?: string;
  secondaryUnit?: "USDC" | "shares";
  verb: string;
  detail?: string;
};

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  if (!address || !isAddress(address)) {
    return NextResponse.json(emptyDashboard(false));
  }

  try {
    const user = address as Address;
    const deals = await getDeals();
    const dealViews = await getDealViews(deals);
    const [walletLiquidity, monthlyShares, monthlyPricePerShare, monthlyTVL, positionIds] = await Promise.all([
      safeRead(BigInt(0), () => client.readContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: "balanceOf", args: [user] })),
      safeRead(BigInt(0), () => client.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "shares", args: [user] })),
      safeRead(WAD, () => client.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "pricePerShare" })),
      safeRead<bigint | undefined>(undefined, () => client.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "totalAssets" })),
      safeRead<readonly bigint[]>([], () => client.readContract({ address: LONG_TERM_VAULT_ADDRESS, abi: LONG_TERM_VAULT_ABI, functionName: "getUserPositions", args: [user] })),
    ]);

    const monthlyValue = (monthlyShares * monthlyPricePerShare) / WAD;
    const fixed = await getFixedIncomeSummary(user, positionIds);
    const deal = await getDealSummary(user, dealViews);
    const activity = await getTransactionHistory(user, dealViews, deals);

    const totalPortfolioValue = walletLiquidity + monthlyValue + fixed.principal + fixed.yield + deal.value + deal.yield;
    const totalYield = fixed.yield + deal.yield;
    await addDashboardSnapshot({
      wallet: user,
      totalPortfolioValue: totalPortfolioValue.toString(),
      totalYield: totalYield.toString(),
    });
    const yieldHistory = await getDashboardSnapshots(user);

    const allocations = [
      { label: "Wallet USDC", value: walletLiquidity, detail: "Available balance" },
      { label: "Monthly Vault", value: monthlyValue, detail: formatTokenAmount(monthlyShares, 6, "shares", 4) },
      { label: "Fixed Income", value: fixed.principal + fixed.yield, detail: `${fixed.activePositions} active positions` },
      { label: "Deal Holdings", value: deal.value + deal.yield, detail: `${deal.activeHoldings} active holdings` },
    ].filter((item) => item.value > BigInt(0));

    return NextResponse.json({
      isConnected: true,
      walletLiquidity: walletLiquidity.toString(),
      monthlyValue: monthlyValue.toString(),
      monthlyTVL: monthlyTVL?.toString(),
      fixedPrincipal: fixed.principal.toString(),
      fixedYield: fixed.yield.toString(),
      dealValue: deal.value.toString(),
      dealYield: deal.yield.toString(),
      totalPortfolioValue: totalPortfolioValue.toString(),
      totalYield: totalYield.toString(),
      activeFixedPositions: fixed.activePositions,
      activeDealHoldings: deal.activeHoldings,
      allocations: allocations.map((item) => ({ ...item, value: item.value.toString() })),
      yieldHistory,
      fixedPositions: fixed.positions,
      dealHoldings: deal.holdings,
      activity,
      dealStatuses: dealViews.map((dealView) => ({
        id: dealView.id,
        contractAddress: dealView.contractAddress,
        title: dealView.title,
        status: dealView.status,
      })),
    });
  } catch (error) {
    return NextResponse.json({ ...emptyDashboard(Boolean(address)), error: error instanceof Error ? error.message : "Dashboard aggregation failed." }, { status: 200 });
  }
}

async function getDealViews(deals: DealMetadata[]) {
  const metadataDeals = deals
    .map((deal) => ({ ...deal, contractAddress: deal.contractAddress as Address | undefined }))
    .filter((deal): deal is DealMetadata & { contractAddress: Address } => Boolean(deal.contractAddress && isAddress(deal.contractAddress)));
  const metadataWithCode = await filterDeployedDeals(metadataDeals);
  const byAddress = new Map(metadataWithCode.map((deal) => [deal.contractAddress.toLowerCase(), deal]));
  const dealCount = await safeRead(BigInt(0), async () => {
    if (!(await hasCode(DEAL_FACTORY_ADDRESS))) return BigInt(0);
    return client.readContract({ address: DEAL_FACTORY_ADDRESS, abi: DEAL_FACTORY_ABI, functionName: "dealCount" });
  });
  const factoryDeals = await Promise.all(
    Array.from({ length: Number(dealCount) }, (_, index) =>
      client.readContract({
        address: DEAL_FACTORY_ADDRESS,
        abi: DEAL_FACTORY_ABI,
        functionName: "allDeals",
        args: [BigInt(index)],
      }),
    ),
  );

  for (const contractAddress of factoryDeals) {
    if (!isAddress(contractAddress)) continue;
    if (!(await isDeployedContract(contractAddress))) continue;
    const key = contractAddress.toLowerCase();
    if (!byAddress.has(key)) {
      byAddress.set(key, {
        id: contractAddress,
        contractAddress,
        title: `Deal ${shortAddress(contractAddress)}`,
        status: "open",
      });
    }
  }

  const dealViews = await Promise.all(
    [...byAddress.values()].map(async (deal) => {
      const [raiseClosed, closeTime] = await Promise.all([
        client
          .readContract({ address: deal.contractAddress, abi: DEAL_VAULT_ABI, functionName: "raiseClosed" })
          .catch(() => deal.status === "closed"),
        client
          .readContract({ address: deal.contractAddress, abi: DEAL_VAULT_ABI, functionName: "closeTime" })
          .catch(() => undefined),
      ]);
      const closeTimeMs = typeof closeTime === "bigint" ? Number(closeTime) * 1000 : undefined;
      const deadlineMs = closeTimeMs ?? parseDeadlineMs(deal.fundingDeadline);
      const deadlinePassed = Boolean(deadlineMs && deadlineMs <= Date.now());
      const status: "open" | "closed" = raiseClosed || deadlinePassed || deal.status === "closed" ? "closed" : "open";
      return {
        ...deal,
        status,
        closeDate: status === "closed" ? deal.closeDate ?? (deadlineMs ? new Date(deadlineMs).toISOString() : undefined) : deal.closeDate,
      };
    }),
  );

  return dealViews;
}

async function filterDeployedDeals<T extends { contractAddress: Address }>(deals: T[]) {
  const checked = await Promise.all(
    deals.map(async (deal) => ({
      deal,
      deployed: await isDeployedContract(deal.contractAddress),
    })),
  );
  return checked.filter((item) => item.deployed).map((item) => item.deal);
}

async function isDeployedContract(address: Address) {
  return hasCode(address);
}

async function getFixedIncomeSummary(user: Address, positionIds: readonly bigint[]) {
  let principal = BigInt(0);
  let yieldAmount = BigInt(0);
  let activePositions = 0;
  const positions: Array<{ id: string; principal: string; claimableYield: string; maturity: string; apyBps: string; duration: string }> = [];

  for (const positionId of positionIds) {
    const [position, claimableYield] = await Promise.all([
      client.readContract({ address: LONG_TERM_VAULT_ADDRESS, abi: LONG_TERM_VAULT_ABI, functionName: "positions", args: [positionId] }),
      client.readContract({ address: LONG_TERM_VAULT_ADDRESS, abi: LONG_TERM_VAULT_ABI, functionName: "claimableYield", args: [positionId] }),
    ]);
    const typedPosition = position as PositionTuple;
    if (typedPosition[0].toLowerCase() === user.toLowerCase() && !typedPosition[7]) {
      activePositions += 1;
      principal += typedPosition[1];
      yieldAmount += claimableYield;
      positions.push({
        id: positionId.toString(),
        principal: typedPosition[1].toString(),
        claimableYield: claimableYield.toString(),
        maturity: typedPosition[5].toString(),
        apyBps: typedPosition[3].toString(),
        duration: typedPosition[2].toString(),
      });
    }
  }

  return { principal, yield: yieldAmount, activePositions, positions };
}

async function safeRead<T>(fallback: T, read: () => Promise<T>) {
  try {
    return await read();
  } catch {
    return fallback;
  }
}

async function hasCode(address: Address) {
  if (address === "0x0000000000000000000000000000000000000000") return false;
  const bytecode = await client.getBytecode({ address }).catch(() => undefined);
  return Boolean(bytecode && bytecode !== "0x");
}

async function getDealSummary(user: Address, deals: Array<DealMetadata & { contractAddress: Address }>) {
  let value = BigInt(0);
  let yieldAmount = BigInt(0);
  let activeHoldings = 0;
  const holdings: Array<{ title: string; contractAddress: Address; shares: string; pricePerShare: string; value: string; pendingYield: string }> = [];

  for (const deal of deals) {
    const [shares, price, pendingYield] = await Promise.all([
      client.readContract({ address: deal.contractAddress, abi: DEAL_VAULT_ABI, functionName: "getShareBalance", args: [user] }).catch(() => BigInt(0)),
      client.readContract({ address: deal.contractAddress, abi: DEAL_VAULT_ABI, functionName: "pricePerShare" }).catch(() => BigInt(0)),
      client.readContract({ address: deal.contractAddress, abi: DEAL_VAULT_ABI, functionName: "pendingYield", args: [user] }).catch(() => BigInt(0)),
    ]);
    const adjustedShares = adjustSampleDealShares(deal.contractAddress, shares);
    if (adjustedShares > BigInt(0)) {
      activeHoldings += 1;
      const positionValue = adjustedShares * price;
      value += positionValue;
      holdings.push({
        title: deal.title,
        contractAddress: deal.contractAddress,
        shares: adjustedShares.toString(),
        pricePerShare: price.toString(),
        value: positionValue.toString(),
        pendingYield: pendingYield.toString(),
      });
    }
    yieldAmount += pendingYield;
  }

  return { value, yield: yieldAmount, activeHoldings, holdings };
}

async function getTransactionHistory(user: Address, deals: Array<DealMetadata & { contractAddress: Address }>, metadataDeals: DealMetadata[]) {
  const dealAddresses = deals.map((deal) => deal.contractAddress);
  const dealByAddress = new Map(
    metadataDeals
      .filter((deal) => deal.contractAddress && isAddress(deal.contractAddress))
      .map((deal) => [deal.contractAddress!.toLowerCase(), deal]),
  );

  const [
    monthlyDeposits,
    monthlyWithdrawals,
    fixedDeposits,
    fixedYieldClaims,
    fixedRedemptions,
    dealInvestments,
    dealYieldClaims,
    marketplaceListings,
    marketplaceCancellations,
    marketplacePurchases,
    marketplaceFills,
    dealShareReceipts,
  ] = await Promise.all([
    getLogsInChunks(client, { address: VAULT_ADDRESS, event: parseAbiItem("event Deposit(address indexed user,uint256 amount,uint256 shares)"), args: { user }, toBlock: "latest" }),
    getLogsInChunks(client, { address: VAULT_ADDRESS, event: parseAbiItem("event Withdraw(address indexed user,uint256 amount)"), args: { user }, toBlock: "latest" }),
    getLogsInChunks(client, { address: LONG_TERM_VAULT_ADDRESS, event: parseAbiItem("event Deposited(address indexed user,uint256 indexed positionId,uint256 amount,uint256 duration,uint256 apyBps)"), args: { user }, toBlock: "latest" }),
    getLogsInChunks(client, { address: LONG_TERM_VAULT_ADDRESS, event: parseAbiItem("event YieldClaimed(address indexed user,uint256 indexed positionId,uint256 amount)"), args: { user }, toBlock: "latest" }),
    getLogsInChunks(client, { address: LONG_TERM_VAULT_ADDRESS, event: parseAbiItem("event Redeemed(address indexed user,uint256 indexed positionId,uint256 principal)"), args: { user }, toBlock: "latest" }),
    dealAddresses.length
      ? getLogsInChunks(client, { address: dealAddresses, event: parseAbiItem("event Invested(address indexed investor,uint256 assets,uint256 shares)"), args: { investor: user }, toBlock: "latest" })
      : Promise.resolve([]),
    dealAddresses.length
      ? getLogsInChunks(client, { address: dealAddresses, event: parseAbiItem("event YieldClaimed(address indexed investor,uint256 amount)"), args: { investor: user }, toBlock: "latest" })
      : Promise.resolve([]),
    getLogsInChunks(client, { address: MARKETPLACE_ADDRESS, event: parseAbiItem("event ListingCreated(uint256 indexed listingId,address indexed seller,address indexed token,uint256 dealId,uint256 amount,uint256 pricePerShare)"), args: { seller: user }, toBlock: "latest" }),
    getLogsInChunks(client, { address: MARKETPLACE_ADDRESS, event: parseAbiItem("event ListingCancelled(uint256 indexed listingId)"), toBlock: "latest" }),
    getLogsInChunks(client, { address: MARKETPLACE_ADDRESS, event: parseAbiItem("event ListingFilled(uint256 indexed listingId,address indexed buyer,uint256 amount,uint256 totalPrice)"), args: { buyer: user }, toBlock: "latest" }),
    getLogsInChunks(client, { address: MARKETPLACE_ADDRESS, event: parseAbiItem("event ListingFilled(uint256 indexed listingId,address indexed buyer,uint256 amount,uint256 totalPrice)"), toBlock: "latest" }),
    dealAddresses.length
      ? getLogsInChunks(client, { address: dealAddresses, event: parseAbiItem("event TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value)"), args: { from: MARKETPLACE_ADDRESS, to: user }, toBlock: "latest" })
      : Promise.resolve([]),
  ]);
  const userListingCancellations = await filterMarketplaceLogsBySeller(user, marketplaceCancellations);
  const userMarketplaceSales = await filterMarketplaceLogsBySeller(user, marketplaceFills);

  const rows: ActivityRow[] = [
    ...monthlyDeposits.map((log) => ({
      id: makeActivityId(log.transactionHash, "monthly-deposit", log.logIndex),
      blockNumber: log.blockNumber,
      hash: log.transactionHash,
      action: "Monthly Vault deposit",
      amount: log.args.amount ?? BigInt(0),
      amountUnit: USDC_UNIT,
      verb: "deposited",
    })),
    ...monthlyWithdrawals.map((log) => ({
      id: makeActivityId(log.transactionHash, "monthly-withdraw", log.logIndex),
      blockNumber: log.blockNumber,
      hash: log.transactionHash,
      action: "Monthly Vault withdrawal",
      amount: log.args.amount ?? BigInt(0),
      amountUnit: USDC_UNIT,
      verb: "sent to wallet",
    })),
    ...fixedDeposits.map((log) => ({
      id: makeActivityId(log.transactionHash, "fixed-deposit", log.logIndex),
      blockNumber: log.blockNumber,
      hash: log.transactionHash,
      action: "Fixed-income deposit",
      amount: log.args.amount ?? BigInt(0),
      amountUnit: USDC_UNIT,
      verb: "locked",
    })),
    ...fixedYieldClaims.map((log) => ({
      id: makeActivityId(log.transactionHash, "fixed-yield", log.logIndex),
      blockNumber: log.blockNumber,
      hash: log.transactionHash,
      action: "Fixed-income yield claim",
      amount: log.args.amount ?? BigInt(0),
      amountUnit: USDC_UNIT,
      verb: "claimed",
    })),
    ...fixedRedemptions.map((log) => ({
      id: makeActivityId(log.transactionHash, "fixed-redeem", log.logIndex),
      blockNumber: log.blockNumber,
      hash: log.transactionHash,
      action: "Fixed-income maturity redemption",
      amount: log.args.principal ?? BigInt(0),
      amountLabel: "principal",
      amountUnit: USDC_UNIT,
      verb: "redeemed",
    })),
    ...dealInvestments
      .filter((log) => !isSampleSeedInvestment(log.address, log.args.assets ?? BigInt(0)))
      .map((log) => ({
        id: makeActivityId(log.transactionHash, "deal-invest", log.logIndex),
        blockNumber: log.blockNumber,
        hash: log.transactionHash,
        action: `Deal investment: ${getDealTitle(dealByAddress, log.address)}`,
        amount: log.args.assets ?? BigInt(0),
        amountUnit: USDC_UNIT,
        secondaryAmount: log.args.shares ?? BigInt(0),
        secondaryLabel: "for",
        secondaryUnit: SHARES_UNIT,
        verb: "invested",
        detail: `Deal vault ${shortAddress(log.address)}`,
      })),
    ...dealYieldClaims.map((log) => ({
      id: makeActivityId(log.transactionHash, "deal-yield", log.logIndex),
      blockNumber: log.blockNumber,
      hash: log.transactionHash,
      action: `Deal revenue claim: ${getDealTitle(dealByAddress, log.address)}`,
      amount: log.args.amount ?? BigInt(0),
      amountUnit: USDC_UNIT,
      verb: "claimed",
      detail: `Deal vault ${shortAddress(log.address)}`,
    })),
    ...marketplaceListings.map((log) => ({
      id: makeActivityId(log.transactionHash, "market-list", log.logIndex),
      blockNumber: log.blockNumber,
      hash: log.transactionHash,
      action: "Marketplace listing created",
      amount: log.args.amount ?? BigInt(0),
      amountUnit: SHARES_UNIT,
      secondaryAmount: (log.args.amount ?? BigInt(0)) * (log.args.pricePerShare ?? BigInt(0)),
      secondaryLabel: "for",
      secondaryUnit: USDC_UNIT,
      verb: "listed",
      detail: `Listing #${log.args.listingId?.toString() ?? "0"}`,
    })),
    ...userListingCancellations.map((log) => ({
      id: makeActivityId(log.transactionHash, "market-cancel", log.logIndex),
      blockNumber: log.blockNumber,
      hash: log.transactionHash,
      action: "Marketplace listing canceled",
      amount: BigInt(0),
      amountUnit: SHARES_UNIT,
      verb: "canceled",
      detail: `Listing #${log.args.listingId?.toString() ?? "0"}`,
    })),
    ...marketplacePurchases.map((log) => ({
      id: makeActivityId(log.transactionHash, "market-buy", log.logIndex),
      blockNumber: log.blockNumber,
      hash: log.transactionHash,
      action: "Marketplace deal purchase",
      amount: log.args.amount ?? BigInt(0),
      amountUnit: SHARES_UNIT,
      secondaryAmount: log.args.totalPrice ?? BigInt(0),
      secondaryLabel: "for",
      secondaryUnit: USDC_UNIT,
      verb: "bought",
      detail: `Listing #${log.args.listingId?.toString() ?? "0"}`,
    })),
    ...userMarketplaceSales.map((log) => ({
      id: makeActivityId(log.transactionHash, "market-sale", log.logIndex),
      blockNumber: log.blockNumber,
      hash: log.transactionHash,
      action: "Marketplace deal sale",
      amount: log.args.amount ?? BigInt(0),
      amountUnit: SHARES_UNIT,
      secondaryAmount: log.args.totalPrice ?? BigInt(0),
      secondaryLabel: "for",
      secondaryUnit: USDC_UNIT,
      verb: "sold",
      detail: `Listing #${log.args.listingId?.toString() ?? "0"}`,
    })),
    ...dealShareReceipts.map((log) => ({
      id: makeActivityId(log.transactionHash, "deal-share-receipt", log.logIndex),
      blockNumber: log.blockNumber,
      hash: log.transactionHash,
      action: `Deal shares received: ${getDealTitle(dealByAddress, log.address)}`,
      amount: log.args.value ?? BigInt(0),
      amountUnit: SHARES_UNIT,
      verb: "received",
      detail: `Deal vault ${shortAddress(log.address)}`,
    })),
  ];

  const sortedRows = rows.sort((a, b) => Number((b.blockNumber ?? BigInt(0)) - (a.blockNumber ?? BigInt(0)))).slice(0, 10);
  return Promise.all(
    sortedRows.map(async (row) => {
      if (!row.blockNumber) return { ...row, timestamp: "Pending block time" };
      const block = await client.getBlock({ blockNumber: row.blockNumber });
      return {
        id: row.id,
        timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
        action: row.action,
        amount: row.amount?.toString(),
        amountLabel: row.amountLabel,
        amountUnit: row.amountUnit,
        secondaryAmount: row.secondaryAmount?.toString(),
        secondaryLabel: row.secondaryLabel,
        secondaryUnit: row.secondaryUnit,
        verb: row.verb,
        detail: row.detail,
        hash: row.hash,
      };
    }),
  );
}

function emptyDashboard(isConnected: boolean) {
  return {
    isConnected,
    walletLiquidity: "0",
    monthlyValue: "0",
    monthlyTVL: undefined,
    fixedPrincipal: "0",
    fixedYield: "0",
    dealValue: "0",
    dealYield: "0",
    totalPortfolioValue: "0",
    totalYield: "0",
    activeFixedPositions: 0,
    activeDealHoldings: 0,
    allocations: [],
    yieldHistory: [],
    activity: [],
    dealStatuses: [],
  };
}

function getDealTitle(deals: Map<string, DealMetadata>, address: Address) {
  return deals.get(address.toLowerCase())?.title ?? shortAddress(address);
}

function shortAddress(address: Address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function parseDeadlineMs(deadline?: string) {
  if (!deadline) return undefined;
  const value = new Date(deadline).getTime();
  return Number.isFinite(value) ? value : undefined;
}

function makeActivityId(hash: Hash, type: string, logIndex: number) {
  return `${hash}-${type}-${logIndex}`;
}

async function filterMarketplaceLogsBySeller<T extends { args: { listingId?: bigint } }>(user: Address, logs: T[]) {
  const matches: T[] = [];
  for (const log of logs) {
    const listingId = log.args.listingId;
    if (listingId === undefined) continue;
    const listing = await client
      .readContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "listings",
        args: [listingId],
      })
      .catch(() => undefined);
    if (listing?.[0]?.toLowerCase() === user.toLowerCase()) {
      matches.push(log);
    }
  }
  return matches;
}

function isSampleSeedInvestment(address: Address, amount: bigint) {
  return address.toLowerCase() === SAMPLE_DEAL_ADDRESS.toLowerCase() && amount === SAMPLE_DEAL_SEED_INVESTMENT;
}

function adjustSampleDealShares(address: Address, shares: bigint) {
  if (address.toLowerCase() !== SAMPLE_DEAL_ADDRESS.toLowerCase()) return shares;
  return shares > SAMPLE_DEAL_SEED_SHARES ? shares - SAMPLE_DEAL_SEED_SHARES : BigInt(0);
}
