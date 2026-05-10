"use client";

import { useEffect, useMemo, useState } from "react";
import { AllocationPieChart } from "@/components/charts";
import { MetricCard } from "@/components/metric-card";
import { SectionHeader } from "@/components/section-header";
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

  return (
    <div>
      <SectionHeader
        eyebrow="Private banking, onchain"
        title="Capital overview"
        description="An executive snapshot of available cash, invested capital, and income currently available."
      />

      {!dashboard.isConnected ? (
        <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
          <p className="font-semibold">Connect Wallet</p>
          <p className="mt-1 text-blue-800 dark:text-blue-200">
            Portfolio value, yield, positions, and activity unlock after wallet connection.
          </p>
        </div>
      ) : null}

      {dashboard.error ? (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {dashboard.error}
        </div>
      ) : null}

      {showSetupNotice ? (
        <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
          <p className="font-semibold">No Activity Yet</p>
          <p className="mt-1 text-blue-800 dark:text-blue-200">
            Fund this wallet with Arc Testnet USDC, confirm the deployed contract addresses are configured, then make a deposit or deal investment.
          </p>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Portfolio value"
          value={dashboard.isConnected ? formatTokenAmount(totalPortfolioValue, 6, "USDC", 2) : "Awaiting Live Data"}
          detail={dashboard.isConnected ? "Cash plus live positions" : "Wallet-specific data"}
        />
        <MetricCard
          label="Available income"
          value={dashboard.isConnected ? formatTokenAmount(totalYield, 6, "USDC", 2) : "Awaiting Live Data"}
          detail={dashboard.isConnected ? "Claimable fixed-income and deal revenue" : "Wallet-specific data"}
        />
        <MetricCard
          label="Wallet cash"
          value={dashboard.isConnected ? formatTokenAmount(walletLiquidity, 6, "USDC", 2) : "Awaiting Live Data"}
          detail={dashboard.isConnected ? "USDC currently in wallet" : "Wallet-specific data"}
        />
      </section>

      <section className="mt-6">
        <AllocationPieChart allocations={dashboard.isConnected ? liveAllocations : []} />
      </section>
    </div>
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
