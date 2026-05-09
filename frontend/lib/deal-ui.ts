import type { Address } from "viem";

export type DealStatus = "open" | "closed";

export type DealMetadata = {
  id: string;
  contractAddress?: Address;
  title: string;
  subtitle?: string;
  description?: string;
  category?: string;
  targetRaise?: string;
  totalRaised?: string;
  ownershipIssued?: string;
  distributions?: string;
  investorCount?: number;
  fundingDeadline?: string;
  closeDate?: string;
  riskLevel?: string;
  revenueModel?: string;
  payoutSchedule?: string;
  expectedYield?: string;
  status?: DealStatus;
};

export type DealView = {
  id: string;
  contractAddress?: Address;
  title: string;
  description: string;
  risk: string;
  targetRaise: number;
  raised: number;
  model: string;
  term: string;
  expectedYield: string;
  status: DealStatus;
  closeDate?: string;
};

export function groupDeals<T extends { status?: DealStatus }>(deals: T[]) {
  const open = deals.filter((deal) => deal.status !== "closed");
  const closed = deals.filter((deal) => deal.status === "closed");
  return { open, closed };
}

export function getVisibleDeals<T extends { status?: DealStatus }>(deals: T[], tab: DealStatus) {
  const grouped = groupDeals(deals);
  return tab === "open" ? grouped.open : grouped.closed;
}

export function getDealSummary(deals: Array<{ status?: DealStatus }>) {
  const grouped = groupDeals(deals);
  return {
    total: deals.length,
    open: grouped.open.length,
    closed: grouped.closed.length,
  };
}

export function toDealViews(deals: DealMetadata[]): DealView[] {
  return deals.map((deal) => {
    const deadlineMs = parseDeadlineMs(deal.fundingDeadline);
    const deadlinePassed = Boolean(deadlineMs && deadlineMs <= Date.now());
    const status = deal.status === "closed" || deadlinePassed ? "closed" : "open";

    return {
      id: deal.id,
      contractAddress: deal.contractAddress,
      title: deal.title,
      description: deal.description ?? deal.subtitle ?? "Deal information pending admin update.",
      risk: deal.riskLevel ?? "Pending",
      targetRaise: Number(deal.targetRaise ?? 0),
      raised: Number(deal.totalRaised ?? 0),
      model: deal.revenueModel ?? "Pending Integration",
      term: deal.payoutSchedule ?? (deal.fundingDeadline ? `Funding until ${deal.fundingDeadline}` : "Pending Integration"),
      expectedYield: deal.expectedYield ?? "Pending Integration",
      status,
      closeDate: status === "closed" ? deal.closeDate ?? (deadlineMs ? new Date(deadlineMs).toISOString() : undefined) : deal.closeDate,
    };
  });
}

export function validateDealForm(input: { title: string; targetRaise: string; minRaise: string; deadline: string }) {
  const title = input.title.trim();
  const targetRaise = Number(input.targetRaise);
  const minRaise = Number(input.minRaise);
  const deadlineMs = new Date(input.deadline).getTime();

  if (!title) return "Enter a deal title.";
  if (!Number.isFinite(targetRaise) || targetRaise <= 0) return "Enter a target raise greater than 0 USDC.";
  if (!Number.isFinite(minRaise) || minRaise <= 0) return "Enter a minimum raise greater than 0 USDC.";
  if (minRaise > targetRaise) return "Minimum raise cannot exceed target raise.";
  if (!Number.isFinite(deadlineMs)) return "Choose a valid funding deadline.";
  if (deadlineMs <= Date.now()) return "Funding deadline must be in the future.";
  return null;
}

function parseDeadlineMs(deadline?: string) {
  if (!deadline) return undefined;
  const value = new Date(deadline).getTime();
  return Number.isFinite(value) ? value : undefined;
}

export function validateInvestmentDisplay(input: {
  amount: string;
  isClosed: boolean;
  targetRaise: number;
  raised: number;
  hasContract?: boolean;
}) {
  const amount = Number(input.amount);
  if (input.isClosed) return "This deal is closed and no longer accepts investments.";
  if (!input.hasContract) return "Deal contract connection is pending.";
  if (!Number.isFinite(amount) || amount <= 0) return "Enter an investment amount greater than 0 USDC.";
  if (input.targetRaise > 0 && input.raised + amount > input.targetRaise) return "This investment would exceed the deal target raise.";
  return null;
}
