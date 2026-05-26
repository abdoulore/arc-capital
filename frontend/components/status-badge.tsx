import { cn } from "@/lib/utils";

const toneMap: Record<string, string> = {
  Liquid: "border-[var(--accent)]/45 text-[var(--accent)]",
  Locked: "border-white/[0.18] text-[var(--muted)]",
  Pending: "border-white/[0.18] text-[var(--muted)]",
  Confirmed: "border-[var(--accent)]/45 text-[var(--accent)]",
  High: "border-white/[0.18] text-[var(--foreground)]",
  Moderate: "border-white/[0.18] text-[var(--muted)]",
  Low: "border-white/[0.18] text-[var(--muted)]",
  Closed: "border-white/[0.18] text-[var(--muted)]",
  Sell: "border-[var(--accent)]/45 text-[var(--accent)]",
};

export function StatusBadge({ label }: { label: string }) {
  return (
    <span className={cn("mono-label inline-flex items-center rounded-full border bg-transparent px-2.5 py-1 text-[9px]", toneMap[label] ?? toneMap.Low)}>
      {label}
    </span>
  );
}
