"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminHeader, AdminMetric, AdminPanel } from "@/components/admin/admin-ui";
import { formatAddress, formatDate, formatNumber, formatTokenAmount } from "@/lib/utils";

type V2MarketplaceListing = {
  id: string;
  onchain_listing_id: string;
  title: string | null;
  seller_wallet: string;
  shares_remaining: string;
  price_per_share_usdc: string;
  status: string;
  created_at: string;
};

type V2MarketplaceTrade = {
  id: string;
  buyer_wallet: string;
  seller_wallet: string;
  shares: string;
  total_price_usdc: string;
  tx_hash: string;
  traded_at: string;
};

type V2MarketplaceResponse = {
  status: "live" | "pending";
  listings: V2MarketplaceListing[];
  userOrders: V2MarketplaceListing[];
  trades: V2MarketplaceTrade[];
};

const EMPTY_MARKETPLACE: V2MarketplaceResponse = {
  status: "pending",
  listings: [],
  userOrders: [],
  trades: [],
};

export default function AdminMarketplacePage() {
  const [marketplace, setMarketplace] = useState<V2MarketplaceResponse>(EMPTY_MARKETPLACE);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refreshMarketplace() {
      try {
        const response = await fetch("/api/v2/marketplace", { cache: "no-store" });
        if (!response.ok) throw new Error("Marketplace data unavailable.");
        const payload = (await response.json()) as V2MarketplaceResponse;
        if (!cancelled) {
          setMarketplace(payload);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setMarketplace(EMPTY_MARKETPLACE);
          setError("Marketplace data unavailable.");
        }
      }
    }

    refreshMarketplace();
    const interval = window.setInterval(refreshMarketplace, 10000);
    window.addEventListener("arc:data-refresh", refreshMarketplace);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("arc:data-refresh", refreshMarketplace);
    };
  }, []);

  const metrics = useMemo(() => {
    const shares = marketplace.listings.reduce((total, listing) => total + decimalShares(listing.shares_remaining), BigInt(0));
    const listingVolume = marketplace.listings.reduce(
      (total, listing) => total + decimalShares(listing.shares_remaining) * decimalUsdcToRaw(listing.price_per_share_usdc),
      BigInt(0),
    );
    const tradeVolume = marketplace.trades.reduce((total, trade) => total + decimalUsdcToRaw(trade.total_price_usdc), BigInt(0));
    const averageTradeSize = marketplace.trades.length > 0 ? tradeVolume / BigInt(marketplace.trades.length) : BigInt(0);
    return { averageTradeSize, listingVolume, shares, tradeVolume };
  }, [marketplace]);

  return (
    <div>
      <AdminHeader
        title="Marketplace oversight"
        description="Monitor indexed listings, completed trades, liquidity depth, and secondary-market activity."
      />

      {error ? (
        <div className="mb-5 border border-white/[0.08] bg-transparent p-4 text-sm text-[var(--muted)]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <AdminMetric label="Active listing volume" value={formatTokenAmount(metrics.listingVolume, 6, "USDC", 2)} />
        <AdminMetric label="Active listing shares" value={formatNumber(Number(metrics.shares), 0)} />
        <AdminMetric label="Completed trade volume" value={formatTokenAmount(metrics.tradeVolume, 6, "USDC", 2)} />
        <AdminMetric label="Average trade size" value={formatTokenAmount(metrics.averageTradeSize, 6, "USDC", 2)} />
      </div>

      <AdminPanel title="Listings and liquidity">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-[var(--line)] text-[var(--muted)]">
              <tr>
                <th className="py-3">Deal</th>
                <th>Listing</th>
                <th>Seller</th>
                <th>Shares</th>
                <th>Price</th>
                <th>Volume</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {marketplace.listings.length === 0 ? <tr><td className="py-6 text-[var(--muted)]" colSpan={7}>No active listings.</td></tr> : null}
              {marketplace.listings.map((listing) => {
                const shares = decimalShares(listing.shares_remaining);
                const price = decimalUsdcToRaw(listing.price_per_share_usdc);
                return (
                  <tr key={listing.id}>
                    <td className="py-3 font-medium">{listing.title ?? `Listing #${listing.onchain_listing_id}`}</td>
                    <td>#{listing.onchain_listing_id}</td>
                    <td className="font-mono text-xs">{formatAddress(listing.seller_wallet)}</td>
                    <td>{formatNumber(Number(shares), 0)}</td>
                    <td>{formatTokenAmount(price, 6, "USDC", 2)}</td>
                    <td>{formatTokenAmount(shares * price, 6, "USDC", 2)}</td>
                    <td>{listing.status === "active" ? "Live" : listing.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </AdminPanel>

      <AdminPanel title="Completed trades">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-[var(--line)] text-[var(--muted)]">
              <tr>
                <th className="py-3">Buyer</th>
                <th>Seller</th>
                <th>Shares</th>
                <th>Value</th>
                <th>Date</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {marketplace.trades.length === 0 ? <tr><td className="py-6 text-[var(--muted)]" colSpan={6}>No marketplace fills recorded.</td></tr> : null}
              {marketplace.trades.map((trade) => (
                <tr key={trade.id}>
                  <td className="py-3 font-mono text-xs">{formatAddress(trade.buyer_wallet)}</td>
                  <td className="font-mono text-xs">{formatAddress(trade.seller_wallet)}</td>
                  <td>{formatNumber(Number(decimalShares(trade.shares)), 0)}</td>
                  <td>{formatTokenAmount(decimalUsdcToRaw(trade.total_price_usdc), 6, "USDC", 2)}</td>
                  <td>{formatDate(trade.traded_at)}</td>
                  <td className="font-mono text-xs">{trade.tx_hash.slice(0, 10)}...{trade.tx_hash.slice(-6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminPanel>
    </div>
  );
}

function decimalShares(value?: string | null) {
  if (!value) return BigInt(0);
  return BigInt(Math.trunc(Number(value)));
}

function decimalUsdcToRaw(value?: string | null) {
  if (!value) return BigInt(0);
  const [wholeRaw, fractionRaw = ""] = value.split(".");
  const whole = wholeRaw.replace(/[^\d-]/g, "") || "0";
  const fraction = fractionRaw.replace(/\D/g, "").padEnd(6, "0").slice(0, 6);
  try {
    return BigInt(whole) * BigInt(1_000_000) + BigInt(fraction || "0");
  } catch {
    return BigInt(0);
  }
}
