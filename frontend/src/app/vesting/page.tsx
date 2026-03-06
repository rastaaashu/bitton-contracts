"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { StatCard } from "@/components/ui/StatCard";
import { TxButton } from "@/components/ui/TxButton";
import { useVestedBalance } from "@/hooks/useContracts";
import { useReleaseVesting } from "@/hooks/useContractWrite";
import { formatBTN, formatBTNPrecise } from "@/lib/format";
import { VESTING_DAILY_RATE } from "@/config/constants";

export default function VestingPage() {
  const { isConnected, address } = useAccount();
  const {
    vestedBalance,
    pendingRelease,
    lastReleaseTime,
    isLoading,
    refetch,
  } = useVestedBalance();
  const releaseHook = useReleaseVesting();

  // Live accumulation counter
  const [liveRelease, setLiveRelease] = useState<bigint>(0n);

  useEffect(() => {
    if (releaseHook.isSuccess) {
      refetch();
    }
  }, [releaseHook.isSuccess, refetch]);

  // Calculate live accumulation every second
  useEffect(() => {
    if (!vestedBalance || !lastReleaseTime) {
      setLiveRelease(pendingRelease || 0n);
      return;
    }

    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const lastRelease = Number(lastReleaseTime);
      const elapsed = now - lastRelease;
      if (elapsed <= 0 || vestedBalance === 0n) {
        setLiveRelease(0n);
        return;
      }

      // 0.5% per day = amount * 5 / 1000 per 86400 seconds
      // Per second: amount * 5 / (1000 * 86400)
      const releasePerSecond =
        (vestedBalance * 5n) / (1000n * 86400n);
      const accumulated = releasePerSecond * BigInt(elapsed);
      const capped = accumulated > vestedBalance ? vestedBalance : accumulated;
      setLiveRelease(capped);
    }, 1000);

    return () => clearInterval(interval);
  }, [vestedBalance, lastReleaseTime, pendingRelease]);

  // Daily release rate
  const dailyRelease = vestedBalance
    ? (vestedBalance * 5n) / 1000n
    : 0n;

  const hasReleasable = liveRelease > 0n;

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Vesting Pool</h2>
        <p className="text-gray-400">Connect your wallet to view vesting.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Vesting Pool</h2>
      <p className="text-gray-400 text-sm mb-6">
        Vested rewards release at 0.5% per day. Released tokens go to your
        Withdrawal Wallet.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Vested (Locked)"
          value={`${formatBTN(vestedBalance)} BTN`}
          loading={isLoading}
        />
        <StatCard
          label="Available to Release"
          value={`${formatBTNPrecise(liveRelease)} BTN`}
          loading={isLoading}
          valueClassName={hasReleasable ? "text-green-400" : undefined}
          subtitle="Updating every second"
        />
        <StatCard
          label="Daily Release Rate"
          value={`${formatBTN(dailyRelease)} BTN/day`}
          loading={isLoading}
          subtitle={`${(VESTING_DAILY_RATE * 100).toFixed(1)}% of locked balance`}
        />
        <StatCard
          label="Rate Per Second"
          value={
            vestedBalance
              ? `${formatBTNPrecise((vestedBalance * 5n) / (1000n * 86400n))} BTN`
              : "0 BTN"
          }
          loading={isLoading}
        />
      </div>

      {/* Visual Progress */}
      {vestedBalance && vestedBalance > 0n && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6 max-w-md">
          <h3 className="font-bold mb-3">Release Progress</h3>
          <div className="w-full bg-gray-800 rounded-full h-3 mb-2">
            <div
              className="bg-green-500 h-3 rounded-full transition-all duration-1000"
              style={{
                width: `${Math.min(
                  Number((liveRelease * 10000n) / vestedBalance) / 100,
                  100
                )}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>{formatBTN(liveRelease)} available</span>
            <span>{formatBTN(vestedBalance)} locked</span>
          </div>
        </div>
      )}

      <TxButton
        label="Release Vested Tokens"
        pendingLabel="Releasing..."
        successLabel="Tokens Released!"
        onClick={() => address && releaseHook.release(address)}
        disabled={!hasReleasable}
        isPending={releaseHook.isPending}
        isSuccess={releaseHook.isSuccess}
        isError={releaseHook.isError}
        hash={releaseHook.hash}
      />

      <p className="text-xs text-gray-500 mt-2">
        Released tokens are sent to your Withdrawal Wallet where you can
        withdraw them.
      </p>
    </div>
  );
}
