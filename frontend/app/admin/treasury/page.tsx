"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { useReadContract } from "wagmi";
import { LONG_TERM_VAULT_ADDRESS, USDC_ABI, USDC_ADDRESS } from "@/app/constants";
import { AdminButton, AdminHeader, AdminInput, AdminMetric, AdminPanel, formatUsdc } from "@/components/admin/admin-ui";
import { useAdminContracts } from "@/hooks/useAdminContracts";
import type { DealMetadata } from "@/lib/admin-store";
import { formatAddress, formatDate, formatTokenAmount } from "@/lib/utils";

type TreasurySummary = {
  treasury?: string;
  treasuryBalance: string;
  monthlyVaultBalance: string;
  longTermBalance: string;
  totalRoutedYield: string;
  totalDealRevenue: string;
  history: Array<{ id: string; timestamp: string; source?: string; destination?: string; amount: string; type: string; hash: string }>;
};

export default function AdminTreasuryPage() {
  const admin = useAdminContracts();
  const [monthlyYield, setMonthlyYield] = useState("");
  const [longTermYield, setLongTermYield] = useState("");
  const [dealRevenue, setDealRevenue] = useState("");
  const [selectedDeal, setSelectedDeal] = useState("");
  const [deals, setDeals] = useState<DealMetadata[]>([]);
  const [summary, setSummary] = useState<TreasurySummary | null>(null);
  const treasuryAddress = (summary?.treasury ?? (typeof admin.metrics.treasury === "string" ? admin.metrics.treasury : undefined)) as Address | undefined;
  const treasuryBalance = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: treasuryAddress ? [treasuryAddress] : undefined,
    query: { enabled: Boolean(treasuryAddress), refetchInterval: 10000 },
  });
  const longTermBalance = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: [LONG_TERM_VAULT_ADDRESS],
    query: { refetchInterval: 10000 },
  });

  function refresh() {
    fetch("/api/admin/deals")
      .then((res) => res.json())
      .then(setDeals)
      .catch(() => setDeals([]));
    fetch("/api/admin/treasury")
      .then((res) => res.json())
      .then(setSummary)
      .catch(() => setSummary(null));
  }

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 12000);
    return () => window.clearInterval(interval);
  }, []);

  const liveDeals = deals.filter((deal) => deal.contractAddress && !("contractMissing" in deal));
  const treasuryUsdc =
    typeof treasuryBalance.data === "bigint"
      ? treasuryBalance.data
      : summary
        ? toBigInt(summary.treasuryBalance)
        : undefined;
  const fixedReserves =
    typeof longTermBalance.data === "bigint"
      ? longTermBalance.data
      : summary
        ? toBigInt(summary.longTermBalance)
        : undefined;

  return (
    <div>
      <AdminHeader title="Treasury and distributions" description="Route real wallet-funded yield into vaults and deal contracts. No synthetic yield is created here." />
      <div className="grid gap-4 md:grid-cols-4">
        <AdminMetric label="Treasury wallet" value={treasuryAddress ? formatAddress(treasuryAddress) : "Awaiting Live Data"} detail="Settlement source" />
        <AdminMetric label="Treasury USDC" value={treasuryUsdc !== undefined ? formatTokenAmount(treasuryUsdc, 6, "", 2).trim() : "Loading"} detail="USDC" />
        <AdminMetric label="Monthly vault cash" value={summary ? formatTokenAmount(toBigInt(summary.monthlyVaultBalance), 6, "", 2).trim() : formatUsdc(admin.metrics.monthlyTVL)} detail="USDC" />
        <AdminMetric label="Long-term reserves" value={fixedReserves !== undefined ? formatTokenAmount(fixedReserves, 6, "", 2).trim() : "Loading"} detail="USDC" />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <AdminMetric label="Total routed yield" value={summary ? formatTokenAmount(toBigInt(summary.totalRoutedYield), 6, "USDC", 2) : "Awaiting Live Data"} />
        <AdminMetric label="Total deal revenue" value={summary ? formatTokenAmount(toBigInt(summary.totalDealRevenue), 6, "USDC", 2) : "Awaiting Live Data"} />
        <AdminMetric label="Distribution mode" value="Wallet tx" detail="Requires operator confirmation" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <AdminPanel title="Inject Monthly Vault yield">
          <div className="grid gap-3">
            <AdminInput value={monthlyYield} onChange={setMonthlyYield} placeholder="Amount USDC" />
            <AdminButton onClick={async () => { const ok = await admin.injectMonthlyYield(monthlyYield); if (ok) { setMonthlyYield(""); refresh(); } }}>Route yield</AdminButton>
          </div>
        </AdminPanel>
        <AdminPanel title="Fund fixed-income yield reserve">
          <div className="grid gap-3">
            <p className="text-sm text-[var(--muted)]">Funds deterministic monthly claims and maturity yield. This is a real USDC transfer to the Long-Term Vault.</p>
            <AdminInput value={longTermYield} onChange={setLongTermYield} placeholder="Amount USDC" />
            <AdminButton onClick={async () => { const ok = await admin.injectLongTermYield(longTermYield); if (ok) { setLongTermYield(""); refresh(); } }}>Fund reserve</AdminButton>
          </div>
        </AdminPanel>
        <AdminPanel title="Distribute deal revenue">
          <div className="grid gap-3">
            <p className="text-sm text-[var(--muted)]">Transfers USDC from the operator wallet into the selected Deal Vault and updates pro-rata claimable revenue.</p>
            <select
              value={selectedDeal}
              onChange={(event) => setSelectedDeal(event.target.value)}
              className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select deal</option>
              {liveDeals.map((deal) => (
                <option key={deal.id} value={deal.contractAddress}>
                  {deal.title}
                </option>
              ))}
            </select>
            <AdminInput value={dealRevenue} onChange={setDealRevenue} placeholder="Revenue amount USDC" />
            <AdminButton
              disabled={!selectedDeal}
              onClick={async () => {
                const ok = await admin.distributeDealRevenue(dealRevenue, selectedDeal as Address);
                if (ok) {
                  setDealRevenue("");
                  refresh();
                }
              }}
            >
              Distribute revenue
            </AdminButton>
          </div>
        </AdminPanel>
      </div>

      <AdminPanel title="Distribution history">
        <div className="divide-y divide-[var(--line)]">
          {!summary || summary.history.length === 0 ? <p className="py-6 text-sm text-[var(--muted)]">No Activity Yet</p> : null}
          {summary?.history.map((item) => (
            <div key={item.id} className="flex flex-col gap-1 py-3 text-sm md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">{humanizeType(item.type)}</p>
                <p className="text-[var(--muted)]">{formatTokenAmount(toBigInt(item.amount), 6, "USDC", 2)} routed to {item.destination ? formatAddress(item.destination) : "destination"}</p>
              </div>
              <div className="text-[var(--muted)] md:text-right">
                <p>{formatDate(item.timestamp)}</p>
                <p className="font-mono text-xs">{formatAddress(item.hash, 10, 6)}</p>
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

function humanizeType(type: string) {
  return type
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
