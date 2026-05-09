"use client";

import { useState } from "react";
import { Hash, parseUnits, type Address } from "viem";
import { usePublicClient, useReadContract, useWriteContract } from "wagmi";
import {
  DEAL_FACTORY_ABI,
  DEAL_FACTORY_ADDRESS,
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
  YIELD_ROUTER_ABI,
  YIELD_ROUTER_ADDRESS,
} from "@/app/constants";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useTransactionToast } from "@/store/useTransactionToast";
import type { TransactionToastState } from "@/store/useTransactionToast";

type AdminTxState = {
  label: string;
  status: "idle" | "pending" | "confirmed" | "failed";
  hash?: Hash;
  error?: string;
};

type AdminWriteRequest = Parameters<NonNullable<ReturnType<typeof usePublicClient>>["estimateContractGas"]>[0];

export function useAdminContracts() {
  const { address } = useIsAdmin();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { addToast, updateToast } = useTransactionToast();
  const [transaction, setTransaction] = useState<AdminTxState>({ label: "", status: "idle" });

  const monthlyTVL = useReadContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "totalAssets", query: { refetchInterval: 10000 } });
  const monthlyPricePerShare = useReadContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "pricePerShare", query: { refetchInterval: 10000 } });
  const totalShares = useReadContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "totalShares", query: { refetchInterval: 10000 } });
  const liquidityBuffer = useReadContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "idleBufferBps" });
  const penaltyBps = useReadContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "penaltyBps" });
  const windowStart = useReadContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "withdrawalWindowStart" });
  const windowDuration = useReadContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "withdrawalWindowDuration" });
  const treasury = useReadContract({ address: YIELD_ROUTER_ADDRESS, abi: YIELD_ROUTER_ABI, functionName: "treasury" });
  const dealCount = useReadContract({ address: DEAL_FACTORY_ADDRESS, abi: DEAL_FACTORY_ABI, functionName: "dealCount" });
  const sampleDealClosed = useReadContract({ address: SAMPLE_DEAL_ADDRESS, abi: DEAL_VAULT_ABI, functionName: "raiseClosed", query: { refetchInterval: 10000 } });
  const sampleDealDeployed = useReadContract({ address: SAMPLE_DEAL_ADDRESS, abi: DEAL_VAULT_ABI, functionName: "capitalDeployed", query: { refetchInterval: 10000 } });
  const listing = useReadContract({ address: MARKETPLACE_ADDRESS, abi: MARKETPLACE_ABI, functionName: "listings", args: [BigInt(0)], query: { refetchInterval: 10000 } });

  const refresh = async () => {
    await Promise.all([
      monthlyTVL.refetch(),
      monthlyPricePerShare.refetch(),
      totalShares.refetch(),
      liquidityBuffer.refetch(),
      penaltyBps.refetch(),
      windowStart.refetch(),
      windowDuration.refetch(),
      treasury.refetch(),
      dealCount.refetch(),
      sampleDealClosed.refetch(),
      sampleDealDeployed.refetch(),
      listing.refetch(),
    ]);
  };

  const run = (label: string, steps: Array<() => Promise<Hash>>) =>
    runAdminTransaction({ label, steps, account: address as Address | undefined, publicClient, addToast, updateToast, setTransaction, afterSuccess: refresh });

  return {
    transaction,
    metrics: {
      monthlyTVL: monthlyTVL.data,
      monthlyPricePerShare: monthlyPricePerShare.data,
      totalShares: totalShares.data,
      liquidityBuffer: liquidityBuffer.data,
      penaltyBps: penaltyBps.data,
      windowStart: windowStart.data,
      windowDuration: windowDuration.data,
      treasury: treasury.data,
      dealCount: dealCount.data,
      sampleDealClosed: sampleDealClosed.data,
      sampleDealDeployed: sampleDealDeployed.data,
      listing: listing.data,
    },
    setLiquidityBuffer: (bps: string) =>
      run("Update liquidity reserve", [
        () => writeEstimatedAdminContract({ publicClient, account: address as Address | undefined, writeContractAsync, request: { address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "setIdleBuffer", args: [BigInt(bps || "0")] } }),
      ]),
    setPenalty: (bps: string) =>
      run("Update withdrawal penalty", [
        () => writeEstimatedAdminContract({ publicClient, account: address as Address | undefined, writeContractAsync, request: { address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "setPenalty", args: [BigInt(bps || "0")] } }),
      ]),
    setWithdrawLimit: (bps: string) =>
      run("Update withdrawal limit", [
        () => writeEstimatedAdminContract({ publicClient, account: address as Address | undefined, writeContractAsync, request: { address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "setWithdrawLimit", args: [BigInt(bps || "0")] } }),
      ]),
    configureLongTermTranche: (duration: number, apyBps: string, enabled = true) =>
      run("Configure fixed-income tranche", [
        () => writeEstimatedAdminContract({ publicClient, account: address as Address | undefined, writeContractAsync, request: { address: LONG_TERM_VAULT_ADDRESS, abi: LONG_TERM_VAULT_ABI, functionName: "configureTranche", args: [BigInt(duration), BigInt(apyBps || "0"), enabled] } }),
      ]),
    setLongTermTreasury: (treasuryAddress: Address) =>
      run("Update fixed-income treasury", [
        () => writeEstimatedAdminContract({ publicClient, account: address as Address | undefined, writeContractAsync, request: { address: LONG_TERM_VAULT_ADDRESS, abi: LONG_TERM_VAULT_ABI, functionName: "setTreasury", args: [treasuryAddress] } }),
      ]),
    openWithdrawalWindow: () =>
      run("Open withdrawal window", [
        () => writeEstimatedAdminContract({ publicClient, account: address as Address | undefined, writeContractAsync, request: { address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "setWithdrawalWindow", args: [BigInt(Math.floor(Date.now() / 1000)), BigInt(7 * 24 * 60 * 60)] } }),
      ]),
    setWithdrawalWindow: (startSeconds: bigint, durationSeconds: bigint) =>
      run("Configure withdrawal window", [
        () => writeEstimatedAdminContract({ publicClient, account: address as Address | undefined, writeContractAsync, request: { address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "setWithdrawalWindow", args: [startSeconds, durationSeconds] } }),
      ]),
    updateNAV: (amount: string) =>
      run("Update vault NAV", [
        () => writeEstimatedAdminContract({ publicClient, account: address as Address | undefined, writeContractAsync, request: { address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: "updateNAV", args: [parseUnits(amount || "0", 6)] } }),
      ]),
    injectMonthlyYield: async (amount: string) => {
      const parsedAmount = parseUnits(amount || "0", 6);
      const steps = await buildApprovalSteps(YIELD_ROUTER_ADDRESS, parsedAmount);
      return run("Inject Monthly Vault yield", [
        ...steps,
        () => writeEstimatedAdminContract({ writeContractAsync, request: { address: YIELD_ROUTER_ADDRESS, abi: YIELD_ROUTER_ABI, functionName: "routeYield", args: [VAULT_ADDRESS, parsedAmount, "monthly-vault-yield"] } }),
      ]);
    },
    injectLongTermYield: async (amount: string) => {
      const parsedAmount = parseUnits(amount || "0", 6);
      const steps = await buildApprovalSteps(YIELD_ROUTER_ADDRESS, parsedAmount);
      return run("Fund fixed-income yield reserve", [
        ...steps,
        () => writeEstimatedAdminContract({ writeContractAsync, request: { address: YIELD_ROUTER_ADDRESS, abi: YIELD_ROUTER_ABI, functionName: "routeYield", args: [LONG_TERM_VAULT_ADDRESS, parsedAmount, "fixed-income-yield-reserve"] } }),
      ]);
    },
    createDeal: async (input: { title: string; targetRaise: string; minRaise: string; deadline: string }) => {
      const deadlineSeconds = Math.floor(new Date(input.deadline).getTime() / 1000);
      if (!publicClient || !Number.isFinite(deadlineSeconds)) {
        addToast({ title: "Invalid deadline", message: "Choose a valid funding deadline before creating the deal.", status: "error" });
        return Promise.resolve(false);
      }

      const dealIndex = await publicClient.readContract({
        address: DEAL_FACTORY_ADDRESS,
        abi: DEAL_FACTORY_ABI,
        functionName: "dealCount",
      });
      const ok = await run("Create deal vault", [
        () =>
          writeEstimatedAdminContract({
            publicClient,
            account: address as Address | undefined,
            writeContractAsync,
            request: {
            address: DEAL_FACTORY_ADDRESS,
            abi: DEAL_FACTORY_ABI,
            functionName: "createDeal",
            args: [
              input.title,
              "",
              parseUnits(input.targetRaise || "0", 6),
              parseUnits(input.minRaise || "0", 6),
              parseUnits("1", 6),
              BigInt(deadlineSeconds),
            ],
            },
          }),
      ]);
      if (!ok) return false;
      return publicClient.readContract({
        address: DEAL_FACTORY_ADDRESS,
        abi: DEAL_FACTORY_ABI,
        functionName: "allDeals",
        args: [dealIndex],
      });
    },
    closeDealFunding: (dealAddress: Address = SAMPLE_DEAL_ADDRESS) =>
      run("Close deal funding", [
        () => writeEstimatedAdminContract({ publicClient, account: address as Address | undefined, writeContractAsync, request: { address: dealAddress, abi: DEAL_VAULT_ABI, functionName: "adminCloseRaise" } }),
      ]),
    markDealCapitalDeployed: (dealAddress: Address = SAMPLE_DEAL_ADDRESS) =>
      run("Mark deal capital deployed", [
        () => writeEstimatedAdminContract({ publicClient, account: address as Address | undefined, writeContractAsync, request: { address: dealAddress, abi: DEAL_VAULT_ABI, functionName: "markCapitalDeployed" } }),
      ]),
    distributeDealRevenue: async (amount: string, dealAddress: Address = SAMPLE_DEAL_ADDRESS) => {
      const parsedAmount = parseUnits(amount || "0", 6);
      const steps = await buildApprovalSteps(dealAddress, parsedAmount);
      return run("Distribute deal revenue", [
        ...steps,
        () => writeEstimatedAdminContract({ writeContractAsync, request: { address: dealAddress, abi: DEAL_VAULT_ABI, functionName: "distributeRevenue", args: [parsedAmount] } }),
      ]);
    },
    logActivity: async (action: string, summary: string, hash?: string) => {
      await fetch("/api/admin/activity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, summary, hash, operator: address }),
      });
    },
  };

  async function buildApprovalSteps(spender: Address, amount: bigint) {
    if (!amount) return [];

    if (publicClient && address) {
      const allowance = await publicClient
        .readContract({
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: "allowance",
          args: [address as Address, spender],
        })
        .catch(() => BigInt(0));

      if (allowance >= amount) return [];
    }

    return [
      () =>
        writeEstimatedAdminContract({
          writeContractAsync,
          request: { address: USDC_ADDRESS, abi: USDC_ABI, functionName: "approve", args: [spender, amount] },
        }),
    ];
  }
}

