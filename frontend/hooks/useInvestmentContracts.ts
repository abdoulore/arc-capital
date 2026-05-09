"use client";

import { useMemo, useState } from "react";
import { Address, Hash, parseUnits } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import {
  DEAL_VAULT_ABI,
  LONG_TERM_VAULT_ABI,
  LONG_TERM_VAULT_ADDRESS,
  MARKETPLACE_ABI,
  MARKETPLACE_ADDRESS,
  SAMPLE_DEAL_ADDRESS,
  USDC_ABI,
  USDC_ADDRESS,
  VAULT_ABI,
  VAULT_ADDRESS,
} from "@/app/constants";
import { arcTestnet } from "@/lib/network";
import { recordLocalActivity, type DashboardActivity } from "@/hooks/useDashboardData";
import { useTransactionToast } from "@/store/useTransactionToast";
import type { TransactionToastState } from "@/store/useTransactionToast";

export type TransactionState = {
  label: string;
  status: "idle" | "pending" | "confirmed" | "failed";
  error?: string;
  hash?: Hash;
};

type RefetchResult = { refetch: () => Promise<unknown> };
type ActivityPreview = Partial<Pick<DashboardActivity, "amount" | "amountLabel" | "amountUnit" | "secondaryAmount" | "secondaryLabel" | "secondaryUnit" | "verb" | "detail">>;

