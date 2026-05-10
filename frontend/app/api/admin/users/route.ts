import { NextResponse } from "next/server";
import { createPublicClient, http, isAddress, parseAbiItem } from "viem";
import {
  DEAL_FACTORY_ABI,
  DEAL_FACTORY_ADDRESS,
  DEAL_VAULT_ABI,
  LONG_TERM_VAULT_ADDRESS,
  MARKETPLACE_ADDRESS,
  VAULT_ADDRESS,
} from "@/app/constants";
import { getLogsInChunks } from "@/lib/chain-logs";
import { ARC_TESTNET_RPC_URL, arcTestnet } from "@/lib/network";
import { getLatestDashboardSnapshots } from "@/lib/admin-store";

const client = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_TESTNET_RPC_URL),
});

type WalletRow = {
  wallet: `0x${string}`;
  totalDeposits: bigint;
  activeInvestments: number;
  yieldClaimed: bigint;
  marketplaceVolume: bigint;
  portfolioValue: bigint;
  lastSeen?: string;
};

export async function GET() {
  const dealAddresses = await getDealAddresses();
  const [snapshots, monthlyDeposits, monthlyWithdrawals, fixedDeposits, fixedYieldClaims, marketFills, dealInvestments, dealYieldClaims] = await Promise.all([
    getLatestDashboardSnapshots(),
    getLogsInChunks(client, { address: VAULT_ADDRESS, event: parseAbiItem("event Deposit(address indexed user,uint256 amount,uint256 shares)"), toBlock: "latest" }),
    getLogsInChunks(client, { address: VAULT_ADDRESS, event: parseAbiItem("event Withdraw(address indexed user,uint256 amount)"), toBlock: "latest" }),
    getLogsInChunks(client, { address: LONG_TERM_VAULT_ADDRESS, event: parseAbiItem("event Deposited(address indexed user,uint256 indexed positionId,uint256 amount,uint256 duration,uint256 apyBps)"), toBlock: "latest" }),
    getLogsInChunks(client, { address: LONG_TERM_VAULT_ADDRESS, event: parseAbiItem("event YieldClaimed(address indexed user,uint256 indexed positionId,uint256 amount)"), toBlock: "latest" }),
    getLogsInChunks(client, { address: MARKETPLACE_ADDRESS, event: parseAbiItem("event ListingFilled(uint256 indexed listingId,address indexed buyer,uint256 amount,uint256 totalPrice)"), toBlock: "latest" }),
    dealAddresses.length
      ? getLogsInChunks(client, { address: dealAddresses, event: parseAbiItem("event Invested(address indexed investor,uint256 assets,uint256 shares)"), toBlock: "latest" })
      : Promise.resolve([]),
    dealAddresses.length
      ? getLogsInChunks(client, { address: dealAddresses, event: parseAbiItem("event YieldClaimed(address indexed investor,uint256 amount)"), toBlock: "latest" })
      : Promise.resolve([]),
  ]);

  const wallets = new Map<string, WalletRow>();
  const touch = (wallet: `0x${string}`) => {
    const key = wallet.toLowerCase();
    const existing = wallets.get(key);
    if (existing) return existing;
    const row: WalletRow = { wallet, totalDeposits: BigInt(0), activeInvestments: 0, yieldClaimed: BigInt(0), marketplaceVolume: BigInt(0), portfolioValue: BigInt(0) };
    wallets.set(key, row);
    return row;
  };

  for (const snapshot of snapshots) {
    if (!isAddress(snapshot.wallet)) continue;
    const row = touch(snapshot.wallet as `0x${string}`);
    row.portfolioValue = maxBigInt(row.portfolioValue, toBigInt(snapshot.totalPortfolioValue));
    row.yieldClaimed = maxBigInt(row.yieldClaimed, toBigInt(snapshot.totalYield));
    row.lastSeen = snapshot.timestamp;
  }
  for (const log of monthlyDeposits) touch(log.args.user!).totalDeposits += log.args.amount ?? BigInt(0);
  for (const log of fixedDeposits) {
    const row = touch(log.args.user!);
    row.totalDeposits += log.args.amount ?? BigInt(0);
    row.activeInvestments += 1;
  }
  for (const log of dealInvestments) {
    const row = touch(log.args.investor!);
    row.totalDeposits += log.args.assets ?? BigInt(0);
    row.activeInvestments += 1;
  }
  for (const log of fixedYieldClaims) touch(log.args.user!).yieldClaimed += log.args.amount ?? BigInt(0);
  for (const log of dealYieldClaims) touch(log.args.investor!).yieldClaimed += log.args.amount ?? BigInt(0);
  for (const log of marketFills) {
    const row = touch(log.args.buyer!);
    row.marketplaceVolume += log.args.totalPrice ?? BigInt(0);
  }

  const rows = [...wallets.values()]
    .filter((row) => row.totalDeposits > BigInt(0) || row.portfolioValue > BigInt(0) || row.activeInvestments > 0 || row.yieldClaimed > BigInt(0) || row.marketplaceVolume > BigInt(0))
    .sort((a, b) => Number((b.totalDeposits + b.portfolioValue) - (a.totalDeposits + a.portfolioValue)));
  const marketplaceRows = await Promise.all(
    marketFills
      .slice(-8)
      .reverse()
      .map(async (log) => {
        const block = await client.getBlock({ blockNumber: log.blockNumber });
        return {
          id: `${log.transactionHash}-${log.logIndex}`,
          buyer: log.args.buyer,
          amount: (log.args.amount ?? BigInt(0)).toString(),
          totalPrice: (log.args.totalPrice ?? BigInt(0)).toString(),
          listingId: (log.args.listingId ?? BigInt(0)).toString(),
          timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
          hash: log.transactionHash,
        };
      }),
  );

  return NextResponse.json({
    activeInvestors: rows.filter((row) => row.totalDeposits > BigInt(0) || row.portfolioValue > BigInt(0) || row.activeInvestments > 0).length,
    topInvestorDeposits: rows[0] ? maxBigInt(rows[0].totalDeposits, rows[0].portfolioValue).toString() : "0",
    recentUsers: new Set([
      ...snapshots.filter((snapshot) => isRecent(snapshot.timestamp)).map((snapshot) => snapshot.wallet.toLowerCase()),
      ...monthlyDeposits.slice(-10).map((log) => log.args.user?.toLowerCase()),
      ...fixedDeposits.slice(-10).map((log) => log.args.user?.toLowerCase()),
      ...dealInvestments.slice(-10).map((log) => log.args.investor?.toLowerCase()),
    ].filter(Boolean)).size,
    highRiskActivity: "0",
    analyticsComplete: true,
    wallets: rows.map((row) => ({
      wallet: row.wallet,
      totalDeposits: row.totalDeposits.toString(),
      portfolioValue: row.portfolioValue.toString(),
      activeInvestments: row.activeInvestments,
      yieldClaimed: row.yieldClaimed.toString(),
      marketplaceVolume: row.marketplaceVolume.toString(),
      status: row.activeInvestments > 0 ? "Invested" : row.portfolioValue > BigInt(0) ? "Holding value" : "Yield only",
    })),
    marketplaceActivity: marketplaceRows,
    withdrawals: monthlyWithdrawals.length,
  });
}

async function getDealAddresses() {
  const dealCount = await client.readContract({ address: DEAL_FACTORY_ADDRESS, abi: DEAL_FACTORY_ABI, functionName: "dealCount" });
  const addresses = await Promise.all(
    Array.from({ length: Number(dealCount) }, (_, index) =>
      client.readContract({ address: DEAL_FACTORY_ADDRESS, abi: DEAL_FACTORY_ABI, functionName: "allDeals", args: [BigInt(index)] }),
    ),
  );
  const checked = await Promise.all(
    addresses.filter((address) => isAddress(address)).map(async (address) => ({
      address,
      bytecode: await client.getBytecode({ address }).catch(() => undefined),
    })),
  );
  return checked.filter((item) => item.bytecode && item.bytecode !== "0x").map((item) => item.address);
}

function toBigInt(value?: string) {
  try {
    return BigInt(value ?? "0");
  } catch {
    return BigInt(0);
  }
}

function maxBigInt(a: bigint, b: bigint) {
  return a > b ? a : b;
}

function isRecent(timestamp: string) {
  const value = new Date(timestamp).getTime();
  if (!Number.isFinite(value)) return false;
  return Date.now() - value <= 7 * 24 * 60 * 60 * 1000;
}
