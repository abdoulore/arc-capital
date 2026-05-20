"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { AllocationPieChart } from "@/components/charts";
import { formatTokenAmount } from "@/lib/utils";

type V2Dashboard = {
  status: "live" | "pending";
  totalPortfolioValue: string;
  availableIncome: string;
  walletCash: string;
  allocation: Array<{ label: string; valueUsdc: string }>;
  lastUpdated: string | null;
  activity: Array<{
    id: string;
    action: string;
    valueUsdc?: string;
    shares?: string;
    txHash?: string;
    timestamp?: string;
  }>;
};

const EMPTY_DASHBOARD: V2Dashboard = {
  status: "pending",
  totalPortfolioValue: "0",
  availableIncome: "0",
  walletCash: "0",
  allocation: [],
  lastUpdated: null,
  activity: [],
};

export default function DashboardPage() {
  const router = useRouter();
  const { address, isConnected, status } = useAccount();
  const [mounted, setMounted] = useState(false);
  const [dashboard, setDashboard] = useState<V2Dashboard>(EMPTY_DASHBOARD);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || status === "connecting" || status === "reconnecting") return;
    if (!isConnected) router.replace("/vaults");
  }, [isConnected, mounted, router, status]);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;

    async function loadDashboard() {
      try {
        const response = await fetch(`/api/v2/dashboard?wallet=${address}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Dashboard data unavailable.");
        const next = (await response.json()) as V2Dashboard;
        if (!cancelled) {
          setDashboard(next);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setDashboard(EMPTY_DASHBOARD);
          setError("Dashboard data unavailable.");
        }
      }
    }

    loadDashboard();
    const interval = window.setInterval(loadDashboard, 10000);
    window.addEventListener("arc:data-refresh", loadDashboard);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("arc:data-refresh", loadDashboard);
    };
  }, [address]);

  const allocations = useMemo(
    () =>
      dashboard.allocation.map((item) => ({
        label: item.label,
        value: decimalUsdcToRaw(item.valueUsdc),
        detail: allocationDetail(item.label),
      })),
    [dashboard.allocation],
  );

  const hasPortfolioData =
    decimalUsdcToRaw(dashboard.totalPortfolioValue) > BigInt(0) ||
    decimalUsdcToRaw(dashboard.availableIncome) > BigInt(0) ||
    decimalUsdcToRaw(dashboard.walletCash) > BigInt(0) ||
    dashboard.allocation.length > 0 ||
    dashboard.activity.length > 0;

  if (!mounted || status === "connecting" || status === "reconnecting" || !isConnected) return null;

  return (
    <div>
      <section className="relative mb-10 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.02] px-6 py-10 shadow-[0_30px_90px_rgba(0,0,0,0.32)] sm:px-10 lg:px-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_35%,rgba(124,92,255,0.22),transparent_24%),radial-gradient(circle_at_60%_30%,rgba(77,141,255,0.14),transparent_28%)]" />
        <div className="relative">
          <p className="text-sm font-semibold uppercase text-blue-300">Private banking, onchain</p>
          <h1 className="mt-5 text-5xl font-semibold tracking-normal text-white">Capital Overview</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
            An executive snapshot of available cash, invested capital, and income currently available.
          </p>
        </div>
      </section>

      {error ? (
        <div className="mb-5 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">
          {error}
        </div>
      ) : null}

      {!hasPortfolioData ? (
        <div className="mb-5 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4 text-sm text-blue-100">
          <p className="font-semibold">No Activity Yet</p>
          <p className="mt-1 text-blue-200">
            Fund this wallet with Arc Testnet USDC, then deposit into a vault or invest in a deal.
          </p>
        </div>
      ) : null}

      <section className="grid gap-5 md:grid-cols-3">
        <DashboardMetricCard
          label="Portfolio value"
          value={formatTokenAmount(decimalUsdcToRaw(dashboard.totalPortfolioValue), 6, "USDC", 2)}
          detail="Cash plus indexed positions"
          tone="violet"
        />
        <DashboardMetricCard
          label="Available income"
          value={formatTokenAmount(decimalUsdcToRaw(dashboard.availableIncome), 6, "USDC", 2)}
          detail="Claimable fixed-income and deal revenue"
          tone="emerald"
        />
        <DashboardMetricCard
          label="Wallet cash"
          value={formatTokenAmount(decimalUsdcToRaw(dashboard.walletCash), 6, "USDC", 2)}
          detail="USDC currently in wallet"
          tone="blue"
        />
      </section>

      <section className="mt-6">
        <AllocationPieChart allocations={allocations} />
      </section>
    </div>
  );
}

function DashboardMetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "violet" | "emerald" | "blue";
}) {
  const palette = {
    violet: "border-violet-400/25 shadow-violet-950/30 text-violet-300 bg-violet-500/10",
    emerald: "border-emerald-400/20 shadow-emerald-950/20 text-emerald-300 bg-emerald-500/10",
    blue: "border-blue-400/20 shadow-blue-950/20 text-blue-300 bg-blue-500/10",
  }[tone];

  return (
    <article className={`relative overflow-hidden rounded-2xl border bg-white/[0.035] p-7 shadow-[0_20px_70px_rgba(0,0,0,0.28)] ${palette}`}>
      <div className="relative z-10 flex items-start gap-5">
        <div className={`grid h-16 w-16 place-items-center rounded-2xl border ${palette}`}>
          <MetricIcon label={label} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-base text-slate-300">{label}</p>
            <span className="grid h-4 w-4 place-items-center rounded-full border border-white/20 text-[10px] text-slate-400" title={detail}>
              i
            </span>
          </div>
          <p className="mt-4 text-3xl font-semibold text-white">{value}</p>
        </div>
      </div>
    </article>
  );
}

function MetricIcon({ label }: { label: string }) {
  if (label === "Portfolio value") {
    return (
      <span className="relative h-7 w-7">
        <span className="absolute bottom-0 left-0 h-2 w-1.5 rounded-sm bg-current" />
        <span className="absolute bottom-0 left-2.5 h-4 w-1.5 rounded-sm bg-current" />
        <span className="absolute bottom-0 left-5 h-6 w-1.5 rounded-sm bg-current" />
        <span className="absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2 border-current" />
      </span>
    );
  }

  if (label === "Available income") {
    return (
      <span className="relative h-7 w-7">
        <span className="absolute inset-1 rounded-md border-2 border-current" />
        <span className="absolute inset-2.5 rounded-sm bg-current" />
      </span>
    );
  }

  return (
    <span className="relative h-7 w-7">
      <span className="absolute inset-x-1 bottom-1 h-4 rounded-md border-2 border-current" />
      <span className="absolute left-2 top-1 h-4 w-5 rounded-md border-2 border-current" />
      <span className="absolute right-1.5 top-4 h-1.5 w-1.5 rounded-full bg-current" />
    </span>
  );
}

function allocationDetail(label: string) {
  if (label === "Wallet USDC") return "Available balance";
  if (label === "Monthly Vault") return "Live vault shares";
  if (label === "Fixed Income") return "Fixed-income principal and claimable yield";
  if (label === "Deal Holdings") return "Private deal ownership value";
  return "Indexed allocation";
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
