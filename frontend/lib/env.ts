import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_EXPLORER_URL, ARC_TESTNET_RPC_URL } from "./arc";

export const publicEnv = Object.freeze({
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "Arc Capital",
  chainId: numberFromEnv("NEXT_PUBLIC_CHAIN_ID", ARC_TESTNET_CHAIN_ID),
  arcRpcUrl: ARC_TESTNET_RPC_URL,
  arcExplorerUrl: ARC_TESTNET_EXPLORER_URL,
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
});

export const serverEnv = Object.freeze({
  postgresUrl: process.env.POSTGRES_URL,
  circleApiKey: process.env.CIRCLE_API_KEY,
  circleEntitySecret: process.env.CIRCLE_ENTITY_SECRET,
  adminWallets: parseList(process.env.ADMIN_WALLETS),
});

export function requireServerEnv(name: keyof typeof serverEnv) {
  const value = serverEnv[name];
  if (!value || (Array.isArray(value) && value.length === 0)) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return value;
}

function numberFromEnv(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseList(value?: string) {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
}
