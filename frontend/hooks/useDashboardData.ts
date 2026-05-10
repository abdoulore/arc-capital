"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";

export type DashboardAllocation = {
  label: string;
  value: bigint;
  detail: string;
};

export type DashboardActivity = {
  id: string;
  timestamp: string;
  action: string;
  amount?: string;
  amountLabel?: string;
  amountUnit?: "USDC" | "shares";
  secondaryAmount?: string;
  secondaryLabel?: string;
  secondaryUnit?: "USDC" | "shares";
  verb: string;
  detail?: string;
  hash?: `0x${string}`;
};

type DashboardResponse = {
  isConnected: boolean;
  walletLiquidity: string;
  monthlyValue: string;
  monthlyTVL?: string;
  fixedPrincipal: string;
  fixedYield: string;
  dealValue: string;
  dealYield: string;
  totalPortfolioValue: string;
  totalYield: string;
  activeFixedPositions: number;
  activeDealHoldings: number;
  allocations: Array<{ label: string; value: string; detail: string }>;
  yieldHistory: Array<{ id: string; timestamp: string; totalPortfolioValue: string; totalYield: string }>;
  fixedPositions?: Array<{ id: string; principal: string; claimableYield: string; maturity: string; apyBps: string; duration: string }>;
  dealHoldings?: Array<{ title: string; contractAddress: `0x${string}`; shares: string; pricePerShare: string; value: string; pendingYield?: string }>;
  dealStatuses?: Array<{ id: string; contractAddress?: `0x${string}`; title: string; status: "open" | "closed" }>;
  activity: DashboardActivity[];
  error?: string;
};

const emptyDashboard: DashboardResponse = {
  isConnected: false,
  walletLiquidity: "0",
  monthlyValue: "0",
  fixedPrincipal: "0",
  fixedYield: "0",
  dealValue: "0",
  dealYield: "0",
  totalPortfolioValue: "0",
  totalYield: "0",
  activeFixedPositions: 0,
  activeDealHoldings: 0,
  allocations: [],
  yieldHistory: [],
  activity: [],
};

export function useDashboardData() {
  const { address } = useAccount();
  const [data, setData] = useState<DashboardResponse>(emptyDashboard);
  const [localActivity, setLocalActivity] = useState<DashboardActivity[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      if (!address) {
        setData(emptyDashboard);
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(`/api/dashboard?address=${address}`, { cache: "no-store" });
        const payload = (await response.json()) as DashboardResponse;
        if (!cancelled) setData(payload);
      } catch {
        if (!cancelled) setData({ ...emptyDashboard, isConnected: true, error: "Dashboard data unavailable." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    function loadLocalActivity() {
      if (!address) {
        setLocalActivity([]);
        return;
      }
      setLocalActivity(readLocalActivity(address));
    }

    loadDashboard();
    loadLocalActivity();
    const interval = window.setInterval(loadDashboard, 12000);
    window.addEventListener("arc:data-refresh", loadDashboard);
    window.addEventListener("arc:local-activity", loadLocalActivity);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("arc:data-refresh", loadDashboard);
      window.removeEventListener("arc:local-activity", loadLocalActivity);
    };
  }, [address]);

  return useMemo(
    () => ({
      ...data,
      isConnected: Boolean(address) || data.isConnected,
      hasPortfolioData:
        toBigInt(data.totalPortfolioValue) > BigInt(0) ||
        toBigInt(data.monthlyValue) > BigInt(0) ||
        toBigInt(data.fixedPrincipal) > BigInt(0) ||
        toBigInt(data.dealValue) > BigInt(0) ||
        data.activity.length > 0 ||
        localActivity.length > 0,
      walletLiquidity: toBigInt(data.walletLiquidity),
      monthlyValue: toBigInt(data.monthlyValue),
      monthlyTVL: data.monthlyTVL ? toBigInt(data.monthlyTVL) : undefined,
      fixedPrincipal: toBigInt(data.fixedPrincipal),
      fixedYield: toBigInt(data.fixedYield),
      dealValue: toBigInt(data.dealValue),
      dealYield: toBigInt(data.dealYield),
      totalPortfolioValue: toBigInt(data.totalPortfolioValue),
      totalYield: toBigInt(data.totalYield),
      allocations: data.allocations.map((allocation) => ({
        ...allocation,
        value: toBigInt(allocation.value),
      })) satisfies DashboardAllocation[],
      yieldHistory: data.yieldHistory.map((point) => ({
        ...point,
        totalPortfolioValue: toBigInt(point.totalPortfolioValue),
        totalYield: toBigInt(point.totalYield),
      })),
      activity: mergeActivity(localActivity, data.activity),
      loading,
    }),
    [address, data, localActivity, loading],
  );
}

export function recordLocalActivity(address: string, activity: DashboardActivity) {
  if (typeof window === "undefined") return;
  const key = localActivityKey(address);
  const existing = readLocalActivity(address);
  const next = [activity, ...existing.filter((item) => item.id !== activity.id)].slice(0, 25);
  window.localStorage.setItem(key, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("arc:local-activity"));
}

function readLocalActivity(address: string) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(localActivityKey(address));
    if (!raw) return [];
    return JSON.parse(raw) as DashboardActivity[];
  } catch {
    return [];
  }
}

function localActivityKey(address: string) {
  return `arc:activity:${address.toLowerCase()}`;
}

function mergeActivity(local: DashboardActivity[], indexed: DashboardActivity[]) {
  const byId = new Map<string, DashboardActivity>();
  const byHashAndAction = new Map<string, string>();
  for (const item of [...local, ...indexed]) {
    const semanticKey = activitySemanticKey(item);
    if (semanticKey) {
      const existingId = byHashAndAction.get(semanticKey);
      if (existingId) {
        const existing = byId.get(existingId);
        byId.set(existingId, pickRicherActivity(existing, item));
        continue;
      }
      byHashAndAction.set(semanticKey, item.id);
    }
    byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function activitySemanticKey(item: DashboardActivity) {
  if (!item.hash) return undefined;
  return `${item.hash.toLowerCase()}:${normalizeAction(item.action)}`;
}

function normalizeAction(action: string) {
  return action.toLowerCase().split(":")[0].trim();
}

function pickRicherActivity(existing: DashboardActivity | undefined, next: DashboardActivity) {
  if (!existing) return next;
  const existingScore = activityDetailScore(existing);
  const nextScore = activityDetailScore(next);
  return nextScore >= existingScore ? next : existing;
}

function activityDetailScore(item: DashboardActivity) {
  return [
    item.amount,
    item.secondaryAmount,
    item.detail && !item.detail.toLowerCase().includes("wallet-confirmed transaction") ? item.detail : undefined,
    item.action.includes(":") ? item.action : undefined,
  ].filter(Boolean).length;
}

function toBigInt(value: string | undefined) {
  try {
    return BigInt(value ?? "0");
  } catch {
    return BigInt(0);
  }
}
