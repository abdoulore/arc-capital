import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem } from "viem";
import {
  DEAL_FACTORY_ABI,
  DEAL_FACTORY_ADDRESS,
  DEAL_VAULT_ABI,
  LONG_TERM_VAULT_ADDRESS,
  USDC_ABI,
  USDC_ADDRESS,
  VAULT_ADDRESS,
  YIELD_ROUTER_ABI,
  YIELD_ROUTER_ADDRESS,
} from "@/app/constants";
import { getLogsInChunks } from "@/lib/chain-logs";
import { ARC_TESTNET_RPC_URL, arcTestnet } from "@/lib/network";

const client = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_TESTNET_RPC_URL),
});

export async function GET() {
  const treasury = await client.readContract({
    address: YIELD_ROUTER_ADDRESS,
    abi: YIELD_ROUTER_ABI,
    functionName: "treasury",
  });
  const [treasuryBalance, monthlyVaultBalance, longTermBalance, routedYieldLogs, dealAddresses] = await Promise.all([
    client.readContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: "balanceOf", args: [treasury] }),
    client.readContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: "balanceOf", args: [VAULT_ADDRESS] }),
    client.readContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: "balanceOf", args: [LONG_TERM_VAULT_ADDRESS] }),
    getLogsInChunks(client, {
      address: YIELD_ROUTER_ADDRESS,
      event: parseAbiItem("event YieldRouted(address indexed source,address indexed destination,uint256 amount,string yieldType)"),
      toBlock: "latest",
    }),
    getDealAddresses(),
  ]);

  const dealRevenueLogs = dealAddresses.length
    ? await getLogsInChunks(client, {
        address: dealAddresses,
        event: parseAbiItem("event RevenueDistributed(address indexed source,uint256 amount)"),
        toBlock: "latest",
      })
    : [];

  const routedRows = await Promise.all(
    routedYieldLogs.map(async (log) => {
      const block = await client.getBlock({ blockNumber: log.blockNumber });
      return {
        id: `${log.transactionHash}-${log.logIndex}`,
        timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
        source: log.args.source,
        destination: log.args.destination,
        amount: (log.args.amount ?? BigInt(0)).toString(),
        type: log.args.yieldType ?? "yield",
        hash: log.transactionHash,
      };
    }),
  );

  const revenueRows = await Promise.all(
    dealRevenueLogs.map(async (log) => {
      const block = await client.getBlock({ blockNumber: log.blockNumber });
      return {
        id: `${log.transactionHash}-${log.logIndex}`,
        timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
        source: log.args.source,
        destination: log.address,
        amount: (log.args.amount ?? BigInt(0)).toString(),
        type: "deal-revenue",
        hash: log.transactionHash,
      };
    }),
  );

  const history = [...routedRows, ...revenueRows]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 20);

  return NextResponse.json({
    treasury,
    treasuryBalance: treasuryBalance.toString(),
    monthlyVaultBalance: monthlyVaultBalance.toString(),
    longTermBalance: longTermBalance.toString(),
    totalRoutedYield: sum(routedRows.map((row) => BigInt(row.amount))).toString(),
    totalDealRevenue: sum(revenueRows.map((row) => BigInt(row.amount))).toString(),
    history,
  });
}

async function getDealAddresses() {
  const dealCount = await client.readContract({
    address: DEAL_FACTORY_ADDRESS,
    abi: DEAL_FACTORY_ABI,
    functionName: "dealCount",
  });
  const addresses = await Promise.all(
    Array.from({ length: Number(dealCount) }, (_, index) =>
      client.readContract({
        address: DEAL_FACTORY_ADDRESS,
        abi: DEAL_FACTORY_ABI,
        functionName: "allDeals",
        args: [BigInt(index)],
      }),
    ),
  );
  const checked = await Promise.all(
    addresses.map(async (address) => ({
      address,
      code: await client.getBytecode({ address }).catch(() => undefined),
    })),
  );
  return checked.filter((item) => item.code && item.code !== "0x").map((item) => item.address);
}

function sum(values: bigint[]) {
  return values.reduce((total, value) => total + value, BigInt(0));
}
