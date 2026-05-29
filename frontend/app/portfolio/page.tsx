"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { WalletGatedButton } from "@/components/wallet-gated-button";
import { useDealVault, useLongTermVault } from "@/hooks/useInvestmentContracts";
import { ARC_TESTNET_EXPLORER_URL } from "@/lib/network";
import { formatDate, formatNumber, formatPercent, formatTokenAmount } from "@/lib/utils";

type V2Portfolio = {
  status: "live" | "pending";
  monthlyVault: null | {
    shares: string;
    currentValueUsdc: string;
    claimableYieldUsdc: string;
    updatedAt: string;
  };
  fixedIncomePositions: Array<{
    id: string;
    onchainPositionId?: string | null;
    principalUsdc: string;
    apyBps: number;
    durationSeconds?: number;
    maturityAt: string;
    claimableYieldUsdc: string;
    status: string;
  }>;
  dealHoldings: Array<{
    dealId: string;
    dealVaultAddress?: `0x${string}` | null;
    title: string;
    shares: string;
    currentValueUsdc: string;
    claimableYieldUsdc: string;
  }>;
  activity: Array<{
    id: string;
    action: string;
    valueUsdc?: string;
    shares?: string;
    txHash?: string;
    timestamp?: string;
    source: "indexed" | "pending";
  }>;
};

const EMPTY_PORTFOLIO: V2Portfolio = {
  status: "pending",
  monthlyVault: null,
  fixedIncomePositions: [],
  dealHoldings: [],
  activity: [],
};

