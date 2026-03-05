import { BTN_DECIMALS } from "@/config/contracts";

/**
 * Format a bigint BTN amount to human-readable string (2 decimal places).
 * e.g., 1_500_000n => "1.50"
 */
export function formatBTN(amount: bigint | undefined | null): string {
  if (amount === undefined || amount === null) return "0.00";
  const divisor = BigInt(10 ** BTN_DECIMALS);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const absFraction = fraction < 0n ? -fraction : fraction;
  const fractionStr = absFraction.toString().padStart(BTN_DECIMALS, "0");
  return `${whole.toLocaleString()}.${fractionStr.slice(0, 2)}`;
}

/**
 * Format a bigint BTN amount with full 6 decimal precision.
 * e.g., 1_500_123n => "1.500123"
 */
export function formatBTNPrecise(amount: bigint | undefined | null): string {
  if (amount === undefined || amount === null) return "0.000000";
  const divisor = BigInt(10 ** BTN_DECIMALS);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const absFraction = fraction < 0n ? -fraction : fraction;
  const fractionStr = absFraction.toString().padStart(BTN_DECIMALS, "0");
  return `${whole.toLocaleString()}.${fractionStr}`;
}

/**
 * Parse a human-readable BTN string to bigint (6 decimals).
 * e.g., "1.5" => 1_500_000n
 */
export function parseBTN(amount: string): bigint {
  if (!amount || amount.trim() === "") return 0n;
  const cleaned = amount.replace(/,/g, "").trim();
  const [whole = "0", fraction = ""] = cleaned.split(".");
  const paddedFraction = fraction
    .padEnd(BTN_DECIMALS, "0")
    .slice(0, BTN_DECIMALS);
  return BigInt(whole + paddedFraction);
}

/**
 * Format a Date or unix timestamp to locale string.
 */
export function formatDate(
  input: Date | number | bigint | undefined | null
): string {
  if (input === undefined || input === null) return "--";
  let date: Date;
  if (input instanceof Date) {
    date = input;
  } else {
    const ts = typeof input === "bigint" ? Number(input) : input;
    if (ts === 0) return "--";
    date = new Date(ts * 1000);
  }
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format seconds remaining into "Xd Xh Xm" countdown string.
 */
export function formatCountdown(secondsRemaining: number): string {
  if (secondsRemaining <= 0) return "Unlocked";
  const days = Math.floor(secondsRemaining / 86400);
  const hours = Math.floor((secondsRemaining % 86400) / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}

/**
 * Truncate an address for display: 0x1234...5678
 */
export function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address || "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Get human-readable tier name.
 */
export function tierName(tier: number | undefined | null): string {
  if (tier === 1) return "Tier 1";
  if (tier === 2) return "Tier 2";
  if (tier === 3) return "Tier 3";
  return "Not Activated";
}

/**
 * Get tier badge color class.
 */
export function tierColor(tier: number | undefined | null): string {
  if (tier === 1) return "bg-blue-600";
  if (tier === 2) return "bg-purple-600";
  if (tier === 3) return "bg-amber-600";
  return "bg-gray-600";
}

/**
 * Build explorer TX URL.
 */
export function txUrl(hash: string): string {
  return `https://sepolia.basescan.org/tx/${hash}`;
}

/**
 * Build explorer address URL.
 */
export function addressUrl(addr: string): string {
  return `https://sepolia.basescan.org/address/${addr}`;
}
