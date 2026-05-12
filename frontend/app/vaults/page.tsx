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
  { duration: "1 year", description: "Monthly payout, principal at maturity" },
  { duration: "2 years", description: "Higher fixed payout with medium lock" },
  { duration: "3 years", description: "Highest fixed payout, least liquid" },
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
  void monthlyApy;
  const penaltyBps = typeof vault.penaltyBps === "bigint" ? Number(vault.penaltyBps) : 0;
  const previewPenalty = withdrawalWindow.isOpen ? 0 : grossWithdraw * (penaltyBps / 10_000);
  const netWithdraw = Math.max(0, grossWithdraw - previewPenalty);
  const ownershipAfterDeposit =
    totalSharesAfterDeposit > BigInt(0) ? (bigintToNumber(shares + expectedShares, SHARE_DECIMALS) / bigintToNumber(totalSharesAfterDeposit, SHARE_DECIMALS)) * 100 : 0;
  const ownershipAfterWithdraw =
    totalSharesAfterWithdraw > BigInt(0) ? (bigintToNumber(remainingShares, SHARE_DECIMALS) / bigintToNumber(totalSharesAfterWithdraw, SHARE_DECIMALS)) * 100 : 0;

  const liveOptions = LONG_TERM_OPTIONS.map((option, index) => {
    const tranche = longTerm.tranches[index];
    return {
      ...option,
      apy: tranche ? Number(tranche[1]) / 100 : undefined,
      enabled: tranche ? tranche[2] : true,
    };
  });
  const selectedFixedOption = liveOptions[selectedDurationIndex];
  const selectedDurationDays = [365, 730, 1095][selectedDurationIndex];
  const fixedAmountNumber = Number(fixedAmount || 0);
  const estimatedMonthlyYield = selectedFixedOption.apy === undefined ? undefined : (fixedAmountNumber * (selectedFixedOption.apy / 100)) / 12;
  const projectedYearlyYield = selectedFixedOption.apy === undefined ? undefined : fixedAmountNumber * (selectedFixedOption.apy / 100);
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

      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.75fr]">
          <div className="flex min-h-[280px] flex-col justify-between rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
            <div>
              <div className="flex flex-wrap items-start gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl border border-blue-400/20 bg-blue-500/15 font-semibold text-blue-100 shadow-[0_0_24px_rgba(47,91,255,0.18)]">
                  <span className="text-sm">|||</span>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-semibold tracking-tight text-white">Monthly RWA Vault</h2>
                    <span className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Liquid
                    </span>
                  </div>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
                    Flexible access to real-world yield with monthly liquidity windows.
                  </p>
                </div>
              </div>

              <div className="mt-6 border-t border-[var(--line)] pt-6">
                {walletConnected ? (
                  <>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Your balance</p>
                      <span
                        title="Your current vault share value based on live share price."
                        aria-label="Your current vault share value based on live share price."
                        className="grid h-4 w-4 place-items-center rounded-full border border-white/15 text-[10px] font-semibold text-slate-400"
                      >
                        i
                      </span>
                    </div>
                    <p className="mt-3 text-4xl font-semibold tracking-tight text-white">
                      {hasShares ? formatCurrency(shareValue) : "Awaiting Live Data"}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      {hasShares ? formatTokenAmount(shares, SHARE_DECIMALS, "shares", 4) : "Wallet position pending"}
                    </p>
                  </>
                ) : (
                  <div className="mx-auto flex max-w-xl flex-col items-center py-4 text-center">
                    <div className="grid h-16 w-16 place-items-center rounded-full border border-blue-400/20 bg-blue-500/10 text-2xl font-semibold text-blue-300">
                      +
                    </div>
                    <p className="mt-5 text-2xl font-semibold leading-9 text-white">Connect your wallet to access deposits, withdrawals, and vault positions.</p>
                    <p className="mt-3 text-sm text-slate-400">Your funds remain non-custodial and secure.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {walletConnected ? (
                <>
                  <WalletGatedButton
                    onClick={() => setDepositOpen(true)}
                    className="flex-1 rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(37,99,235,0.25)] transition hover:bg-blue-500"
                  >
                    Deposit
                  </WalletGatedButton>
                  <WalletGatedButton
                    onClick={() => setWithdrawOpen(true)}
                    className="flex-1 rounded-md border border-white/15 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.07]"
                  >
                    Withdraw
                  </WalletGatedButton>
                </>
              ) : (
                <WalletGatedButton className="mx-auto w-full max-w-md rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(37,99,235,0.25)] transition hover:bg-blue-500">
                  Connect Wallet
                </WalletGatedButton>
              )}
            </div>
          </div>

          <div className="min-h-[280px] rounded-lg border border-[var(--line)] bg-[var(--panel)] px-5 py-4 shadow-sm">
            <VaultInfoRow
              icon="[]"
              label="Withdrawal window"
              value={withdrawalWindow.label}
              detail={withdrawalWindow.countdownDate ? getWindowTimingText(withdrawalWindow) : withdrawalWindow.detail}
              tone={withdrawalWindow.isOpen ? "green" : "blue"}
            />
            <VaultInfoRow
              icon="|||"
              label="Vault liquidity"
              value={hasTotalAssets ? formatTokenAmount(totalAssets, USDC_DECIMALS, "USDC", 2) : "Awaiting Live Data"}
              detail="Live onchain vault assets"
              isLast
            />
          </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-4 text-xl font-semibold">Long-term fixed income</h2>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
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
                className="mt-2 w-full rounded-md border border-[var(--line)] bg-transparent px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-[var(--muted)] dark:disabled:bg-slate-900"
                placeholder={walletConnected ? "USDC amount" : "Awaiting wallet connection"}
              />

              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-[var(--muted)]">Lock duration</p>
                  <p className="text-sm font-semibold">{selectedFixedOption.duration}</p>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={1}
                  value={selectedDurationIndex}
                  onChange={(event) => setSelectedDurationIndex(Number(event.target.value))}
                  disabled={!walletConnected}
                  className="w-full accent-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Select lock duration"
                />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {liveOptions.map((option, index) => (
                    <button
                      key={option.duration}
                      type="button"
                      onClick={() => setSelectedDurationIndex(index)}
                      disabled={!walletConnected}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                        selectedDurationIndex === index
                          ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200"
                          : "border-[var(--line)] text-[var(--muted)] hover:bg-slate-50 dark:hover:bg-slate-900"
                      }`}
                    >
                      {option.duration}
                    </button>
                  ))}
                </div>
              </div>

              <p className="mt-5 text-sm text-[var(--muted)]">Early withdrawals may reduce returns</p>
            </div>

            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 text-[var(--foreground)] shadow-sm">
              <p className="text-sm text-[var(--muted)]">Fixed APY</p>
              <p className="mt-2 text-4xl font-semibold text-emerald-600 dark:text-emerald-300">{selectedFixedOption.apy === undefined ? "Awaiting Live Data" : formatPercent(selectedFixedOption.apy)}</p>
              <p className="mt-2 text-sm text-[var(--muted)]">{selectedFixedOption.description}</p>

              <div className="mt-5 space-y-3 text-sm">
                <SummaryRow label="Monthly payout estimate" value={estimatedMonthlyYield === undefined ? "Awaiting Live Data" : formatCurrency(estimatedMonthlyYield)} />
                <SummaryRow label="Projected yearly earnings" value={projectedYearlyYield === undefined ? "Awaiting Live Data" : formatCurrency(projectedYearlyYield)} />
                <SummaryRow label="Maturity date" value={maturityDateText} />
                <SummaryRow label="Settlement" value="Approve USDC, then confirm deposit" />
              </div>

              <WalletGatedButton
                onClick={async () => {
                  const ok = await longTerm.deposit(fixedAmount, selectedDurationDays);
                  if (ok) setFixedAmount("");
                }}
                disabled={!selectedFixedOption.enabled || longTermBusy}
                className="mt-5 w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
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
            ["Estimated gas", "Awaiting Wallet Estimate", "Estimated network fee."],
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
        ? "Yield appears after treasury distributions are routed to the vault"
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
    return { label: "Not configured", detail: "Admin must set a monthly withdrawal window", countdownDate: null as Date | null, nextWindowDate: null as Date | null, isOpen: false };
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

function VaultInfoRow({
  icon,
  label,
  value,
  detail,
  tone = "blue",
  isLast,
}: {
  icon: string;
  label: string;
  value: string;
  detail: string;
  tone?: "blue" | "green";
  isLast?: boolean;
}) {
  return (
    <div className={`flex gap-4 py-3.5 ${isLast ? "" : "border-b border-[var(--line)]"}`}>
      <div
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-sm font-semibold ${
          tone === "green"
            ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
            : "border-blue-400/20 bg-blue-500/10 text-blue-300"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`mt-1 text-lg font-semibold ${tone === "green" ? "text-emerald-300" : "text-white"}`}>{value}</p>
        <p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p>
      </div>
    </div>
  );
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
        className="w-full rounded-md border border-[var(--line)] bg-transparent px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-[var(--muted)] dark:disabled:bg-slate-900"
      />
      <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--background)] p-3 text-sm text-[var(--foreground)]">
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
      {warning ? <div className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">{warning}</div> : null}
      {advanced?.length ? (
        <div className="mt-3 rounded-md border border-[var(--line)]">
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
        className="mt-5 w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
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
