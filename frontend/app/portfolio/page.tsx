"use client";

import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { WalletGatedButton } from "@/components/wallet-gated-button";
import { DEAL_VAULT_ABI, LONG_TERM_VAULT_ABI, LONG_TERM_VAULT_ADDRESS, USDC_ABI, USDC_ADDRESS, VAULT_ABI, VAULT_ADDRESS } from "@/app/constants";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useDealVault, useLongTermVault } from "@/hooks/useInvestmentContracts";
import { ARC_TESTNET_EXPLORER_URL } from "@/lib/network";
import { formatDate, formatNumber, formatPercent, formatTokenAmount } from "@/lib/utils";
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
        description="Holdings, maturities, claimable yield, and wallet-confirmed activity for the connected account."
      />

      {!connected ? (
        <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
          <p className="font-semibold">Connect Wallet</p>
          <p className="mt-1 text-blue-800 dark:text-blue-200">
            Vault balances, deal holdings, claimable yield, and transaction history are wallet-specific.
          </p>
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <PortfolioMetric label="Total value" value={connected ? formatTokenAmount(totalValue, 6, "USDC", 2) : "Awaiting Live Data"} />
        <PortfolioMetric label="Wallet liquidity" value={connected ? formatTokenAmount(walletLiquidity, 6, "USDC", 2) : "Awaiting Live Data"} />
        <PortfolioMetric label="Claimable yield" value={connected ? formatTokenAmount(totalYield, 6, "USDC", 2) : "Awaiting Live Data"} />
      </section>

      <section className="mt-5 grid gap-3 lg:grid-cols-3">
        <PositionPanel
          title="Monthly Vault"
          status="Semi-liquid"
          value={connected ? formatTokenAmount(monthlyValue, 6, "USDC", 2) : "Awaiting Live Data"}
          detail="Monthly liquidity with wallet settlement. Vault shares are used for accounting."
          rows={[
            ["Liquidity", "Monthly window"],
            ["Current value", connected ? formatTokenAmount(monthlyValue, 6, "USDC", 2) : "Awaiting Live Data"],
          ]}
        />
        <PositionPanel
          title="Long-Term Fixed Income"
          status="Locked"
          value={connected ? formatTokenAmount(fixedPrincipal, 6, "USDC", 2) : "Awaiting Live Data"}
          detail="Principal locked by maturity bucket. Yield claims are separate from principal redemption."
          rows={[
            ["Active positions", String(fixedRows.length)],
            ["Claimable yield", connected ? formatTokenAmount(fixedYield, 6, "USDC", 2) : "Awaiting Live Data"],
          ]}
        />
        <PositionPanel
          title="Private Deal Holdings"
          status="Tradable"
          value={connected ? formatTokenAmount(dealValue, 6, "USDC", 2) : "Awaiting Live Data"}
          detail="Private deal positions with yield rights that transfer through marketplace trades. Ownership shares track your position."
          rows={[
            ["Active holdings", String(dealRows.length)],
            ["Claimable yield", connected ? formatTokenAmount(dealYield, 6, "USDC", 2) : "Awaiting Live Data"],
          ]}
        />
      </section>

      <section className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Fixed-income positions</h2>
            <p className="text-sm text-[var(--muted)]">Position-level principal, APY, maturity, and claimable income.</p>
          </div>
          <StatusBadge label="Fixed APY" />
        </div>
        {connected ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[var(--line)] text-[var(--muted)]">
              <tr>
                <th className="py-3 font-medium">Lock</th>
                <th className="py-3 font-medium">Principal</th>
                <th className="py-3 font-medium">APY</th>
                <th className="py-3 font-medium">Maturity</th>
                <th className="py-3 font-medium">Claimable yield</th>
                <th className="py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {connected && fixedRows.length === 0 ? <tr><td className="py-6 text-[var(--muted)]" colSpan={6}>No fixed-income positions.</td></tr> : null}
              {fixedRows.map((position) => <FixedPositionRow key={position.id} position={position} />)}
            </tbody>
          </table>
        </div>
        ) : (
          <p className="py-6 text-sm text-[var(--muted)]">Awaiting Live Data</p>
        )}
      </section>

      <section className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Deal positions</h2>
            <p className="text-sm text-[var(--muted)]">Ownership shares, current value, revenue claims, and marketplace readiness.</p>
          </div>
          <StatusBadge label="Deal Shares" />
        </div>
        {connected ? (
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
              {connected && dealRows.length === 0 ? <tr><td className="py-6 text-[var(--muted)]" colSpan={6}>No deal holdings.</td></tr> : null}
              {dealRows.map((holding) => <DealHoldingRow key={holding.contractAddress} holding={holding} />)}
            </tbody>
          </table>
        </div>
        ) : (
          <p className="py-6 text-sm text-[var(--muted)]">Awaiting Live Data</p>
        )}
      </section>

      <section className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
        <h2 className="font-semibold">Transaction history</h2>
        {!connected ? <p className="py-6 text-sm text-[var(--muted)]">Awaiting Live Data</p> : null}
        {connected && portfolio.activity.length === 0 ? <p className="py-6 text-sm text-[var(--muted)]">No Activity Yet</p> : null}
        {connected && portfolio.activity.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-[var(--line)] text-[var(--muted)]">
                <tr>
                  <th className="py-3 font-medium">Activity</th>
                  <th className="py-3 font-medium">Value</th>
                  <th className="py-3 font-medium">Date</th>
                  <th className="py-3 text-right font-medium">Record</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {portfolio.activity.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3">
                      <p className="font-medium">{item.action}</p>
                      {item.detail && !item.detail.toLowerCase().includes("wallet-confirmed transaction") ? <p className="mt-1 text-xs text-[var(--muted)]">{item.detail}</p> : null}
                    </td>
                    <td className="py-3 font-medium">{formatActivitySummary(item)}</td>
                    <td className="py-3 text-[var(--muted)]">{formatDate(item.timestamp)}</td>
                    <td className="py-3 text-right">
                      {item.hash ? (
                        <a
                          href={`${ARC_TESTNET_EXPLORER_URL}/tx/${item.hash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Explorer
                        </a>
                      ) : (
                        <span className="text-[var(--muted)]">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
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
  const principal = toBigInt(position.principal);
  const maturitySeconds = toBigInt(position.maturity);
  const isMature = maturitySeconds > BigInt(0) && maturitySeconds <= BigInt(Math.floor(Date.now() / 1000));
  const earlyExitReturn = (principal * BigInt(9000)) / BigInt(10000);
  const earlyExitPenalty = principal - earlyExitReturn;
  const maturity = formatDate(BigInt(position.maturity));
  const transactionPending = longTerm.transaction.status === "pending";

  return (
    <tr>
      <td className="py-4 font-medium">{formatLockDuration(position.duration)}</td>
      <td className="py-4">{formatTokenAmount(principal, 6, "USDC", 2)}</td>
      <td className="py-4">{formatPercent(Number(position.apyBps) / 100)}</td>
      <td className="py-4">{maturity}</td>
      <td className="py-4">{formatTokenAmount(claimableYield, 6, "USDC", 2)}</td>
      <td className="py-4">
        <div className="flex flex-wrap items-center gap-2">
          {claimableYield > BigInt(0) ? (
            <WalletGatedButton
              onClick={() => longTerm.claimYield(BigInt(position.id))}
              disabled={transactionPending}
              className="rounded-md border border-[var(--line)] px-3 py-2 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-slate-900"
            >
              {transactionPending ? "Working..." : "Claim"}
            </WalletGatedButton>
          ) : null}
          {isMature ? (
            <WalletGatedButton
              onClick={() => longTerm.redeemAtMaturity(BigInt(position.id))}
              disabled={transactionPending}
              className="rounded-md bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {transactionPending ? "Working..." : "Redeem"}
            </WalletGatedButton>
          ) : (
            <WalletGatedButton
              onClick={() => {
                const ok = window.confirm(
                  `Early exit returns ${formatTokenAmount(earlyExitReturn, 6, "USDC", 2)} and sends ${formatTokenAmount(earlyExitPenalty, 6, "USDC", 2)} as penalty. Continue?`,
                );
                if (ok) void longTerm.earlyExit(BigInt(position.id));
              }}
              disabled={transactionPending || principal === BigInt(0)}
              className="rounded-md border border-amber-300 px-3 py-2 font-medium text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/30"
            >
              {transactionPending ? "Working..." : "Early exit"}
            </WalletGatedButton>
          )}
        </div>
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
          <WalletGatedButton
            onClick={() => dealVault.claimYield()}
            disabled={dealVault.transaction.status === "pending"}
            className="rounded-md border border-[var(--line)] px-3 py-2 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-slate-900"
          >
            {dealVault.transaction.status === "pending" ? "Claiming..." : "Claim"}
          </WalletGatedButton>
        ) : (
          <StatusBadge label="Listable" />
        )}
      </td>
    </tr>
  );
}

function PortfolioMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
      <p className="text-xs font-medium uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function PositionPanel({ title, status, value, detail, rows }: { title: string; status: string; value: string; detail: string; rows: Array<[string, string]> }) {
  return (
    <article className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{detail}</p>
        </div>
        <StatusBadge label={status} />
      </div>
      <p className="mt-4 text-xl font-semibold">{value}</p>
      <div className="mt-3 space-y-2 text-sm">
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

function formatLockDuration(duration: string) {
  const days = Number(toBigInt(duration)) / 86_400;
  if (days >= 1090) return "3 years";
  if (days >= 725) return "2 years";
  if (days >= 360) return "1 year";
  return "Fixed term";
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
