"use client";

import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
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

// ─── Approve Token ───
export function useApproveToken() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return {
    approve: (tokenAddress: `0x${string}`, spender: `0x${string}`, amount: bigint) =>
      writeContract({
        address: tokenAddress,
        abi: btnAbi,
        functionName: "approve",
        args: [spender, amount],
      }),
    isPending: isPending || isConfirming,
    isSuccess,
    isError: !!error,
    error,
    hash,
    reset,
  };
}

// ─── Activate Vault ───
export function useActivateVault() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return {
    activate: (tier: number) =>
      writeContract({
        address: CONTRACTS.vaultManager,
        abi: vmAbi,
        functionName: "activateVault",
        args: [tier],
      }),
    isPending: isPending || isConfirming,
    isSuccess,
    isError: !!error,
    error,
    hash,
    reset,
  };
}

// ─── Stake ───
export function useStake() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return {
    stake: (amount: bigint, programType: number) =>
      writeContract({
        address: CONTRACTS.stakingVault,
        abi: svAbi,
        functionName: "stake",
        args: [amount, programType],
      }),
    isPending: isPending || isConfirming,
    isSuccess,
    isError: !!error,
    error,
    hash,
    reset,
  };
}

// ─── Unstake ───
export function useUnstake() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return {
    unstake: (stakeIndex: number) =>
      writeContract({
        address: CONTRACTS.stakingVault,
        abi: svAbi,
        functionName: "unstake",
        args: [BigInt(stakeIndex)],
      }),
    isPending: isPending || isConfirming,
    isSuccess,
    isError: !!error,
    error,
    hash,
    reset,
  };
}

// ─── Settle Rewards ───
export function useSettleRewards() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return {
    settle: (userAddress: `0x${string}`) =>
      writeContract({
        address: CONTRACTS.rewardEngine,
        abi: reAbi,
        functionName: "settleWeekly",
        args: [userAddress],
      }),
    isPending: isPending || isConfirming,
    isSuccess,
    isError: !!error,
    error,
    hash,
    reset,
  };
}

// ─── Release Vesting ───
export function useReleaseVesting() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return {
    release: (userAddress: `0x${string}`) =>
      writeContract({
        address: CONTRACTS.vestingPool,
        abi: vpAbi,
        functionName: "release",
        args: [userAddress],
      }),
    isPending: isPending || isConfirming,
    isSuccess,
    isError: !!error,
    error,
    hash,
    reset,
  };
}

// ─── Withdraw ───
export function useWithdraw() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return {
    withdraw: (amount: bigint) =>
      writeContract({
        address: CONTRACTS.withdrawalWallet,
        abi: wwAbi,
        functionName: "withdraw",
        args: [amount],
      }),
    isPending: isPending || isConfirming,
    isSuccess,
    isError: !!error,
    error,
    hash,
    reset,
  };
}

// ─── Register Referrer ───
export function useRegisterReferrer() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return {
    register: (referrerAddress: `0x${string}`) =>
      writeContract({
        address: CONTRACTS.bonusEngine,
        abi: beAbi,
        functionName: "registerReferrer",
        args: [referrerAddress],
      }),
    isPending: isPending || isConfirming,
    isSuccess,
    isError: !!error,
    error,
    hash,
    reset,
  };
}

// ─── Fund Rewards (Admin) ───
export function useFundRewards() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  return {
    fund: (amount: bigint) =>
      writeContract({
        address: CONTRACTS.rewardEngine,
        abi: reAbi,
        functionName: "fundRewards",
        args: [amount],
      }),
    isPending: isPending || isConfirming,
    isSuccess,
    isError: !!error,
    error,
    hash,
    reset,
  };
}
