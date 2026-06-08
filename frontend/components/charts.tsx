import { formatDate, formatPercent, formatTokenAmount } from "@/lib/utils";
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
    <div className="arc-panel p-6">
      <div className="mb-4">
        <h2 className="text-2xl">Yield trend</h2>
        <p className="text-sm text-[var(--muted)]">
          {hasLiveYield ? `${formatTokenAmount(totalYield, 6, "USDC", 2)} currently claimable` : "Awaiting Live Data"}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="border border-[var(--line)] bg-transparent p-4">
          <p className="mono-label text-[9px] text-[var(--muted)]">Claimable now</p>
          <p className="mt-2 text-2xl font-light">
            {hasLiveYield ? formatTokenAmount(totalYield, 6, "USDC", 2) : "Awaiting Live Data"}
          </p>
          <div className="mt-4 h-1.5 overflow-hidden bg-white/[0.08]">
            <div
              className="h-full bg-[var(--accent)] transition-all"
              style={{ width: hasClaimableYield ? "100%" : "0%" }}
            />
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            {hasClaimableYield ? "Available from live fixed-income and deal revenue accounting." : "No claimable yield available yet."}
          </p>
        </div>

        <div className="border border-[var(--line)] px-4 py-3 text-sm text-[var(--muted)] md:w-64">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-medium text-[var(--foreground)]">Yield history</p>
            <span className="text-xs">{chartPoints.length < 2 ? "No yield history yet" : `${chartPoints.length} points`}</span>
          </div>
          {chartPoints.length < 2 ? (
            <p className="text-xs leading-5">No yield history yet.</p>
          ) : (
            <div className="flex h-24 items-end gap-1">
              {chartPoints.map((point) => {
                const height = spread === BigInt(0)
                  ? 50
                  : 18 + Number(((point.totalYield - minYield) * BigInt(82)) / spread);
                return (
                  <div
                    key={point.id}
                    className="min-w-0 flex-1 bg-[var(--accent)]"
                    style={{ height: `${height}%` }}
                    title={`${formatDate(point.timestamp)} - ${formatTokenAmount(point.totalYield, 6, "USDC", 2)}`}
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
    <div className="arc-panel p-7">
      <h2 className="text-2xl">Allocation</h2>
      {allocations.length === 0 || total === BigInt(0) ? (
        <div className="mt-5 grid h-48 place-items-center border border-dashed border-white/15 text-sm text-[var(--muted)]">
          Awaiting Live Data
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {allocations.map((item, index) => {
            const percent = Number((item.value * BigInt(10_000)) / total) / 100;
            return (
              <div key={item.label} className="grid gap-4 md:grid-cols-[220px_1fr_130px] md:items-center">
                <div className="flex items-center gap-4">
                  <div className="grid h-12 w-12 place-items-center border border-white/[0.1] bg-transparent">
                    <span className="font-mono text-lg text-[var(--accent)]">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{item.detail}</p>
                  </div>
                </div>
                <div className="h-1.5 overflow-hidden bg-white/5">
                  <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.max(1, percent)}%`, opacity: Math.max(0.35, 1 - index * 0.12) }} />
                </div>
                <div className="text-left md:text-right">
                  <p className="text-lg font-medium">{formatPercent(percent)}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{formatTokenAmount(item.value, 6, "USDC", 2)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
