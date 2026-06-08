import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "positive" | "warning";
  hideDetail?: boolean;
};

export function MetricCard({ label, value, detail, tone = "default", hideDetail = true }: MetricCardProps) {
  return (
    <div className="arc-panel p-5">
      <div className="flex items-center gap-2">
        <p className="mono-label text-[9px] text-[var(--muted)]">{label}</p>
        {detail ? (
          <span className="grid h-4 w-4 place-items-center rounded-full border border-[var(--line)] text-[10px] text-[var(--muted)]" title={detail}>
            i
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-3xl font-light tracking-normal">{value}</p>
      {detail && !hideDetail ? (
        <p
          className={cn(
            "mt-2 text-sm",
            tone === "positive" && "text-[var(--accent)]",
            tone === "warning" && "text-[var(--warning)]",
            tone === "default" && "text-[var(--muted)]"
          )}
        >
          {detail}
        </p>
      ) : null}
    </div>
  );
}
