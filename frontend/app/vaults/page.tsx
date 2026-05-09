"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { CountdownTimer } from "@/components/countdown-timer";
import { MetricCard } from "@/components/metric-card";
import { Modal } from "@/components/modal";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
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
  const penaltyBps = typeof vault.penaltyBps === "bigint" ? Number(vault.penaltyBps) : 0;
  const previewPenalty = withdrawalWindow.isOpen ? 0 : grossWithdraw * (penaltyBps / 10_000);
  const netWithdraw = Math.max(0, grossWithdraw - previewPenalty);
  const ownershipAfterDeposit =
    totalSharesAfterDeposit > BigInt(0) ? (bigintToNumber(shares + expectedShares, SHARE_DECIMALS) / bigintToNumber(totalSharesAfterDeposit, SHARE_DECIMALS)) * 100 : 0;
  const ownershipAfterWithdraw =
    totalSharesAfterWithdraw > BigInt(0) ? (bigintToNumber(remainingShares, SHARE_DECIMALS) / bigintToNumber(totalSharesAfterWithdraw, SHARE_DECIMALS)) * 100 : 0;

  const transactionText = useMemo(() => {
    const active = vault.transaction.status !== "idle" ? vault.transaction : longTerm.transaction;
    if (active.status === "idle") return null;
    return `${active.label}${active.error ? `: ${active.error}` : ""}`;
  }, [vault.transaction, longTerm.transaction]);

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
        title="Liquidity-aware investing"
        description="Choose between semi-liquid NAV exposure and deterministic fixed-income lockups. Every action previews liquidity, penalties, and settlement."
      />

      {transactionText ? (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
          {transactionText}
        </div>
      ) : null}

      {!walletConnected ? (
        <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
          <p className="font-semibold">Connect Wallet</p>
          <p className="mt-1 text-blue-800 dark:text-blue-200">
            Connect your wallet to deposit, withdraw, or configure a fixed-income lock.
          </p>
        </div>
      ) : null}

      <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">Monthly RWA Vault</h2>
              <StatusBadge label="Liquid" />
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Semi-liquid exposure to short-duration real-world strategies. Withdrawals are free during monthly windows; outside-window exits pay a penalty that remains for other shareholders.
            </p>
          </div>
          {withdrawalWindow.countdownDate ? (
            <CountdownTimer date={withdrawalWindow.countdownDate.toISOString()} />
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Withdrawal window not configured
            </div>
          )}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <MetricCard label="Yearly APY" value={monthlyApy.value} detail={monthlyApy.detail} />
          <MetricCard label="Total value locked" value={hasTotalAssets ? formatTokenAmount(totalAssets, USDC_DECIMALS, "USDC", 2) : "Awaiting Live Data"} detail="Live onchain vault assets" />
          <MetricCard label="Your claimable value" value={hasShares ? formatCurrency(shareValue) : "Awaiting Live Data"} detail={hasShares ? formatTokenAmount(shares, SHARE_DECIMALS, "shares", 4) : "Wallet position pending"} />
          <MetricCard label="Withdrawal window" value={withdrawalWindow.label} detail={withdrawalWindow.detail} />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {walletConnected ? (
            <>
              <WalletGatedButton onClick={() => setDepositOpen(true)} className="rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700">
                Deposit
              </WalletGatedButton>
              <WalletGatedButton onClick={() => setWithdrawOpen(true)} className="rounded-md border border-[var(--line)] px-4 py-3 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-900">
                Withdraw
              </WalletGatedButton>
            </>
          ) : (
            <WalletGatedButton className="rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700">
              Connect Wallet
            </WalletGatedButton>
          )}
          <button onClick={vault.fundWallet} className="rounded-md border border-[var(--line)] px-4 py-3 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-900">
            Get test USDC
          </button>
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

              <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                Principal is locked until maturity. Early exits may return less than principal after penalties.
              </div>
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
        <div className="mt-6 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 text-sm shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold">Your fixed-income positions</h3>
              <p className="mt-1 text-[var(--muted)]">Principal remains locked until maturity. Yield can be claimed separately.</p>
            </div>
            <StatusBadge label="Fixed APY" />
          </div>
          {longTerm.positions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead className="border-b border-[var(--line)] text-xs uppercase text-[var(--muted)]">
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
                  {longTerm.positions.map((position) => (
                    <tr key={position.id.toString()}>
                      <td className="py-4 font-medium">#{position.id.toString()}</td>
                      <td className="py-4">{position.ready ? formatTokenAmount(position.principal, USDC_DECIMALS, "USDC", 2) : "Awaiting Live Data"}</td>
                      <td className="py-4">{position.ready ? formatPercent(Number(position.apyBps) / 100) : "Awaiting Live Data"}</td>
                      <td className="py-4">{position.ready ? formatDate(position.maturity) : "Awaiting Live Data"}</td>
                      <td className="py-4">{position.ready ? formatTokenAmount(position.claimableYield, USDC_DECIMALS, "USDC", 2) : "Awaiting Live Data"}</td>
                      <td className="py-4">
                        {position.claimableYield > BigInt(0) ? (
                          <WalletGatedButton
                            onClick={() => longTerm.claimYield(position.id)}
                            disabled={longTerm.transaction.status === "pending"}
                            className="rounded-md border border-[var(--line)] px-3 py-2 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-slate-900"
                          >
                            {longTerm.transaction.status === "pending" ? "Claiming..." : "Claim"}
                          </WalletGatedButton>
                        ) : (
                          <StatusBadge label={position.redeemed ? "Redeemed" : "Accruing"} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[var(--muted)]">No fixed-income positions yet.</p>
          )}
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
            ["Estimated gas", "Awaiting Wallet Estimate", "Estimated network fee."],
            ["Total estimated cost", "Awaiting Wallet Estimate"],
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
    return { label: "Awaiting Live Data", detail: "Reading vault schedule", countdownDate: null as Date | null, isOpen: false };
  }
  if (start === BigInt(0) || duration === BigInt(0)) {
    return { label: "Not configured", detail: "Admin must set a monthly withdrawal window", countdownDate: null as Date | null, isOpen: false };
  }
  if (!nowMs) {
    return { label: "Configured", detail: "Monthly free-withdrawal schedule", countdownDate: new Date(Number(start) * 1000), isOpen: false };
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
    label: open ? "Open now" : "Configured",
    detail: `${days} day window, repeats monthly`,
    countdownDate: new Date((open ? currentClose : nextStart) * 1000),
    isOpen: open,
  };
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
