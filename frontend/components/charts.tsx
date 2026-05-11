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
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="font-semibold">Yield trend</h2>
        <p className="text-sm text-[var(--muted)]">
          {hasLiveYield ? `${formatTokenAmount(totalYield, 6, "USDC", 2)} currently claimable` : "Awaiting Live Data"}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
          <p className="text-xs uppercase tracking-normal text-[var(--muted)]">Claimable now</p>
          <p className="mt-2 text-2xl font-semibold">
            {hasLiveYield ? formatTokenAmount(totalYield, 6, "USDC", 2) : "Awaiting Live Data"}
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
                    className="min-w-0 flex-1 rounded-t bg-blue-600"
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
  const tones = [
    { bg: "bg-blue-500", icon: "text-blue-300", panel: "bg-blue-500/15", ring: "ring-blue-400/20" },
    { bg: "bg-violet-500", icon: "text-violet-300", panel: "bg-violet-500/15", ring: "ring-violet-400/20" },
    { bg: "bg-emerald-500", icon: "text-emerald-300", panel: "bg-emerald-500/15", ring: "ring-emerald-400/20" },
    { bg: "bg-orange-500", icon: "text-orange-300", panel: "bg-orange-500/15", ring: "ring-orange-400/20" },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-7 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
      <h2 className="text-xl font-semibold">Allocation</h2>
      {allocations.length === 0 || total === BigInt(0) ? (
        <div className="mt-5 grid h-48 place-items-center rounded-xl border border-dashed border-white/15 text-sm text-[var(--muted)]">
          Awaiting Live Data
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {allocations.map((item, index) => {
            const percent = Number((item.value * BigInt(10_000)) / total) / 100;
            const tone = tones[index % tones.length];
            return (
              <div key={item.label} className="grid gap-4 md:grid-cols-[220px_1fr_130px] md:items-center">
                <div className="flex items-center gap-4">
                  <div className={`grid h-12 w-12 place-items-center rounded-2xl ring-1 ${tone.panel} ${tone.ring}`}>
                    <span className={`text-lg font-semibold ${tone.icon}`}>{item.label.slice(0, 1)}</span>
                  </div>
                  <div>
                    <p className="font-semibold">{item.label}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{item.detail}</p>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div className={`h-full rounded-full ${tone.bg} shadow-[0_0_22px_currentColor]`} style={{ width: `${Math.max(1, percent)}%` }} />
                </div>
                <div className="text-left md:text-right">
                  <p className="text-lg font-semibold">{formatPercent(percent)}</p>
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
