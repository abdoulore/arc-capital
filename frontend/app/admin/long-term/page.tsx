"use client";

import { useEffect, useState } from "react";
import { isAddress, type Address } from "viem";
import { AdminButton, AdminHeader, AdminInput, AdminMetric, AdminPanel, formatUsdc } from "@/components/admin/admin-ui";
import { useAdminContracts } from "@/hooks/useAdminContracts";
import { formatAddress, formatDate, formatPercent, formatTokenAmount } from "@/lib/utils";

type LongTermAnalytics = {
  activePositions: number;
  lockedCapital: string;
  claimableYield: string;
  upcomingUnlockCount: number;
  pools: Array<{ label: string; duration: string; principal: string; claimableYield: string; positions: number }>;
  upcomingUnlocks: Array<{ id: string; owner: string; principal: string; maturity: string; apyBps: string }>;
};

export default function AdminLongTermPage() {
  const admin = useAdminContracts();
  const { metrics } = admin;
  const [selectedDuration, setSelectedDuration] = useState(365 * 24 * 60 * 60);
  const [apyBps, setApyBps] = useState("");
  const [treasury, setTreasury] = useState("");
  const [analytics, setAnalytics] = useState<LongTermAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const durationOptions = [
    { label: "1 year", seconds: 365 * 24 * 60 * 60 },
    { label: "2 years", seconds: 730 * 24 * 60 * 60 },
    { label: "3 years", seconds: 1095 * 24 * 60 * 60 },
  ];

  function chooseDuration(seconds: number) {
    setSelectedDuration(seconds);
  }

  function refreshAnalytics() {
    setLoading(true);
    fetch("/api/admin/long-term")
      .then((res) => res.json())
      .then((payload) => {
        setAnalytics(payload);
        setLoadError(false);
      })
      .catch(() => {
        setAnalytics(null);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refreshAnalytics();
    const interval = window.setInterval(refreshAnalytics, 12000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div>
      <AdminHeader title="Long-Term Vault operations" description="Monitor fixed-income liabilities, unlocks, and deterministic yield obligations." />
      <div className="grid gap-4 md:grid-cols-4">
        <AdminMetric label="Monthly TVL reference" value={formatUsdc(metrics.monthlyTVL)} />
        <AdminMetric label="Yield obligations" value={metricValue(analytics ? formatTokenAmount(toBigInt(analytics.claimableYield), 6, "USDC", 2) : undefined, loading, loadError)} />
        <AdminMetric label="Active positions" value={metricValue(analytics ? String(analytics.activePositions) : undefined, loading, loadError)} />
        <AdminMetric label="Upcoming unlocks" value={metricValue(analytics ? String(analytics.upcomingUnlockCount) : undefined, loading, loadError)} />
      </div>
      <AdminPanel title="Duration pools">
        <div className="grid gap-4 md:grid-cols-3">
          {durationOptions.map((pool) => (
            <div key={pool.seconds} className="rounded-md border border-[var(--line)] p-4">
              <p className="font-semibold">{pool.label} pool</p>
              <p className="mt-2 text-2xl font-semibold">{formatTokenAmount(toBigInt(analytics?.pools.find((item) => item.duration === String(pool.seconds))?.principal), 6, "USDC", 2)}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {analytics?.pools.find((item) => item.duration === String(pool.seconds))?.positions ?? 0} positions,
                {" "}
                {formatTokenAmount(toBigInt(analytics?.pools.find((item) => item.duration === String(pool.seconds))?.claimableYield), 6, "USDC", 2)} claimable
              </p>
            </div>
          ))}
        </div>
      </AdminPanel>
      <AdminPanel title="Tranche controls">
        <div className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-3">
            {durationOptions.map((option) => (
              <button
                key={option.seconds}
                type="button"
                onClick={() => chooseDuration(option.seconds)}
                className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                  selectedDuration === option.seconds
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <AdminInput value={apyBps} onChange={setApyBps} placeholder="APY bps" />
          <AdminButton onClick={() => admin.configureLongTermTranche(selectedDuration, apyBps, true)}>Update selected tranche APY</AdminButton>
          <AdminInput value={treasury} onChange={setTreasury} placeholder="Treasury wallet address" />
          <AdminButton disabled={!isAddress(treasury)} onClick={() => admin.setLongTermTreasury(treasury as Address)}>Update treasury wallet</AdminButton>
        </div>
      </AdminPanel>
      <AdminPanel title="Upcoming unlock schedule">
        <div className="divide-y divide-[var(--line)]">
          {loadError ? <p className="py-6 text-sm text-[var(--muted)]">Long-term analytics unavailable. Retry after the RPC recovers.</p> : null}
          {!loadError && (!analytics || analytics.upcomingUnlocks.length === 0) ? <p className="py-6 text-sm text-[var(--muted)]">No upcoming unlocks.</p> : null}
          {analytics?.upcomingUnlocks.map((unlock) => (
            <div key={unlock.id} className="flex flex-col gap-1 py-3 text-sm md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Position #{unlock.id}</p>
                <p className="text-[var(--muted)]">{formatAddress(unlock.owner)}</p>
              </div>
              <div className="text-[var(--muted)] md:text-right">
                <p>{formatTokenAmount(toBigInt(unlock.principal), 6, "USDC", 2)} principal</p>
                <p>{formatDate(BigInt(unlock.maturity))} at {formatPercent(Number(unlock.apyBps) / 100)}</p>
              </div>
            </div>
          ))}
        </div>
      </AdminPanel>
    </div>
  );
}

function toBigInt(value?: string) {
  try {
    return BigInt(value ?? "0");
  } catch {
    return BigInt(0);
  }
}

function metricValue(value: string | undefined, loading: boolean, error: boolean) {
  if (value !== undefined) return value;
  if (error) return "Unavailable";
  return loading ? "Loading" : "0";
}
