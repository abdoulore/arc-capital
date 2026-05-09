import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem } from "viem";
import { VAULT_ABI, VAULT_ADDRESS, YIELD_ROUTER_ADDRESS } from "@/app/constants";
import { getLogsInChunks } from "@/lib/chain-logs";
import { ARC_TESTNET_RPC_URL, arcTestnet } from "@/lib/network";

const client = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_TESTNET_RPC_URL),
});

export async function GET() {
  try {
    const [totalAssets, routedYieldLogs] = await Promise.all([
      client.readContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "totalAssets" }),
      getLogsInChunks(client, {
        address: YIELD_ROUTER_ADDRESS,
        event: parseAbiItem("event YieldRouted(address indexed source,address indexed destination,uint256 amount,string yieldType)"),
        args: { destination: VAULT_ADDRESS },
        toBlock: "latest",
      }),
    ]);

    if (!routedYieldLogs.length) {
      return NextResponse.json({
        status: "ready",
        apyBps: "0",
        routedYield: "0",
        investorCapital: totalAssets.toString(),
        basisDays: 0,
      message: "No routed Monthly Vault yield recorded yet.",
      });
    }

    const routedYield = routedYieldLogs.reduce((total, log) => total + (log.args.amount ?? BigInt(0)), BigInt(0));
    const investorCapital = totalAssets > routedYield ? totalAssets - routedYield : totalAssets;
    if (investorCapital === BigInt(0)) {
      return NextResponse.json({
        status: "ready",
        apyBps: "0",
        routedYield: routedYield.toString(),
        investorCapital: "0",
        basisDays: 0,
        message: "Awaiting investor capital.",
      });
    }

    const firstBlockNumber = routedYieldLogs.reduce(
      (earliest, log) => (log.blockNumber < earliest ? log.blockNumber : earliest),
      routedYieldLogs[0].blockNumber,
    );
    const firstBlock = await client.getBlock({ blockNumber: firstBlockNumber });
    const firstTimestampMs = Number(firstBlock.timestamp) * 1000;
    const basisDays = Math.max(30, Math.floor((Date.now() - firstTimestampMs) / (24 * 60 * 60 * 1000)));
    const apyBps = (routedYield * BigInt(10_000) * BigInt(365)) / (investorCapital * BigInt(basisDays));

    return NextResponse.json({
      status: "ready",
      apyBps: apyBps.toString(),
      routedYield: routedYield.toString(),
      investorCapital: investorCapital.toString(),
      basisDays,
      message: "Yearly APY annualized from routed Monthly Vault yield.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "unavailable",
        apyBps: "0",
        routedYield: "0",
        investorCapital: "0",
        basisDays: 0,
        message: error instanceof Error ? error.message : "Monthly Vault APY is unavailable.",
      },
      { status: 200 },
    );
  }
}
