import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem } from "viem";
import { LONG_TERM_VAULT_ABI, LONG_TERM_VAULT_ADDRESS } from "@/app/constants";
import { getLogsInChunks } from "@/lib/chain-logs";
import { ARC_TESTNET_RPC_URL, arcTestnet } from "@/lib/network";

const client = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_TESTNET_RPC_URL),
});

type PositionTuple = readonly [
  `0x${string}`,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  boolean,
];

const DURATIONS = [
  { label: "1 year", seconds: BigInt(365 * 24 * 60 * 60) },
  { label: "2 years", seconds: BigInt(730 * 24 * 60 * 60) },
  { label: "3 years", seconds: BigInt(1095 * 24 * 60 * 60) },
];

export async function GET() {
  const depositLogs = await getLogsInChunks(client, {
    address: LONG_TERM_VAULT_ADDRESS,
    event: parseAbiItem("event Deposited(address indexed user,uint256 indexed positionId,uint256 amount,uint256 duration,uint256 apyBps)"),
    toBlock: "latest",
  });

  const positionIds = [...new Set(depositLogs.map((log) => log.args.positionId ?? BigInt(0)))];
  const positions = await Promise.all(
    positionIds.map(async (positionId) => {
      const [position, claimableYield] = await Promise.all([
        client.readContract({ address: LONG_TERM_VAULT_ADDRESS, abi: LONG_TERM_VAULT_ABI, functionName: "positions", args: [positionId] }),
        client.readContract({ address: LONG_TERM_VAULT_ADDRESS, abi: LONG_TERM_VAULT_ABI, functionName: "claimableYield", args: [positionId] }),
      ]);
      const typed = position as PositionTuple;
      return {
        id: positionId,
        owner: typed[0],
        principal: typed[1],
        duration: typed[2],
        apyBps: typed[3],
        start: typed[4],
        maturity: typed[5],
        lastClaim: typed[6],
        redeemed: typed[7],
        claimableYield,
      };
    }),
  );

  const activePositions = positions.filter((position) => !position.redeemed);
  const pools = DURATIONS.map((duration) => {
    const tranchePositions = activePositions.filter((position) => position.duration === duration.seconds);
    const principal = sum(tranchePositions.map((position) => position.principal));
    const claimableYield = sum(tranchePositions.map((position) => position.claimableYield));
    return {
      label: duration.label,
      duration: duration.seconds.toString(),
      principal: principal.toString(),
      claimableYield: claimableYield.toString(),
      positions: tranchePositions.length,
    };
  });

  const lockedCapital = sum(activePositions.map((position) => position.principal));
  const claimableYield = sum(activePositions.map((position) => position.claimableYield));
  const upcomingUnlocks = activePositions
    .sort((a, b) => Number(a.maturity - b.maturity))
    .slice(0, 8)
    .map((position) => ({
      id: position.id.toString(),
      owner: position.owner,
      principal: position.principal.toString(),
      maturity: position.maturity.toString(),
      apyBps: position.apyBps.toString(),
    }));

  return NextResponse.json({
    activePositions: activePositions.length,
    lockedCapital: lockedCapital.toString(),
    claimableYield: claimableYield.toString(),
    upcomingUnlockCount: upcomingUnlocks.length,
    pools,
    upcomingUnlocks,
  });
}

function sum(values: bigint[]) {
  return values.reduce((total, value) => total + value, BigInt(0));
}