export function useMonthlyVault() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { addToast, updateToast } = useTransactionToast();
  const [transaction, setTransaction] = useState<TransactionState>({ label: "", status: "idle" });

  const balanceQuery = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { refetchInterval: 8000 },
  });

  const sharesQuery = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "shares",
    args: address ? [address] : undefined,
    query: { refetchInterval: 8000 },
  });

  const pricePerShareQuery = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "pricePerShare",
    query: { refetchInterval: 12000 },
  });

  const totalAssetsQuery = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "totalAssets",
    query: { refetchInterval: 12000 },
  });

  const totalSharesQuery = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "totalShares",
    query: { refetchInterval: 12000 },
  });

  const windowStartQuery = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "withdrawalWindowStart",
    query: { refetchInterval: 12000 },
  });

  const windowDurationQuery = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "withdrawalWindowDuration",
    query: { refetchInterval: 12000 },
  });

  const penaltyBpsQuery = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "penaltyBps",
    query: { refetchInterval: 12000 },
  });

  const withdrawRequestQuery = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "withdrawRequests",
    args: address ? [address] : undefined,
    query: { refetchInterval: 8000 },
  });

  const preview = useMemo(
    () => ({
      gasEstimate: "Estimated at signing",
      gasUsd: "Paid in USDC",
      settlement: "USDC approval then vault deposit",
      chain: arcTestnet.name,
    }),
    []
  );

  const refreshMonthlyVault = async () => {
    await Promise.all([
      balanceQuery.refetch(),
      sharesQuery.refetch(),
      pricePerShareQuery.refetch(),
      totalAssetsQuery.refetch(),
      totalSharesQuery.refetch(),
      windowStartQuery.refetch(),
      windowDurationQuery.refetch(),
      penaltyBpsQuery.refetch(),
      withdrawRequestQuery.refetch(),
    ]);
  };

  async function fundWallet() {
    window.open("https://faucet.circle.com/", "_blank", "noopener,noreferrer");
    addToast({
      title: "Arc Testnet faucet opened",
      message: "Request testnet USDC for Arc Testnet, then refresh your balance.",
      status: "success",
    });
    return true;
  }

  async function deposit(amount: string) {
    const parsed = parseUnits(amount || "0", 6);
    return runTransaction({
      label: "Monthly Vault deposit",
      addToast,
      updateToast,
      publicClient,
      account: address,
      setTransaction,
      steps: [
        async () =>
          writeContractAsync({
            address: USDC_ADDRESS,
            abi: USDC_ABI,
            functionName: "approve",
            args: [VAULT_ADDRESS, parsed],
            gas: await estimateGas(publicClient, address, {
              address: USDC_ADDRESS,
              abi: USDC_ABI,
              functionName: "approve",
              args: [VAULT_ADDRESS, parsed],
            }),
          }),
        async () =>
          writeContractAsync({
            address: VAULT_ADDRESS,
            abi: VAULT_ABI,
            functionName: "deposit",
            args: [parsed],
            gas: await estimateGas(publicClient, address, {
              address: VAULT_ADDRESS,
              abi: VAULT_ABI,
              functionName: "deposit",
              args: [parsed],
            }),
          }),
      ],
      afterSuccess: refreshMonthlyVault,
      activity: {
        amount: parsed.toString(),
        amountUnit: "USDC",
        verb: "deposited",
      },
    });
  }

  async function withdraw(shareAmount: bigint) {
    const pendingShares = withdrawRequestQuery.data?.[0] ?? BigInt(0);
    if (pendingShares > BigInt(0)) {
      return failTransaction("Monthly Vault withdrawal", "You already have a pending withdrawal request. Execute it before starting a new withdrawal.");
    }

    return runTransaction({
      label: "Monthly Vault withdrawal",
      addToast,
      updateToast,
      publicClient,
      account: address,
      setTransaction,
      steps: [
        async () =>
          writeContractAsync({
            address: VAULT_ADDRESS,
            abi: VAULT_ABI,
            functionName: "withdraw",
            args: [shareAmount],
            gas: await estimateGas(publicClient, address, {
              address: VAULT_ADDRESS,
              abi: VAULT_ABI,
              functionName: "withdraw",
              args: [shareAmount],
            }),
          }),
      ],
      afterSuccess: refreshMonthlyVault,
      activity: {
        amount: shareAmount.toString(),
        amountUnit: "shares",
        verb: "withdrawn",
        detail: "Wallet-confirmed direct withdrawal.",
      },
    });
  }

  async function executeWithdraw() {
    const pendingShares = withdrawRequestQuery.data?.[0] ?? BigInt(0);
    if (pendingShares === BigInt(0)) {
      return failTransaction("Monthly Vault withdrawal", "No pending withdrawal request found.");
    }

    return runTransaction({
      label: "Monthly Vault withdrawal",
      addToast,
      updateToast,
      publicClient,
      account: address,
      setTransaction,
      steps: [
        async () =>
          writeContractAsync({
            address: VAULT_ADDRESS,
            abi: VAULT_ABI,
            functionName: "executeWithdraw",
            gas: await estimateGas(publicClient, address, {
              address: VAULT_ADDRESS,
              abi: VAULT_ABI,
              functionName: "executeWithdraw",
            }),
          }),
      ],
      afterSuccess: refreshMonthlyVault,
      activity: {
        amount: pendingShares.toString(),
        amountUnit: "shares",
        verb: "executed",
        detail: "Pending withdrawal executed to wallet.",
      },
    });
  }

  return {
    address,
    usdcBalance: balanceQuery.data,
    shares: sharesQuery.data,
    pricePerShare: pricePerShareQuery.data,
    totalAssets: totalAssetsQuery.data,
    totalShares: totalSharesQuery.data,
    withdrawalWindowStart: windowStartQuery.data,
    withdrawalWindowDuration: windowDurationQuery.data,
    penaltyBps: penaltyBpsQuery.data,
    withdrawRequest: withdrawRequestQuery.data,
    preview,
    transaction,
    fundWallet,
    deposit,
    withdraw,
    executeWithdraw,
    refreshMonthlyVault,
  };

  function failTransaction(label: string, message: string) {
    setTransaction({ label, status: "failed", error: message });
    addToast({ title: `${label} blocked`, message, status: "error" });
    return Promise.resolve(false);
  }
}

