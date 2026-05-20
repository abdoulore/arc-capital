"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type Address } from "viem";
import { AdminButton, AdminHeader, AdminInput, AdminMetric, AdminPanel } from "@/components/admin/admin-ui";
import { useAdminContracts } from "@/hooks/useAdminContracts";
import { getDealSummary, getVisibleDeals, validateDealForm, type DealMetadata } from "@/lib/deal-ui";
import { formatAddress, formatCurrency, formatDate } from "@/lib/utils";

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
  const [deleteCandidate, setDeleteCandidate] = useState<DealMetadata | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    loadDeals();
  }, []);

  async function loadDeals() {
    try {
      const response = await fetch("/api/v2/deals", { cache: "no-store" });
      const payload = (await response.json()) as {
        openDeals?: V2Deal[];
        closedDeals?: V2Deal[];
      };
      setMetadata([...(payload.openDeals ?? []), ...(payload.closedDeals ?? [])].map(toDealMetadata));
    } catch {
      setMetadata([]);
    }
  }

  async function createDeal() {
    const validationError = validateDealForm({ title, targetRaise, minRaise, deadline });
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);

    const metadataId = slugifyDeal(title);
    const contractAddress = await admin.createDeal({ title, targetRaise, minRaise, deadline, metadataId });
    if (contractAddress) {
      await fetch("/api/v2/deals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dealVaultAddress: contractAddress,
          title,
          subtitle,
          description,
          targetRaiseUsdc: targetRaise,
          minInvestmentUsdc: minRaise,
          fundingDeadline: new Date(deadline).toISOString(),
          riskLevel,
          revenueDistributionModel: revenueModel,
          expectedPayoutSchedule: payoutSchedule,
          status: "open",
          metadata: { expectedYield, metadataId },
        }),
      });
      await admin.logActivity("Create deal", `Created ${title}`);
      await loadDeals();
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
    const response = await fetch("/api/v2/deals", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: deal.id, status: "closed", closedAt: closeDate }),
    });
    if (response.ok) {
      await loadDeals();
    }
    setCloseCandidate(null);
    await admin.logActivity("Close deal", `Closed ${deal.title}`);
  }

  async function deleteDeal(deal: DealMetadata) {
    const response = await fetch("/api/v2/deals", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: deal.id, status: "archived", closedAt: new Date().toISOString() }),
    });
    if (response.ok) {
      setMetadata((current) => current.filter((item) => item.id !== deal.id));
      setDeleteCandidate(null);
      await admin.logActivity("Delete deal metadata", `Removed ${deal.title} from active deal views`);
    }
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
            <div key={deal.id} className="grid gap-3 py-3 text-sm md:grid-cols-[1fr_auto_auto_auto] md:items-center">
              <Link href={`/admin/deals/${deal.id}`} className="min-w-0">
                <span className="font-medium">{deal.title}</span>
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs text-[var(--muted)] dark:bg-slate-900">{deal.status === "closed" ? "Closed" : "Open"}</span>
                <p className="mt-1 truncate text-xs text-[var(--muted)]">{deal.contractAddress ? formatAddress(deal.contractAddress) : "Contract pending"}</p>
              </Link>
              <span className="text-[var(--muted)]">{formatCurrency(Number(deal.totalRaised ?? 0), 0)} raised</span>
              {deal.status === "closed" ? (
                <span className="text-[var(--muted)]">{deal.closeDate ? formatDate(deal.closeDate) : "Closed"}</span>
              ) : (
                <AdminButton disabled={!deal.contractAddress} onClick={() => setCloseCandidate(deal)}>Close deal</AdminButton>
              )}
              <button
                type="button"
                onClick={() => setDeleteCandidate(deal)}
                className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
              >
                Delete from app
              </button>
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
      {deleteCandidate ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Delete deal from app?</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              This archives {deleteCandidate.title} in the backend metadata so it no longer appears in open or closed deal lists. The onchain contract, ownership records, and transaction history remain unchanged.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteCandidate(null)} className="rounded-md border border-[var(--line)] px-4 py-2 text-sm font-semibold">Cancel</button>
              <button
                type="button"
                onClick={() => deleteDeal(deleteCandidate)}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Confirm delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type V2Deal = {
  id: string;
  contractAddress?: Address | null;
  title: string;
  subtitle?: string | null;
  riskLevel?: string | null;
  status: "open" | "closed" | string;
  targetRaiseUsdc?: string | null;
  totalRaisedUsdc: string;
  investorCount: number;
  fundingDeadline?: string | null;
  closedAt?: string | null;
};

function toDealMetadata(deal: V2Deal): DealMetadata {
  return {
    id: deal.id,
    contractAddress: deal.contractAddress ?? undefined,
    title: deal.title,
    subtitle: deal.subtitle ?? undefined,
    targetRaise: deal.targetRaiseUsdc ?? "0",
    totalRaised: deal.totalRaisedUsdc,
    investorCount: deal.investorCount,
    fundingDeadline: deal.fundingDeadline ?? undefined,
    closeDate: deal.closedAt ?? undefined,
    riskLevel: deal.riskLevel ?? undefined,
    status: deal.status === "closed" || deal.status === "archived" ? deal.status : "open",
  };
}

function slugifyDeal(value: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "deal"}-${Date.now()}`;
}
