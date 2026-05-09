import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "positive" | "warning";
};

export function MetricCard({ label, value, detail, tone = "default" }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-normal">{value}</p>
      {detail ? (
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