export default function PortfolioPage() {
  const router = useRouter();
  const { address, isConnected, status } = useAccount();
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(0);
  const [portfolio, setPortfolio] = useState<V2Portfolio>(EMPTY_PORTFOLIO);
  const [earlyExitPosition, setEarlyExitPosition] = useState<V2Portfolio["fixedIncomePositions"][number] | null>(null);
  const [optimisticallyExitedPositions, setOptimisticallyExitedPositions] = useState<Set<string>>(() => new Set());
  const longTerm = useLongTermVault();

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Date.now()), 0);
    const interval = window.setInterval(() => setNow(Date.now()), 60000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!mounted || status === "connecting" || status === "reconnecting") return;
    if (!isConnected) router.replace("/vaults");
  }, [isConnected, mounted, router, status]);

  useEffect(() => {
    if (!address) return;
    const resetTimer = window.setTimeout(() => setOptimisticallyExitedPositions(new Set()), 0);
    let cancelled = false;

    async function loadPortfolio() {
      try {
        const response = await fetch(`/api/v2/portfolio?wallet=${address}`, { cache: "no-store" });
        const next = (await response.json()) as V2Portfolio;
        if (!cancelled) setPortfolio(next);
      } catch {
        if (!cancelled) setPortfolio(EMPTY_PORTFOLIO);
      }
    }

    loadPortfolio();
    const interval = window.setInterval(loadPortfolio, 10000);
    window.addEventListener("arc:data-refresh", loadPortfolio);
    return () => {
      cancelled = true;
      window.clearTimeout(resetTimer);
      window.clearInterval(interval);
      window.removeEventListener("arc:data-refresh", loadPortfolio);
    };
  }, [address]);

  const activeFixedIncomePositions = useMemo(
    () =>
      portfolio.fixedIncomePositions.filter(
        (position) => position.status === "active" && !optimisticallyExitedPositions.has(positionKey(position)),
      ),
    [optimisticallyExitedPositions, portfolio.fixedIncomePositions],
  );

  const totals = useMemo(() => {
    const monthly = decimalUsdcToRaw(portfolio.monthlyVault?.currentValueUsdc);
    const fixed = activeFixedIncomePositions.reduce((total, position) => total + decimalUsdcToRaw(position.principalUsdc), BigInt(0));
    const fixedYield = activeFixedIncomePositions.reduce((total, position) => total + decimalUsdcToRaw(position.claimableYieldUsdc), BigInt(0));
    const deals = portfolio.dealHoldings.reduce((total, holding) => total + decimalUsdcToRaw(holding.currentValueUsdc), BigInt(0));
    const dealYield = portfolio.dealHoldings.reduce((total, holding) => total + decimalUsdcToRaw(holding.claimableYieldUsdc), BigInt(0));
    return {
      monthly,
      fixed,
      fixedYield,
      deals,
      dealYield,
      total: monthly + fixed + fixedYield + deals + dealYield,
      yield: fixedYield + dealYield,
    };
  }, [activeFixedIncomePositions, portfolio]);

  if (!mounted || status === "connecting" || status === "reconnecting" || !isConnected) return null;

  return (
    <div>
      <SectionHeader
        eyebrow="Portfolio"
        title="Positions and liquidity"
        description="Holdings, maturities, claimable yield, and indexed activity for the connected account."
      />

      <section className="grid gap-3 md:grid-cols-3">
        <PortfolioMetric label="Total value" value={formatTokenAmount(totals.total, 6, "USDC", 2)} detail="Cash plus indexed positions" />
        <PortfolioMetric label="Invested capital" value={formatTokenAmount(totals.monthly + totals.fixed + totals.deals, 6, "USDC", 2)} detail="Monthly vault, fixed income, and private deal capital" />
        <PortfolioMetric label="Claimable yield" value={formatTokenAmount(totals.yield, 6, "USDC", 2)} detail="Claimable fixed-income and deal revenue" />
      </section>

      <section className="mt-5 grid gap-3 lg:grid-cols-3">
        <PositionPanel
          title="Monthly Vault"
          status="Semi-liquid"
          value={formatTokenAmount(totals.monthly, 6, "USDC", 2)}
          detail="Monthly liquidity with wallet settlement. Vault shares are used for accounting."
          rows={[
            ["Shares", formatDecimal(portfolio.monthlyVault?.shares, 4)],
            ["Claimable yield", formatTokenAmount(decimalUsdcToRaw(portfolio.monthlyVault?.claimableYieldUsdc), 6, "USDC", 2)],
          ]}
        />
        <PositionPanel
          title="Long-Term Fixed Income"
          status="Locked"
          value={formatTokenAmount(totals.fixed, 6, "USDC", 2)}
          detail="Principal locked by maturity bucket. Yield claims are separate from principal redemption."
          rows={[
            ["Active positions", String(activeFixedIncomePositions.length)],
            ["Claimable yield", formatTokenAmount(totals.fixedYield, 6, "USDC", 2)],
          ]}
        />
        <PositionPanel
          title="Private Deal Holdings"
          status="Tradable"
          value={formatTokenAmount(totals.deals, 6, "USDC", 2)}
          detail="Private deal positions with yield rights that transfer through marketplace trades."
          rows={[
            ["Active holdings", String(portfolio.dealHoldings.length)],
            ["Claimable yield", formatTokenAmount(totals.dealYield, 6, "USDC", 2)],
          ]}
        />
      </section>

      <section className="mt-5 border border-white/[0.08] bg-transparent p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl">Fixed-income positions</h2>
            <p className="mt-1 text-sm font-light text-[var(--muted)]">Position-level principal, APY, maturity, and claimable income.</p>
          </div>
          <StatusBadge label="Fixed APY" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-white/[0.08] text-[var(--muted)]">
              <tr>
                <th className="mono-label py-3 text-[10px] font-normal">Lock</th>
                <th className="mono-label py-3 text-[10px] font-normal">Principal</th>
                <th className="mono-label py-3 text-[10px] font-normal">APY</th>
                <th className="mono-label py-3 text-[10px] font-normal">Maturity</th>
                <th className="mono-label py-3 text-[10px] font-normal">Claimable yield</th>
                <th className="mono-label py-3 text-[10px] font-normal">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.08]">
              {activeFixedIncomePositions.length === 0 ? <tr><td className="py-6 text-[var(--muted)]" colSpan={6}>No fixed-income positions.</td></tr> : null}
              {activeFixedIncomePositions.map((position) => (
                <FixedPositionRow key={position.id} position={position} longTerm={longTerm} now={now} onEarlyExit={setEarlyExitPosition} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-5 border border-white/[0.08] bg-transparent p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl">Deal positions</h2>
            <p className="mt-1 text-sm font-light text-[var(--muted)]">Ownership shares, current value, revenue claims, and marketplace readiness.</p>
          </div>
          <StatusBadge label="Deal Shares" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-white/[0.08] text-[var(--muted)]">
              <tr>
                <th className="mono-label py-3 text-[10px] font-normal">Deal</th>
                <th className="mono-label py-3 text-[10px] font-normal">Shares</th>
                <th className="mono-label py-3 text-[10px] font-normal">Current value</th>
                <th className="mono-label py-3 text-[10px] font-normal">Claimable yield</th>
                <th className="mono-label py-3 text-[10px] font-normal">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.08]">
              {portfolio.dealHoldings.length === 0 ? <tr><td className="py-6 text-[var(--muted)]" colSpan={5}>No deal holdings.</td></tr> : null}
              {portfolio.dealHoldings.map((holding) => <DealHoldingRow key={holding.dealId} holding={holding} />)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-5 border border-white/[0.08] bg-transparent p-5">
        <h2 className="text-2xl">Transaction history</h2>
        {portfolio.activity.length === 0 ? <p className="py-6 text-sm text-[var(--muted)]">No Activity Yet</p> : null}
        {portfolio.activity.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-white/[0.08] text-[var(--muted)]">
                <tr>
                  <th className="mono-label py-3 text-[10px] font-normal">Activity</th>
                  <th className="mono-label py-3 text-[10px] font-normal">Value</th>
                  <th className="mono-label py-3 text-[10px] font-normal">Date</th>
                  <th className="mono-label py-3 text-right text-[10px] font-normal">Record</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.08]">
                {portfolio.activity.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 font-medium">{item.action}</td>
                    <td className="py-3 font-medium">{formatIndexedActivityValue(item)}</td>
                    <td className="py-3 text-[var(--muted)]">{formatDate(item.timestamp)}</td>
                    <td className="py-3 text-right">
                      {item.txHash ? (
                        <a
                          href={`${ARC_TESTNET_EXPLORER_URL}/tx/${item.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-[var(--accent)] hover:underline"
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

      {earlyExitPosition ? (
        <EarlyExitModal
          position={earlyExitPosition}
          busy={longTerm.transaction.status === "pending"}
          onCancel={() => setEarlyExitPosition(null)}
          onConfirm={async () => {
            const positionId = earlyExitPosition.onchainPositionId;
            if (!positionId) return;
            const ok = await longTerm.earlyExit(BigInt(positionId));
            if (ok) {
              const exitedKey = positionKey(earlyExitPosition);
              setOptimisticallyExitedPositions((current) => new Set(current).add(exitedKey));
              setPortfolio((current) => ({
                ...current,
                fixedIncomePositions: current.fixedIncomePositions.filter((position) => positionKey(position) !== exitedKey),
              }));
              setEarlyExitPosition(null);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function positionKey(position: V2Portfolio["fixedIncomePositions"][number]) {
  return position.onchainPositionId ?? position.id;
}

function FixedPositionRow({
  position,
  longTerm,
  now,
  onEarlyExit,
}: {
  position: V2Portfolio["fixedIncomePositions"][number];
  longTerm: ReturnType<typeof useLongTermVault>;
  now: number;
  onEarlyExit: (position: V2Portfolio["fixedIncomePositions"][number]) => void;
}) {
  const positionId = position.onchainPositionId;
  const principal = decimalUsdcToRaw(position.principalUsdc);
  const claimableYield = decimalUsdcToRaw(position.claimableYieldUsdc);
  const isMature = now > 0 && new Date(position.maturityAt).getTime() <= now;
  const transactionPending = longTerm.transaction.status === "pending";

  return (
    <tr>
      <td className="py-4 font-medium">{formatLockDuration(position.durationSeconds)}</td>
      <td className="py-4">{formatTokenAmount(principal, 6, "USDC", 2)}</td>
      <td className="py-4">{formatPercent(position.apyBps / 100)}</td>
      <td className="py-4">{formatDate(position.maturityAt)}</td>
      <td className="py-4">{formatTokenAmount(claimableYield, 6, "USDC", 2)}</td>
      <td className="py-4">
        <div className="flex flex-wrap items-center gap-2">
          {claimableYield > BigInt(0) && positionId ? (
            <WalletGatedButton
              onClick={() => longTerm.claimYield(BigInt(positionId))}
              disabled={transactionPending}
              className="arc-button-outline rounded-md px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {transactionPending ? "Working..." : "Claim"}
            </WalletGatedButton>
          ) : null}
          {isMature && positionId ? (
            <WalletGatedButton
              onClick={() => longTerm.redeemAtMaturity(BigInt(positionId))}
              disabled={transactionPending}
              className="arc-button-filled rounded-md px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {transactionPending ? "Working..." : "Redeem"}
            </WalletGatedButton>
          ) : (
            <WalletGatedButton
              onClick={() => onEarlyExit(position)}
              disabled={transactionPending || !positionId || principal === BigInt(0)}
              className="rounded-md border border-white/[0.18] px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-white/[0.32] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {transactionPending ? "Working..." : "Early exit"}
            </WalletGatedButton>
          )}
        </div>
      </td>
    </tr>
  );
}

function DealHoldingRow({ holding }: { holding: V2Portfolio["dealHoldings"][number] }) {
  const dealVault = useDealVault(holding.dealVaultAddress ?? undefined);
  const pendingYield = decimalUsdcToRaw(holding.claimableYieldUsdc);

  return (
    <tr>
      <td className="py-4 font-medium">{holding.title}</td>
      <td className="py-4">{formatDecimal(holding.shares, 0)}</td>
      <td className="py-4">{formatTokenAmount(decimalUsdcToRaw(holding.currentValueUsdc), 6, "USDC", 2)}</td>
      <td className="py-4">{formatTokenAmount(pendingYield, 6, "USDC", 2)}</td>
      <td className="py-4">
        {pendingYield > BigInt(0) && holding.dealVaultAddress ? (
          <WalletGatedButton
            onClick={() => dealVault.claimYield()}
            disabled={dealVault.transaction.status === "pending"}
            className="arc-button-outline rounded-md px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-60"
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

function EarlyExitModal({
  position,
  busy,
  onCancel,
  onConfirm,
}: {
  position: V2Portfolio["fixedIncomePositions"][number];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const principal = decimalUsdcToRaw(position.principalUsdc);
  const returnedPrincipal = (principal * BigInt(9000)) / BigInt(10000);
  const penalty = principal - returnedPrincipal;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md border border-white/[0.08] bg-[var(--background)] p-6">
        <p className="mono-label text-[10px] text-[var(--accent)]">Fixed-income early exit</p>
        <h2 className="mt-3 text-3xl">Confirm early exit</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Early exit permanently closes this fixed-income position and returns principal after penalty.
        </p>
        <div className="mt-5 border border-white/[0.08] bg-transparent p-4 text-sm">
          <PreviewRow label="Principal" value={formatTokenAmount(principal, 6, "USDC", 2)} />
          <PreviewRow label="Returned to wallet" value={formatTokenAmount(returnedPrincipal, 6, "USDC", 2)} />
          <PreviewRow label="Penalty" value={formatTokenAmount(penalty, 6, "USDC", 2)} tone="warning" />
          <PreviewRow label="Maturity" value={formatDate(position.maturityAt)} />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className="arc-button-outline rounded-md px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-60">
            Cancel
          </button>
          <button type="button" onClick={() => void onConfirm()} disabled={busy} className="arc-button-filled rounded-md px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? "Confirming..." : "Confirm early exit"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PortfolioMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border border-white/[0.08] bg-transparent p-4">
      <div className="flex items-center gap-2">
        <p className="mono-label text-[9px] text-[var(--muted)]">{label}</p>
        <span title={detail} aria-label={detail} className="grid h-4 w-4 place-items-center rounded-full border border-white/[0.12] text-[10px] text-[var(--muted)]">i</span>
      </div>
      <p className="mt-3 text-2xl">{value}</p>
    </div>
  );
}

function PositionPanel({ title, status, value, detail, rows }: { title: string; status: string; value: string; detail: string; rows: Array<[string, string]> }) {
  return (
    <article className="border border-white/[0.08] bg-transparent p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-2xl leading-tight">{title}</h3>
          <span title={detail} aria-label={detail} className="grid h-4 w-4 place-items-center rounded-full border border-white/[0.12] text-[10px] text-[var(--muted)]">i</span>
        </div>
        <StatusBadge label={status} />
      </div>
      <p className="mt-5 text-2xl">{value}</p>
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

function PreviewRow({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <span className="mono-label text-[9px] text-[var(--muted)]">{label}</span>
      <span className={tone === "warning" ? "text-[var(--accent)]" : ""}>{value}</span>
    </div>
  );
}

function formatIndexedActivityValue(item: V2Portfolio["activity"][number]) {
  const value = decimalUsdcToRaw(item.valueUsdc);
  if (value > BigInt(0)) return `${formatTokenAmount(value, 6, "USDC", 2)}${item.shares && Number(item.shares) > 0 ? ` for ${formatDecimal(item.shares, 0)} shares` : ""}`;
  if (item.shares && Number(item.shares) > 0) return `${formatDecimal(item.shares, 0)} shares`;
  return "Value pending";
}

function formatLockDuration(durationSeconds?: number) {
  if (!durationSeconds) return "Fixed term";
  const days = durationSeconds / 86_400;
  if (days >= 1090) return "3 years";
  if (days >= 725) return "2 years";
  if (days >= 360) return "1 year";
  return "Fixed term";
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

function formatDecimal(value?: string | null, maximumFractionDigits = 2) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return "0";
  return formatNumber(parsed, maximumFractionDigits);
}
