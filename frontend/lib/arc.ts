import type { Chain } from "viem";

export const ARC_TESTNET_CHAIN_ID = 5_042_002;
export const ARC_TESTNET_CHAIN_ID_HEX = "0x4cef52";
export const ARC_TESTNET_RPC_URL =
  process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL ??
  process.env.NEXT_PUBLIC_ARC_RPC_URL ??
  "https://rpc.testnet.arc.network";
export const ARC_TESTNET_EXPLORER_URL =
  process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? "https://testnet.arcscan.app";

export const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
export const ARC_USDC_DECIMALS = 6;
export const ARC_NATIVE_USDC_DECIMALS = 18;

export const arcTestnetV2 = {
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: ARC_NATIVE_USDC_DECIMALS,
  },
  rpcUrls: {
    default: { http: [ARC_TESTNET_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: ARC_TESTNET_EXPLORER_URL },
  },
  testnet: true,
} as const satisfies Chain;

export function getArcExplorerTxUrl(hash?: string) {
  if (!hash) return undefined;
  return `${ARC_TESTNET_EXPLORER_URL}/tx/${hash}`;
}

export function getArcExplorerAddressUrl(address?: string) {
  if (!address) return undefined;
  return `${ARC_TESTNET_EXPLORER_URL}/address/${address}`;
}

export function isArcTestnetChain(chainId?: number) {
  return chainId === ARC_TESTNET_CHAIN_ID;
}
