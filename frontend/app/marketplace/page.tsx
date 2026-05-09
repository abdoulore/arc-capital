"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { DEAL_VAULT_ABI } from "@/app/constants";
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
  id: number;
  seller: string;
  deal: string;
  amountRemaining: string;
  pricePerShare: string;
  active: boolean;
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
    const shares = BigInt(listing.amountRemaining);
    const priceRaw = BigInt(listing.pricePerShare);
    return {
      id: listing.id,
      deal: listing.deal,
      side: "Sell",
      shares,
      priceRaw,
      price: Number(priceRaw) / 1_000_000,
      volumeRaw: shares * priceRaw,
    };
  });
  const yourRows = liveRows.filter((row) => {
    const listing = listings.find((item) => item.id === row.id);
    return listing?.seller?.toLowerCase() === marketplace.address?.toLowerCase();
  });
  const totalCost = useMemo(() => Number(amount || 0) * (selectedListing?.price ?? 0), [amount, selectedListing]);

  async function refreshListings() {
    fetch("/api/marketplace")
      .then((res) => res.json())
      .then((data: { listings?: MarketplaceListing[] }) => setListings(data.listings ?? []))
      .catch(() => setListings([]));
  }

  useEffect(() => {
    refreshListings();
    const interval = window.setInterval(refreshListings, 10000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/deals", { cache: "no-store" })
      .then((res) => res.json())
      .then((payload: Array<{ title: string; contractAddress?: `0x${string}`; contractMissing?: boolean }>) => {
        if (!cancelled) {
          setDeals(payload.filter((deal) => deal.contractAddress && !deal.contractMissing).map((deal) => ({ title: deal.title, contractAddress: deal.contractAddress! })));
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
        description="Listings are escrowed before they appear here. Fills settle atomically: USDC to seller, deal shares to buyer."
      />

      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
        {marketplace.transaction.status !== "idle" ? (
          <div className="mb-4 rounded-md bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">
            {marketplace.transaction.label}
          </div>
        ) : null}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Live orderbook</h2>
            <p className="text-sm text-[var(--muted)]">Yield rights transfer with ownership.</p>
          </div>
          <button onClick={() => setListingOpen(true)} className="rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700">
            Create listing
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-[var(--line)] text-[var(--muted)]">
              <tr>
                <th className="py-3 font-medium">Deal</th>
                <th className="py-3 font-medium">Side</th>
                <th className="py-3 font-medium">Shares</th>
                <th className="py-3 font-medium">Price / share</th>
                <th className="py-3 font-medium">Volume</th>
                <th className="py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {liveRows.length === 0 ? <tr><td className="py-6 text-[var(--muted)]" colSpan={6}>No active listings.</td></tr> : null}
              {liveRows.map((row) => (
                <tr key={row.id}>
                  <td className="py-4 font-medium">{row.deal}</td>
                  <td className="py-4"><StatusBadge label={row.side === "Sell" ? "Liquid" : "Pending"} /></td>
                  <td className="py-4">{formatNumber(Number(row.shares), 0)}</td>
                  <td className="py-4">{formatTokenAmount(row.priceRaw, 6, "USDC", 2)}</td>
                  <td className="py-4">{formatTokenAmount(row.volumeRaw, 6, "USDC", 2)}</td>
                  <td className="py-4">
                    <button onClick={() => setSelectedListing(row)} className="rounded-md border border-[var(--line)] px-3 py-2 font-medium hover:bg-slate-50 dark:hover:bg-slate-900">
                      Trade
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="font-semibold">Your orders</h2>
          <p className="text-sm text-[var(--muted)]">Open listings created by your connected wallet. Canceling returns unsold shares to your wallet.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-[var(--line)] text-[var(--muted)]">
              <tr>
                <th className="py-3 font-medium">Deal</th>
                <th className="py-3 font-medium">Listing</th>
                <th className="py-3 font-medium">Remaining shares</th>
                <th className="py-3 font-medium">Price / share</th>
                <th className="py-3 font-medium">Volume</th>
                <th className="py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {!marketplace.address ? <tr><td className="py-6 text-[var(--muted)]" colSpan={6}>Connect wallet to manage orders.</td></tr> : null}
              {marketplace.address && yourRows.length === 0 ? <tr><td className="py-6 text-[var(--muted)]" colSpan={6}>No open orders.</td></tr> : null}
              {yourRows.map((row) => (
                <tr key={row.id}>
                  <td className="py-4 font-medium">{row.deal}</td>
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
                      className="rounded-md border border-red-200 px-3 py-2 font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
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

      <Modal title="Create marketplace listing" open={listingOpen} onClose={() => setListingOpen(false)}>
        <div>
          {dealHoldings.length === 0 ? (
            <div className="rounded-md border border-[var(--line)] bg-slate-50 p-4 text-sm text-[var(--muted)] dark:bg-slate-900">
              No deal shares available to list.
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
                className="mt-2 w-full rounded-md border border-[var(--line)] bg-transparent px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full rounded-md border border-[var(--line)] bg-transparent px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  value={listingPrice}
                  onChange={(event) => setListingPrice(event.target.value)}
                  placeholder="Price per share"
                  className="w-full rounded-md border border-[var(--line)] bg-transparent px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--background)] p-4 text-sm">
                <PreviewRow label="Escrow" value="Shares transfer to marketplace" />
                <PreviewRow label="Settlement" value="Buyer pays USDC directly to you" />
                <PreviewRow label="Estimated value" value={formatCurrency(Number(listingAmount || 0) * Number(listingPrice || 0))} />
              </div>
              {formError ? <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">{formError}</p> : null}
              <button
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
                className="mt-5 w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
              >
                {marketplace.transaction.status === "pending" ? "Confirming..." : marketplace.transaction.status === "confirmed" ? "Confirmed" : "Create listing"}
              </button>
            </>
          )}
        </div>
      </Modal>

      <Modal title="Trade deal shares" open={Boolean(selectedListing)} onClose={() => setSelectedListing(null)}>
        {selectedListing ? (
          <div>
            <div className="rounded-md border border-[var(--line)] bg-[var(--background)] p-4 text-sm">
              <PreviewRow label="Deal" value={selectedListing.deal} />
              <PreviewRow label="Available shares" value={formatNumber(Number(selectedListing.shares), 0)} />
              <PreviewRow label="Effective price" value={formatCurrency(selectedListing.price)} />
            </div>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Shares to fill"
              className="mt-4 w-full rounded-md border border-[var(--line)] bg-transparent px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--background)] p-4 text-sm">
              <PreviewRow label="Total cost" value={formatCurrency(totalCost)} />
              <PreviewRow label="Settlement" value="USDC for ERC-1155 deal shares" />
            </div>
            <div className="mt-4 rounded-md bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">
              Future revenue distributions follow the shares after settlement.
            </div>
            <button
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
              className="mt-5 w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
            >
              {marketplace.transaction.status === "pending" ? "Confirming..." : marketplace.transaction.status === "confirmed" ? "Confirmed" : "Confirm trade"}
            </button>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="text-right font-semibold text-[var(--foreground)]">{value}</span>
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
    abi: DEAL_VAULT_ABI,
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
