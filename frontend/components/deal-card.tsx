import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge } from "@/components/status-badge";
import { formatCurrency } from "@/lib/utils";

type DealCardProps = {
  deal: {
    id: string;
    title: string;
    description: string;
    risk: string;
    targetRaise: number;
    raised: number;
    model: string;
    term: string;
    expectedYield: string;
    status?: "open" | "closed";
  };
  onInvest?: (dealId: string) => void;
};

export function DealCard({ deal, onInvest }: DealCardProps) {
  const closed = deal.status === "closed";
  const progress = deal.targetRaise > 0 ? (deal.raised / deal.targetRaise) * 100 : 0;

  return (
    <article className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{deal.title}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{deal.description}</p>
        </div>
        <StatusBadge label={closed ? "Closed" : deal.risk} />
      </div>
      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--muted)]">Funding</span>
          <span className="font-medium">
            {formatCurrency(deal.raised, 0)} / {formatCurrency(deal.targetRaise, 0)}
          </span>
        </div>
        <ProgressBar value={progress} />
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-[var(--muted)]">Model</dt>
          <dd className="mt-1 font-medium">{deal.model}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Term</dt>
          <dd className="mt-1 font-medium">{deal.term}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Yield</dt>
          <dd className="mt-1 font-medium">{deal.expectedYield}</dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={() => onInvest?.(deal.id)}
        disabled={closed}
        className="mt-5 w-full rounded-md bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 dark:disabled:bg-slate-700 dark:disabled:text-slate-300"
      >
        {closed ? "Closed" : "Review investment"}
      </button>
    </article>
  );
}
