"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type Address } from "viem";
import { AdminButton, AdminHeader, AdminInput, AdminMetric, AdminPanel } from "@/components/admin/admin-ui";
import { useAdminContracts } from "@/hooks/useAdminContracts";
import { getDealSummary, getVisibleDeals, validateDealForm, type DealMetadata } from "@/lib/deal-ui";
import { formatCurrency } from "@/lib/utils";

export default function AdminDealsPage() {
  const admin = useAdminContracts();
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [riskLevel, setRiskLevel] = useState("Moderate");
  const [revenueModel, setRevenueModel] = useState("");
  const [expectedYield, setExpectedYield] = useState("");
  const [payoutSchedule, setPayoutSchedule] = useState("");
  const [targetRaise, setTargetRaise] = useState("");
  const [minRaise, setMinRaise] = useState("");
  const [deadline, setDeadline] = useState("");
  const [metadata, setMetadata] = useState<DealMetadata[]>([]);
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [closeCandidate, setCloseCandidate] = useState<DealMetadata | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/deals").then((res) => res.json()).then(setMetadata).catch(() => setMetadata([]));
  }, []);

  async function createDeal() {
    const validationError = validateDealForm({ title, targetRaise, minRaise, deadline });
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);

    const contractAddress = await admin.createDeal({ title, targetRaise, minRaise, deadline });
    if (contractAddress) {
      const response = await fetch("/api/admin/deals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: String(contractAddress).toLowerCase(),
          contractAddress,
          title,
          subtitle,
          description,
          targetRaise,
          totalRaised: "0",
          ownershipIssued: "0",
          distributions: "0",
          investorCount: 0,
          fundingDeadline: deadline,
          riskLevel,
          revenueModel,
          expectedYield,
          payoutSchedule,
          status: "open",
        }),
      });
      const entry = (await response.json()) as DealMetadata;
      setMetadata((current) => [entry, ...current.filter((deal) => deal.id !== entry.id)]);
      await admin.logActivity("Create deal", `Created ${title}`);
      setTitle("");
      setSubtitle("");
      setDescription("");
      setRevenueModel("");
      setExpectedYield("");
      setPayoutSchedule("");
      setTargetRaise("");
      setMinRaise("");
      setDeadline("");
    }
  }

  async function closeDeal(deal: DealMetadata) {
    if (!deal.contractAddress) return;
    const ok = await admin.closeDealFunding(deal.contractAddress as Address);
    if (!ok) return;

    const closeDate = new Date().toISOString();
    const response = await fetch("/api/admin/deals", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: deal.id, status: "closed", closeDate }),
    });
    if (response.ok) {
      const updated = (await response.json()) as DealMetadata;
      setMetadata((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    }
    setCloseCandidate(null);
    await admin.logActivity("Close deal", `Closed ${deal.title}`);
  }

  const allDeals = metadata;
  const summary = getDealSummary(allDeals);
  const visibleDeals = getVisibleDeals(allDeals, tab);

  return (
    <div>
      <AdminHeader title="Deal management" description="Create isolated deal vaults, manage metadata, close funding, and distribute realized revenue." />
      <div className="grid gap-4 md:grid-cols-3">
        <AdminMetric label="Indexed deals" value={String(summary.total)} />
        <AdminMetric label="Open deals" value={String(summary.open)} />
        <AdminMetric label="Closed deals" value={String(summary.closed)} />
      </div>
      <div className="mt-6 grid gap-6">
        <AdminPanel title="Create deal">
          <div className="grid gap-3">
            <AdminInput value={title} onChange={setTitle} placeholder="Deal title" />
            <AdminInput value={subtitle} onChange={setSubtitle} placeholder="Subtitle" />
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Deal description"
              className="min-h-24 w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <AdminInput value={riskLevel} onChange={setRiskLevel} placeholder="Risk level" />
              <AdminInput value={revenueModel} onChange={setRevenueModel} placeholder="Revenue model" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <AdminInput value={expectedYield} onChange={setExpectedYield} placeholder="Expected yield description" />
              <AdminInput value={payoutSchedule} onChange={setPayoutSchedule} placeholder="Payout schedule / term" />
            </div>
            <AdminInput value={targetRaise} onChange={setTargetRaise} placeholder="Target raise USDC" />
            <AdminInput value={minRaise} onChange={setMinRaise} placeholder="Minimum raise USDC" />
            <AdminInput value={deadline} onChange={setDeadline} type="date" />
            {formError ? <p className="text-sm text-amber-600 dark:text-amber-400">{formError}</p> : null}
            <AdminButton onClick={createDeal}>Deploy deal vault</AdminButton>
          </div>
        </AdminPanel>
      </div>
      <AdminPanel title="Deals">
        <div className="mb-4 flex gap-2">
          <button type="button" onClick={() => setTab("open")} className={`rounded-md px-3 py-2 text-sm font-semibold ${tab === "open" ? "bg-blue-600 text-white" : "border border-[var(--line)]"}`}>
            Open Deals
          </button>
          <button type="button" onClick={() => setTab("closed")} className={`rounded-md px-3 py-2 text-sm font-semibold ${tab === "closed" ? "bg-blue-600 text-white" : "border border-[var(--line)]"}`}>
            Closed Deals
          </button>
        </div>
        <div className="divide-y divide-[var(--line)]">
          {visibleDeals.length === 0 ? <p className="py-6 text-sm text-[var(--muted)]">No {tab} deals. Create a new deal to begin.</p> : null}
          {visibleDeals.map((deal) => (
            <div key={deal.id} className="grid gap-3 py-3 text-sm md:grid-cols-[1fr_auto_auto] md:items-center">
              <Link href={`/admin/deals/${deal.id}`} className="min-w-0">
                <span className="font-medium">{deal.title}</span>
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs text-[var(--muted)] dark:bg-slate-900">{deal.status === "closed" ? "Closed" : "Open"}</span>
                <p className="mt-1 truncate text-xs text-[var(--muted)]">{deal.contractAddress ?? "Seed deal"}</p>
              </Link>
              <span className="text-[var(--muted)]">{formatCurrency(Number(deal.totalRaised ?? 0), 0)} raised</span>
              {deal.status === "closed" ? (
                <span className="text-[var(--muted)]">{deal.closeDate ? new Date(deal.closeDate).toLocaleDateString("en-US") : "Closed"}</span>
              ) : (
                <AdminButton disabled={!deal.contractAddress} onClick={() => setCloseCandidate(deal)}>Close deal</AdminButton>
              )}
            </div>
          ))}
        </div>
      </AdminPanel>
      {closeCandidate ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Close deal funding?</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">This prevents new investments into {closeCandidate.title}. Existing ownership and history stay intact.</p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setCloseCandidate(null)} className="rounded-md border border-[var(--line)] px-4 py-2 text-sm font-semibold">Cancel</button>
              <AdminButton onClick={() => closeDeal(closeCandidate)}>Confirm close</AdminButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
