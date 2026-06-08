"use client";

import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { Modal } from "@/components/modal";
import { SectionHeader } from "@/components/section-header";
import { WalletGatedButton } from "@/components/wallet-gated-button";
import { bigintToNumber, formatCurrency, formatNumber, formatPercent, formatTokenAmount } from "@/lib/utils";
import { useLongTermVault, useMonthlyVault } from "@/hooks/useInvestmentContracts";

const USDC_DECIMALS = 6;
const SHARE_DECIMALS = 6;
const WAD_DECIMALS = 18;
const LONG_TERM_OPTIONS = [
  { duration: "1 year", description: "Monthly payout, principal at maturity", defaultApyBps: 800 },
  { duration: "2 years", description: "Higher fixed payout with medium lock", defaultApyBps: 1200 },
  { duration: "3 years", description: "Highest fixed payout, least liquid", defaultApyBps: 1800 },
];
type MonthlyApySummary = {
  status: "ready" | "unavailable";
  apyBps: string;
  routedYield: string;
  basisDays: number;
  message: string;
};

export default function VaultsPage() {
  const vault = useMonthlyVault();
  const longTerm = useLongTermVault();
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [withdrawShares, setWithdrawShares] = useState("");
  const [fixedAmount, setFixedAmount] = useState("");
  const [selectedDurationIndex, setSelectedDurationIndex] = useState(0);
  const [todayMs, setTodayMs] = useState<number | null>(null);
  const [monthlyApySummary, setMonthlyApySummary] = useState<MonthlyApySummary | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setTodayMs(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    fetch("/api/vaults/monthly/apy", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then(setMonthlyApySummary)
      .catch(() => setMonthlyApySummary({ status: "unavailable", apyBps: "0", routedYield: "0", basisDays: 0, message: "Monthly Vault APY is unavailable." }));
  }, []);

  const shares = typeof vault.shares === "bigint" ? vault.shares : BigInt(0);
  const totalShares = typeof vault.totalShares === "bigint" ? vault.totalShares : BigInt(0);
  const totalAssets = typeof vault.totalAssets === "bigint" ? vault.totalAssets : BigInt(0);
  const hasTotalAssets = typeof vault.totalAssets === "bigint";
  const hasPricePerShare = typeof vault.pricePerShare === "bigint";
  const hasShares = typeof vault.shares === "bigint";
  const pps = typeof vault.pricePerShare === "bigint" ? vault.pricePerShare : parseUnits("1", WAD_DECIMALS);
  const depositAmount = safeParseUnits(amount, USDC_DECIMALS);
  const requestedShares = safeParseUnits(withdrawShares, SHARE_DECIMALS);
  const pendingWithdrawShares = vault.withdrawRequest?.[0] ?? BigInt(0);
  const pendingWithdrawTime = vault.withdrawRequest?.[1] ?? BigInt(0);
  const hasPendingWithdraw = pendingWithdrawShares > BigInt(0);
  const pendingWithdrawRaw = (pendingWithdrawShares * pps) / parseUnits("1", WAD_DECIMALS);
  const pendingWithdrawDate =
    pendingWithdrawTime > BigInt(0)
      ? formatDate(pendingWithdrawTime)
      : "Awaiting Live Data";
  const expectedShares = pps > BigInt(0) ? (depositAmount * parseUnits("1", WAD_DECIMALS)) / pps : BigInt(0);
  const shareValueRaw = (shares * pps) / parseUnits("1", WAD_DECIMALS);
  const shareValue = bigintToNumber(shareValueRaw, USDC_DECIMALS);
  const grossWithdrawRaw = (requestedShares * pps) / parseUnits("1", WAD_DECIMALS);
  const grossWithdraw = bigintToNumber(grossWithdrawRaw, USDC_DECIMALS);
  const remainingShares = requestedShares > shares ? BigInt(0) : shares - requestedShares;
  const totalSharesAfterDeposit = totalShares + expectedShares;
  const totalAssetsAfterDeposit = totalAssets + depositAmount;
  const totalSharesAfterWithdraw = totalShares > requestedShares ? totalShares - requestedShares : BigInt(0);
  const withdrawalWindow = getWithdrawalWindow(vault.withdrawalWindowStart, vault.withdrawalWindowDuration, todayMs);
  const monthlyApy = getMonthlyVaultApy(monthlyApySummary);
  const penaltyBps = typeof vault.penaltyBps === "bigint" ? Number(vault.penaltyBps) : 0;
  const previewPenalty = withdrawalWindow.isOpen ? 0 : grossWithdraw * (penaltyBps / 10_000);
  const netWithdraw = Math.max(0, grossWithdraw - previewPenalty);
  const ownershipAfterDeposit =
    totalSharesAfterDeposit > BigInt(0) ? (bigintToNumber(shares + expectedShares, SHARE_DECIMALS) / bigintToNumber(totalSharesAfterDeposit, SHARE_DECIMALS)) * 100 : 0;
  const ownershipAfterWithdraw =
    totalSharesAfterWithdraw > BigInt(0) ? (bigintToNumber(remainingShares, SHARE_DECIMALS) / bigintToNumber(totalSharesAfterWithdraw, SHARE_DECIMALS)) * 100 : 0;

  const liveOptions = LONG_TERM_OPTIONS.map((option, index) => {
    const tranche = longTerm.tranches[index];
    const apyBps = tranche?.[1] ?? BigInt(option.defaultApyBps);
    return {
      ...option,
      apy: Number(apyBps) / 100,
      enabled: tranche ? tranche[2] : true,
      isLive: Boolean(tranche),
    };
  });
  const selectedFixedOption = liveOptions[selectedDurationIndex];
  const selectedDurationDays = [365, 730, 1095][selectedDurationIndex];
  const fixedAmountNumber = Number(fixedAmount || 0);
  const estimatedMonthlyYield = (fixedAmountNumber * (selectedFixedOption.apy / 100)) / 12;
  const projectedYearlyYield = fixedAmountNumber * (selectedFixedOption.apy / 100);
  const maturityDate = todayMs ? new Date(todayMs + selectedDurationDays * 24 * 60 * 60 * 1000) : null;
  const maturityDateText = maturityDate
    ? maturityDate.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "Calculating";
  const longTermBusy = longTerm.transaction.status === "pending";
  const longTermSuccess = longTerm.transaction.status === "confirmed";
  const longTermButtonLabel = longTermBusy
    ? longTerm.transaction.label
    : longTermSuccess
      ? "Success"
      : "Deposit";
  const walletConnected = Boolean(vault.address);

  return (
    <div>
      <SectionHeader
        eyebrow="Vaults"
        title="Choose between flexible yield access and long-term fixed returns"
        description=""
      />

      <section className="arc-panel grid gap-0 lg:grid-cols-[1.35fr_0.75fr]">
          <div className="flex min-h-[360px] flex-col justify-between border-b border-white/[0.08] bg-transparent p-8 lg:border-b-0 lg:border-r">
            <div>
              <div className="flex flex-wrap items-start gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-sm border border-white/[0.12] bg-transparent font-mono text-[var(--foreground)]">
                  <span className="text-sm">|||</span>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl leading-none text-[var(--foreground)] sm:text-3xl">Monthly RWA Vault</h2>
                    <span className="inline-flex items-center rounded-full border border-[var(--accent)]/30 bg-transparent px-3 py-1 text-xs font-medium text-[var(--accent)]">
                      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                      Liquid
                    </span>
                  </div>
                  <p className="mt-3 max-w-xl text-sm font-light leading-6 text-[var(--muted)]">
                    Flexible access to real-world yield with monthly liquidity windows.
                  </p>
                </div>
              </div>

              <div className="mt-6 border-t border-[var(--line)] pt-6">
                {walletConnected ? (
                  <>
                    <div className="flex items-center gap-2">
                      <p className="mono-label text-[10px] text-[var(--muted)]">Your balance</p>
                      <span
                        title="Your current vault share value based on live share price."
                        aria-label="Your current vault share value based on live share price."
                        className="grid h-4 w-4 place-items-center rounded-full border border-white/15 text-[10px] font-semibold text-[var(--muted)]"
                      >
                        i
                      </span>
                    </div>
                    <p className="mt-3 text-5xl font-light tracking-tight text-[var(--foreground)]">
                      {hasShares ? formatCurrency(shareValue) : <PendingSkeleton className="h-12 w-48" />}
                    </p>
                    <p className="mt-3 text-sm text-[var(--muted)]">
                      {hasShares ? formatTokenAmount(shares, SHARE_DECIMALS, "shares", 4) : "Wallet position pending"}
                    </p>
                  </>
                ) : (
                  <div className="mx-auto flex max-w-xl flex-col items-center py-4 text-center">
                    <div className="grid h-16 w-16 place-items-center rounded-full border border-white/[0.12] bg-transparent text-2xl font-light text-[var(--accent)]">
                      +
                    </div>
                    <p className="mt-5 max-w-lg text-2xl leading-9 text-[var(--foreground)] sm:text-3xl sm:leading-10">Connect your wallet to access deposits, withdrawals, and vault positions.</p>
                    <p className="mt-3 text-sm text-[var(--muted)]">Your funds remain non-custodial and secure.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {walletConnected ? (
                <>
                  <WalletGatedButton
                    onClick={() => setDepositOpen(true)}
                    className="arc-button-filled flex-1 px-4 py-3 text-sm font-medium transition"
                  >
                    Deposit
                  </WalletGatedButton>
                  <WalletGatedButton
                    onClick={() => setWithdrawOpen(true)}
                    className="arc-button-outline flex-1 px-4 py-3 text-sm font-medium transition"
                  >
                    Withdraw
                  </WalletGatedButton>
                </>
              ) : (
                <WalletGatedButton className="arc-button-outline mx-auto w-full max-w-md px-4 py-3 text-sm font-medium transition">
                  Connect Wallet
                </WalletGatedButton>
              )}
            </div>
          </div>

          <div className="min-h-[360px] bg-transparent px-8 py-6">
            <VaultInfoRow
              icon="[]"
              label="Withdrawal window"
              value={withdrawalWindow.label}
              detail={withdrawalWindow.countdownDate ? getWindowTimingText(withdrawalWindow) : withdrawalWindow.detail}
              tone={withdrawalWindow.isOpen ? "green" : "blue"}
            />
            <VaultInfoRow
              icon="[]"
              label="Next window"
              value={getNextWindowText(withdrawalWindow)}
              detail={withdrawalWindow.isOpen ? "Next monthly liquidity window" : "Upcoming free-withdrawal window"}
            />
            <VaultInfoRow
              icon="|||"
              label="Vault liquidity"
              value={hasTotalAssets ? formatTokenAmount(totalAssets, USDC_DECIMALS, "USDC", 2) : ""}
              pending={!hasTotalAssets}
              detail="Live onchain vault assets"
            />
            <VaultInfoRow
              icon="%"
              label="Yearly APY"
              value={monthlyApy.value}
              detail={monthlyApy.detail}
              isLast
            />
          </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-5 text-3xl leading-tight sm:text-4xl">Long-term fixed income</h2>
        <div className="arc-panel p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
            <div>
              <label className="text-sm font-medium text-[var(--muted)]" htmlFor="fixed-income-amount">
                Deposit amount
              </label>
              <input
                id="fixed-income-amount"
                value={fixedAmount}
                onChange={(event) => setFixedAmount(event.target.value)}
                disabled={!walletConnected}
                className="arc-field mt-2 w-full px-4 py-3 text-lg font-light disabled:cursor-not-allowed disabled:opacity-50"
                placeholder={walletConnected ? "USDC amount" : "Awaiting wallet connection"}
              />

              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-[var(--muted)]">Lock duration</p>
                  <p className="mono-label text-[10px] text-[var(--foreground)]">{selectedFixedOption.duration}</p>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={1}
                  value={selectedDurationIndex}
                  onChange={(event) => setSelectedDurationIndex(Number(event.target.value))}
                  disabled={!walletConnected}
                  className="w-full accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Select lock duration"
                />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {liveOptions.map((option, index) => (
                    <button
                      key={option.duration}
                      type="button"
                      onClick={() => setSelectedDurationIndex(index)}
                      disabled={!walletConnected}
                      className={`border px-3 py-2 text-sm font-light transition ${
                        selectedDurationIndex === index
                          ? "border-[var(--accent)] bg-transparent text-[var(--foreground)]"
                          : "border-[var(--line)] text-[var(--muted)] hover:border-white/20"
                      }`}
                    >
                      {option.duration}
                    </button>
                  ))}
                </div>
              </div>

              <p className="mt-5 text-sm text-[var(--muted)]">Early withdrawals may reduce returns</p>
            </div>

            <div className="arc-panel p-6 text-[var(--foreground)]">
              <p className="text-sm text-[var(--muted)]">Fixed APY</p>
              <div className="mt-2 text-5xl text-[var(--accent)]">{formatPercent(selectedFixedOption.apy)}</div>
              <p className="mt-2 text-sm text-[var(--muted)]">{selectedFixedOption.description}</p>
              {!selectedFixedOption.isLive ? (
                <p className="mt-1 text-xs text-[var(--muted)]">Live term data is still syncing.</p>
              ) : null}

              <div className="mt-5 space-y-3 text-sm">
                <SummaryRow label="Monthly payout estimate" value={formatCurrency(estimatedMonthlyYield)} />
                <SummaryRow label="Projected yearly earnings" value={formatCurrency(projectedYearlyYield)} />
                <SummaryRow label="Maturity date" value={maturityDateText} />
                <SummaryRow label="Settlement" value="Approve USDC, then confirm deposit" />
              </div>

              <WalletGatedButton
                onClick={async () => {
                  const ok = await longTerm.deposit(fixedAmount, selectedDurationDays);
                  if (ok) setFixedAmount("");
                }}
                disabled={!selectedFixedOption.enabled || longTermBusy}
                className={`${walletConnected ? "arc-button-filled" : "arc-button-outline"} mt-5 w-full px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {longTermButtonLabel}
              </WalletGatedButton>
            </div>
          </div>
        </div>
      </section>

      <Modal title="Deposit into Monthly Vault" open={depositOpen} onClose={() => setDepositOpen(false)}>
        <TransactionForm
          value={amount}
          onChange={setAmount}
          primaryLabel="Confirm deposit"
          preview={[
            ["Deposit amount", formatTokenAmount(depositAmount, USDC_DECIMALS, "USDC", 2)],
            ["Share exchange rate", hasPricePerShare ? `${formatNumber(Number(formatUnits(pps, WAD_DECIMALS)), 6)} USDC/share` : "Awaiting Live Data", "The current price for one vault share."],
            ["Shares you receive", hasPricePerShare ? formatTokenAmount(expectedShares, SHARE_DECIMALS, "shares", 4) : "Awaiting Live Data", "Your ownership units in the vault."],
            ["Vault TVL after deposit", hasTotalAssets ? formatTokenAmount(totalAssetsAfterDeposit, USDC_DECIMALS, "USDC", 2) : "Awaiting Live Data", "Estimated vault value after this deposit."],
          ]}
          advanced={[
            ["Settlement", "Approve USDC, then deposit"],
            ["Network", vault.preview.chain],
            ["Required transactions", "2"],
            ["USD equivalent", formatCurrency(bigintToNumber(depositAmount, USDC_DECIMALS))],
            ["Ownership preview", formatPercent(ownershipAfterDeposit)],
          ]}
          status={vault.transaction.status}
          onSubmit={async () => {
            const ok = await vault.deposit(amount);
            if (ok) {
              setAmount("");
              window.setTimeout(() => setDepositOpen(false), 900);
            }
          }}
        />
      </Modal>

      <Modal title="Withdraw from Monthly Vault" open={withdrawOpen} onClose={() => setWithdrawOpen(false)}>
        <TransactionForm
          value={withdrawShares}
          onChange={setWithdrawShares}
          primaryLabel={hasPendingWithdraw ? "Execute pending withdrawal" : "Withdraw to wallet"}
          inputDisabled={hasPendingWithdraw}
          preview={[
            ["Shares burned", hasPendingWithdraw ? formatTokenAmount(pendingWithdrawShares, SHARE_DECIMALS, "shares", 4) : formatTokenAmount(requestedShares, SHARE_DECIMALS, "shares", 4), "Shares removed from your vault position."],
            ["Estimated net received", hasPendingWithdraw ? formatTokenAmount(pendingWithdrawRaw, USDC_DECIMALS, "USDC", 2) : formatCurrency(netWithdraw)],
            ["Penalty amount", hasPendingWithdraw ? "Calculated on execution" : formatCurrency(previewPenalty), withdrawalWindow.isOpen ? "No penalty while the withdrawal window is open." : "Fee applied outside the free withdrawal window."],
            ["Withdrawal window", withdrawalWindow.label, withdrawalWindow.isOpen ? "Free withdrawals are available now." : "Free withdrawals are only available during the monthly window."],
            ["Remaining shares", hasPendingWithdraw ? "Already reserved" : formatTokenAmount(remainingShares, SHARE_DECIMALS, "shares", 4)],
          ]}
          warning={hasPendingWithdraw ? "You already have a pending withdrawal request. Execute it to send USDC to your wallet before starting another withdrawal." : withdrawalWindow.isOpen ? "The withdrawal window is open. This preview applies no penalty." : "USDC is sent directly to your wallet after confirmation. Outside the monthly window, a penalty is applied and redistributed to remaining shareholders."}
          advanced={[
            ["Request time", hasPendingWithdraw ? pendingWithdrawDate : "No pending request"],
            ["Gross withdrawal", hasPendingWithdraw ? formatTokenAmount(pendingWithdrawRaw, USDC_DECIMALS, "USDC", 2) : formatTokenAmount(grossWithdrawRaw, USDC_DECIMALS, "USDC", 2)],
            ["Post-withdraw ownership", formatPercent(ownershipAfterWithdraw)],
            ["Settlement timing", "Sent to wallet after confirmation"],
            ["Vault accounting", "Shares price against current NAV"],
          ]}
          status={vault.transaction.status}
          onSubmit={async () => {
            const ok = hasPendingWithdraw ? await vault.executeWithdraw() : await vault.withdraw(requestedShares);
            if (ok) {
              setWithdrawShares("");
              window.setTimeout(() => setWithdrawOpen(false), 900);
            }
          }}
        />
      </Modal>
    </div>
  );
}

function getMonthlyVaultApy(summary: MonthlyApySummary | null) {
  if (!summary) return { value: "Awaiting Live Data", detail: "Yield appears after live vault data is available" };
  if (summary.status === "unavailable") return { value: "Awaiting Live Data", detail: "Yield appears after live vault data is available" };

  return {
    value: summary.routedYield === "0" ? "Awaiting Live Data" : formatPercent(Number(summary.apyBps || "0") / 100),
    detail:
      summary.routedYield === "0"
        ? "Yield appears after live yield history is available"
        : `Annualized from ${formatTokenAmount(safeBigInt(summary.routedYield), USDC_DECIMALS, "USDC", 2)} routed yield over ${summary.basisDays} days`,
  };
}

function safeBigInt(value: string) {
  try {
    return BigInt(value || "0");
  } catch {
    return BigInt(0);
  }
}

function getWithdrawalWindow(start?: bigint, duration?: bigint, nowMs: number | null = Date.now()) {
  if (typeof start !== "bigint" || typeof duration !== "bigint") {
    return { label: "Awaiting Live Data", detail: "Reading vault schedule", countdownDate: null as Date | null, nextWindowDate: null as Date | null, isOpen: false };
  }
  if (start === BigInt(0) || duration === BigInt(0)) {
    return {
      label: "Schedule pending",
      detail: "Monthly withdrawal timing will appear here once live.",
      countdownDate: null as Date | null,
      nextWindowDate: null as Date | null,
      isOpen: false,
    };
  }
  if (!nowMs) {
    const startDate = new Date(Number(start) * 1000);
    return { label: "Configured", detail: "Monthly free-withdrawal schedule", countdownDate: startDate, nextWindowDate: startDate, isOpen: false };
  }

  const now = Math.floor(nowMs / 1000);
  const startNumber = Number(start);
  const durationNumber = Number(duration);
  const period = 30 * 24 * 60 * 60;
  const elapsed = now >= startNumber ? (now - startNumber) % period : period - ((startNumber - now) % period);
  const cycleStart = now >= startNumber ? now - elapsed : startNumber;
  const open = elapsed < durationNumber;
  const nextStart = open ? cycleStart : cycleStart + period;
  const currentClose = cycleStart + durationNumber;
  const days = Math.max(1, Math.round(durationNumber / 86400));

  return {
    label: open ? "Open now" : "Closed now",
    detail: `${days} day window, repeats monthly`,
    countdownDate: new Date((open ? currentClose : nextStart) * 1000),
    nextWindowDate: new Date((open ? cycleStart + period : nextStart) * 1000),
    isOpen: open,
  };
}

function getWindowTimingText(window: { countdownDate: Date | null; isOpen: boolean; detail: string }) {
  if (!window.countdownDate) return window.detail;
  const diffMs = Math.max(0, window.countdownDate.getTime() - Date.now());
  const days = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  return window.isOpen ? `Window closes in ${days} day${days === 1 ? "" : "s"}` : `Next window in ${days} day${days === 1 ? "" : "s"}`;
}

function getNextWindowText(window: { nextWindowDate: Date | null; countdownDate: Date | null; isOpen: boolean; label: string }) {
  const target = window.nextWindowDate ?? window.countdownDate;
  if (!target) return window.label === "Schedule pending" ? "Schedule pending" : "Awaiting Live Data";
  const diffMs = Math.max(0, target.getTime() - Date.now());
  const days = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  return `${days} day${days === 1 ? "" : "s"}`;
}

function VaultInfoRow({
  icon,
  label,
  value,
  detail,
  tone = "blue",
  isLast,
  pending,
}: {
  icon: string;
  label: string;
  value: string;
  detail: string;
  tone?: "blue" | "green";
  isLast?: boolean;
  pending?: boolean;
}) {
  return (
    <div className={`flex gap-4 py-3.5 ${isLast ? "" : "border-b border-[var(--line)]"}`}>
      <div
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-sm border text-sm font-light ${
          tone === "green"
            ? "border-[var(--accent)]/30 bg-transparent text-[var(--accent)]"
            : "border-white/[0.12] bg-transparent text-[var(--foreground)]"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="mono-label text-[10px] text-[var(--muted)]">{label}</p>
        <div className={`mt-1 text-xl ${tone === "green" ? "text-[var(--accent)]" : "text-[var(--foreground)]"}`}>
          {pending ? <PendingSkeleton className="h-6 w-32" /> : value}
        </div>
        <p className="mt-1 text-xs font-light leading-5 text-[var(--muted)]">{detail}</p>
      </div>
    </div>
  );
}

function PendingSkeleton({ className = "h-5 w-28" }: { className?: string }) {
  return <span className={`skeleton inline-block align-middle ${className}`} aria-label="Awaiting Live Data" />;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="text-right font-semibold text-[var(--foreground)]">{value}</span>
    </div>
  );
}

function formatDate(timestamp: bigint) {
  if (timestamp === BigInt(0)) return "Awaiting Live Data";
  return new Date(Number(timestamp) * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function TransactionForm({
  value,
  onChange,
  primaryLabel,
  preview,
  warning,
  advanced,
  status,
  onSubmit,
  inputDisabled,
}: {
  value: string;
  onChange: (value: string) => void;
  primaryLabel: string;
  preview: Array<[string, string, string?]>;
  warning?: string;
  advanced?: Array<[string, string]>;
  status: "idle" | "pending" | "confirmed" | "failed";
  onSubmit: () => Promise<void>;
  inputDisabled?: boolean;
}) {
  const busy = status === "pending";
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={inputDisabled}
        placeholder="0.00"
        className="arc-field w-full px-4 py-3 text-lg font-light disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="mt-4 border border-[var(--line)] bg-transparent p-3 text-sm text-[var(--foreground)]">
        {preview.map(([label, content, tooltip]) => (
          <div key={label} className="flex justify-between gap-4 py-1.5">
            <span className="inline-flex items-center gap-1 text-[var(--muted)]">
              {label}
              {tooltip ? (
              <span className="grid h-4 w-4 place-items-center rounded-full border border-[var(--line)] text-[10px]" title={tooltip}>
                i
              </span>
              ) : null}
            </span>
            <span className="text-right font-semibold text-[var(--foreground)]">{content}</span>
          </div>
        ))}
      </div>
      {warning ? <div className="mt-3 border border-[var(--line)] p-3 text-sm font-light leading-6 text-[var(--muted)]">{warning}</div> : null}
      {advanced?.length ? (
        <div className="mt-3 border border-[var(--line)]">
          <button
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-[var(--muted)]"
          >
            Advanced details
            <span>{advancedOpen ? "Hide" : "Show"}</span>
          </button>
          {advancedOpen ? (
            <div className="border-t border-[var(--line)] px-3 py-2 text-sm">
              {advanced.map(([label, content]) => (
                <div key={label} className="flex justify-between gap-4 py-1.5">
                  <span className="text-[var(--muted)]">{label}</span>
                  <span className="text-right font-semibold text-[var(--foreground)]">{content}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <WalletGatedButton
        onClick={onSubmit}
        disabled={busy}
        className="arc-button-filled mt-5 w-full px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Confirming..." : status === "confirmed" ? "Confirmed" : primaryLabel}
      </WalletGatedButton>
    </div>
  );
}

function safeParseUnits(value: string, decimals: number) {
  try {
    return parseUnits(value && Number.isFinite(Number(value)) ? value : "0", decimals);
  } catch {
    return BigInt(0);
  }
}