export function useLongTermVault() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { addToast, updateToast } = useTransactionToast();
  const [transaction, setTransaction] = useState<TransactionState>({ label: "", status: "idle" });

  const oneYear = useReadContract({
    address: LONG_TERM_VAULT_ADDRESS,
    abi: LONG_TERM_VAULT_ABI,
    functionName: "tranches",
    args: [BigInt(365 * 24 * 60 * 60)],
  });

  const twoYears = useReadContract({
    address: LONG_TERM_VAULT_ADDRESS,
    abi: LONG_TERM_VAULT_ABI,
    functionName: "tranches",
    args: [BigInt(730 * 24 * 60 * 60)],
  });

  const threeYears = useReadContract({
    address: LONG_TERM_VAULT_ADDRESS,
    abi: LONG_TERM_VAULT_ABI,
    functionName: "tranches",
    args: [BigInt(1095 * 24 * 60 * 60)],
  });

  const userPositions = useReadContract({
    address: LONG_TERM_VAULT_ADDRESS,
    abi: LONG_TERM_VAULT_ABI,
    functionName: "getUserPositions",
    args: address ? [address] : undefined,
    query: { refetchInterval: 10000 },
  });
  const positionIds = useMemo(() => [...(userPositions.data ?? [])], [userPositions.data]);
  const positionReads = useReadContracts({
    contracts: positionIds.flatMap((positionId) => [
      {
        address: LONG_TERM_VAULT_ADDRESS,
        abi: LONG_TERM_VAULT_ABI,
        functionName: "positions",
        args: [positionId],
      },
      {
        address: LONG_TERM_VAULT_ADDRESS,
        abi: LONG_TERM_VAULT_ABI,
        functionName: "claimableYield",
        args: [positionId],
      },
    ]),
    query: { enabled: positionIds.length > 0, refetchInterval: 10000 },
  });
  const positions = useMemo(
    () =>
      positionIds.map((positionId, index) => {
        const position = positionReads.data?.[index * 2]?.result as
          | readonly [Address, bigint, bigint, bigint, bigint, bigint, bigint, boolean]
          | undefined;
        const claimableYield = positionReads.data?.[index * 2 + 1]?.result as bigint | undefined;

        return {
          id: positionId,
          principal: position?.[1] ?? BigInt(0),
          duration: position?.[2] ?? BigInt(0),
          apyBps: position?.[3] ?? BigInt(0),
          start: position?.[4] ?? BigInt(0),
          maturity: position?.[5] ?? BigInt(0),
          lastClaim: position?.[6] ?? BigInt(0),
          redeemed: position?.[7] ?? false,
          claimableYield: claimableYield ?? BigInt(0),
          ready: Boolean(position),
        };
      }),
    [positionIds, positionReads.data]
  );

  async function deposit(amount: string, durationDays: number) {
    const parsed = parseUnits(amount || "0", 6);
    const duration = BigInt(durationDays * 24 * 60 * 60);
    return runTransaction({
      label: "Fixed-income deposit",
      addToast,
      updateToast,
      publicClient,
      account: address,
      setTransaction,
      stepLabels: ["Approving...", "Confirming..."],
      steps: [
        () =>
          writeContractAsync({
            address: USDC_ADDRESS,
            abi: USDC_ABI,
            functionName: "approve",
            args: [LONG_TERM_VAULT_ADDRESS, parsed],
          }),
        () =>
          writeContractAsync({
            address: LONG_TERM_VAULT_ADDRESS,
            abi: LONG_TERM_VAULT_ABI,
            functionName: "deposit",
            args: [parsed, duration],
          }),
      ],
      afterSuccess: () => refreshQueries([userPositions, positionReads]),
      activity: {
        amount: parsed.toString(),
        amountUnit: "USDC",
        verb: "locked",
      },
    });
  }

  async function claimYield(positionId: bigint) {
    return runTransaction({
      label: "Fixed-income yield claim",
      addToast,
      updateToast,
      publicClient,
      account: address,
      setTransaction,
      steps: [
        () =>
          writeContractAsync({
            address: LONG_TERM_VAULT_ADDRESS,
            abi: LONG_TERM_VAULT_ABI,
            functionName: "claimYield",
            args: [positionId],
          }),
      ],
      afterSuccess: () => refreshQueries([userPositions, positionReads]),
      activity: {
        amount: (positions.find((position) => position.id === positionId)?.claimableYield ?? BigInt(0)).toString(),
        amountUnit: "USDC",
        verb: "claimed",
        detail: `Position #${positionId.toString()}`,
      },
    });
  }

  return {
    tranches: [oneYear.data, twoYears.data, threeYears.data],
    userPositions: userPositions.data ?? [],
    positions,
    transaction,
    deposit,
    claimYield,
  };
}

