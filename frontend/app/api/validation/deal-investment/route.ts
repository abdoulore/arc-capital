import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, isAddress, parseUnits, type Address } from "viem";
import { DEAL_VAULT_ABI, USDC_ABI, USDC_ADDRESS } from "@/app/constants";
import { ARC_TESTNET_RPC_URL, arcTestnet } from "@/lib/network";

const client = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_TESTNET_RPC_URL),
});

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      user?: string;
      dealAddress?: string;
      amount?: string;
    };

    if (!body.user || !isAddress(body.user)) return invalid("Connect a wallet before investing.");
    if (!body.dealAddress || !isAddress(body.dealAddress)) return invalid("Deal contract connection is pending.");

    let amount: bigint;
    try {
      amount = parseUnits(body.amount || "0", 6);
    } catch {
      return invalid("Enter a valid USDC amount.");
    }

    if (amount <= BigInt(0)) return invalid("Enter an investment amount greater than 0 USDC.");

    const dealAddress = body.dealAddress as Address;
    const user = body.user as Address;
    const code = await client.getBytecode({ address: dealAddress });
    if (!code || code === "0x") {
      return invalid("This deal contract is not deployed on the current network. Refresh deals or create a new deal.");
    }

    const [raiseClosed, closeTime, totalRaised, targetRaise, usdcBalance] = await Promise.all([
      client.readContract({ address: dealAddress, abi: DEAL_VAULT_ABI, functionName: "raiseClosed" }),
      client.readContract({ address: dealAddress, abi: DEAL_VAULT_ABI, functionName: "closeTime" }),
      client.readContract({ address: dealAddress, abi: DEAL_VAULT_ABI, functionName: "totalRaised" }),
      client.readContract({ address: dealAddress, abi: DEAL_VAULT_ABI, functionName: "targetRaise" }),
      client.readContract({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: "balanceOf", args: [user] }),
    ]);

    if (raiseClosed) return invalid("This deal is closed and no longer accepts investments.");
    if (closeTime > BigInt(0) && BigInt(Math.floor(Date.now() / 1000)) >= closeTime) return invalid("The funding deadline has passed.");
    if (totalRaised + amount > targetRaise) return invalid("This investment would exceed the deal target raise.");
    if (usdcBalance < amount) return invalid("Your USDC balance is too low for this investment.");

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to validate this investment.";
    return NextResponse.json({ ok: false, message }, { status: 200 });
  }
}

function invalid(message: string) {
  return NextResponse.json({ ok: false, message });
}