async function writeEstimatedAdminContract({
  writeContractAsync,
  request,
}: {
  publicClient?: ReturnType<typeof usePublicClient>;
  account?: Address;
  writeContractAsync: ReturnType<typeof useWriteContract>["writeContractAsync"];
  request: AdminWriteRequest;
}) {
  return writeContractAsync(request);
}

async function runAdminTransaction({
  label,
  steps,
  account,
  publicClient,
  addToast,
  updateToast,
  setTransaction,
  afterSuccess,
}: {
  label: string;
  steps: Array<() => Promise<Hash>>;
  account?: Address;
  publicClient: ReturnType<typeof usePublicClient>;
  addToast: TransactionToastState["addToast"];
  updateToast: TransactionToastState["updateToast"];
  setTransaction: (state: AdminTxState) => void;
  afterSuccess?: () => Promise<void>;
}) {
  if (!publicClient) return false;

  const toastId = addToast({ title: label, message: "Waiting for operator signature.", status: "pending" });
  setTransaction({ label, status: "pending" });

  try {
    let lastHash: Hash | undefined;
    for (const step of steps) {
      const nonceBefore = account ? await publicClient.getTransactionCount({ address: account, blockTag: "latest" }) : undefined;
      const hash = await step();
      lastHash = hash;
      updateToast(toastId, { message: "Submitted. Waiting for confirmation.", hash });
      await publicClient.waitForTransactionReceipt({ hash });
      if (account && nonceBefore !== undefined) {
        await waitForNonceAbove(publicClient, account, nonceBefore);
      }
    }
    await afterSuccess?.();
    setTransaction({ label, status: "confirmed", hash: lastHash });
    updateToast(toastId, { title: `${label} confirmed`, message: "Admin state refreshed.", status: "success", hash: lastHash });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin transaction failed.";
    setTransaction({ label, status: "failed", error: message });
    updateToast(toastId, { title: `${label} failed`, message, status: "error" });
    return false;
  }
}

async function waitForNonceAbove(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  account: Address,
  previousNonce: number,
) {
  const timeoutAt = Date.now() + 10000;

  while (Date.now() < timeoutAt) {
    const latestNonce = await publicClient.getTransactionCount({ address: account, blockTag: "latest" });
    if (latestNonce > previousNonce) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
