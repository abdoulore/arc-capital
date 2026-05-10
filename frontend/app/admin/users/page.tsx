"use client";

import { useEffect, useState } from "react";
import { AdminHeader, AdminMetric, AdminPanel } from "@/components/admin/admin-ui";
import { formatAddress, formatDate, formatNumber, formatTokenAmount } from "@/lib/utils";

type UsersSummary = {
  activeInvestors: number;
  topInvestorDeposits: string;
  recentUsers: number;
  highRiskActivity: string;
  wallets: Array<{ wallet: string; totalDeposits: string; portfolioValue?: string; activeInvestments: number; yieldClaimed: string; marketplaceVolume: string; status: string }>;
  marketplaceActivity: Array<{ id: string; buyer: string; amount: string; totalPrice: string; listingId: string; timestamp: string; hash: string }>;
};

export default function AdminUsersPage() {
  const [summary, setSummary] = useState<UsersSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  function refreshUsers() {
    setLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);

    fetch("/api/admin/users", { signal: controller.signal, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("User analytics unavailable"))))
      .then((payload) => {
        setSummary(payload);
        setLoadError(false);
      })
      .catch(() => {
        setSummary(null);
        setLoadError(true);
      })
      .finally(() => {
        window.clearTimeout(timeout);
        setLoading(false);
      });
  }

  useEffect(() => {
    refreshUsers();
    const interval = window.setInterval(refreshUsers, 12000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div>
      <AdminHeader title="User monitoring" description="Operational wallet monitoring without exposing unnecessary sensitive information." />
      <div className="grid gap-4 md:grid-cols-4">
        <AdminMetric label="Active investors" value={metricValue(summary ? formatNumber(summary.activeInvestors, 0) : undefined, loading, loadError)} />
        <AdminMetric label="Top wallet value" value={metricValue(summary ? formatTokenAmount(toBigInt(summary.topInvestorDeposits), 6, "USDC", 2) : undefined, loading, loadError)} />
        <AdminMetric label="Recent users" value={metricValue(summary ? formatNumber(summary.recentUsers, 0) : undefined, loading, loadError)} />
        <AdminMetric label="High-risk activity" value={loadError ? "Unavailable" : loading ? "Loading" : summary?.highRiskActivity ?? "0"} />
      </div>
      <AdminPanel title="Investor wallets">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-[var(--line)] text-[var(--muted)]">
              <tr><th className="py-3">Wallet</th><th>Portfolio value</th><th>Total deposits</th><th>Active investments</th><th>Yield claimed</th><th>Marketplace volume</th><th>Status</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {loadError ? <tr><td className="py-6 text-[var(--muted)]" colSpan={7}>User analytics unavailable. Retry after the RPC recovers.</td></tr> : null}
              {!loadError && (!summary || summary.wallets.length === 0) ? <tr><td className="py-6 text-[var(--muted)]" colSpan={7}>{loading ? "Loading investor wallets." : "No investor wallets found."}</td></tr> : null}
              {summary?.wallets.map((wallet) => (
                <tr key={wallet.wallet}>
                  <td className="py-3 font-mono text-xs">{formatAddress(wallet.wallet)}</td>
                  <td>{formatTokenAmount(toBigInt(wallet.portfolioValue), 6, "USDC", 2)}</td>
                  <td>{formatTokenAmount(toBigInt(wallet.totalDeposits), 6, "USDC", 2)}</td>
                  <td>{formatNumber(wallet.activeInvestments, 0)}</td>
                  <td>{formatTokenAmount(toBigInt(wallet.yieldClaimed), 6, "USDC", 2)}</td>
                  <td>{formatTokenAmount(toBigInt(wallet.marketplaceVolume), 6, "USDC", 2)}</td>
                  <td>{wallet.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminPanel>
      <AdminPanel title="Marketplace activity">
        <div className="divide-y divide-[var(--line)]">
          {loadError ? <p className="py-6 text-sm text-[var(--muted)]">Marketplace user activity unavailable. Retry after the RPC recovers.</p> : null}
          {!loadError && (!summary || summary.marketplaceActivity.length === 0) ? <p className="py-6 text-sm text-[var(--muted)]">{loading ? "Loading marketplace activity." : "No marketplace fills recorded."}</p> : null}
          {summary?.marketplaceActivity.map((item) => (
            <div key={item.id} className="flex flex-col gap-1 py-3 text-sm md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Listing #{item.listingId} filled</p>
                <p className="text-[var(--muted)]">{formatNumber(Number(item.amount), 0)} shares for {formatTokenAmount(toBigInt(item.totalPrice), 6, "USDC", 2)}</p>
              </div>
              <div className="text-[var(--muted)] md:text-right">
                <p>{formatAddress(item.buyer)}</p>
                <p>{formatDate(item.timestamp)}</p>
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
