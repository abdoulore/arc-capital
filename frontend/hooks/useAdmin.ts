"use client";

import { useAccount } from "wagmi";
import { isAdminWallet } from "@/lib/admin-config";

export function useIsAdmin() {
  const { address, isConnected } = useAccount();
  return {
    address,
    isConnected,
    isAdmin: isAdminWallet(address),
  };
}
