"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminHeader, AdminMetric, AdminPanel, formatUsdc } from "@/components/admin/admin-ui";
import { useAdminContracts } from "@/hooks/useAdminContracts";
import { formatDate, formatNumber, formatTokenAmount } from "@/lib/utils";

type AdminActivity = {
  id: string;
  timestamp: string;
  operator?: string;
  action: string;
  summary: string;
  hash?: string;
};

type UserMetrics = {
  activeInvestors: number;
  wallets: Array<{
    totalDeposits: string;
    activeInvestments: number;
    yieldClaimed: string;
    marketplaceVolume: string;
  }>;
  withdrawals: number;
};

type MarketplaceListing = {
  id: number;
  amountRemaining: string;
  pricePerShare: string;
};

export default function AdminOverviewPage() {
  const { metrics } = useAdminContracts();
  const [activity, setActivity] = useState<AdminActivity[]>([]);
  const [localActivity, setLocalActivity] = useState<AdminActivity[]>([]);
  const [userMetrics, setUserMetrics] = useState<UserMetrics | null>(null);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);

  useEffect(() => {
    let mounted = true;

    async function refresh() {
      const [activityResponse, usersResponse, marketplaceResponse] = await Promise.allSettled([
        fetch("/api/admin/activity").then((res) => res.json() as Promise<AdminActivity[]>),
        fetch("/api/admin/users").then((res) => res.json() as Promise<UserMetrics>),
        fetch("/api/marketplace").then((res) => res.json() as Promise<{ listings?: MarketplaceListing[] }>),
      ]);

      if (!mounted) return;
      if (activityResponse.status === "fulfilled") setActivity(activityResponse.value.slice(0, 5));
      if (usersResponse.status === "fulfilled") setUserMetrics(usersResponse.value);
      if (marketplaceResponse.status === "fulfilled") setListings(marketplaceResponse.value.listings ?? []);
      setLocalActivity(readRecentLocalActivity());
    }

    refresh();
    const interval = window.setInterval(refresh, 10000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const overview = useMemo(() => {
    const totalDeposits =
      userMetrics?.wallets.reduce((total, wallet) => total + BigInt(wallet.totalDeposits || "0"), BigInt(0)) ??
      BigInt(0);
    const activeInvestments =
      userMetrics?.wallets.reduce((total, wallet) => total + wallet.activeInvestments, 0) ?? 0;
    const yieldClaimed =
      userMetrics?.wallets.reduce((total, wallet) => total + BigInt(wallet.yieldClaimed || "0"), BigInt(0)) ??
      BigInt(0);
    const listingVolume = listings.reduce(
      (total, listing) => total + BigInt(listing.amountRemaining || "0") * BigInt(listing.pricePerShare || "0"),
      BigInt(0),
    );

    return { activeInvestments, listingVolume, totalDeposits, yieldClaimed };
  }, [listings, userMetrics]);

  return (
    <div>
      <AdminHeader title="Operations overview" description="Monitor capital, yield obligations, treasury routing, and marketplace liquidity from one control surface." />
      <div className="grid gap-4 md:grid-cols-4">
        <AdminMetric label="Total TVL" value={formatUsdc(metrics.monthlyTVL)} detail="Monthly Vault live onchain value" />
        <AdminMetric label="Indexed deposits" value={formatTokenAmount(overview.totalDeposits, 6, "USDC", 2)} detail="Event indexer total" />
        <AdminMetric label="Active listing volume" value={formatTokenAmount(overview.listingVolume, 6, "USDC", 2)} detail="Open orderbook liquidity" />
        <AdminMetric label="Active deals" value={formatNumber(Number(metrics.dealCount ?? BigInt(0)), 0)} detail="DealVaultFactory count" />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <AdminPanel title="Capital and yield">
          <div className="grid gap-3 sm:grid-cols-3">
            <CompactMetric label="Investors" value={String(userMetrics?.activeInvestors ?? 0)} />
            <CompactMetric label="Indexed positions" value={formatNumber(overview.activeInvestments, 0)} />
            <CompactMetric label="Indexed yield claimed" value={formatTokenAmount(overview.yieldClaimed, 6, "USDC", 2)} />
          </div>
          <div className="mt-4 rounded-md border border-dashed border-[var(--line)] px-4 py-3 text-sm text-[var(--muted)]">
            Live TVL and shares are read directly from contracts. Investor counts, deposits, and claimed yield depend on the event indexer.
          </div>
        </AdminPanel>

        <AdminPanel title="Operational status">
          <div className="grid gap-3 sm:grid-cols-2">
            <CompactMetric label="Withdrawal events" value={formatNumber(userMetrics?.withdrawals ?? 0, 0)} />
            <CompactMetric label="Open listings" value={formatNumber(listings.length, 0)} />
            <CompactMetric label="Monthly vault shares" value={metrics.totalShares ? formatTokenAmount(metrics.totalShares, 6, "shares", 2) : "Awaiting Live Data"} />
            <CompactMetric label="Monitoring" value="Pending Integration" />
          </div>
        </AdminPanel>
      </div>

      <AdminPanel title="Recent platform activity">
        <div className="divide-y divide-[var(--line)]">
          {[...activity, ...localActivity].length === 0 ? <p className="py-6 text-sm text-[var(--muted)]">No Activity Yet</p> : null}
          {[...activity, ...localActivity].slice(0, 8).map((item) => (
            <div key={item.id} className="grid gap-2 py-3 text-sm md:grid-cols-[1fr_auto]">
              <div>
                <p className="font-medium">{item.action}</p>
                <p className="text-[var(--muted)]">{item.summary || "No summary provided."}</p>
              </div>
              <div className="text-left text-xs text-[var(--muted)] md:text-right">
                <p>{formatDate(item.timestamp)}</p>
                {item.hash ? <p className="font-mono">{item.hash.slice(0, 10)}...{item.hash.slice(-6)}</p> : null}
              </div>
            </div>
          ))}
        </div>
      </AdminPanel>
    </div>
  );
}

function readRecentLocalActivity() {
  if (typeof window === "undefined") return [];
  const rows: AdminActivity[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith("arc:activity:")) continue;
    try {
      const items = JSON.parse(window.localStorage.getItem(key) ?? "[]") as Array<{
        id: string;
        timestamp: string;
        action: string;
        detail?: string;
        hash?: string;
      }>;
      rows.push(
        ...items.map((item) => ({
          id: item.id,
          timestamp: item.timestamp,
          action: item.action,
          summary: item.detail ?? "Transaction confirmed.",
          hash: item.hash,
        })),
      );
    } catch {
      continue;
    }
  }
  return rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 5);
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--background)] p-3">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 break-words text-base font-semibold">{value}</p>
    </div>
  );
}
