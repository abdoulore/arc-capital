"use client";

import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge } from "@/components/status-badge";
import { WalletGatedButton } from "@/components/wallet-gated-button";
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
    <article className="border border-white/[0.08] bg-transparent p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="break-words text-2xl leading-tight">{deal.title}</h3>
          <p className="mt-3 text-sm font-light leading-6 text-[var(--muted)]">{deal.description}</p>
        </div>
        <StatusBadge label={closed ? "Closed" : deal.risk} />
      </div>
      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="mono-label text-[10px] text-[var(--muted)]">Funding</span>
          <span className="text-[var(--foreground)]">
            {formatCurrency(deal.raised, 0)} / {formatCurrency(deal.targetRaise, 0)}
          </span>
        </div>
        <ProgressBar value={progress} />
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="mono-label text-[9px] text-[var(--muted)]">Model</dt>
          <dd className="mt-2 text-[var(--foreground)]">{deal.model}</dd>
        </div>
        <div>
          <dt className="mono-label text-[9px] text-[var(--muted)]">Term</dt>
          <dd className="mt-2 text-[var(--foreground)]">{deal.term}</dd>
        </div>
        <div>
          <dt className="mono-label text-[9px] text-[var(--muted)]">Yield</dt>
          <dd className="mt-2 text-[var(--foreground)]">{deal.expectedYield}</dd>
        </div>
      </dl>
      {closed ? (
        <button
          type="button"
          disabled
          className="arc-button-outline mt-5 w-full cursor-not-allowed rounded-md px-4 py-3 text-sm opacity-50"
        >
          Closed
        </button>
      ) : (
        <WalletGatedButton
          onClick={() => onInvest?.(deal.id)}
          className="arc-button-outline mt-5 w-full rounded-md px-4 py-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          Review investment
        </WalletGatedButton>
      )}
    </article>
  );
}
