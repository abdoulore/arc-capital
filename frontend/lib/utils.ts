export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatCurrency(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
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

export function bigintToNumber(value: bigint, decimals: number) {
  return Number(value) / 10 ** decimals;
}

export function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

export function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

export function daysUntil(date: string) {
  const ms = new Date(date).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}
