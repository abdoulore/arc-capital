"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { useAccount, useReadContract } from "wagmi";
import {
  LONG_TERM_VAULT_V2_ADDRESS,
  MONTHLY_VAULT_V2_ADDRESS,
  USDC_ABI,
  USDC_ADDRESS,
} from "@/app/constants";
import { AdminButton, AdminHeader, AdminInput, AdminMetric, AdminPanel } from "@/components/admin/admin-ui";
import { useAdminContracts } from "@/hooks/useAdminContracts";
import { formatAddress, formatDate, formatTokenAmount } from "@/lib/utils";

type V2Deal = {
  id: string;
  contractAddress?: Address | null;
  title: string;
  status: string;
};

type V2Treasury = {
  status: "live" | "pending";
  summary: null | {
    total_routed_yield_usdc: string;
    total_deal_revenue_usdc: string;
    movement_count: string;
  };
  movements: Array<{
    id: string;
    movement_type: string;
    operator_wallet: string | null;
    destination: string | null;
    amount_usdc: string;
    tx_hash: string | null;
    occurred_at: string;
  }>;
};

const EMPTY_TREASURY: V2Treasury = {
  status: "pending",
  summary: null,
  movements: [],
};

export default function AdminTreasuryPage() {
  const { address } = useAccount();
  const admin = useAdminContracts();
  const [monthlyYield, setMonthlyYield] = useState("");
  const [longTermYield, setLongTermYield] = useState("");
  const [dealRevenue, setDealRevenue] = useState("");
  const [selectedDeal, setSelectedDeal] = useState("");
  const [deals, setDeals] = useState<V2Deal[]>([]);
  const [treasury, setTreasury] = useState<V2Treasury>(EMPTY_TREASURY);
  const [error, setError] = useState<string | null>(null);

  const operatorBalance = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 10000 },
  });
  const monthlyVaultBalance = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: [MONTHLY_VAULT_V2_ADDRESS],
    query: { refetchInterval: 10000 },
  });
  const longTermBalance = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: [LONG_TERM_VAULT_V2_ADDRESS],
    query: { refetchInterval: 10000 },
  });

  const refresh = useCallback(async () => {
    try {
      const [dealsResponse, treasuryResponse] = await Promise.all([
        fetch("/api/v2/deals", { cache: "no-store" }),
        fetch("/api/v2/admin/treasury", { cache: "no-store" }),
      ]);
      if (!dealsResponse.ok || !treasuryResponse.ok) throw new Error("Treasury data unavailable.");
      const dealsPayload = (await dealsResponse.json()) as { openDeals?: V2Deal[]; closedDeals?: V2Deal[] };
      const treasuryPayload = (await treasuryResponse.json()) as V2Treasury;
      setDeals([...(dealsPayload.openDeals ?? []), ...(dealsPayload.closedDeals ?? [])].filter((deal) => deal.contractAddress));
      setTreasury(treasuryPayload);
      setError(null);
    } catch {
      setDeals([]);
      setTreasury(EMPTY_TREASURY);
      setError("Treasury data unavailable.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(refresh, 0);
    const interval = window.setInterval(refresh, 12000);
    window.addEventListener("arc:data-refresh", refresh);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("arc:data-refresh", refresh);
    };
  }, [refresh]);

  return (
    <div>
      <AdminHeader
        title="Treasury and distributions"
        description="Route real wallet-funded yield into V2 vaults and deal contracts. No synthetic yield is created here."
      />

      {error ? (
        <div className="mb-5 border border-white/[0.08] bg-transparent p-4 text-sm text-[var(--muted)]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <AdminMetric label="Operator wallet" value={address ? formatAddress(address) : "Connect Wallet"} detail="Settlement source" />
        <AdminMetric label="Operator USDC" value={formatMaybeUSDC(operatorBalance.data)} detail="Available for routing" />
        <AdminMetric label="Monthly vault cash" value={formatMaybeUSDC(monthlyVaultBalance.data)} detail="V2 vault USDC balance" />
        <AdminMetric label="Long-term reserves" value={formatMaybeUSDC(longTermBalance.data)} detail="V2 fixed-income reserve" />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <AdminMetric label="Total routed yield" value={formatTokenAmount(decimalUsdcToRaw(treasury.summary?.total_routed_yield_usdc), 6, "USDC", 2)} />
        <AdminMetric label="Total deal revenue" value={formatTokenAmount(decimalUsdcToRaw(treasury.summary?.total_deal_revenue_usdc), 6, "USDC", 2)} />
        <AdminMetric label="Distribution records" value={treasury.summary?.movement_count ?? "0"} detail="Indexed treasury movements" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <AdminPanel title="Inject Monthly Vault yield">
          <div className="grid gap-3">
            <AdminInput value={monthlyYield} onChange={setMonthlyYield} placeholder="Amount USDC" />
            <AdminButton
              onClick={async () => {
                const ok = await admin.injectMonthlyYield(monthlyYield);
                if (ok) {
                  setMonthlyYield("");
                  refresh();
                }
              }}
            >
              Route yield
            </AdminButton>
          </div>
        </AdminPanel>

        <AdminPanel title="Fund fixed-income yield reserve">
          <div className="grid gap-3">
            <p className="text-sm text-[var(--muted)]">
              Transfers USDC directly into the V2 Long-Term Vault reserve used for deterministic yield claims and maturity payouts.
            </p>
            <AdminInput value={longTermYield} onChange={setLongTermYield} placeholder="Amount USDC" />
            <AdminButton
              onClick={async () => {
                const ok = await admin.injectLongTermYield(longTermYield);
                if (ok) {
                  setLongTermYield("");
                  refresh();
                }
              }}
            >
              Fund reserve
            </AdminButton>
          </div>
        </AdminPanel>

        <AdminPanel title="Distribute deal revenue">
          <div className="grid gap-3">
            <p className="text-sm text-[var(--muted)]">
              Transfers USDC from the operator wallet into the selected V2 Deal Vault and updates pro-rata claimable revenue.
            </p>
            <select
              value={selectedDeal}
              onChange={(event) => setSelectedDeal(event.target.value)}
              className="rounded-none border border-white/[0.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="">Select deal</option>
              {deals.map((deal) => (
                <option key={deal.id} value={deal.contractAddress ?? ""}>
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
          {treasury.movements.length === 0 ? <p className="py-6 text-sm text-[var(--muted)]">No Activity Yet</p> : null}
          {treasury.movements.map((item) => (
            <div key={item.id} className="flex flex-col gap-1 py-3 text-sm md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">{humanizeType(item.movement_type)}</p>
                <p className="text-[var(--muted)]">
                  {formatTokenAmount(decimalUsdcToRaw(item.amount_usdc), 6, "USDC", 2)} routed to {item.destination ? formatAddress(item.destination) : "destination"}
                </p>
              </div>
              <div className="text-[var(--muted)] md:text-right">
                <p>{formatDate(item.occurred_at)}</p>
                {item.tx_hash ? <p className="font-mono text-xs">{formatAddress(item.tx_hash, 10, 6)}</p> : null}
              </div>
            </div>
          ))}
        </div>
      </AdminPanel>
    </div>
  );
}

function formatMaybeUSDC(value: unknown) {
  return typeof value === "bigint" ? formatTokenAmount(value, 6, "USDC", 2) : "Awaiting Live Data";
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

function humanizeType(type: string) {
  return type
    .replace(/_/g, " ")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
