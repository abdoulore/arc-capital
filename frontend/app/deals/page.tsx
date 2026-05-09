"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { DealCard } from "@/components/deal-card";
import { Modal } from "@/components/modal";
import { SectionHeader } from "@/components/section-header";
import { getVisibleDeals, toDealViews, type DealMetadata } from "@/lib/deal-ui";
import { formatCurrency } from "@/lib/utils";
import { useDealVault } from "@/hooks/useInvestmentContracts";
import { SAMPLE_DEAL_ADDRESS } from "@/app/constants";
import { useAccount } from "wagmi";

export default function DealsPage() {
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [adminDeals, setAdminDeals] = useState<DealMetadata[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const { address } = useAccount();
  const liveDeals = useMemo(() => toDealViews(adminDeals), [adminDeals]);
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
    fetch("/api/admin/deals")
      .then((res) => res.json())
      .then(setAdminDeals)
      .catch(() => setAdminDeals([]));
  }

  return (
    <div>
      <SectionHeader
        eyebrow="Private deals"
        title="Invest in real-world cash flow"
        description="Each deal has isolated accounting, its own risk profile, and revenue-based distributions. No guaranteed APY is implied."
      />

      {dealVault.transaction.status !== "idle" ? (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
          {dealVault.transaction.label}
        </div>
      ) : null}

      <div className="mb-5 flex gap-2">
        <button type="button" onClick={() => setTab("open")} className={`rounded-md px-3 py-2 text-sm font-semibold ${tab === "open" ? "bg-blue-600 text-white" : "border border-[var(--line)]"}`}>
          Open Deals
        </button>
        <button type="button" onClick={() => setTab("closed")} className={`rounded-md px-3 py-2 text-sm font-semibold ${tab === "closed" ? "bg-blue-600 text-white" : "border border-[var(--line)]"}`}>
          Closed Deals
        </button>
      </div>

      <section className="grid gap-5 lg:grid-cols-3">
        {visibleDeals.length === 0 ? (
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-6 text-sm text-[var(--muted)] shadow-sm">
            No {tab} deals yet.
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
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-md border border-[var(--line)] bg-[var(--background)] p-4 text-sm">
              <PreviewRow label="Risk level" value={activeDeal.risk} />
              <PreviewRow label="Yield model" value={activeDeal.model} />
              <PreviewRow label="Target raise" value={formatCurrency(activeTarget, 0)} />
              <PreviewRow label="Total raised" value={formatCurrency(activeRaised, 0)} />
              <PreviewRow label="Term" value={activeDeal.term} />
              <PreviewRow label="Status" value={activeClosed ? "Closed" : "Open"} />
            </div>
            {activeClosed ? (
              <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--background)] p-3 text-sm text-[var(--muted)]">
                This deal is closed. Historical ownership and distributions remain visible, but new investments are disabled.
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
                  className="mt-4 w-full rounded-md border border-[var(--line)] bg-transparent px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
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
                  className="mt-5 w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
                >
                  {dealVault.transaction.status === "pending" ? "Confirming..." : dealVault.transaction.status === "confirmed" ? "Confirmed" : "Confirm investment"}
                </button>
                {formError ? <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">{formError}</p> : null}
              </>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[var(--muted)]">{label}</p>
      <p className="mt-1 font-semibold text-[var(--foreground)]">{value}</p>
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
