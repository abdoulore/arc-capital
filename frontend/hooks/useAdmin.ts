"use client";

import { useAccount } from "wagmi";
import { isAdminWallet } from "@/lib/admin-config";

export function useIsAdmin() {
  const { address, isConnected, status } = useAccount();
  return {
    address,
    isConnected,
    status,
    isAdmin: isAdminWallet(address),
  };
}
