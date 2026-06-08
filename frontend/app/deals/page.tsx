"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { DealCard } from "@/components/deal-card";
import { Modal } from "@/components/modal";
import { SectionHeader } from "@/components/section-header";
import { WalletGatedButton } from "@/components/wallet-gated-button";
import { getVisibleDeals, toDealViews, type DealMetadata } from "@/lib/deal-ui";
import { formatCurrency } from "@/lib/utils";
import { useDealVault } from "@/hooks/useInvestmentContracts";
import { SAMPLE_DEAL_ADDRESS } from "@/app/constants";
import { useAccount } from "wagmi";

export default function DealsPage() {
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [deals, setDeals] = useState<DealMetadata[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const { address } = useAccount();
  const liveDeals = useMemo(() => toDealViews(deals), [deals]);
  const activeDeal = liveDeals.find((deal) => deal.id === activeDealId);
  const dealVault = useDealVault(activeDeal?.contractAddress ?? SAMPLE_DEAL_ADDRESS);
  const visibleDeals = getVisibleDeals(liveDeals, tab);
  const activeRaised = typeof dealVault.totalRaised === "bigint" ? Number(formatUnits(dealVault.totalRaised, 6)) : activeDeal?.raised ?? 0;
  const activeTarget = typeof dealVault.targetRaise === "bigint" ? Number(formatUnits(dealVault.targetRaise, 6)) : activeDeal?.targetRaise ?? 0;
  const activeDeadlinePassed =
    typeof dealVault.closeTime === "bigint" &&
    dealVault.closeTime > BigInt(0) &&
    BigInt(Math.floor(Date.now() / 1000)) >= dealVault.closeTime;
  const activeClosed = activeDeal?.status === "closed" || dealVault.raiseClosed === true || activeDeadlinePassed;

  useEffect(() => {
    refreshDeals();
  }, []);

  async function refreshDeals() {
    fetch("/api/v2/deals")
      .then((res) => res.json())
      .then((data: V2DealsResponse) => setDeals([...mapV2Deals(data.openDeals), ...mapV2Deals(data.closedDeals)]))
      .catch(() => setDeals([]));
  }

  return (
    <div>
      <SectionHeader
        eyebrow="Private deals"
        title="Invest in real-world cash flow"
        description="Each deal has isolated accounting, its own risk profile, and revenue-based distributions. No guaranteed APY is implied."
      />

      {dealVault.transaction.status === "pending" || dealVault.transaction.status === "confirmed" ? (
        <div className="mb-6 border border-white/[0.08] bg-transparent p-4 text-sm text-[var(--muted)]">
          {dealVault.transaction.label}
        </div>
      ) : null}

      <div className="mb-5 flex gap-2">
        <button type="button" onClick={() => setTab("open")} className={`mono-label border px-4 py-2 text-[10px] transition ${tab === "open" ? "border-[var(--accent)] text-[var(--foreground)]" : "border-white/[0.08] text-[var(--muted)] hover:border-white/[0.18]"}`}>
          Open Deals
        </button>
        <button type="button" onClick={() => setTab("closed")} className={`mono-label border px-4 py-2 text-[10px] transition ${tab === "closed" ? "border-[var(--accent)] text-[var(--foreground)]" : "border-white/[0.08] text-[var(--muted)] hover:border-white/[0.18]"}`}>
          Closed Deals
        </button>
      </div>

      <section className="grid gap-5 lg:grid-cols-3">
        {visibleDeals.length === 0 ? (
          <div className="arc-panel p-8 lg:col-span-3">
            <p className="text-2xl">{tab === "open" ? "No open deals available." : "No closed deals yet."}</p>
            <p className="mt-3 max-w-2xl text-sm font-light leading-6 text-[var(--muted)]">
              {tab === "open"
                ? "New opportunities will appear here once they are approved and opened for funding."
                : "Completed opportunities will move here with their funding and distribution history."}
            </p>
          </div>
        ) : null}
        {visibleDeals.map((deal) => (
          <DealCard key={deal.id} deal={deal} onInvest={setActiveDealId} />
        ))}
      </section>

      <Modal title={activeDeal ? `Invest in ${activeDeal.title}` : "Invest"} open={Boolean(activeDeal)} onClose={() => setActiveDealId(null)}>
        {activeDeal ? (
          <div>
            <p className="text-sm leading-6 text-[var(--muted)]">{activeDeal.description}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 border border-white/[0.08] bg-transparent p-4 text-sm">
              <PreviewRow label="Risk level" value={activeDeal.risk} />
              <PreviewRow label="Yield model" value={activeDeal.model} />
              <PreviewRow label="Target raise" value={formatCurrency(activeTarget, 0)} />
              <PreviewRow label="Total raised" value={formatCurrency(activeRaised, 0)} />
              <PreviewRow label="Term" value={activeDeal.term} />
              <PreviewRow label="Status" value={activeClosed ? "Closed" : "Open"} />
            </div>
            {activeClosed ? (
              <div className="mt-4 border border-white/[0.08] bg-transparent p-3 text-sm text-[var(--muted)]">
                This deal is closed. Historical ownership and distributions remain visible, but new investments are disabled.
              </div>
            ) : !address ? (
              <div>
                <div className="mt-4 border border-white/[0.08] bg-transparent p-4 text-sm">
                  <p className="text-lg text-[var(--foreground)]">Wallet required</p>
                  <p className="mt-1 leading-6 text-[var(--muted)]">
                    Connect your wallet to review investment terms and submit a transaction.
                  </p>
                </div>
                <WalletGatedButton className="arc-button-outline mt-5 w-full px-4 py-3 text-sm transition">
                  Confirm investment
                </WalletGatedButton>
              </div>
            ) : (
              <>
                <input
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setFormError(null);
                  }}
                  placeholder="USDC amount"
                  className="arc-field mt-4 w-full px-4 py-3"
                />
                <div className="mt-4 border border-white/[0.08] bg-transparent p-3 text-sm text-[var(--muted)]">
                  Private deal shares are illiquid unless another buyer fills your marketplace listing. Yield rights follow share ownership.
                </div>
                <button
                  onClick={async () => {
                    const validation = await fetch("/api/validation/deal-investment", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ user: address, dealAddress: activeDeal.contractAddress, amount }),
                    });
                    const validationResult = (await safeJson(validation)) as { ok: boolean; message?: string };
                    if (!validationResult.ok) {
                      setFormError(validationResult.message ?? "Investment validation failed.");
                      return;
                    }

                    const ok = await dealVault.invest(amount);
                    if (ok) {
                      setAmount("");
                      await refreshDeals();
                      window.setTimeout(() => setActiveDealId(null), 900);
                    }
                  }}
                  disabled={dealVault.transaction.status === "pending" || !activeDeal.contractAddress}
                  className="arc-button-filled mt-5 w-full px-4 py-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {dealVault.transaction.status === "pending" ? "Confirming..." : dealVault.transaction.status === "confirmed" ? "Confirmed" : "Confirm investment"}
                </button>
                {formError ? <p className="mt-3 text-sm text-[var(--accent)]">{formError}</p> : null}
              </>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

type V2Deal = {
  id: string;
  contractAddress?: `0x${string}` | null;
  title: string;
  subtitle?: string | null;
  riskLevel?: string | null;
  status: "open" | "closed" | "archived" | string;
  targetRaiseUsdc?: string | null;
  totalRaisedUsdc?: string | null;
  investorCount?: number;
  fundingDeadline?: string;
  closedAt?: string;
};

type V2DealsResponse = {
  openDeals?: V2Deal[];
  closedDeals?: V2Deal[];
};

function mapV2Deals(deals?: V2Deal[]): DealMetadata[] {
  return (deals ?? []).map((deal) => ({
    id: deal.id,
    contractAddress: deal.contractAddress ?? undefined,
    title: deal.title,
    subtitle: deal.subtitle ?? undefined,
    description: deal.subtitle ?? undefined,
    riskLevel: deal.riskLevel ?? undefined,
    status: deal.status === "closed" || deal.status === "archived" ? deal.status : "open",
    targetRaise: deal.targetRaiseUsdc ?? "0",
    totalRaised: deal.totalRaisedUsdc ?? "0",
    investorCount: deal.investorCount,
    fundingDeadline: deal.fundingDeadline,
    closeDate: deal.closedAt,
    revenueModel: "Revenue share",
    payoutSchedule: deal.fundingDeadline ? `Funding deadline ${new Date(deal.fundingDeadline).toLocaleDateString("en-US")}` : "Awaiting Live Data",
    expectedYield: "Revenue-based",
  }));
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mono-label text-[9px] text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-[var(--foreground)]">{value}</p>
    </div>
  );
}

async function safeJson(response: Response) {
  const text = await response.text();
  if (!text) {
    return {
      ok: false,
      message: response.ok ? "Validation returned an empty response." : `Validation service failed with HTTP ${response.status}.`,
    };
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      ok: false,
      message: "Validation service returned an invalid response.",
    };
  }
}
