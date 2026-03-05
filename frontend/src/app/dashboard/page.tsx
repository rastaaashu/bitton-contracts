"use client";

import { useAccount } from "wagmi";
import { StatCard } from "@/components/ui/StatCard";
import {
  useBTNBalance,
  useVaultStatus,
  useTotalStaked,
  useWithdrawableBalance,
  useVestedBalance,
  usePendingRewards,
  useStakes,
} from "@/hooks/useContracts";
import { formatBTN, tierName, formatDate, formatCountdown } from "@/lib/format";
import { PROGRAM_CONFIGS } from "@/config/constants";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { StakeInfo } from "@/types";

export default function DashboardPage() {
  const { isConnected, address } = useAccount();
  const { data: btnBalance, isLoading: btnLoading } = useBTNBalance();
  const { isActive, tier, isLoading: vaultLoading } = useVaultStatus();
  const { data: totalStaked, isLoading: stakedLoading } = useTotalStaked();
  const { data: withdrawable, isLoading: withdrawLoading } = useWithdrawableBalance();
  const { vestedBalance, pendingRelease, isLoading: vestingLoading } = useVestedBalance();
  const { data: pendingRewards, isLoading: rewardsLoading } = usePendingRewards();
  const { data: stakesRaw, isLoading: stakesLoading } = useStakes();
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  const stakes = (stakesRaw as StakeInfo[] | undefined) || [];
  const activeStakes = stakes.filter((s) => s.active);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h2 className="text-2xl font-bold mb-4">Welcome to BitTON.AI</h2>
        <p className="text-gray-400 mb-6 max-w-md">
          Connect your wallet to access your dashboard, stake BTN tokens, and
          earn rewards.
        </p>
        <p className="text-sm text-gray-500">
          Use the Connect button in the top right corner.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

      {/* Vault Status Banner */}
      {!vaultLoading && !isActive && (
        <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div>
            <p className="text-yellow-300 font-medium">Vault Not Activated</p>
            <p className="text-yellow-400/70 text-sm">
              Activate your vault to start earning staking rewards and bonuses.
            </p>
          </div>
          <Link
            href="/vault"
            className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Activate Now
          </Link>
        </div>
      )}

      {/* Balance Zone Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Wallet Balance"
          value={`${formatBTN(btnBalance as bigint | undefined)} BTN`}
          loading={btnLoading}
        />
        <StatCard
          label="Total Staked"
          value={`${formatBTN(totalStaked as bigint | undefined)} BTN`}
          loading={stakedLoading}
          subtitle={`${activeStakes.length} active stake(s)`}
        />
        <StatCard
          label="Vesting Locked"
          value={`${formatBTN(vestedBalance)} BTN`}
          loading={vestingLoading}
          subtitle={`${formatBTN(pendingRelease)} releasable`}
        />
        <StatCard
          label="Withdrawable"
          value={`${formatBTN(withdrawable as bigint | undefined)} BTN`}
          loading={withdrawLoading}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Vault Tier"
          value={tierName(tier)}
          loading={vaultLoading}
          valueClassName={
            tier === 1
              ? "text-blue-400"
              : tier === 2
              ? "text-purple-400"
              : tier === 3
              ? "text-amber-400"
              : "text-gray-500"
          }
        />
        <StatCard
          label="Pending Rewards"
          value={`${formatBTN(pendingRewards as bigint | undefined)} BTN`}
          loading={rewardsLoading}
        />
      </div>

      {/* Active Stakes Table */}
      <h3 className="text-lg font-bold mb-4">Active Stakes</h3>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {stakesLoading ? (
          <div className="p-6">
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-12 bg-gray-800 rounded animate-pulse" />
              ))}
            </div>
          </div>
        ) : activeStakes.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-gray-400 text-sm mb-3">No active stakes.</p>
            <Link
              href="/staking"
              className="text-brand-400 hover:text-brand-300 text-sm underline"
            >
              Start staking
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="text-left px-4 py-3 font-medium">#</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Amount</th>
                <th className="text-left px-4 py-3 font-medium">Started</th>
                <th className="text-left px-4 py-3 font-medium">
                  Time Remaining
                </th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {stakes.map((stake, index) => {
                if (!stake.active) return null;
                const config =
                  PROGRAM_CONFIGS[stake.programType as 0 | 1] ||
                  PROGRAM_CONFIGS[0];
                const lockEnd =
                  Number(stake.startTime) + config.lockSeconds;
                const remaining = lockEnd - now;
                return (
                  <tr
                    key={index}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30"
                  >
                    <td className="px-4 py-3 text-gray-500">{index}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          stake.programType === 0
                            ? "text-blue-400"
                            : "text-purple-400"
                        }
                      >
                        {config.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {formatBTN(stake.amount)} BTN
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {formatDate(stake.startTime)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          remaining <= 0
                            ? "text-green-400"
                            : "text-yellow-400"
                        }
                      >
                        {formatCountdown(remaining)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href="/staking"
                        className="text-brand-400 hover:text-brand-300 text-xs underline"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
