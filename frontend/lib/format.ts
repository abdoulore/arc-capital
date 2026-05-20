import { formatUnits, parseUnits } from "viem";
import { ARC_USDC_DECIMALS } from "./arc";

const PENDING_LABEL = "Awaiting Live Data";

export function formatUSDC(value?: bigint | string | number | null, maximumFractionDigits = 2) {
  if (value === undefined || value === null || value === "") return PENDING_LABEL;
  const decimalValue = typeof value === "bigint" ? Number(formatUnits(value, ARC_USDC_DECIMALS)) : Number(value);
  if (!Number.isFinite(decimalValue)) return PENDING_LABEL;
  return `${formatNumber(decimalValue, maximumFractionDigits, maximumFractionDigits)} USDC`;
}

export function parseUSDC(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return BigInt(0);
  return parseUnits(normalized, ARC_USDC_DECIMALS);
}

export function formatToken(value?: bigint | string | number | null, decimals = 18, symbol = "", maximumFractionDigits = 4) {
  if (value === undefined || value === null || value === "") return PENDING_LABEL;
  const decimalValue = typeof value === "bigint" ? Number(formatUnits(value, decimals)) : Number(value);
  if (!Number.isFinite(decimalValue)) return PENDING_LABEL;
  const formatted = formatNumber(decimalValue, 0, maximumFractionDigits);
  return symbol ? `${formatted} ${symbol}` : formatted;
}

export function formatPercent(value?: number | bigint | string | null, fractionDigits = 2) {
  if (value === undefined || value === null || value === "") return PENDING_LABEL;
  const numeric = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isFinite(numeric)) return PENDING_LABEL;
  return `${numeric.toFixed(fractionDigits)}%`;
}

export function formatBps(value?: number | bigint | string | null, fractionDigits = 2) {
  if (value === undefined || value === null || value === "") return PENDING_LABEL;
  const numeric = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isFinite(numeric)) return PENDING_LABEL;
  return `${(numeric / 100).toFixed(fractionDigits)}%`;
}

export function formatDate(value?: string | number | bigint | Date | null) {
  if (value === undefined || value === null || value === "") return PENDING_LABEL;
  const date =
    value instanceof Date
      ? value
      : typeof value === "bigint"
        ? new Date(Number(value) * 1000)
        : typeof value === "number"
          ? new Date(value < 10_000_000_000 ? value * 1000 : value)
          : new Date(value);
  if (Number.isNaN(date.getTime())) return PENDING_LABEL;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function formatAddress(address?: string | null, prefix = 6, suffix = 4) {
  if (!address) return PENDING_LABEL;
  if (address.length <= prefix + suffix + 3) return address;
  return `${address.slice(0, prefix)}...${address.slice(-suffix)}`;
}

export function formatNumber(value?: number | null, minimumFractionDigits = 0, maximumFractionDigits = 2) {
  if (value === undefined || value === null || !Number.isFinite(value)) return PENDING_LABEL;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}
