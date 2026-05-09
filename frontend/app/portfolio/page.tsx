"use client";

import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { DEAL_VAULT_ABI, LONG_TERM_VAULT_ABI, LONG_TERM_VAULT_ADDRESS, USDC_ABI, USDC_ADDRESS, VAULT_ABI, VAULT_ADDRESS } from "@/app/constants";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useDealVault, useLongTermVault } from "@/hooks/useInvestmentContracts";
import { formatNumber, formatTokenAmount } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";

export default function PortfolioPage() {
  const portfolio = useDashboardData();
  const { address } = useAccount();
  const connected = portfolio.isConnected;
  const liveWallet = useLiveWalletValue(address);
  const liveMonthly = useLiveMonthlyValue(address);
  const liveFixed = useLiveFixedPositions(address);
  const liveDeals = useLiveDealPositions(address);
  const walletLiquidity = liveWallet ?? portfolio.walletLiquidity;
  const monthlyValue = liveMonthly.value ?? portfolio.monthlyValue;
  const fixedPrincipal = liveFixed.hasLiveData ? liveFixed.principal : portfolio.fixedPrincipal;
  const fixedYield = liveFixed.hasLiveData ? liveFixed.yield : portfolio.fixedYield;
  const dealValue = liveDeals.hasLiveData ? liveDeals.value : portfolio.dealValue;
  const dealYield = liveDeals.hasLiveData ? liveDeals.yield : portfolio.dealYield;
  const totalValue = walletLiquidity + monthlyValue + fixedPrincipal + fixedYield + dealValue + dealYield;
  const totalYield = fixedYield + dealYield;
  const fixedRows = liveFixed.hasLiveData ? liveFixed.positions : portfolio.fixedPositions ?? [];
  const dealRows = liveDeals.hasLiveData ? liveDeals.holdings : portfolio.dealHoldings ?? [];

  return (
    <div>
      <SectionHeader
        eyebrow="Portfolio"
        title="Positions and liquidity"
        description="See what is liquid, what is locked, what can be listed, and what has claimable yield."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <PortfolioMetric label="Total value" value={connected ? formatTokenAmount(totalValue, 6, "USDC", 2) : "Connect Wallet"} />
        <PortfolioMetric label="Wallet liquidity" value={connected ? formatTokenAmount(walletLiquidity, 6, "USDC", 2) : "Connect Wallet"} />
        <PortfolioMetric label="Claimable yield" value={connected ? formatTokenAmount(totalYield, 6, "USDC", 2) : "Connect Wallet"} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <PositionPanel
          title="Monthly Vault"
          status="Semi-liquid"
          value={connected ? formatTokenAmount(monthlyValue, 6, "USDC", 2) : "Connect Wallet"}
          detail="NAV-priced vault shares. Withdrawals settle to wallet and may carry a penalty outside the window."
          rows={[
            ["Liquidity", "Monthly window"],
            ["Current value", connected ? formatTokenAmount(monthlyValue, 6, "USDC", 2) : "Connect Wallet"],
          ]}
        />
        <PositionPanel
          title="Long-Term Fixed Income"
          status="Locked"
          value={connected ? formatTokenAmount(fixedPrincipal, 6, "USDC", 2) : "Connect Wallet"}
          detail="Principal locked by maturity bucket. Yield claims are separate from principal redemption."
          rows={[
            ["Active positions", String(fixedRows.length)],
            ["Claimable yield", connected ? formatTokenAmount(fixedYield, 6, "USDC", 2) : "Connect Wallet"],
          ]}
        />
        <PositionPanel
          title="Private Deal Holdings"
          status="Tradable"
          value={connected ? formatTokenAmount(dealValue, 6, "USDC", 2) : "Connect Wallet"}
          detail="ERC-1155 ownership positions. Yield rights follow ownership through marketplace trades."
          rows={[
            ["Active holdings", String(dealRows.length)],
            ["Claimable yield", connected ? formatTokenAmount(dealYield, 6, "USDC", 2) : "Connect Wallet"],
          ]}
        />
      </section>

      <section className="mt-6 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Fixed-income positions</h2>
            <p className="text-sm text-[var(--muted)]">Deterministic monthly yield by position. Principal remains locked until maturity.</p>
          </div>
          <StatusBadge label="Fixed APY" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[var(--line)] text-[var(--muted)]">
              <tr>
                <th className="py-3 font-medium">Position</th>
                <th className="py-3 font-medium">Principal</th>
                <th className="py-3 font-medium">APY</th>
                <th className="py-3 font-medium">Maturity</th>
                <th className="py-3 font-medium">Claimable yield</th>
                <th className="py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {!connected ? <tr><td className="py-6 text-[var(--muted)]" colSpan={6}>Connect wallet to view fixed-income positions.</td></tr> : null}
              {connected && fixedRows.length === 0 ? <tr><td className="py-6 text-[var(--muted)]" colSpan={6}>No fixed-income positions.</td></tr> : null}
              {fixedRows.map((position) => <FixedPositionRow key={position.id} position={position} />)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Deal positions</h2>
            <p className="text-sm text-[var(--muted)]">Positions available for revenue distributions and secondary listing.</p>
          </div>
          <StatusBadge label="ERC-1155" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[var(--line)] text-[var(--muted)]">
              <tr>
                <th className="py-3 font-medium">Deal</th>
                <th className="py-3 font-medium">Shares</th>
                <th className="py-3 font-medium">Price / share</th>
                <th className="py-3 font-medium">Current value</th>
                <th className="py-3 font-medium">Claimable yield</th>
                <th className="py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {!connected ? <tr><td className="py-6 text-[var(--muted)]" colSpan={6}>Connect wallet to view positions.</td></tr> : null}
              {connected && dealRows.length === 0 ? <tr><td className="py-6 text-[var(--muted)]" colSpan={6}>No deal holdings.</td></tr> : null}
              {dealRows.map((holding) => <DealHoldingRow key={holding.contractAddress} holding={holding} />)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
        <h2 className="font-semibold">Transaction history</h2>
        <div className="mt-3 divide-y divide-[var(--line)]">
          {!connected ? <p className="py-6 text-sm text-[var(--muted)]">Connect wallet to view transaction history.</p> : null}
          {connected && portfolio.activity.length === 0 ? <p className="py-6 text-sm text-[var(--muted)]">No transactions found.</p> : null}
          {portfolio.activity.map((item) => (
            <div key={item.id} className="flex flex-col gap-1 py-3 text-sm md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">{item.action}</p>
                <p className="text-[var(--muted)]">{formatActivitySummary(item)}</p>
                {item.detail ? <p className="mt-1 font-mono text-xs text-[var(--muted)]">{item.detail}</p> : null}
              </div>
              <div className="text-[var(--muted)] md:text-right">
                <p>{item.timestamp}</p>
                {item.hash ? <p className="font-mono text-xs">{item.hash.slice(0, 10)}...{item.hash.slice(-6)}</p> : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function FixedPositionRow({
  position,
}: {
  position: { id: string; principal: string; claimableYield: string; maturity: string; apyBps: string; duration: string };
}) {
  const longTerm = useLongTermVault();
  const claimableYield = toBigInt(position.claimableYield);
  const maturity = new Date(Number(position.maturity) * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <tr>
      <td className="py-4 font-medium">#{position.id}</td>
      <td className="py-4">{formatTokenAmount(toBigInt(position.principal), 6, "USDC", 2)}</td>
      <td className="py-4">{(Number(position.apyBps) / 100).toFixed(2)}%</td>
      <td className="py-4">{maturity}</td>
      <td className="py-4">{formatTokenAmount(claimableYield, 6, "USDC", 2)}</td>
      <td className="py-4">
        {claimableYield > BigInt(0) ? (
          <button
            type="button"
            onClick={() => longTerm.claimYield(BigInt(position.id))}
            disabled={longTerm.transaction.status === "pending"}
            className="rounded-md border border-[var(--line)] px-3 py-2 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-slate-900"
          >
            {longTerm.transaction.status === "pending" ? "Claiming..." : "Claim"}
          </button>
        ) : (
          <StatusBadge label="Accruing" />
        )}
      </td>
    </tr>
  );
}

function DealHoldingRow({
  holding,
}: {
  holding: { title: string; contractAddress: `0x${string}`; shares: string; pricePerShare: string; value: string; pendingYield?: string };
}) {
  const dealVault = useDealVault(holding.contractAddress);
  const pendingYield = toBigInt(holding.pendingYield ?? "0");

  return (
    <tr>
      <td className="py-4 font-medium">{holding.title}</td>
      <td className="py-4">{formatNumber(Number(holding.shares), 0)}</td>
      <td className="py-4">{formatTokenAmount(toBigInt(holding.pricePerShare), 6, "USDC", 2)}</td>
      <td className="py-4">{formatTokenAmount(toBigInt(holding.value), 6, "USDC", 2)}</td>
      <td className="py-4">{formatTokenAmount(pendingYield, 6, "USDC", 2)}</td>
      <td className="py-4">
        {pendingYield > BigInt(0) ? (
          <button
            type="button"
            onClick={() => dealVault.claimYield()}
            disabled={dealVault.transaction.status === "pending"}
            className="rounded-md border border-[var(--line)] px-3 py-2 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-slate-900"
          >
            {dealVault.transaction.status === "pending" ? "Claiming..." : "Claim"}
          </button>
        ) : (
          <StatusBadge label="Listable" />
        )}
      </td>
    </tr>
  );
}

function PortfolioMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function PositionPanel({ title, status, value, detail, rows }: { title: string; status: string; value: string; detail: string; rows: Array<[string, string]> }) {
  return (
    <article className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{detail}</p>
        </div>
        <StatusBadge label={status} />
      </div>
      <p className="mt-5 text-2xl font-semibold">{value}</p>
      <div className="mt-4 space-y-2 text-sm">
        {rows.map(([label, content]) => (
          <div key={label} className="flex justify-between gap-4">
            <span className="text-[var(--muted)]">{label}</span>
            <span className="text-right font-medium">{content}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

type ActivityItem = ReturnType<typeof useDashboardData>["activity"][number];

function formatActivitySummary(item: ActivityItem) {
  const primary = formatActivityAmount(item.amount, item.amountUnit);
  const secondary = item.secondaryAmount ? ` ${item.secondaryLabel ?? "for"} ${formatActivityAmount(item.secondaryAmount, item.secondaryUnit)}` : "";
  const label = item.amountLabel ? ` ${item.amountLabel}` : "";
  return `${primary}${label} ${item.verb}${secondary}`;
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

function useLiveWalletValue(address?: `0x${string}`) {
  const { data } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 8000 },
  });
  return typeof data === "bigint" ? data : undefined;
}

function useLiveMonthlyValue(address?: `0x${string}`) {
  const { data: shares } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "shares",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 8000 },
  });
  const { data: pricePerShare } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "pricePerShare",
    query: { refetchInterval: 8000 },
  });
  return {
    value: typeof shares === "bigint" && typeof pricePerShare === "bigint"
      ? (shares * pricePerShare) / BigInt(10 ** 18)
      : undefined,
  };
}

function useLiveFixedPositions(address?: `0x${string}`) {
  const { data: positionIds } = useReadContract({
    address: LONG_TERM_VAULT_ADDRESS,
    abi: LONG_TERM_VAULT_ABI,
    functionName: "getUserPositions",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 8000 },
  });
  const ids = Array.isArray(positionIds) ? positionIds : [];
  const reads = [useFixedPosition(ids[0]), useFixedPosition(ids[1]), useFixedPosition(ids[2])].filter((position) => position.id);
  const positions = reads.filter((position) => !position.redeemed).map((position) => ({
    id: position.id!,
    principal: position.principal.toString(),
    claimableYield: position.claimableYield.toString(),
    maturity: position.maturity.toString(),
    apyBps: position.apyBps.toString(),
    duration: position.duration.toString(),
  }));

  return {
    hasLiveData: Array.isArray(positionIds),
    positions,
    principal: reads.filter((position) => !position.redeemed).reduce((total, position) => total + position.principal, BigInt(0)),
    yield: reads.filter((position) => !position.redeemed).reduce((total, position) => total + position.claimableYield, BigInt(0)),
  };
}

function useFixedPosition(positionId?: bigint) {
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
    id: positionId?.toString(),
    principal: Array.isArray(position) && typeof position[1] === "bigint" ? position[1] : BigInt(0),
    duration: Array.isArray(position) && typeof position[2] === "bigint" ? position[2] : BigInt(0),
    apyBps: Array.isArray(position) && typeof position[3] === "bigint" ? position[3] : BigInt(0),
    maturity: Array.isArray(position) && typeof position[5] === "bigint" ? position[5] : BigInt(0),
    redeemed: Array.isArray(position) ? Boolean(position[7]) : false,
    claimableYield: typeof claimableYield === "bigint" ? claimableYield : BigInt(0),
  };
}

function useLiveDealPositions(address?: `0x${string}`) {
  const [deals, setDeals] = useState<Array<{ title: string; contractAddress: `0x${string}` }>>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/deals", { cache: "no-store" })
      .then((res) => res.json())
      .then((payload: Array<{ title: string; contractAddress?: `0x${string}`; contractMissing?: boolean }>) => {
        if (!cancelled) setDeals(payload.filter((deal) => deal.contractAddress && !deal.contractMissing).map((deal) => ({ title: deal.title, contractAddress: deal.contractAddress! })));
      })
      .catch(() => {
        if (!cancelled) setDeals([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reads = [useDealPosition(deals[0], address), useDealPosition(deals[1], address), useDealPosition(deals[2], address)].filter((holding) => holding.contractAddress);
  const holdings = reads.filter((holding) => BigInt(holding.shares) > BigInt(0));

  return {
    hasLiveData: deals.length > 0,
    holdings,
    value: holdings.reduce((total, holding) => total + BigInt(holding.value), BigInt(0)),
    yield: holdings.reduce((total, holding) => total + BigInt(holding.pendingYield ?? "0"), BigInt(0)),
  };
}

function useDealPosition(deal?: { title: string; contractAddress: `0x${string}` }, address?: `0x${string}`) {
  const { data: shares } = useReadContract({
    address: deal?.contractAddress,
    abi: DEAL_VAULT_ABI,
    functionName: "getShareBalance",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(deal?.contractAddress && address), refetchInterval: 8000 },
  });
  const { data: pricePerShare } = useReadContract({
    address: deal?.contractAddress,
    abi: DEAL_VAULT_ABI,
    functionName: "pricePerShare",
    query: { enabled: Boolean(deal?.contractAddress), refetchInterval: 8000 },
  });
  const { data: pendingYield } = useReadContract({
    address: deal?.contractAddress,
    abi: DEAL_VAULT_ABI,
    functionName: "pendingYield",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(deal?.contractAddress && address), refetchInterval: 8000 },
  });
  const safeShares = typeof shares === "bigint" ? shares : BigInt(0);
  const safePrice = typeof pricePerShare === "bigint" ? pricePerShare : BigInt(0);

  return {
    title: deal?.title ?? "",
    contractAddress: deal?.contractAddress ?? "0x0000000000000000000000000000000000000000",
    shares: safeShares.toString(),
    pricePerShare: safePrice.toString(),
    value: (safeShares * safePrice).toString(),
    pendingYield: (typeof pendingYield === "bigint" ? pendingYield : BigInt(0)).toString(),
  };
}
