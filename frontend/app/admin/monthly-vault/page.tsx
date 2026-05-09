"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { AdminButton, AdminHeader, AdminInput, AdminMetric, AdminPanel, formatUsdc } from "@/components/admin/admin-ui";
import { useAdminContracts } from "@/hooks/useAdminContracts";
import { VAULT_ADDRESS } from "@/app/constants";
import { formatDate, formatNumber, formatPercent } from "@/lib/utils";

type TreasurySummary = {
  history: Array<{ destination: string; amount: string; type: string }>;
};

export default function AdminMonthlyVaultPage() {
  const admin = useAdminContracts();
  const [penalty, setPenalty] = useState("");
  const [buffer, setBuffer] = useState("");
  const [withdrawLimit, setWithdrawLimit] = useState("");
  const [windowStartInput, setWindowStartInput] = useState("");
  const [windowDurationDays, setWindowDurationDays] = useState("7");
  const [nav, setNav] = useState("");
  const [yieldAmount, setYieldAmount] = useState("");
  const [treasurySummary, setTreasurySummary] = useState<TreasurySummary | null>(null);

  useEffect(() => {
    fetch("/api/admin/treasury", { cache: "no-store" })
      .then((res) => res.json())
      .then(setTreasurySummary)
      .catch(() => setTreasurySummary(null));
  }, []);

  const monthlyRoutedYield = useMemo(() => {
    return treasurySummary?.history
      .filter((item) => item.destination?.toLowerCase() === VAULT_ADDRESS.toLowerCase())
      .reduce((total, item) => total + BigInt(item.amount || "0"), BigInt(0)) ?? BigInt(0);
  }, [treasurySummary]);
  const monthlyTVL = admin.metrics.monthlyTVL ?? BigInt(0);
  const estimatedInvestorCapital = monthlyTVL > monthlyRoutedYield ? monthlyTVL - monthlyRoutedYield : BigInt(0);
  const navPerShare =
    typeof admin.metrics.monthlyPricePerShare === "bigint"
      ? `${formatNumber(Number(formatUnits(admin.metrics.monthlyPricePerShare, 18)), 6)} USDC/share`
      : "Awaiting Live Data";
  const windowStart = admin.metrics.windowStart;
  const windowDuration = admin.metrics.windowDuration;
  const windowConfigured = typeof windowStart === "bigint" && windowStart > BigInt(0) && typeof windowDuration === "bigint" && windowDuration > BigInt(0);
  const windowStatus = windowConfigured ? getWindowStatus(windowStart, windowDuration) : "Not configured";
  const windowDetail = windowConfigured
    ? `Starts ${formatDate(windowStart)} and repeats monthly`
    : "Set a first start date to activate free monthly withdrawals";

  return (
    <div>
      <AdminHeader title="Monthly Vault controls" description="Configure semi-liquid vault parameters and route treasury yield with confirmation and audit toasts." />
      <div className="grid gap-4 md:grid-cols-4">
        <AdminMetric label="TVL" value={formatUsdc(admin.metrics.monthlyTVL)} detail="Total USDC assets held by the vault" />
        <AdminMetric label="NAV per share" value={navPerShare} detail="Current redeemable value of one vault share" />
        <AdminMetric label="Routed treasury yield" value={formatUsdc(monthlyRoutedYield)} detail="Yield sent into this vault" />
        <AdminMetric label="Investor capital estimate" value={formatUsdc(estimatedInvestorCapital)} detail="TVL less routed yield" />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <AdminMetric label="Liquidity buffer" value={typeof admin.metrics.liquidityBuffer === "bigint" ? formatPercent(Number(admin.metrics.liquidityBuffer) / 100) : "Awaiting Live Data"} />
        <AdminMetric label="Penalty" value={typeof admin.metrics.penaltyBps === "bigint" ? formatPercent(Number(admin.metrics.penaltyBps) / 100) : "Awaiting Live Data"} />
        <AdminMetric label="Withdrawal window" value={windowStatus} detail={windowDetail} />
        <AdminMetric label="Shareholder effect" value="NAV uplift" detail="Injected yield increases share price, not share count" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <AdminPanel title="Protocol configuration">
          <div className="grid gap-3">
            <AdminInput value={buffer} onChange={setBuffer} placeholder="Liquidity reserve bps" />
            <AdminButton onClick={() => admin.setLiquidityBuffer(buffer)}>Configure liquidity reserve</AdminButton>
            <AdminInput value={penalty} onChange={setPenalty} placeholder="Penalty bps" />
            <AdminButton onClick={() => admin.setPenalty(penalty)}>Configure penalty</AdminButton>
            <AdminInput value={withdrawLimit} onChange={setWithdrawLimit} placeholder="Max withdrawal bps" />
            <AdminButton onClick={() => admin.setWithdrawLimit(withdrawLimit)}>Configure withdrawal limit</AdminButton>
            <div className="grid gap-3 rounded-md border border-[var(--line)] bg-[var(--background)] p-3">
              <p className="text-sm font-medium">Withdrawal window schedule</p>
              <AdminInput value={windowStartInput} onChange={setWindowStartInput} type="datetime-local" />
              <AdminInput value={windowDurationDays} onChange={setWindowDurationDays} placeholder="Window duration in days" type="number" />
              <AdminButton
                onClick={() => {
                  const start = Math.floor(new Date(windowStartInput).getTime() / 1000);
                  const days = Number(windowDurationDays || "0");
                  if (!Number.isFinite(start) || !Number.isFinite(days) || start <= 0 || days <= 0) return;
                  admin.setWithdrawalWindow(BigInt(start), BigInt(Math.floor(days * 24 * 60 * 60)));
                }}
              >
                Configure withdrawal window
              </AdminButton>
            </div>
            <AdminButton onClick={admin.openWithdrawalWindow}>Open withdrawal window</AdminButton>
          </div>
        </AdminPanel>
        <AdminPanel title="NAV and yield operations">
          <div className="grid gap-3">
            <div className="rounded-md border border-[var(--line)] bg-[var(--background)] p-3 text-sm text-[var(--muted)]">
              Treasury yield sent to the Monthly Vault becomes part of vault NAV. That is expected: it increases share price for existing shareholders. It should not be interpreted as new investor deposits.
            </div>
            <AdminInput value={nav} onChange={setNav} placeholder="NAV in USDC" />
            <AdminButton onClick={() => admin.updateNAV(nav)}>Update NAV</AdminButton>
            <AdminInput value={yieldAmount} onChange={setYieldAmount} placeholder="Yield amount in USDC" />
            <AdminButton onClick={() => admin.injectMonthlyYield(yieldAmount)}>Inject treasury yield</AdminButton>
          </div>
        </AdminPanel>
      </div>
    </div>
  );
}

function getWindowStatus(start: bigint, duration: bigint) {
  const now = Math.floor(Date.now() / 1000);
  const startNumber = Number(start);
  const durationNumber = Number(duration);
  const period = 30 * 24 * 60 * 60;
  const elapsed = now >= startNumber ? (now - startNumber) % period : period - ((startNumber - now) % period);
  return elapsed < durationNumber ? "Open now" : "Configured";
}
