"use client";

import { useReadContract, useAccount } from "wagmi";
import { CONTRACTS } from "@/config/contracts";
import BTNTokenABI from "@/abi/BTNToken.json";
import VaultManagerABI from "@/abi/VaultManager.json";
import StakingVaultABI from "@/abi/StakingVault.json";
import RewardEngineABI from "@/abi/RewardEngine.json";
import VestingPoolABI from "@/abi/VestingPool.json";
import WithdrawalWalletABI from "@/abi/WithdrawalWallet.json";
import BonusEngineABI from "@/abi/BonusEngine.json";

const btnAbi = BTNTokenABI.abi as readonly unknown[];
const vmAbi = VaultManagerABI.abi as readonly unknown[];
const svAbi = StakingVaultABI.abi as readonly unknown[];
const reAbi = RewardEngineABI.abi as readonly unknown[];
const vpAbi = VestingPoolABI.abi as readonly unknown[];
const wwAbi = WithdrawalWalletABI.abi as readonly unknown[];
const beAbi = BonusEngineABI.abi as readonly unknown[];

// ─── BTN Balance ───
export function useBTNBalance() {
  const { address } = useAccount();
  return useReadContract({
    address: CONTRACTS.btnToken,
    abi: btnAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10000 },
  });
}

// ─── USDT Balance ───
export function useUSDTBalance() {
  const { address } = useAccount();
  return useReadContract({
    address: CONTRACTS.usdtToken,
    abi: btnAbi, // same ERC20 interface
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10000 },
  });
}

// ─── Vault Status ───
export function useVaultStatus() {
  const { address } = useAccount();
  const active = useReadContract({
    address: CONTRACTS.vaultManager,
    abi: vmAbi,
    functionName: "isVaultActive",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const tier = useReadContract({
    address: CONTRACTS.vaultManager,
    abi: vmAbi,
    functionName: "getUserTier",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  return {
    isActive: active.data as boolean | undefined,
    tier: tier.data as number | undefined,
    isLoading: active.isLoading || tier.isLoading,
    refetch: () => {
      active.refetch();
      tier.refetch();
    },
  };
}

// ─── Get BTN amount for USD (oracle conversion) ───
export function useBTNAmountForUSD(feeUSD: bigint) {
  return useReadContract({
    address: CONTRACTS.vaultManager,
    abi: vmAbi,
    functionName: "getBTNAmountForUSD",
    args: [feeUSD],
    query: { enabled: feeUSD > 0n },
  });
}

// ─── Stakes ───
export function useStakes() {
  const { address } = useAccount();
  return useReadContract({
    address: CONTRACTS.stakingVault,
    abi: svAbi,
    functionName: "getStakes",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15000 },
  });
}

// ─── Total Staked (user) ───
export function useTotalStaked() {
  const { address } = useAccount();
  return useReadContract({
    address: CONTRACTS.stakingVault,
    abi: svAbi,
    functionName: "getUserTotalStaked",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15000 },
  });
}

// ─── Global Total Staked ───
export function useGlobalTotalStaked() {
  return useReadContract({
    address: CONTRACTS.stakingVault,
    abi: svAbi,
    functionName: "totalStaked",
    query: { refetchInterval: 30000 },
  });
}

// ─── Pending Rewards per stake ───
export function usePendingRewardsForStake(stakeIndex: number) {
  const { address } = useAccount();
  return useReadContract({
    address: CONTRACTS.stakingVault,
    abi: svAbi,
    functionName: "getPendingRewards",
    args: address ? [address, BigInt(stakeIndex)] : undefined,
    query: { enabled: !!address, refetchInterval: 15000 },
  });
}

// ─── Withdrawable Balance ───
export function useWithdrawableBalance() {
  const { address } = useAccount();
  return useReadContract({
    address: CONTRACTS.withdrawalWallet,
    abi: wwAbi,
    functionName: "getWithdrawableBalance",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10000 },
  });
}

// ─── Vested Balance ───
export function useVestedBalance() {
  const { address } = useAccount();
  const balance = useReadContract({
    address: CONTRACTS.vestingPool,
    abi: vpAbi,
    functionName: "getVestedBalance",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10000 },
  });
  const pending = useReadContract({
    address: CONTRACTS.vestingPool,
    abi: vpAbi,
    functionName: "getPendingRelease",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10000 },
  });
  const lastRelease = useReadContract({
    address: CONTRACTS.vestingPool,
    abi: vpAbi,
    functionName: "lastReleaseTime",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  return {
    vestedBalance: balance.data as bigint | undefined,
    pendingRelease: pending.data as bigint | undefined,
    lastReleaseTime: lastRelease.data as bigint | undefined,
    isLoading: balance.isLoading || pending.isLoading,
    refetch: () => {
      balance.refetch();
      pending.refetch();
      lastRelease.refetch();
    },
  };
}

// ─── Pending Rewards (total from RewardEngine) ───
export function usePendingRewards() {
  const { address } = useAccount();
  return useReadContract({
    address: CONTRACTS.rewardEngine,
    abi: reAbi,
    functionName: "getTotalPending",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15000 },
  });
}

