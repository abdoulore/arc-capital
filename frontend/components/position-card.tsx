"use client";

import { StatusBadge } from "@/components/status-badge";
import { WalletGatedButton } from "@/components/wallet-gated-button";
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
    <article className="arc-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl leading-tight">{title}</h3>
          <p className="mt-2 text-sm font-light leading-6 text-[var(--muted)]">{detail}</p>
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
          <p className="mt-1 text-lg font-semibold text-[var(--accent)]">{formatCurrency(yieldEarned)}</p>
        </div>
      </div>
      {action ? (
        <WalletGatedButton className="arc-button-outline mt-5 px-4 py-2 text-sm font-medium">
          {action}
        </WalletGatedButton>
      ) : null}
    </article>
  );
}
