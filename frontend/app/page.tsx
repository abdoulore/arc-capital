"use client";

import { useEffect, useMemo, useState } from "react";
import { AllocationPieChart, YieldChart } from "@/components/charts";
import { MetricCard } from "@/components/metric-card";
import { SectionHeader } from "@/components/section-header";
import { DEAL_VAULT_ABI, LONG_TERM_VAULT_ABI, LONG_TERM_VAULT_ADDRESS, USDC_ABI, USDC_ADDRESS, VAULT_ABI, VAULT_ADDRESS } from "@/app/constants";
import { useDashboardData } from "@/hooks/useDashboardData";
import { ARC_TESTNET_EXPLORER_URL } from "@/lib/network";
import { formatNumber, formatTokenAmount } from "@/lib/utils";
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

  return (
    <div>
      <SectionHeader
        eyebrow="Private banking, onchain"
        title="Capital overview"
        description="Track semi-liquid vault exposure, fixed-income locks, and private deal cash flows in one place."
      />

      {dashboard.error ? (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {dashboard.error}
        </div>
      ) : null}

      {showSetupNotice ? (
        <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
          <p className="font-semibold">No Arc portfolio activity yet</p>
          <p className="mt-1 text-blue-800 dark:text-blue-200">
            Fund this wallet with Arc Testnet USDC, confirm the deployed contract addresses are configured, then make a deposit or deal investment.
          </p>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Total portfolio value"
          value={dashboard.isConnected ? formatTokenAmount(totalPortfolioValue, 6, "USDC", 2) : "Connect Wallet"}
          detail="Wallet balance plus live onchain positions"
        />
        <MetricCard
          label="Claimable yield"
          value={dashboard.isConnected ? formatTokenAmount(totalYield, 6, "USDC", 2) : "Connect Wallet"}
          detail="Fixed-income and deal revenue available now"
        />
        <MetricCard
          label="Available liquidity"
          value={dashboard.isConnected ? formatTokenAmount(walletLiquidity, 6, "USDC", 2) : "Connect Wallet"}
          detail="USDC currently in wallet"
        />
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-4">
        <MetricCard label="Monthly Vault" value={dashboard.isConnected ? formatTokenAmount(monthlyValue, 6, "USDC", 2) : "Connect Wallet"} detail="Live share value" />
        <MetricCard label="Fixed Income" value={dashboard.isConnected ? formatTokenAmount(fixedPrincipal, 6, "USDC", 2) : "Connect Wallet"} detail={`${activeFixedPositions} active positions`} />
        <MetricCard label="Deal Holdings" value={dashboard.isConnected ? formatTokenAmount(dealValue, 6, "USDC", 2) : "Connect Wallet"} detail={`${activeDealHoldings} active holdings`} />
        <MetricCard label="Monthly Vault TVL" value={typeof monthlyTVL === "bigint" ? formatTokenAmount(monthlyTVL, 6, "USDC", 2) : "Awaiting Live Data"} detail="Protocol-level onchain assets" />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <YieldChart totalYield={dashboard.isConnected ? totalYield : undefined} history={dashboard.isConnected ? dashboard.yieldHistory : []} />
        <AllocationPieChart allocations={dashboard.isConnected ? liveAllocations : []} />
      </section>

      <section className="mt-6 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Recent activity</h2>
            <p className="text-sm text-[var(--muted)]">Financial events that changed portfolio value or liquidity.</p>
          </div>
        </div>
        <div className="divide-y divide-[var(--line)]">
          {dashboard.activity.length === 0 ? <p className="py-6 text-sm text-[var(--muted)]">No live activity logged yet.</p> : null}
          {dashboard.activity.slice(0, 6).map((item) => (
            <div key={item.id} className="flex flex-col gap-3 py-4 text-sm md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="font-semibold">{item.action}</p>
                <p className="mt-1 text-[var(--foreground)]">{formatActivityValue(item)}</p>
                {item.detail && !isWalletFallbackDetail(item.detail) ? <p className="mt-1 text-xs text-[var(--muted)]">{item.detail}</p> : null}
              </div>
              <div className="shrink-0 text-[var(--muted)] md:text-right">
                <p>{formatActivityDate(item.timestamp)}</p>
                {item.hash ? (
                  <a
                    href={`${ARC_TESTNET_EXPLORER_URL}/tx/${item.hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block font-mono text-xs text-blue-600 hover:underline dark:text-blue-400"
                  >
                    View transaction
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

type ActivityItem = ReturnType<typeof useDashboardData>["activity"][number];

function formatActivityValue(item: ActivityItem) {
  if (!item.amount) return "Value pending";
  const primary = formatActivityAmount(item.amount, item.amountUnit);
  const secondary = item.secondaryAmount ? ` ${item.secondaryLabel ?? "for"} ${formatActivityAmount(item.secondaryAmount, item.secondaryUnit)}` : "";
  const label = item.amountLabel ? ` ${item.amountLabel}` : "";
  return `${primary}${label} ${item.verb}${secondary}`;
}

function isWalletFallbackDetail(detail: string) {
  return detail.toLowerCase().includes("wallet-confirmed transaction");
}

function formatActivityDate(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatActivityAmount(value = "0", unit: ActivityItem["amountUnit"]) {
  const amount = toBigInt(value);
  if (unit === "shares") return `${formatNumber(Number(amount), 0)} shares`;
  return formatTokenAmount(amount, 6, "USDC", 2);
}

function toBigInt(value: string) {
  try {
    return BigInt(value);
  } catch {
    return BigInt(0);
  }
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