// ─── Last Settlement Time ───
export function useLastSettlementTime() {
  const { address } = useAccount();
  return useReadContract({
    address: CONTRACTS.rewardEngine,
    abi: reAbi,
    functionName: "lastSettlementTime",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
}

// ─── Reward Pool Balance ───
export function useRewardPoolBalance() {
  return useReadContract({
    address: CONTRACTS.rewardEngine,
    abi: reAbi,
    functionName: "rewardPoolBalance",
    query: { refetchInterval: 30000 },
  });
}

// ─── Referral Info ───
export function useReferralInfo() {
  const { address } = useAccount();
  const referrer = useReadContract({
    address: CONTRACTS.bonusEngine,
    abi: beAbi,
    functionName: "getReferrer",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const downline = useReadContract({
    address: CONTRACTS.bonusEngine,
    abi: beAbi,
    functionName: "getDownline",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const downlineCount = useReadContract({
    address: CONTRACTS.bonusEngine,
    abi: beAbi,
    functionName: "getDownlineCount",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  return {
    referrer: referrer.data as `0x${string}` | undefined,
    downline: downline.data as `0x${string}`[] | undefined,
    downlineCount: downlineCount.data as bigint | undefined,
    isLoading: referrer.isLoading || downline.isLoading,
    refetch: () => {
      referrer.refetch();
      downline.refetch();
      downlineCount.refetch();
    },
  };
}

// ─── Is Qualified (for matching bonus) ───
export function useIsQualified(level: number = 1) {
  const { address } = useAccount();
  return useReadContract({
    address: CONTRACTS.bonusEngine,
    abi: beAbi,
    functionName: "isQualified",
    args: address ? [address, level] : undefined,
    query: { enabled: !!address },
  });
}

// ─── Token Allowance ───
export function useAllowance(
  tokenAddress: `0x${string}`,
  spenderAddress: `0x${string}`
) {
  const { address } = useAccount();
  return useReadContract({
    address: tokenAddress,
    abi: btnAbi,
    functionName: "allowance",
    args: address ? [address, spenderAddress] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  });
}

// ─── Has Admin Role ───
export function useHasAdminRole() {
  const { address } = useAccount();
  const DEFAULT_ADMIN_ROLE =
    "0x0000000000000000000000000000000000000000000000000000000000000000";
  return useReadContract({
    address: CONTRACTS.rewardEngine,
    abi: reAbi,
    functionName: "hasRole",
    args: address ? [DEFAULT_ADMIN_ROLE, address] : undefined,
    query: { enabled: !!address },
  });
}

// ─── Has Operator Role ───
export function useHasOperatorRole() {
  const { address } = useAccount();
  return useReadContract({
    address: CONTRACTS.rewardEngine,
    abi: reAbi,
    functionName: "OPERATOR_ROLE",
    query: { enabled: !!address },
  });
}
