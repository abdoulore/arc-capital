export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatCurrency(value: number, maximumFractionDigits = 2) {
  if (!Number.isFinite(value)) return "Awaiting Live Data";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

export function formatTokenAmount(value: bigint, decimals: number, symbol: string, maximumFractionDigits = 4) {
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = value % divisor;
  const fractionText = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, maximumFractionDigits)
    .replace(/0+$/, "");
  const wholeText = new Intl.NumberFormat("en-US").format(Number(whole));
  return `${wholeText}${fractionText ? `.${fractionText}` : ""} ${symbol}`;
}

export function formatUSDC(value?: bigint | string | number, maximumFractionDigits = 2) {
  if (value === undefined || value === null) return "Awaiting Live Data";
  const raw = typeof value === "bigint" ? value : safeBigInt(value);
  return formatTokenAmount(raw, 6, "USDC", maximumFractionDigits);
}

export function formatToken(value?: bigint | string | number, decimals = 18, symbol = "", maximumFractionDigits = 4) {
  if (value === undefined || value === null) return "Awaiting Live Data";
  const formatted = formatTokenAmount(typeof value === "bigint" ? value : safeBigInt(value), decimals, symbol, maximumFractionDigits);
  return symbol ? formatted : formatted.trim();
}

export function bigintToNumber(value: bigint, decimals: number) {
  return Number(value) / 10 ** decimals;
}

export function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "Awaiting Live Data";
  return `${value.toFixed(2)}%`;
}

export function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

export function formatDate(value?: string | number | bigint | Date) {
  if (value === undefined || value === null) return "Awaiting Live Data";
  const date =
    value instanceof Date
      ? value
      : typeof value === "bigint"
        ? new Date(Number(value) * 1000)
        : typeof value === "number"
          ? new Date(value * 1000)
          : new Date(value);
  if (Number.isNaN(date.getTime())) return "Awaiting Live Data";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatAddress(address?: string, prefix = 6, suffix = 4) {
  if (!address) return "Awaiting Live Data";
  if (address.length <= prefix + suffix + 3) return address;
  return `${address.slice(0, prefix)}...${address.slice(-suffix)}`;
}

export function daysUntil(date: string) {
  const ms = new Date(date).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function safeBigInt(value: string | number) {
  try {
    if (typeof value === "number") return BigInt(Math.trunc(value));
    return BigInt(value || "0");
  } catch {
    return BigInt(0);
  }
}
