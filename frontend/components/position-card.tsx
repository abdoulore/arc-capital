import { StatusBadge } from "@/components/status-badge";
import { formatCurrency } from "@/lib/utils";

type PositionCardProps = {
  title: string;
  value: number;
  yieldEarned: number;
  status: string;
  detail: string;
  action?: string;
};

export function PositionCard({ title, value, yieldEarned, status, detail, action }: PositionCardProps) {
  return (
    <article className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{detail}</p>
        </div>
        <StatusBadge label={status} />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-[var(--muted)]">Current value</p>
          <p className="mt-1 text-lg font-semibold">{formatCurrency(value)}</p>
        </div>
        <div>
          <p className="text-[var(--muted)]">Yield earned</p>
          <p className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(yieldEarned)}</p>
        </div>
      </div>
      {action ? (
        <button type="button" className="mt-5 rounded-md border border-[var(--line)] px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-900">
          {action}
        </button>
      ) : null}
    </article>
  );
}