export function useDealVault(dealAddress: Address = SAMPLE_DEAL_ADDRESS) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { addToast, updateToast } = useTransactionToast();
  const [transaction, setTransaction] = useState<TransactionState>({ label: "", status: "idle" });

  const totalRaised = useReadContract({
    address: dealAddress,
    abi: DEAL_VAULT_ABI,
    functionName: "totalRaised",
    query: { refetchInterval: 10000 },
  });

  const targetRaise = useReadContract({
    address: dealAddress,
    abi: DEAL_VAULT_ABI,
    functionName: "targetRaise",
  });

  const minRaise = useReadContract({
    address: dealAddress,
    abi: DEAL_VAULT_ABI,
    functionName: "minRaise",
  });

  const closeTime = useReadContract({
    address: dealAddress,
    abi: DEAL_VAULT_ABI,
    functionName: "closeTime",
  });

  const raiseClosed = useReadContract({
    address: dealAddress,
    abi: DEAL_VAULT_ABI,
    functionName: "raiseClosed",
    query: { refetchInterval: 10000 },
  });

  const usdcBalance = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { refetchInterval: 10000 },
  });

  const allowance = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "allowance",
    args: address ? [address, dealAddress] : undefined,
    query: { refetchInterval: 10000 },
  });

  const shareBalance = useReadContract({
    address: dealAddress,
    abi: DEAL_VAULT_ABI,
    functionName: "getShareBalance",
    args: address ? [address] : undefined,
    query: { refetchInterval: 10000 },
  });

  const pendingYield = useReadContract({
    address: dealAddress,
    abi: DEAL_VAULT_ABI,
    functionName: "pendingYield",
    args: address ? [address] : undefined,
    query: { refetchInterval: 10000 },
  });

  const refreshDeal = () => refreshQueries([totalRaised, shareBalance, pendingYield, usdcBalance, allowance, raiseClosed]);

  async function invest(amount: string) {
    const parsed = parseUnits(amount || "0", 6);
    const currentRaised = totalRaised.data ?? BigInt(0);
    const currentTarget = targetRaise.data ?? BigInt(0);
    const userBalance = usdcBalance.data ?? BigInt(0);
    const currentCloseTime = closeTime.data ?? BigInt(0);

    if (raiseClosed.data) {
      return failTransaction("Deal investment", "This deal is closed and no longer accepts investments.");
    }
    if (currentCloseTime > BigInt(0) && BigInt(Math.floor(Date.now() / 1000)) >= currentCloseTime) {
      return failTransaction("Deal investment", "The funding deadline has passed.");
    }
    if (parsed <= BigInt(0)) {
      return failTransaction("Deal investment", "Enter an investment amount greater than 0 USDC.");
    }
    if (userBalance < parsed) {
      return failTransaction("Deal investment", "Your USDC balance is too low for this investment.");
    }
    if (currentTarget > BigInt(0) && currentRaised + parsed > currentTarget) {
      return failTransaction("Deal investment", "This investment would exceed the deal target raise.");
    }

    return runTransaction({
      label: "Deal investment",
      addToast,
      updateToast,
      publicClient,
      account: address,
      setTransaction,
      steps: [
        ...(allowance.data && allowance.data >= parsed
          ? []
          : [
              () =>
                writeContractAsync({
                  address: USDC_ADDRESS,
                  abi: USDC_ABI,
                  functionName: "approve",
                  args: [dealAddress, parsed],
                }),
            ]),
        () =>
          writeContractAsync({
            address: dealAddress,
            abi: DEAL_VAULT_ABI,
            functionName: "invest",
            args: [parsed],
          }),
      ],
      afterSuccess: refreshDeal,
      activity: {
        amount: parsed.toString(),
        amountUnit: "USDC",
        verb: "invested",
        detail: `Deal vault ${shortAddress(dealAddress)}`,
      },
    });
  }

  async function claimYield() {
    const claimable = pendingYield.data ?? BigInt(0);
    return runTransaction({
      label: "Deal revenue claim",
      addToast,
      updateToast,
      publicClient,
      account: address,
      setTransaction,
      steps: [
        () =>
          writeContractAsync({
            address: dealAddress,
            abi: DEAL_VAULT_ABI,
            functionName: "claimYield",
          }),
      ],
      afterSuccess: refreshDeal,
      activity: {
        amount: claimable.toString(),
        amountUnit: "USDC",
        verb: "claimed",
        detail: `Deal vault ${shortAddress(dealAddress)}`,
      },
    });
  }

  return {
    totalRaised: totalRaised.data,
    targetRaise: targetRaise.data,
    minRaise: minRaise.data,
    closeTime: closeTime.data,
    raiseClosed: raiseClosed.data,
    usdcBalance: usdcBalance.data,
    allowance: allowance.data,
    shareBalance: shareBalance.data,
    pendingYield: pendingYield.data,
    transaction,
    invest,
    claimYield,
    refreshDeal,
  };

  function failTransaction(label: string, message: string) {
    setTransaction({ label, status: "failed", error: message });
    addToast({ title: `${label} blocked`, message, status: "error" });
    return Promise.resolve(false);
  }
}

