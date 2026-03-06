import type { TierConfig, ProgramConfig, MatchingLevel, VaultTier } from "@/types";

// ─── Chain ───
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_EXPLORER = "https://sepolia.basescan.org";

// ─── Tier Configurations ───
export const TIER_CONFIGS: Record<1 | 2 | 3, TierConfig> = {
  1: {
    id: 1 as VaultTier,
    name: "Tier 1",
    feeUSD: 25,
    feeRaw: BigInt(25_000_000), // 25 USDT (6 decimals)
    multiplier: 1.0,
    multiplierInt: 10,
    matchingLevels: 3,
    color: "blue",
  },
  2: {
    id: 2 as VaultTier,
    name: "Tier 2",
    feeUSD: 50,
    feeRaw: BigInt(50_000_000), // 50 USDT (6 decimals)
    multiplier: 1.1,
    multiplierInt: 11,
    matchingLevels: 5,
    color: "purple",
  },
  3: {
    id: 3 as VaultTier,
    name: "Tier 3",
    feeUSD: 100,
    feeRaw: BigInt(100_000_000), // 100 USDT (6 decimals)
    multiplier: 1.2,
    multiplierInt: 12,
    matchingLevels: 10,
    color: "amber",
  },
};

// ─── Program Configurations ───
export const PROGRAM_CONFIGS: Record<0 | 1, ProgramConfig> = {
  0: {
    type: 0,
    name: "Short Staking",
    lockDays: 30,
    lockSeconds: 30 * 24 * 60 * 60,
    dailyRate: 0.005,
    multiplierNote: "Tier multiplier (1.0x / 1.1x / 1.2x)",
    earlyExitAllowed: true,
    earlyExitPenaltyBps: 1500,
  },
  1: {
    type: 1,
    name: "Long Staking",
    lockDays: 180,
    lockSeconds: 180 * 24 * 60 * 60,
    dailyRate: 0.005,
    multiplierNote: "Fixed 1.2x multiplier",
    earlyExitAllowed: false,
    earlyExitPenaltyBps: 0,
  },
};

// ─── Matching Bonus Percentages (by level, 1-indexed) ───
export const MATCHING_LEVELS: MatchingLevel[] = [
  { level: 1, bps: 1000, percentage: "10%" },
  { level: 2, bps: 700, percentage: "7%" },
  { level: 3, bps: 500, percentage: "5%" },
  { level: 4, bps: 400, percentage: "4%" },
  { level: 5, bps: 300, percentage: "3%" },
  { level: 6, bps: 200, percentage: "2%" },
  { level: 7, bps: 200, percentage: "2%" },
  { level: 8, bps: 100, percentage: "1%" },
  { level: 9, bps: 100, percentage: "1%" },
  { level: 10, bps: 100, percentage: "1%" },
];

// ─── Misc Constants ───
export const DIRECT_BONUS_BPS = 500; // 5%
export const MIN_PERSONAL_STAKE = BigInt(500_000_000); // 500 BTN (6 decimals)
export const VESTING_DAILY_RATE = 0.005; // 0.5% per day
export const SETTLEMENT_WITHDRAWABLE_PCT = 10;
export const SETTLEMENT_VESTING_PCT = 90;
export const EARLY_EXIT_PENALTY_BPS = 1500; // 15%

// ─── Explorer Helpers ───
export function txUrl(hash: string): string {
  return `${BASE_SEPOLIA_EXPLORER}/tx/${hash}`;
}

export function addressUrl(addr: string): string {
  return `${BASE_SEPOLIA_EXPLORER}/address/${addr}`;
}

// ─── API Base URL ───
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
