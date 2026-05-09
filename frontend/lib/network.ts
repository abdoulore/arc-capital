import type { Address } from "viem";

export const ARC_TESTNET_CHAIN_ID = 5_042_002;
export const ARC_TESTNET_RPC_URL =
  process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL ??
  process.env.ARC_TESTNET_RPC_URL ??
  "https://rpc.testnet.arc.network";
export const ARC_TESTNET_EXPLORER_URL = "https://testnet.arcscan.app";
export const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as Address;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export const arcTestnet = {
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_TESTNET_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: ARC_TESTNET_EXPLORER_URL },
  },
  testnet: true,
} as const;

