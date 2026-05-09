import { NextResponse } from "next/server";
import { createPublicClient, http, isAddress, type Address } from "viem";
import { addDealMetadata, getDeals, updateDealMetadata } from "@/lib/admin-store";
import { DEAL_FACTORY_ABI, DEAL_FACTORY_ADDRESS, DEAL_VAULT_ABI } from "@/app/constants";
import { ARC_TESTNET_RPC_URL, arcTestnet } from "@/lib/network";

const client = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_TESTNET_RPC_URL),
});

export async function GET() {
  const deals = await getDeals();
  const factoryDeals = await getFactoryDeals();
  const byAddress = new Map(
    deals
      .filter((deal) => deal.contractAddress && isAddress(deal.contractAddress))
      .map((deal) => [deal.contractAddress!.toLowerCase(), deal]),
  );

  for (const address of factoryDeals) {
    const key = address.toLowerCase();
    if (!byAddress.has(key)) {
      byAddress.set(key, {
        id: key,
        contractAddress: address,
        title: `Deal ${shortAddress(address)}`,
        status: "open",
      });
    }
  }

  const checkedDeals = await Promise.all(
    [...byAddress.values(), ...deals.filter((deal) => !deal.contractAddress || !isAddress(deal.contractAddress))]
      .map(async (deal) => {
        if (!deal.contractAddress || !isAddress(deal.contractAddress)) return { ...deal, contractMissing: true };
        const address = deal.contractAddress as Address;
        const bytecode = await client.getBytecode({ address }).catch(() => undefined);
        if (!bytecode || bytecode === "0x") return { ...deal, contractMissing: true };

        const [raiseClosed, totalRaised, targetRaise, closeTime] = await Promise.all([
          client.readContract({ address, abi: DEAL_VAULT_ABI, functionName: "raiseClosed" }).catch(() => deal.status === "closed"),
          client.readContract({ address, abi: DEAL_VAULT_ABI, functionName: "totalRaised" }).catch(() => undefined),
          client.readContract({ address, abi: DEAL_VAULT_ABI, functionName: "targetRaise" }).catch(() => undefined),
          client.readContract({ address, abi: DEAL_VAULT_ABI, functionName: "closeTime" }).catch(() => undefined),
        ]);

        const closeTimeMs = typeof closeTime === "bigint" ? Number(closeTime) * 1000 : undefined;
        const deadlineMs = closeTimeMs ?? parseDeadlineMs(deal.fundingDeadline);
        const deadlinePassed = Boolean(deadlineMs && deadlineMs <= Date.now());
        const status = raiseClosed || deadlinePassed || deal.status === "closed" ? "closed" : "open";
        return {
          ...deal,
          status,
          totalRaised: typeof totalRaised === "bigint" ? formatUsdc(totalRaised) : deal.totalRaised,
          targetRaise: typeof targetRaise === "bigint" ? formatUsdc(targetRaise) : deal.targetRaise,
          fundingDeadline: closeTimeMs ? new Date(closeTimeMs).toISOString().slice(0, 10) : deal.fundingDeadline,
          closeDate: status === "closed" ? deal.closeDate ?? (deadlineMs ? new Date(deadlineMs).toISOString() : undefined) : undefined,
        };
      }),
  );
  return NextResponse.json(checkedDeals);
}

export async function POST(request: Request) {
  const body = await request.json();
  return NextResponse.json(await addDealMetadata(body));
}

export async function PATCH(request: Request) {
  const body = await request.json();
  if (!body.id) {
    return NextResponse.json({ error: "Deal id is required" }, { status: 400 });
  }

  const updated = await updateDealMetadata(body.id, body);
  if (!updated) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

async function getFactoryDeals() {
  if (DEAL_FACTORY_ADDRESS === "0x0000000000000000000000000000000000000000") return [];
  const code = await client.getBytecode({ address: DEAL_FACTORY_ADDRESS }).catch(() => undefined);
  if (!code || code === "0x") return [];

  const dealCount = await client.readContract({
    address: DEAL_FACTORY_ADDRESS,
    abi: DEAL_FACTORY_ABI,
    functionName: "dealCount",
  }).catch(() => BigInt(0));

  return Promise.all(
    Array.from({ length: Number(dealCount) }, (_, index) =>
      client.readContract({
        address: DEAL_FACTORY_ADDRESS,
        abi: DEAL_FACTORY_ABI,
        functionName: "allDeals",
        args: [BigInt(index)],
      }),
    ),
  );
}

function formatUsdc(value: bigint) {
  return (Number(value) / 1_000_000).toString();
}

function shortAddress(address: Address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function parseDeadlineMs(deadline?: string) {
  if (!deadline) return undefined;
  const value = new Date(deadline).getTime();
  return Number.isFinite(value) ? value : undefined;
}
