"use client";

import { useEffect, useMemo, useState } from "react";
import { AllocationPieChart } from "@/components/charts";
import { DEAL_VAULT_ABI, LONG_TERM_VAULT_ABI, LONG_TERM_VAULT_ADDRESS, USDC_ABI, USDC_ADDRESS, VAULT_ABI, VAULT_ADDRESS } from "@/app/constants";
import { useDashboardData } from "@/hooks/useDashboardData";
import { formatTokenAmount } from "@/lib/utils";
import { useAccount, useReadContract } from "wagmi";

export default function DashboardPage() {
  const dashboard = useDashboardData();
  const { address } = useAccount();
  const [liveDeals, setLiveDeals] = useState<Array<{ id: string; contractAddress?: `0x${string}`; title: string; status: "open" | "closed" }>>([]);
  const { data: liveWalletBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { refetchInterval: 8000 },
  });
  const { data: liveMonthlyShares } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "shares",
    args: address ? [address] : undefined,
    query: { refetchInterval: 8000 },
  });
  const { data: livePricePerShare } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "pricePerShare",
    query: { refetchInterval: 8000 },
  });
  const { data: liveMonthlyTVL } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "totalAssets",
    query: { refetchInterval: 8000 },
  });
  useEffect(() => {
    let cancelled = false;
    async function loadDeals() {
      try {
        const response = await fetch("/api/admin/deals", { cache: "no-store" });
        const payload = (await response.json()) as Array<{ id: string; contractAddress?: `0x${string}`; title: string; status?: "open" | "closed"; contractMissing?: boolean }>;
        if (!cancelled) {
          setLiveDeals(payload.filter((deal) => deal.contractAddress && !deal.contractMissing).map((deal) => ({
            id: deal.id,
            contractAddress: deal.contractAddress,
            title: deal.title,
            status: deal.status ?? "open",
          })));
        }
      } catch {
        if (!cancelled) setLiveDeals([]);
      }
    }
    loadDeals();
    window.addEventListener("arc:data-refresh", loadDeals);
    return () => {
      cancelled = true;
      window.removeEventListener("arc:data-refresh", loadDeals);
    };
  }, []);

  const dealSources = useMemo(() => {
    const byAddress = new Map<string, { id: string; contractAddress?: `0x${string}`; title: string; status: "open" | "closed" }>();
    for (const deal of [...(dashboard.dealStatuses ?? []), ...liveDeals]) {
      if (!deal.contractAddress) continue;
      byAddress.set(deal.contractAddress.toLowerCase(), deal);
    }
    return [...byAddress.values()];
  }, [dashboard.dealStatuses, liveDeals]);
  const liveDealReads = useLiveDealValues(dealSources, address);
  const liveFixedReads = useLiveFixedIncomeValues(address);
  const walletLiquidity = typeof liveWalletBalance === "bigint" ? liveWalletBalance : dashboard.walletLiquidity;
  const monthlyValue =
    typeof liveMonthlyShares === "bigint" && typeof livePricePerShare === "bigint"
      ? (liveMonthlyShares * livePricePerShare) / BigInt(10 ** 18)
      : dashboard.monthlyValue;
  const monthlyTVL = typeof liveMonthlyTVL === "bigint" ? liveMonthlyTVL : dashboard.monthlyTVL;
  const dealValue = liveDealReads.hasLiveData ? liveDealReads.value : dashboard.dealValue;
  const dealYield = liveDealReads.hasLiveData ? liveDealReads.yield : dashboard.dealYield;
  const activeDealHoldings = liveDealReads.hasLiveData ? liveDealReads.activeHoldings : dashboard.activeDealHoldings;
  const fixedPrincipal = liveFixedReads.hasLiveData ? liveFixedReads.principal : dashboard.fixedPrincipal;
  const fixedYield = liveFixedReads.hasLiveData ? liveFixedReads.yield : dashboard.fixedYield;
  const activeFixedPositions = liveFixedReads.hasLiveData ? liveFixedReads.activePositions : dashboard.activeFixedPositions;
  const totalYield = fixedYield + dealYield;
  const totalPortfolioValue = dashboard.totalPortfolioValue > dashboard.walletLiquidity
    ? dashboard.totalPortfolioValue - dashboard.walletLiquidity - dashboard.monthlyValue - dashboard.fixedPrincipal - dashboard.fixedYield - dashboard.dealValue - dashboard.dealYield + walletLiquidity + monthlyValue + fixedPrincipal + fixedYield + dealValue + dealYield
    : walletLiquidity + monthlyValue + fixedPrincipal + fixedYield + dealValue + dealYield;
  const liveAllocations = useMemo(
    () =>
      [
        { label: "Wallet USDC", value: walletLiquidity, detail: "Available balance" },
        { label: "Monthly Vault", value: monthlyValue, detail: "Live vault shares" },
        { label: "Fixed Income", value: fixedPrincipal + fixedYield, detail: `${activeFixedPositions} active positions` },
        { label: "Deal Holdings", value: dealValue + dealYield, detail: `${activeDealHoldings} active holdings` },
      ].filter((item) => item.value > BigInt(0)),
    [activeDealHoldings, activeFixedPositions, dealValue, dealYield, fixedPrincipal, fixedYield, monthlyValue, walletLiquidity],
  );
  const showSetupNotice = dashboard.isConnected && !dashboard.loading && !dashboard.hasPortfolioData;
  const dashboardMetrics = [
    {
      label: "Portfolio value",
      value: dashboard.isConnected ? formatTokenAmount(totalPortfolioValue, 6, "USDC", 2) : "Awaiting Live Data",
      detail: dashboard.isConnected ? "Cash plus live positions" : "Wallet-specific data",
      tone: "violet" as const,
      icon: "↗",
    },
    {
      label: "Available income",
      value: dashboard.isConnected ? formatTokenAmount(totalYield, 6, "USDC", 2) : "Awaiting Live Data",
      detail: dashboard.isConnected ? "Claimable fixed-income and deal revenue" : "Wallet-specific data",
      tone: "emerald" as const,
      icon: "▣",
    },
    {
      label: "Wallet cash",
      value: dashboard.isConnected ? formatTokenAmount(walletLiquidity, 6, "USDC", 2) : "Awaiting Live Data",
      detail: dashboard.isConnected ? "USDC currently in wallet" : "Wallet-specific data",
      tone: "blue" as const,
      icon: "□",
    },
  ];

  return (
    <div>
      <section className="relative mb-10 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.02] px-6 py-10 shadow-[0_30px_90px_rgba(0,0,0,0.32)] sm:px-10 lg:px-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_35%,rgba(124,92,255,0.22),transparent_24%),radial-gradient(circle_at_60%_30%,rgba(77,141,255,0.14),transparent_28%)]" />
        <div className="relative">
          <div>
            <p className="text-sm font-semibold uppercase text-blue-300">Private banking, onchain</p>
            <h1 className="mt-5 text-5xl font-semibold tracking-normal text-white">Capital Overview</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
              An executive snapshot of available cash, invested capital, and income currently available.
            </p>
          </div>
        </div>
      </section>

      {!dashboard.isConnected ? (
        <div className="mb-5 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4 text-sm text-blue-100">
          <p className="font-semibold">Connect Wallet</p>
          <p className="mt-1 text-blue-200">
            Portfolio value, yield, positions, and activity unlock after wallet connection.
          </p>
        </div>
      ) : null}

      {dashboard.error ? (
        <div className="mb-5 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">
          {dashboard.error}
        </div>
      ) : null}

      {showSetupNotice ? (
        <div className="mb-5 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4 text-sm text-blue-100">
          <p className="font-semibold">No Activity Yet</p>
          <p className="mt-1 text-blue-200">
            Fund this wallet with Arc Testnet USDC, confirm the deployed contract addresses are configured, then make a deposit or deal investment.
          </p>
        </div>
      ) : null}

      <section className="grid gap-5 md:grid-cols-3">
        {dashboardMetrics.map((metric) => (
          <DashboardMetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="mt-6">
        <AllocationPieChart allocations={dashboard.isConnected ? liveAllocations : []} />
      </section>
    </div>
  );
}

function DashboardMetricCard({
  label,
  value,
  detail,
  tone,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "violet" | "emerald" | "blue";
  icon: string;
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
          <span className="text-3xl font-semibold">{icon}</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-base text-slate-300">{label}</p>
            <span className="grid h-4 w-4 place-items-center rounded-full border border-white/20 text-[10px] text-slate-400" title={detail}>i</span>
          </div>
          <p className="mt-4 text-3xl font-semibold text-white">{value}</p>
        </div>
      </div>
      <div className="absolute bottom-6 right-6 h-12 w-32 opacity-70">
        <svg viewBox="0 0 140 48" className="h-full w-full">
          <path d="M2 42 C18 38, 22 30, 35 33 S52 35, 65 24 84 30, 97 18 111 20, 138 5" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>
    </article>
  );
}

type DashboardData = ReturnType<typeof useDashboardData>;

function useLiveDealValues(deals: DashboardData["dealStatuses"], address?: `0x${string}`) {
  const openDeals = (deals ?? []).filter((deal) => deal.contractAddress);
  const first = useDealRead(openDeals[0]?.contractAddress, address);
  const second = useDealRead(openDeals[1]?.contractAddress, address);
  const third = useDealRead(openDeals[2]?.contractAddress, address);
  const reads = [first, second, third].filter((read) => read.hasAddress);
  const value = reads.reduce((total, read) => total + read.value, BigInt(0));
  const yieldAmount = reads.reduce((total, read) => total + read.yield, BigInt(0));
  const activeHoldings = reads.filter((read) => read.shares > BigInt(0)).length;

  return {
    activeHoldings,
    hasLiveData: reads.length > 0 && reads.every((read) => read.ready),
    value,
    yield: yieldAmount,
  };
}

function useDealRead(contractAddress?: `0x${string}`, address?: `0x${string}`) {
  const { data: shares } = useReadContract({
    address: contractAddress,
    abi: DEAL_VAULT_ABI,
    functionName: "getShareBalance",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(contractAddress && address), refetchInterval: 8000 },
  });
  const { data: pricePerShare } = useReadContract({
    address: contractAddress,
    abi: DEAL_VAULT_ABI,
    functionName: "pricePerShare",
    query: { enabled: Boolean(contractAddress), refetchInterval: 8000 },
  });
  const { data: pendingYield } = useReadContract({
    address: contractAddress,
    abi: DEAL_VAULT_ABI,
    functionName: "pendingYield",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(contractAddress && address), refetchInterval: 8000 },
  });
  const safeShares = typeof shares === "bigint" ? shares : BigInt(0);
  const safePrice = typeof pricePerShare === "bigint" ? pricePerShare : BigInt(0);

  return {
    hasAddress: Boolean(contractAddress),
    ready: typeof shares === "bigint" && typeof pricePerShare === "bigint",
    shares: safeShares,
    value: safeShares * safePrice,
    yield: typeof pendingYield === "bigint" ? pendingYield : BigInt(0),
  };
}

