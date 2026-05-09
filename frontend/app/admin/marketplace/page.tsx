"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminHeader, AdminMetric, AdminPanel } from "@/components/admin/admin-ui";
import { formatNumber, formatTokenAmount } from "@/lib/utils";

type MarketplaceListing = {
  id: number;
  seller: string;
  token: string;
  dealId: string;
  deal: string;
  amountRemaining: string;
  pricePerShare: string;
  active: boolean;
};

export default function AdminMarketplacePage() {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);

  function refreshMarketplace() {
    fetch("/api/marketplace")
      .then((res) => res.json())
      .then((data: { listings?: MarketplaceListing[] }) => setListings(data.listings ?? []))
      .catch(() => setListings([]));
  }

  useEffect(() => {
    refreshMarketplace();
    const interval = window.setInterval(refreshMarketplace, 10000);
    return () => window.clearInterval(interval);
  }, []);

  const metrics = useMemo(() => {
    const shares = listings.reduce((total, listing) => total + BigInt(listing.amountRemaining), BigInt(0));
    const volume = listings.reduce((total, listing) => total + BigInt(listing.amountRemaining) * BigInt(listing.pricePerShare), BigInt(0));
    const averageTradeSize = listings.length > 0 ? volume / BigInt(listings.length) : BigInt(0);
    return { shares, volume, averageTradeSize };
  }, [listings]);

  return (
    <div>
      <AdminHeader title="Marketplace oversight" description="Monitor active listings, liquidity depth, volume, and potential intervention events." />
      <div className="grid gap-4 md:grid-cols-4">
        <AdminMetric label="Active listing volume" value={formatTokenAmount(metrics.volume, 6, "USDC", 2)} />
        <AdminMetric label="Active listing shares" value={formatNumber(Number(metrics.shares), 0)} />
        <AdminMetric label="Average listing size" value={formatTokenAmount(metrics.averageTradeSize, 6, "USDC", 2)} />
        <AdminMetric label="Suspicious activity" value="Pending Monitoring" />
      </div>
      <AdminPanel title="Listings and liquidity">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
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
              {listings.length === 0 ? <tr><td className="py-6 text-[var(--muted)]" colSpan={7}>No active listings.</td></tr> : null}
              {listings.map((listing) => {
                const shares = BigInt(listing.amountRemaining);
                const price = BigInt(listing.pricePerShare);
                return (
                  <tr key={listing.id}>
                    <td className="py-3 font-medium">{listing.deal}</td>
                    <td>#{listing.id}</td>
                    <td className="font-mono text-xs">{listing.seller.slice(0, 8)}...{listing.seller.slice(-6)}</td>
                    <td>{formatNumber(Number(shares), 0)}</td>
                    <td>{formatTokenAmount(price, 6, "USDC", 2)}</td>
                    <td>{formatTokenAmount(shares * price, 6, "USDC", 2)}</td>
                    <td>{listing.active ? "Live" : "Inactive"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </AdminPanel>
    </div>
  );
}
