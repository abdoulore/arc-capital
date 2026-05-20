"use client";

import { useEffect, useState } from "react";
import { AdminHeader, AdminMetric, AdminPanel } from "@/components/admin/admin-ui";
import { formatAddress, formatDate, formatNumber, formatTokenAmount } from "@/lib/utils";

type V2AdminOverview = {
  status: "live" | "pending";
  metrics: null | {
    total_value_usdc: string;
    investor_count: string;
    active_deals: string;
    open_listings: string;
    marketplace_volume_usdc: string;
  };
  activity: Array<{
    id: string;
    operatorWallet?: string | null;
    action: string;
    summary: string;
    txHash?: string | null;
    timestamp: string;
  }>;
};

const EMPTY_OVERVIEW: V2AdminOverview = {
  status: "pending",
  metrics: null,
  activity: [],
};

export default function AdminOverviewPage() {
  const [overview, setOverview] = useState<V2AdminOverview>(EMPTY_OVERVIEW);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch("/api/v2/admin/overview", { cache: "no-store" });
        if (!response.ok) throw new Error("Admin overview unavailable.");
        const payload = (await response.json()) as V2AdminOverview;
        if (!cancelled) {
          setOverview(payload);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setOverview(EMPTY_OVERVIEW);
          setError("Admin overview unavailable.");
        }
      }
    }

    refresh();
    const interval = window.setInterval(refresh, 10000);
    window.addEventListener("arc:data-refresh", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("arc:data-refresh", refresh);
    };
  }, []);

  const metrics = overview.metrics;
  const totalValue = decimalUsdcToRaw(metrics?.total_value_usdc);
  const marketplaceVolume = decimalUsdcToRaw(metrics?.marketplace_volume_usdc);

  return (
    <div>
      <AdminHeader
        title="Operations overview"
        description="Monitor indexed capital, investors, deals, and marketplace liquidity from one control surface."
      />

      {error ? (
        <div className="mb-5 rounded-lg border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <AdminMetric label="Indexed portfolio value" value={formatTokenAmount(totalValue, 6, "USDC", 2)} detail="Latest portfolio snapshots" />
        <AdminMetric label="Active investors" value={formatNumber(Number(metrics?.investor_count ?? 0), 0)} detail="Indexed wallet records" />
        <AdminMetric label="Marketplace volume" value={formatTokenAmount(marketplaceVolume, 6, "USDC", 2)} detail="Completed V2 trades" />
        <AdminMetric label="Active deals" value={formatNumber(Number(metrics?.active_deals ?? 0), 0)} detail="Open indexed deals" />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <AdminPanel title="Capital and marketplace">
          <div className="grid gap-3 sm:grid-cols-3">
            <CompactMetric label="Indexed value" value={formatTokenAmount(totalValue, 6, "USDC", 2)} />
            <CompactMetric label="Open listings" value={formatNumber(Number(metrics?.open_listings ?? 0), 0)} />
            <CompactMetric label="Trade volume" value={formatTokenAmount(marketplaceVolume, 6, "USDC", 2)} />
          </div>
          <div className="mt-4 rounded-md border border-dashed border-[var(--line)] px-4 py-3 text-sm text-[var(--muted)]">
            Values come from V2 indexed events and persisted portfolio snapshots. Run the V2 indexer after new onchain activity.
          </div>
        </AdminPanel>

        <AdminPanel title="Operational status">
          <div className="grid gap-3 sm:grid-cols-2">
            <CompactMetric label="Backend source" value={overview.status === "live" ? "V2 Indexed Data" : "Pending Integration"} />
            <CompactMetric label="Investor records" value={formatNumber(Number(metrics?.investor_count ?? 0), 0)} />
            <CompactMetric label="Open deals" value={formatNumber(Number(metrics?.active_deals ?? 0), 0)} />
            <CompactMetric label="Open listings" value={formatNumber(Number(metrics?.open_listings ?? 0), 0)} />
          </div>
        </AdminPanel>
      </div>

      <AdminPanel title="Recent admin activity">
        <div className="divide-y divide-[var(--line)]">
          {overview.activity.length === 0 ? <p className="py-6 text-sm text-[var(--muted)]">No Activity Yet</p> : null}
          {overview.activity.slice(0, 8).map((item) => (
            <div key={item.id} className="grid gap-2 py-3 text-sm md:grid-cols-[1fr_auto]">
              <div>
                <p className="font-medium">{item.action}</p>
                <p className="text-[var(--muted)]">{item.summary || "No summary provided."}</p>
              </div>
              <div className="text-left text-xs text-[var(--muted)] md:text-right">
                <p>{formatDate(item.timestamp)}</p>
                {item.operatorWallet ? <p>{formatAddress(item.operatorWallet)}</p> : null}
                {item.txHash ? <p className="font-mono">{item.txHash.slice(0, 10)}...{item.txHash.slice(-6)}</p> : null}
              </div>
            </div>
          ))}
        </div>
      </AdminPanel>
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--background)] p-3">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 break-words text-base font-semibold">{value}</p>
    </div>
  );
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
