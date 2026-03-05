"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { StatCard } from "@/components/ui/StatCard";
import { TxButton } from "@/components/ui/TxButton";
import {
  usePendingRewards,
  useLastSettlementTime,
  useRewardPoolBalance,
  useWithdrawableBalance,
  useVestedBalance,
  useVaultStatus,
} from "@/hooks/useContracts";
import { useSettleRewards } from "@/hooks/useContractWrite";
import { formatBTN, formatDate } from "@/lib/format";
import { SETTLEMENT_WITHDRAWABLE_PCT, SETTLEMENT_VESTING_PCT } from "@/config/constants";

export default function RewardsPage() {
  const { isConnected, address } = useAccount();
  const { isActive } = useVaultStatus();
  const { data: pendingRewards, isLoading: pendingLoading, refetch: refetchPending } = usePendingRewards();
  const { data: lastSettlement, isLoading: settlementLoading } = useLastSettlementTime();
  const { data: rewardPool, isLoading: poolLoading } = useRewardPoolBalance();
  const { refetch: refetchWithdrawable } = useWithdrawableBalance();
  const { refetch: refetchVesting } = useVestedBalance();

  const settleHook = useSettleRewards();

  useEffect(() => {
    if (settleHook.isSuccess) {
      refetchPending();
      refetchWithdrawable();
      refetchVesting();
    }
  }, [settleHook.isSuccess, refetchPending, refetchWithdrawable, refetchVesting]);

  const pending = (pendingRewards as bigint) || 0n;
  const hasPending = pending > 0n;

  // Calculate split preview
  const withdrawablePortion = hasPending
    ? (pending * BigInt(SETTLEMENT_WITHDRAWABLE_PCT)) / 100n
    : 0n;
  const vestingPortion = hasPending
    ? (pending * BigInt(SETTLEMENT_VESTING_PCT)) / 100n
    : 0n;

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Rewards & Settlement</h2>
        <p className="text-gray-400">Connect your wallet to view rewards.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Rewards & Settlement</h2>
      <p className="text-gray-400 text-sm mb-6">
        Settle your pending staking rewards. Settlement splits 10% to your
        Withdrawal Wallet and 90% to Vesting Pool.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Pending Rewards"
          value={`${formatBTN(pendingRewards as bigint | undefined)} BTN`}
          loading={pendingLoading}
          valueClassName={hasPending ? "text-green-400" : undefined}
        />
        <StatCard
          label="Last Settlement"
          value={formatDate(lastSettlement as bigint | undefined)}
          loading={settlementLoading}
        />
        <StatCard
          label="Reward Pool Balance"
          value={`${formatBTN(rewardPool as bigint | undefined)} BTN`}
          loading={poolLoading}
          subtitle="System-wide funded balance"
        />
      </div>

      {/* Split Preview */}
      {hasPending && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6 max-w-md">
          <h3 className="font-bold mb-3">Settlement Preview</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Total Pending</span>
              <span className="font-medium">{formatBTN(pending)} BTN</span>
            </div>
            <div className="h-px bg-gray-800" />
            <div className="flex justify-between">
              <span className="text-gray-400">
                To Withdrawal Wallet ({SETTLEMENT_WITHDRAWABLE_PCT}%)
              </span>
              <span className="text-green-400">
                +{formatBTN(withdrawablePortion)} BTN
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">
                To Vesting Pool ({SETTLEMENT_VESTING_PCT}%)
              </span>
              <span className="text-blue-400">
                +{formatBTN(vestingPortion)} BTN
              </span>
            </div>
          </div>
        </div>
      )}

      <TxButton
        label="Settle Rewards"
        pendingLabel="Settling..."
        successLabel="Rewards Settled!"
        onClick={() => address && settleHook.settle(address)}
        disabled={!hasPending || !isActive}
        isPending={settleHook.isPending}
        isSuccess={settleHook.isSuccess}
        isError={settleHook.isError}
        hash={settleHook.hash}
      />

      {!isActive && (
        <p className="text-xs text-yellow-400 mt-2">
          Vault must be active to settle rewards.
        </p>
      )}

      <p className="text-xs text-gray-500 mt-2">
        Settlement splits: {SETTLEMENT_WITHDRAWABLE_PCT}% to Withdrawal Wallet,{" "}
        {SETTLEMENT_VESTING_PCT}% to Vesting Pool.
      </p>
    </div>
  );
}
