"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { WalletGatedButton } from "@/components/wallet-gated-button";
import { DEAL_VAULT_V2_ABI } from "@/app/constants";
import { formatCurrency, formatNumber, formatTokenAmount } from "@/lib/utils";
import { useMarketplace } from "@/hooks/useInvestmentContracts";
import { useReadContract } from "wagmi";

type MarketplaceRow = {
  id: number;
  deal: string;
  side: string;
  shares: bigint;
  priceRaw: bigint;
  price: number;
  volumeRaw: bigint;
};

type MarketplaceListing = {
  id: string;
  onchain_listing_id: string;
  title: string | null;
  seller_wallet: string;
  shares_remaining: string;
  price_per_share_usdc: string;
  status: string;
  created_at: string;
};

export default function MarketplacePage() {
  const [selectedListing, setSelectedListing] = useState<MarketplaceRow | null>(null);
  const [listingOpen, setListingOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [listingAmount, setListingAmount] = useState("");
  const [listingPrice, setListingPrice] = useState("");
  const [selectedDealAddress, setSelectedDealAddress] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [deals, setDeals] = useState<Array<{ title: string; contractAddress: `0x${string}` }>>([]);
  const marketplace = useMarketplace();
  const dealHoldings = useLiveDealHoldings(deals, marketplace.address);
  const liveRows: MarketplaceRow[] = listings.map((listing) => {
    const shares = BigInt(Math.trunc(Number(listing.shares_remaining || 0)));
    const priceRaw = BigInt(Math.round(Number(listing.price_per_share_usdc || 0) * 1_000_000));
    return {
      id: Number(listing.onchain_listing_id),
      deal: listing.title ?? `Listing #${listing.onchain_listing_id}`,
      side: "Sell",
      shares,
      priceRaw,
      price: Number(priceRaw) / 1_000_000,
      volumeRaw: shares * priceRaw,
    };
  });
  const yourRows = liveRows.filter((row) => {
    const listing = listings.find((item) => Number(item.onchain_listing_id) === row.id);
    return listing?.seller_wallet?.toLowerCase() === marketplace.address?.toLowerCase();
  });
  const totalCost = useMemo(() => Number(amount || 0) * (selectedListing?.price ?? 0), [amount, selectedListing]);

  const refreshListings = useCallback(async () => {
    const params = marketplace.address ? `?wallet=${marketplace.address}` : "";
    fetch(`/api/v2/marketplace${params}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { listings?: MarketplaceListing[] }) => setListings(data.listings ?? []))
      .catch(() => setListings([]));
  }, [marketplace.address]);

  useEffect(() => {
    const timer = window.setTimeout(refreshListings, 0);
    const interval = window.setInterval(refreshListings, 10000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [refreshListings]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v2/deals", { cache: "no-store" })
      .then((res) => res.json())
      .then((payload: {
        openDeals?: Array<{ title: string; contractAddress?: `0x${string}` | null }>;
        closedDeals?: Array<{ title: string; contractAddress?: `0x${string}` | null }>;
      }) => {
        if (!cancelled) {
          setDeals([...(payload.openDeals ?? []), ...(payload.closedDeals ?? [])].filter((deal) => deal.contractAddress).map((deal) => ({ title: deal.title, contractAddress: deal.contractAddress! })));
        }
      })
      .catch(() => {
        if (!cancelled) setDeals([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <SectionHeader
        eyebrow="Secondary market"
        title="Orderbook for private positions"
        description="Review active listings and manage private deal orders. Yield rights follow ownership after settlement."
      />

      {!marketplace.address ? (
        <div className="mb-5 border border-white/[0.08] bg-transparent p-4 text-sm text-[var(--muted)]">
          <p className="text-lg text-[var(--foreground)]">Connect Wallet</p>
          <p className="mt-1">
            Connect your wallet to create listings, trade deal shares, or manage your orders.
          </p>
        </div>
      ) : null}

      <section className="border border-white/[0.08] bg-transparent p-6">
        {marketplace.transaction.status !== "idle" ? (
          <div className="mb-4 border border-white/[0.08] bg-transparent p-3 text-sm text-[var(--muted)]">
            {marketplace.transaction.label}
          </div>
        ) : null}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl">Live orderbook</h2>
            <p className="mt-1 text-sm font-light text-[var(--muted)]">Yield rights transfer with ownership.</p>
          </div>
          <WalletGatedButton onClick={() => setListingOpen(true)} className="arc-button-outline rounded-md px-4 py-3 text-sm transition">
            Create listing
          </WalletGatedButton>
        </div>
        {liveRows.length === 0 ? (
          <div className="border-t border-white/[0.08] py-6 text-sm text-[var(--muted)]">No active listings.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-white/[0.08] text-[var(--muted)]">
                <tr>
                  <th className="mono-label py-3 text-[10px] font-normal">Deal</th>
                  <th className="mono-label py-3 text-[10px] font-normal">Side</th>
                  <th className="mono-label py-3 text-[10px] font-normal">Shares</th>
                  <th className="mono-label py-3 text-[10px] font-normal">Price / share</th>
                  <th className="mono-label py-3 text-[10px] font-normal">Volume</th>
                  <th className="mono-label py-3 text-[10px] font-normal">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.08]">
                {liveRows.map((row) => (
                  <tr key={row.id}>
                    <td className="py-4 text-[var(--foreground)]">{row.deal}</td>
                    <td className="py-4"><StatusBadge label={row.side === "Sell" ? "Liquid" : "Pending"} /></td>
                    <td className="py-4">{formatNumber(Number(row.shares), 0)}</td>
                    <td className="py-4">{formatTokenAmount(row.priceRaw, 6, "USDC", 2)}</td>
                    <td className="py-4">{formatTokenAmount(row.volumeRaw, 6, "USDC", 2)}</td>
                    <td className="py-4">
                      <WalletGatedButton onClick={() => setSelectedListing(row)} className="arc-button-outline rounded-md px-3 py-2 text-sm transition">
                        Trade
                      </WalletGatedButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {marketplace.address ? (
      <section className="mt-6 border border-white/[0.08] bg-transparent p-6">
        <div className="mb-4">
          <h2 className="text-2xl">Your orders</h2>
          <p className="mt-1 text-sm font-light text-[var(--muted)]">Open listings created by your connected wallet. Canceling returns unsold shares to your wallet.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-white/[0.08] text-[var(--muted)]">
              <tr>
                <th className="mono-label py-3 text-[10px] font-normal">Deal</th>
                <th className="mono-label py-3 text-[10px] font-normal">Listing</th>
                <th className="mono-label py-3 text-[10px] font-normal">Remaining shares</th>
                <th className="mono-label py-3 text-[10px] font-normal">Price / share</th>
                <th className="mono-label py-3 text-[10px] font-normal">Volume</th>
                <th className="mono-label py-3 text-[10px] font-normal">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.08]">
              {marketplace.address && yourRows.length === 0 ? <tr><td className="py-6 text-[var(--muted)]" colSpan={6}>No open orders.</td></tr> : null}
              {yourRows.map((row) => (
                <tr key={row.id}>
                  <td className="py-4 text-[var(--foreground)]">{row.deal}</td>
                  <td className="py-4">#{row.id}</td>
                  <td className="py-4">{formatNumber(Number(row.shares), 0)}</td>
                  <td className="py-4">{formatTokenAmount(row.priceRaw, 6, "USDC", 2)}</td>
                  <td className="py-4">{formatTokenAmount(row.volumeRaw, 6, "USDC", 2)}</td>
                  <td className="py-4">
                    <button
                      onClick={async () => {
                        const ok = await marketplace.cancelListing(BigInt(row.id));
                        if (ok) refreshListings();
                      }}
                      disabled={marketplace.transaction.status === "pending"}
                      className="rounded-md border border-white/[0.18] px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-white/[0.32] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      ) : (
        <section className="mt-6 border border-white/[0.08] bg-transparent p-6">
          <h2 className="text-2xl">Your orders</h2>
          <p className="mt-3 text-sm text-[var(--muted)]">Connect your wallet to view open orders.</p>
        </section>
      )}

      <Modal title="Create marketplace listing" open={listingOpen} onClose={() => setListingOpen(false)}>
        <div>
          {!marketplace.address ? (
            <div>
              <div className="border border-white/[0.08] bg-transparent p-4 text-sm">
                <p className="text-lg text-[var(--foreground)]">Wallet required</p>
                <p className="mt-1 leading-6 text-[var(--muted)]">
                  Connect your wallet to create a marketplace listing for owned deal shares.
                </p>
              </div>
              <WalletGatedButton
                className="arc-button-outline mt-5 w-full rounded-md px-4 py-3 text-sm transition"
              >
                Create listing
              </WalletGatedButton>
            </div>
          ) : dealHoldings.length === 0 ? (
            <div>
              <div className="border border-white/[0.08] bg-transparent p-4 text-sm">
                <p className="text-lg text-[var(--foreground)]">No listable deal holdings</p>
                <p className="mt-1 leading-6 text-[var(--muted)]">
                  This wallet does not currently hold deal shares. Invest in a deal or receive shares before creating a listing.
                </p>
              </div>
              <button
                type="button"
                disabled
                className="arc-button-outline mt-5 w-full cursor-not-allowed rounded-md px-4 py-3 text-sm opacity-50"
              >
                Create listing unavailable
              </button>
            </div>
          ) : (
            <>
              <label className="text-sm font-medium text-[var(--muted)]" htmlFor="deal-select">
                Deal position
              </label>
              <select
                id="deal-select"
                value={selectedDealAddress}
                onChange={(event) => {
                  setSelectedDealAddress(event.target.value);
                  setFormError(null);
                }}
                className="mt-2 w-full rounded-none border border-white/[0.08] bg-transparent px-4 py-3 outline-none focus:border-[var(--accent)]"
              >
                <option value="">Select deal</option>
                {dealHoldings.map((holding) => (
                  <option key={holding.contractAddress} value={holding.contractAddress}>
                    {holding.title} - {formatNumber(Number(holding.shares), 0)} shares
                  </option>
                ))}
              </select>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <input
                  value={listingAmount}
                  onChange={(event) => setListingAmount(event.target.value)}
                  placeholder="Shares to sell"
                  className="w-full rounded-none border border-white/[0.08] bg-transparent px-4 py-3 outline-none focus:border-[var(--accent)]"
                />
                <input
                  value={listingPrice}
                  onChange={(event) => setListingPrice(event.target.value)}
                  placeholder="Price per share"
                  className="w-full rounded-none border border-white/[0.08] bg-transparent px-4 py-3 outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div className="mt-4 border border-white/[0.08] bg-transparent p-4 text-sm">
                <PreviewRow label="Escrow" value="Shares transfer to marketplace" />
                <PreviewRow label="Settlement" value="Buyer pays USDC directly to you" />
                <PreviewRow label="Estimated value" value={formatCurrency(Number(listingAmount || 0) * Number(listingPrice || 0))} />
              </div>
              {formError ? <p className="mt-3 text-sm text-[var(--accent)]">{formError}</p> : null}
              <WalletGatedButton
                onClick={async () => {
                  const holding = dealHoldings.find((item) => item.contractAddress === selectedDealAddress);
                  if (!holding) {
                    setFormError("Select a deal position to list.");
                    return;
                  }
                  const shares = BigInt(listingAmount || "0");
                  if (shares <= BigInt(0)) {
                    setFormError("Enter a share amount greater than 0.");
                    return;
                  }
                  if (shares > BigInt(holding.shares)) {
                    setFormError("You cannot list more shares than you own.");
                    return;
                  }
                  if (Number(listingPrice || 0) <= 0) {
                    setFormError("Enter a price greater than 0 USDC.");
                    return;
                  }

                  const ok = await marketplace.createListing(listingAmount, listingPrice, holding.contractAddress);
                  if (ok) {
                    setListingAmount("");
                    setListingPrice("");
                    setSelectedDealAddress("");
                    refreshListings();
                    window.setTimeout(() => setListingOpen(false), 900);
                  }
                }}
                disabled={marketplace.transaction.status === "pending"}
                className="arc-button-filled mt-5 w-full rounded-md px-4 py-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {marketplace.transaction.status === "pending" ? "Confirming..." : marketplace.transaction.status === "confirmed" ? "Confirmed" : "Create listing"}
              </WalletGatedButton>
            </>
          )}
        </div>
      </Modal>

      <Modal title="Trade deal shares" open={Boolean(selectedListing)} onClose={() => setSelectedListing(null)}>
        {selectedListing ? (
          <div>
            <div className="border border-white/[0.08] bg-transparent p-4 text-sm">
              <PreviewRow label="Deal" value={selectedListing.deal} />
              <PreviewRow label="Available shares" value={formatNumber(Number(selectedListing.shares), 0)} />
              <PreviewRow label="Effective price" value={formatCurrency(selectedListing.price)} />
            </div>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Shares to fill"
              className="mt-4 w-full rounded-none border border-white/[0.08] bg-transparent px-4 py-3 outline-none focus:border-[var(--accent)]"
            />
            <div className="mt-4 border border-white/[0.08] bg-transparent p-4 text-sm">
              <PreviewRow label="Total cost" value={formatCurrency(totalCost)} />
              <PreviewRow label="Settlement" value="USDC for deal shares" />
            </div>
            <div className="mt-4 border border-white/[0.08] bg-transparent p-3 text-sm text-[var(--muted)]">
              Future revenue distributions follow the shares after settlement.
            </div>
            <WalletGatedButton
              onClick={async () => {
                const ok = await marketplace.fillListing(amount, BigInt(selectedListing.id), [
                  "0x0000000000000000000000000000000000000000",
                  "0x0000000000000000000000000000000000000000",
                  BigInt(0),
                  selectedListing.shares,
                  selectedListing.priceRaw,
                  true,
                ]);
                if (ok) {
                  setAmount("");
                  refreshListings();
                  window.setTimeout(() => setSelectedListing(null), 900);
                }
              }}
              disabled={marketplace.transaction.status === "pending"}
              className="arc-button-filled mt-5 w-full rounded-md px-4 py-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {marketplace.transaction.status === "pending" ? "Confirming..." : marketplace.transaction.status === "confirmed" ? "Confirmed" : "Confirm trade"}
            </WalletGatedButton>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <span className="mono-label text-[9px] text-[var(--muted)]">{label}</span>
      <span className="text-right text-[var(--foreground)]">{value}</span>
    </div>
  );
}

function useLiveDealHoldings(deals: Array<{ title: string; contractAddress: `0x${string}` }>, address?: `0x${string}`) {
  const first = useDealHolding(deals[0], address);
  const second = useDealHolding(deals[1], address);
  const third = useDealHolding(deals[2], address);
  return [first, second, third].filter((holding) => holding.contractAddress && BigInt(holding.shares) > BigInt(0));
}

function useDealHolding(deal?: { title: string; contractAddress: `0x${string}` }, address?: `0x${string}`) {
  const { data: shares } = useReadContract({
    address: deal?.contractAddress,
    abi: DEAL_VAULT_V2_ABI,
    functionName: "getShareBalance",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(deal?.contractAddress && address), refetchInterval: 8000 },
  });

  return {
    title: deal?.title ?? "",
    contractAddress: deal?.contractAddress,
    shares: (typeof shares === "bigint" ? shares : BigInt(0)).toString(),
  };
}