export function useMarketplace() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { addToast, updateToast } = useTransactionToast();
  const [transaction, setTransaction] = useState<TransactionState>({ label: "", status: "idle" });

  const listing = useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: "listings",
    args: [BigInt(0)],
    query: { refetchInterval: 10000 },
  });

  async function createListing(amount: string, price: string, dealAddress: Address = SAMPLE_DEAL_ADDRESS) {
    if (!address) return failMarketplaceTransaction("Marketplace listing", "Connect a wallet before creating a listing.");
    const parsedAmount = BigInt(amount || "0");
    const parsedPrice = parseUnits(price || "0", 6);
    if (parsedAmount <= BigInt(0)) return failMarketplaceTransaction("Marketplace listing", "Enter shares greater than 0.");
    if (parsedPrice <= BigInt(0)) return failMarketplaceTransaction("Marketplace listing", "Enter a price greater than 0 USDC.");

    return runTransaction({
      label: "Marketplace listing",
      addToast,
      updateToast,
      publicClient,
      account: address,
      setTransaction,
      steps: [
        () =>
          writeContractAsync({
            address: dealAddress,
            abi: DEAL_VAULT_ABI,
            functionName: "setApprovalForAll",
            args: [MARKETPLACE_ADDRESS, true],
          }),
        () =>
          writeContractAsync({
            address: MARKETPLACE_ADDRESS,
            abi: MARKETPLACE_ABI,
            functionName: "createListing",
            args: [dealAddress, BigInt(0), parsedAmount, parsedPrice],
          }),
      ],
      afterSuccess: () => refreshQueries([listing]),
      activity: {
        amount: parsedAmount.toString(),
        amountUnit: "shares",
        secondaryAmount: (parsedAmount * parsedPrice).toString(),
        secondaryLabel: "for",
        secondaryUnit: "USDC",
        verb: "listed",
      },
    });
  }

  async function fillListing(amount: string, listingId = BigInt(0), selectedListing = listing.data) {
    if (!address) return failMarketplaceTransaction("Marketplace trade", "Connect a wallet before trading.");
    const current = selectedListing;
    const price = current?.[4] ?? BigInt(0);
    const parsedAmount = BigInt(amount || "0");
    if (parsedAmount <= BigInt(0)) return failMarketplaceTransaction("Marketplace trade", "Enter shares greater than 0.");
    if (price <= BigInt(0)) return failMarketplaceTransaction("Marketplace trade", "Listing price is unavailable. Refresh the orderbook.");

    return runTransaction({
      label: "Marketplace trade",
      addToast,
      updateToast,
      publicClient,
      account: address,
      setTransaction,
      steps: [
        () =>
          writeContractAsync({
            address: USDC_ADDRESS,
            abi: USDC_ABI,
            functionName: "approve",
            args: [MARKETPLACE_ADDRESS, price * parsedAmount],
          }),
        () =>
          writeContractAsync({
            address: MARKETPLACE_ADDRESS,
            abi: MARKETPLACE_ABI,
            functionName: "fillListing",
            args: [listingId, parsedAmount],
          }),
      ],
      afterSuccess: () => refreshQueries([listing]),
      activity: {
        amount: parsedAmount.toString(),
        amountUnit: "shares",
        secondaryAmount: (parsedAmount * price).toString(),
        secondaryLabel: "for",
        secondaryUnit: "USDC",
        verb: "bought",
        detail: `Listing #${listingId.toString()}`,
      },
    });
  }

  async function cancelListing(listingId: bigint) {
    if (!address) return failMarketplaceTransaction("Cancel marketplace listing", "Connect the seller wallet before canceling.");
    return runTransaction({
      label: "Cancel marketplace listing",
      addToast,
      updateToast,
      publicClient,
      account: address,
      setTransaction,
      steps: [
        () =>
          writeContractAsync({
            address: MARKETPLACE_ADDRESS,
            abi: MARKETPLACE_ABI,
            functionName: "cancelListing",
            args: [listingId],
          }),
      ],
      afterSuccess: () => refreshQueries([listing]),
      activity: {
        amount: "0",
        amountUnit: "shares",
        verb: "canceled",
        detail: `Listing #${listingId.toString()}`,
      },
    });
  }

  return {
    address,
    listing: listing.data,
    transaction,
    createListing,
    fillListing,
    cancelListing,
  };

  function failMarketplaceTransaction(label: string, message: string) {
    setTransaction({ label, status: "failed", error: message });
    addToast({ title: `${label} blocked`, message, status: "error" });
    return Promise.resolve(false);
  }
}

