"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { type Address } from "viem";
import { AdminButton, AdminHeader, AdminPanel } from "@/components/admin/admin-ui";
import { useAdminContracts } from "@/hooks/useAdminContracts";
import { formatCurrency } from "@/lib/utils";

type AdminDealMetadata = {
  id: string;
  contractAddress?: string;
  title: string;
  targetRaise?: string;
  totalRaised?: string;
  ownershipIssued?: string;
  distributions?: string;
  investorCount?: number;
  closeDate?: string;
  riskLevel?: string;
  status?: "open" | "closed";
  revenueModel?: string;
};

export default function AdminDealDetailPage() {
  const params = useParams<{ dealId: string }>();
  const admin = useAdminContracts();
  const [metadata, setMetadata] = useState<AdminDealMetadata[]>([]);
  const deal = metadata.find((item) => item.id === params.dealId);
  const status = deal?.status ?? "open";

  useEffect(() => {
    fetch("/api/admin/deals").then((res) => res.json()).then(setMetadata).catch(() => setMetadata([]));
  }, []);

  async function closeDeal() {
    if (!deal?.contractAddress) return;
    const ok = await admin.closeDealFunding(deal.contractAddress as Address);
    if (!ok) return;
    const closeDate = new Date().toISOString();
    const response = await fetch("/api/admin/deals", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: deal.id, status: "closed", closeDate }),
    });
    const updated = (await response.json()) as AdminDealMetadata;
    setMetadata((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    await admin.logActivity("Close deal", `Closed ${deal.title}`);
  }

  return (
    <div>
      <AdminHeader title={deal?.title ?? "Deal not found"} description="Investor ownership, funding history, distributions, and treasury movement controls." />
      <div className="grid gap-6 lg:grid-cols-2">
        <AdminPanel title="Deal metrics">
          <div className="grid gap-3 text-sm">
            <Row label="Status" value={status === "closed" ? "Closed" : "Open"} />
            <Row label="Target raise" value={deal?.targetRaise ? formatCurrency(Number(deal.targetRaise), 0) : "Awaiting Live Data"} />
            <Row label="Raised" value={deal?.totalRaised ? formatCurrency(Number(deal.totalRaised), 0) : "Awaiting Live Data"} />
            <Row label="Risk" value={deal?.riskLevel ?? "Moderate"} />
            <Row label="Yield model" value={deal?.revenueModel ?? "Revenue share"} />
            <Row label="Contract" value={deal?.contractAddress ?? "Seed deal"} />
          </div>
        </AdminPanel>
        <AdminPanel title="Admin actions">
          <div className="flex flex-wrap gap-3">
            <AdminButton disabled={!deal?.contractAddress || status === "closed"} onClick={closeDeal}>
              {status === "closed" ? "Funding closed" : "Close funding"}
            </AdminButton>
            <AdminButton disabled={!deal?.contractAddress || status !== "closed"} onClick={() => admin.markDealCapitalDeployed(deal?.contractAddress as Address)}>
              Mark capital deployed
            </AdminButton>
            <AdminButton onClick={() => admin.logActivity("Upload report", `Report uploaded for ${deal?.title ?? params.dealId}`)}>Log report upload</AdminButton>
            <AdminButton onClick={() => admin.logActivity("Pause trading", `Trading pause requested for ${deal?.title ?? params.dealId}`)}>Log trading pause</AdminButton>
          </div>
        </AdminPanel>
      </div>
      <AdminPanel title="Ownership breakdown">
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <Row label="Investors" value={String(deal?.investorCount ?? 0)} />
          <Row label="Ownership issued" value={deal?.ownershipIssued ?? "0 shares"} />
          <Row label="Distributions" value={deal?.distributions ? formatCurrency(Number(deal.distributions), 2) : "Awaiting Live Data"} />
          <Row label="Close date" value={deal?.closeDate ? new Date(deal.closeDate).toLocaleString("en-US") : "Open"} />
        </div>
      </AdminPanel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--line)] p-3">
      <p className="text-[var(--muted)]">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
