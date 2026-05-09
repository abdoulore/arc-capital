import { formatTokenAmount } from "@/lib/utils";
import type { DashboardAllocation } from "@/hooks/useDashboardData";

type YieldHistoryPoint = {
  id: string;
  timestamp: string;
  totalPortfolioValue: bigint;
  totalYield: bigint;
};

export function YieldChart({ totalYield, history = [] }: { totalYield?: bigint; history?: YieldHistoryPoint[] }) {
  const hasLiveYield = typeof totalYield === "bigint";
  const hasClaimableYield = hasLiveYield && totalYield > BigInt(0);
  const chartPoints = history.slice(-12);
  const maxYield = chartPoints.reduce((max, point) => (point.totalYield > max ? point.totalYield : max), BigInt(0));
  const minYield = chartPoints.reduce((min, point) => (point.totalYield < min ? point.totalYield : min), maxYield);
  const spread = maxYield - minYield;

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="font-semibold">Yield trend</h2>
        <p className="text-sm text-[var(--muted)]">
          {hasLiveYield ? `${formatTokenAmount(totalYield, 6, "USDC", 2)} currently claimable` : "Awaiting wallet connection"}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
          <p className="text-xs uppercase tracking-normal text-[var(--muted)]">Claimable now</p>
          <p className="mt-2 text-2xl font-semibold">
            {hasLiveYield ? formatTokenAmount(totalYield, 6, "USDC", 2) : "Connect Wallet"}
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all"
              style={{ width: hasClaimableYield ? "100%" : "0%" }}
            />
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            {hasClaimableYield ? "Available from live fixed-income and deal revenue accounting." : "No claimable yield available yet."}
          </p>
        </div>

        <div className="rounded-md border border-[var(--line)] px-4 py-3 text-sm text-[var(--muted)] md:w-64">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-medium text-[var(--foreground)]">Yield history</p>
            <span className="text-xs">{chartPoints.length} points</span>
          </div>
          {chartPoints.length < 2 ? (
            <p className="text-xs leading-5">Recording started. The trend line appears after the next dashboard snapshot.</p>
          ) : (
            <div className="flex h-24 items-end gap-1">
              {chartPoints.map((point) => {
                const height = spread === BigInt(0)
                  ? 50
                  : 18 + Number(((point.totalYield - minYield) * BigInt(82)) / spread);
                return (
                  <div
                    key={point.id}
                    className="min-w-0 flex-1 rounded-t bg-blue-600"
                    style={{ height: `${height}%` }}
                    title={`${new Date(point.timestamp).toLocaleString()} - ${formatTokenAmount(point.totalYield, 6, "USDC", 2)}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AllocationPieChart({ allocations = [] }: { allocations?: DashboardAllocation[] }) {
  const total = allocations.reduce((sum, item) => sum + item.value, BigInt(0));

  return (
    <div className="h-72 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
      <h2 className="font-semibold">Allocation</h2>
      {allocations.length === 0 || total === BigInt(0) ? (
        <div className="mt-4 grid h-[80%] place-items-center rounded-md border border-dashed border-[var(--line)] text-sm text-[var(--muted)]">
          Awaiting Live Data
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {allocations.map((item) => {
            const percent = Number((item.value * BigInt(10_000)) / total) / 100;
            return (
              <div key={item.label}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{item.label}</span>
                  <span className="text-[var(--muted)]">{percent.toFixed(2)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(1, percent)}%` }} />
                </div>
                <div className="mt-1 flex justify-between gap-3 text-xs text-[var(--muted)]">
                  <span>{item.detail}</span>
                  <span>{formatTokenAmount(item.value, 6, "USDC", 2)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