async function runTransaction({
  label,
  addToast,
  updateToast,
  publicClient,
  account,
  setTransaction,
  steps,
  stepLabels,
  afterSuccess,
  activity,
}: {
  label: string;
  addToast: TransactionToastState["addToast"];
  updateToast: TransactionToastState["updateToast"];
  publicClient: ReturnType<typeof usePublicClient>;
  account?: Address;
  setTransaction: (state: TransactionState) => void;
  steps: Array<() => Promise<Hash>>;
  stepLabels?: string[];
  afterSuccess?: () => Promise<unknown>;
  activity?: ActivityPreview;
}) {
  if (!publicClient) {
    const error = "Wallet client is not connected to a network.";
    setTransaction({ label, status: "failed", error });
    addToast({ title: `${label} failed`, message: error, status: "error" });
    return false;
  }

  const toastId = addToast({ title: label, message: "Waiting for wallet confirmation.", status: "pending" });
  setTransaction({ label, status: "pending" });

  try {
    let lastHash: Hash | undefined;
    for (const [index, step] of steps.entries()) {
      setTransaction({ label: stepLabels?.[index] ?? label, status: "pending" });
      const nonceBefore =
        account && publicClient
          ? await publicClient.getTransactionCount({ address: account, blockTag: "latest" })
          : undefined;
      const hash = await step();
      lastHash = hash;
      updateToast(toastId, {
        message: `Transaction ${index + 1} of ${steps.length} submitted. Waiting for confirmation.`,
        hash,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      if (account && nonceBefore !== undefined) {
        await waitForNonceAbove(publicClient, account, nonceBefore);
      }
    }

    await afterSuccess?.();
    if (account && lastHash) {
      recordLocalActivity(account, {
        id: `${lastHash}-${label}`,
        timestamp: new Date().toISOString(),
        action: label,
        verb: activity?.verb ?? "confirmed",
        detail: activity?.detail ?? "Wallet-confirmed transaction. Onchain event indexing may appear shortly.",
        hash: lastHash,
        amount: activity?.amount,
        amountLabel: activity?.amountLabel,
        amountUnit: activity?.amountUnit,
        secondaryAmount: activity?.secondaryAmount,
        secondaryLabel: activity?.secondaryLabel,
        secondaryUnit: activity?.secondaryUnit,
      });
    }
    window.dispatchEvent(new CustomEvent("arc:data-refresh"));
    setTransaction({ label, status: "confirmed", hash: lastHash });
    updateToast(toastId, {
      title: `${label} confirmed`,
      message: "Balances and positions have been refreshed.",
      status: "success",
      hash: lastHash,
    });
    window.setTimeout(() => setTransaction({ label: "", status: "idle" }), 2500);
    return true;
  } catch (error) {
    const message = getErrorMessage(error);
    setTransaction({ label, status: "failed", error: message });
    updateToast(toastId, { title: `${label} failed`, message, status: "error" });
    window.setTimeout(() => setTransaction({ label: "", status: "idle" }), 5000);
    return false;
  }
}

async function refreshQueries(queries: RefetchResult[]) {
  await Promise.all(queries.map((query) => query.refetch()));
}

async function waitForNonceAbove(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  account: Address,
  previousNonce: number
) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const nonce = await publicClient.getTransactionCount({ address: account, blockTag: "latest" });
    if (nonce > previousNonce) return;
    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }
}

async function estimateGas(
  publicClient: ReturnType<typeof usePublicClient>,
  account: `0x${string}` | undefined,
  request: Parameters<NonNullable<ReturnType<typeof usePublicClient>>["estimateContractGas"]>[0]
) {
  if (!publicClient || !account) return undefined;
  return publicClient.estimateContractGas({ ...request, account });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Transaction could not be completed.";
}

function shortAddress(address: Address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