function useLiveFixedIncomeValues(address?: `0x${string}`) {
  const { data: positionIds } = useReadContract({
    address: LONG_TERM_VAULT_ADDRESS,
    abi: LONG_TERM_VAULT_ABI,
    functionName: "getUserPositions",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 8000 },
  });
  const ids = Array.isArray(positionIds) ? positionIds : [];
  const first = useFixedPositionRead(ids[0]);
  const second = useFixedPositionRead(ids[1]);
  const third = useFixedPositionRead(ids[2]);
  const reads = [first, second, third].filter((read) => read.hasPosition);
  const activeReads = reads.filter((read) => !read.redeemed);

  return {
    activePositions: activeReads.length,
    hasLiveData: Array.isArray(positionIds) && reads.every((read) => read.ready),
    principal: activeReads.reduce((total, read) => total + read.principal, BigInt(0)),
    yield: activeReads.reduce((total, read) => total + read.yield, BigInt(0)),
  };
}

function useFixedPositionRead(positionId?: bigint) {
  const { data: position } = useReadContract({
    address: LONG_TERM_VAULT_ADDRESS,
    abi: LONG_TERM_VAULT_ABI,
    functionName: "positions",
    args: positionId !== undefined ? [positionId] : undefined,
    query: { enabled: positionId !== undefined, refetchInterval: 8000 },
  });
  const { data: claimableYield } = useReadContract({
    address: LONG_TERM_VAULT_ADDRESS,
    abi: LONG_TERM_VAULT_ABI,
    functionName: "claimableYield",
    args: positionId !== undefined ? [positionId] : undefined,
    query: { enabled: positionId !== undefined, refetchInterval: 8000 },
  });

  return {
    hasPosition: positionId !== undefined,
    ready: Array.isArray(position),
    principal: Array.isArray(position) && typeof position[1] === "bigint" ? position[1] : BigInt(0),
    redeemed: Array.isArray(position) ? Boolean(position[7]) : false,
    yield: typeof claimableYield === "bigint" ? claimableYield : BigInt(0),
  };
}
