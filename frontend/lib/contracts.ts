import type { Address } from "viem";
import { ARC_USDC_ADDRESS } from "./arc";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export type ArcCapitalContractName =
  | "usdc"
  | "monthlyVault"
  | "longTermVault"
  | "vaultFactory"
  | "dealFactory"
  | "sampleDeal"
  | "marketplace"
  | "yieldRouter"
  | "navOracle"
  | "monthlyVaultV2"
  | "longTermVaultV2"
  | "dealFactoryV2"
  | "marketplaceV2";

const ADDRESS_ENV_KEYS: Record<ArcCapitalContractName, string> = {
  usdc: "NEXT_PUBLIC_USDC_ADDRESS",
  monthlyVault: "NEXT_PUBLIC_VAULT_ADDRESS",
  longTermVault: "NEXT_PUBLIC_LONG_TERM_VAULT_ADDRESS",
  vaultFactory: "NEXT_PUBLIC_VAULT_FACTORY_ADDRESS",
  dealFactory: "NEXT_PUBLIC_DEAL_FACTORY_ADDRESS",
  sampleDeal: "NEXT_PUBLIC_SAMPLE_DEAL_ADDRESS",
  marketplace: "NEXT_PUBLIC_MARKETPLACE_ADDRESS",
  yieldRouter: "NEXT_PUBLIC_YIELD_ROUTER_ADDRESS",
  navOracle: "NEXT_PUBLIC_NAV_ORACLE_ADDRESS",
  monthlyVaultV2: "NEXT_PUBLIC_MONTHLY_VAULT_V2_ADDRESS",
  longTermVaultV2: "NEXT_PUBLIC_LONG_TERM_VAULT_V2_ADDRESS",
  dealFactoryV2: "NEXT_PUBLIC_DEAL_FACTORY_V2_ADDRESS",
  marketplaceV2: "NEXT_PUBLIC_MARKETPLACE_V2_ADDRESS",
};

const FALLBACK_ADDRESSES: Partial<Record<ArcCapitalContractName, Address>> = {
  usdc: ARC_USDC_ADDRESS as Address,
};

export const arcCapitalContracts = Object.freeze({
  usdc: publicContractAddress("usdc"),
  monthlyVault: publicContractAddress("monthlyVault"),
  longTermVault: publicContractAddress("longTermVault"),
  vaultFactory: publicContractAddress("vaultFactory"),
  dealFactory: publicContractAddress("dealFactory"),
  sampleDeal: publicContractAddress("sampleDeal"),
  marketplace: publicContractAddress("marketplace"),
  yieldRouter: publicContractAddress("yieldRouter"),
  navOracle: publicContractAddress("navOracle"),
  monthlyVaultV2: publicContractAddress("monthlyVaultV2", publicContractAddress("monthlyVault")),
  longTermVaultV2: publicContractAddress("longTermVaultV2", publicContractAddress("longTermVault")),
  dealFactoryV2: publicContractAddress("dealFactoryV2", publicContractAddress("dealFactory")),
  marketplaceV2: publicContractAddress("marketplaceV2", publicContractAddress("marketplace")),
});

export function publicContractAddress(name: ArcCapitalContractName, fallback = FALLBACK_ADDRESSES[name] ?? ZERO_ADDRESS) {
  const value = process.env[ADDRESS_ENV_KEYS[name]]?.trim();
  return isAddressLike(value) ? (value as Address) : fallback;
}

export function isConfiguredAddress(address?: string): address is Address {
  return isAddressLike(address) && address.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
}

function isAddressLike(value?: string): value is Address {
  return Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value));
}
