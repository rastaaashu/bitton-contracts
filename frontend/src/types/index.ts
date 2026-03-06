// ─── Address type ───
export type Address = `0x${string}`;

// ─── Vault Tiers ───
export type VaultTier = 0 | 1 | 2 | 3; // 0 = none, 1 = T1, 2 = T2, 3 = T3

// ─── Staking Program Types ───
export type ProgramType = 0 | 1; // 0 = Short (30d), 1 = Long (180d)

// ─── Stake Info (matches contract struct) ───
export interface StakeInfo {
  amount: bigint;
  startTime: bigint;
  programType: number; // 0 = Short (30d), 1 = Long (180d)
  lastRewardTime: bigint;
  active: boolean;
}

// ─── User Dashboard ───
export interface UserDashboard {
  btnBalance: bigint;
  usdtBalance: bigint;
  vaultActive: boolean;
  vaultTier: VaultTier;
  totalStaked: bigint;
  withdrawableBalance: bigint;
  vestedBalance: bigint;
  pendingRelease: bigint;
  pendingRewards: bigint;
  stakes: StakeInfo[];
}

// ─── Referral Info ───
export interface ReferralInfo {
  referrer: Address | null;
  downline: Address[];
  downlineCount: bigint;
  isQualified: boolean;
}

// ─── Tier Configuration ───
export interface TierConfig {
  id: VaultTier;
  name: string;
  feeUSD: number; // in dollars
  feeRaw: bigint; // 6 decimal USDT
  multiplier: number; // 1.0, 1.1, 1.2
  multiplierInt: number; // 10, 11, 12 (divide by 10)
  matchingLevels: number; // 3, 5, 10
  color: string;
}

// ─── Program Configuration ───
export interface ProgramConfig {
  type: ProgramType;
  name: string;
  lockDays: number;
  lockSeconds: number;
  dailyRate: number; // 0.005 = 0.5%
  multiplierNote: string;
  earlyExitAllowed: boolean;
  earlyExitPenaltyBps: number; // 1500 = 15%
}

// ─── Matching Bonus Level ───
export interface MatchingLevel {
  level: number;
  bps: number; // basis points
  percentage: string; // human readable
}

// ─── Transaction History Entry ───
export interface HistoryEntry {
  type: string;
  amount: string;
  date: string;
  txHash: string;
  details?: string;
}

// ─── Write Hook Return ───
export interface WriteHookReturn {
  write: (() => void) | undefined;
  writeAsync: (() => Promise<`0x${string}`>) | undefined;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
  hash: `0x${string}` | undefined;
  reset: () => void;
}
