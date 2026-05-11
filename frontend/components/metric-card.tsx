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
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <p className="text-sm text-[var(--muted)]">{label}</p>
        {detail ? (
          <span className="grid h-4 w-4 place-items-center rounded-full border border-[var(--line)] text-[10px] text-[var(--muted)]" title={detail}>
            i
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-normal">{value}</p>
      {detail && !hideDetail ? (
        <p
          className={cn(
            "mt-2 text-sm",
            tone === "positive" && "text-emerald-600 dark:text-emerald-400",
            tone === "warning" && "text-amber-600 dark:text-amber-400",
            tone === "default" && "text-[var(--muted)]"
          )}
        >
          {detail}
        </p>
      ) : null}
    </div>
  );
}
