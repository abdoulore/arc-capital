import { NextResponse } from "next/server";
import { createPublicClient, http, isAddress, type Address } from "viem";
import { MARKETPLACE_ABI, MARKETPLACE_ADDRESS } from "@/app/constants";
import { getDeals } from "@/lib/admin-store";
import { ARC_TESTNET_RPC_URL, arcTestnet } from "@/lib/network";

const client = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_TESTNET_RPC_URL),
});

export async function GET() {
  const deals = await getDeals();
  const dealTitles = new Map(
    deals
      .filter((deal) => deal.contractAddress && isAddress(deal.contractAddress))
      .map((deal) => [deal.contractAddress!.toLowerCase(), deal.title]),
  );
  const nextListingId = await client.readContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: "nextListingId",
  });
  const listings = await Promise.all(
    Array.from({ length: Number(nextListingId) }, async (_, index) => {
      const listing = await client.readContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "listings",
        args: [BigInt(index)],
      });
      const [seller, token, dealId, amountRemaining, pricePerShare, active] = listing;
      return {
        id: index,
        seller,
        token,
        dealId: dealId.toString(),
        deal: dealTitles.get(token.toLowerCase()) ?? `Deal ${shortAddress(token)}`,
        amountRemaining: amountRemaining.toString(),
        pricePerShare: pricePerShare.toString(),
        active,
      };
    }),
  );

  return NextResponse.json({
    nextListingId: nextListingId.toString(),
    listings: listings.filter((listing) => listing.active && BigInt(listing.amountRemaining) > BigInt(0)),
  });
}

function shortAddress(address: Address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
