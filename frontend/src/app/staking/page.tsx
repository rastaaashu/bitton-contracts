"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { clsx } from "clsx";
import { CONTRACTS } from "@/config/contracts";
import { PROGRAM_CONFIGS } from "@/config/constants";
import {
  useBTNBalance,
  useVaultStatus,
  useStakes,
  useAllowance,
} from "@/hooks/useContracts";
import { useApproveToken, useStake, useUnstake } from "@/hooks/useContractWrite";
import { formatBTN, parseBTN, formatDate, formatCountdown, tierName } from "@/lib/format";
import { TxButton } from "@/components/ui/TxButton";
import { Modal } from "@/components/ui/Modal";
import type { StakeInfo } from "@/types";

export default function StakingPage() {
  const { isConnected, address } = useAccount();
  const { data: btnBalance } = useBTNBalance();
  const { isActive, tier } = useVaultStatus();
  const { data: stakesRaw, isLoading: stakesLoading, refetch: refetchStakes } = useStakes();
  const stakes = (stakesRaw as StakeInfo[] | undefined) || [];

  const [amount, setAmount] = useState("");
  const [programType, setProgramType] = useState<0 | 1>(0);
  const [step, setStep] = useState<"idle" | "approve" | "stake">("idle");
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  // Unstake modal
  const [unstakeIndex, setUnstakeIndex] = useState<number | null>(null);
  const [showUnstakeModal, setShowUnstakeModal] = useState(false);

  const approveHook = useApproveToken();
  const stakeHook = useStake();
  const unstakeHook = useUnstake();

  const parsedAmount = parseBTN(amount);
  const { data: allowance, refetch: refetchAllowance } = useAllowance(
    CONTRACTS.btnToken,
    CONTRACTS.stakingVault
  );

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  // Step machine
  useEffect(() => {
    if (step === "approve" && parsedAmount > 0n) {
      const currentAllowance = (allowance as bigint) || 0n;
      if (currentAllowance >= parsedAmount) {
        setStep("stake");
      }
    }
  }, [allowance, step, parsedAmount]);

  useEffect(() => {
    if (approveHook.isSuccess) refetchAllowance();
  }, [approveHook.isSuccess, refetchAllowance]);

  useEffect(() => {
    if (stakeHook.isSuccess) {
      refetchStakes();
      setStep("idle");
      setAmount("");
      stakeHook.reset();
    }
  }, [stakeHook.isSuccess, refetchStakes]);

  useEffect(() => {
    if (unstakeHook.isSuccess) {
      refetchStakes();
      setShowUnstakeModal(false);
      setUnstakeIndex(null);
      unstakeHook.reset();
    }
  }, [unstakeHook.isSuccess, refetchStakes]);

  const handleStartStake = () => {
    if (parsedAmount <= 0n) return;
    const currentAllowance = (allowance as bigint) || 0n;
    if (currentAllowance >= parsedAmount) {
      setStep("stake");
    } else {
      setStep("approve");
    }
  };

  // Estimate rewards
  const config = PROGRAM_CONFIGS[programType];
  const tierMultiplier =
    programType === 1
      ? 1.2
      : tier === 3
      ? 1.2
      : tier === 2
      ? 1.1
      : 1.0;
  const dailyRewardEstimate =
    parseFloat(amount || "0") * config.dailyRate * tierMultiplier;
  const weeklyRewardEstimate = dailyRewardEstimate * 7;

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Staking</h2>
        <p className="text-gray-400">Connect your wallet to stake BTN.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Staking</h2>
      <p className="text-gray-400 text-sm mb-6">
        Stake BTN tokens to earn daily rewards. Choose between Short (30 days) or Long (180 days) programs.
      </p>

      {!isActive && (
        <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-xl p-4 mb-6">
          <p className="text-yellow-300 text-sm">
            You need to activate a vault before you can stake.{" "}
            <a href="/vault" className="underline">
              Go to Vault
            </a>
          </p>
        </div>
      )}

      {/* Stake Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4">New Stake</h3>

          {/* Program Toggle */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setProgramType(0)}
              className={clsx(
                "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
                programType === 0
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              )}
            >
              Short (30d)
            </button>
            <button
              onClick={() => setProgramType(1)}
              className={clsx(
                "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
                programType === 1
                  ? "bg-purple-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              )}
            >
              Long (180d)
            </button>
          </div>

          {/* Amount Input */}
          <div className="relative mb-4">
            <input
              type="text"
              placeholder="Amount (BTN)"
              value={amount}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.]/g, "");
                setAmount(val);
              }}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white pr-20"
            />
            <button
              onClick={() => {
                const bal = btnBalance as bigint | undefined;
                if (bal) setAmount(formatBTN(bal).replace(/,/g, ""));
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-brand-400 hover:text-brand-300"
            >
              MAX
            </button>
          </div>

          <p className="text-xs text-gray-500 mb-4">
            Balance: {formatBTN(btnBalance as bigint | undefined)} BTN
          </p>

          {/* Estimates */}
          <div className="bg-gray-800/50 rounded-lg p-3 mb-4 space-y-1 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>Daily Rate</span>
              <span>{(config.dailyRate * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Multiplier ({programType === 1 ? "Long" : tierName(tier)})</span>
              <span>{tierMultiplier}x</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Est. Daily Reward</span>
              <span className="text-green-400">
                ~{dailyRewardEstimate.toFixed(2)} BTN
              </span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Est. Weekly Reward</span>
              <span className="text-green-400">
                ~{weeklyRewardEstimate.toFixed(2)} BTN
              </span>
            </div>
            {config.earlyExitAllowed && (
              <div className="flex justify-between text-yellow-400 text-xs pt-1 border-t border-gray-700">
                <span>Early Exit Penalty</span>
                <span>15%</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {step === "idle" && (
            <button
              onClick={handleStartStake}
              disabled={!isActive || parsedAmount <= 0n}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium transition-colors"
            >
              Stake {config.name.split(" ")[0]}
            </button>
          )}

          {step === "approve" && (
            <TxButton
              label={`Approve ${amount} BTN`}
              pendingLabel="Approving..."
              onClick={() =>
                approveHook.approve(
                  CONTRACTS.btnToken,
                  CONTRACTS.stakingVault,
                  parsedAmount
                )
              }
              isPending={approveHook.isPending}
              isSuccess={approveHook.isSuccess}
              isError={approveHook.isError}
              hash={approveHook.hash}
              className="w-full"
            />
          )}

          {step === "stake" && (
            <TxButton
              label={`Confirm Stake`}
              pendingLabel="Staking..."
              onClick={() => stakeHook.stake(parsedAmount, programType)}
              isPending={stakeHook.isPending}
              isSuccess={stakeHook.isSuccess}
              isError={stakeHook.isError}
              hash={stakeHook.hash}
              successLabel="Staked!"
              className="w-full"
            />
          )}

          {step !== "idle" && (
            <button
              onClick={() => {
                setStep("idle");
                approveHook.reset();
                stakeHook.reset();
              }}
              className="w-full mt-2 text-sm text-gray-500 hover:text-gray-300"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Info Panel */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4">Program Details</h3>
          <div className="space-y-4">
            {([0, 1] as const).map((pt) => {
              const c = PROGRAM_CONFIGS[pt];
              return (
                <div
                  key={pt}
                  className={clsx(
                    "p-4 rounded-lg border",
                    pt === programType
                      ? "border-brand-600/50 bg-brand-600/5"
                      : "border-gray-800"
                  )}
                >
                  <h4 className="font-medium mb-2">{c.name}</h4>
                  <ul className="text-sm text-gray-400 space-y-1">
                    <li>Lock Period: {c.lockDays} days</li>
                    <li>Daily Rate: {(c.dailyRate * 100).toFixed(1)}%</li>
                    <li>Multiplier: {c.multiplierNote}</li>
                    <li>
                      Early Exit:{" "}
                      {c.earlyExitAllowed
                        ? `Allowed (${c.earlyExitPenaltyBps / 100}% penalty)`
                        : "Not allowed"}
                    </li>
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active Stakes Table */}
      <h3 className="text-lg font-bold mb-4">Your Stakes</h3>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {stakesLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 bg-gray-800 rounded animate-pulse" />
            ))}
          </div>
        ) : stakes.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">
            No stakes yet. Create one above.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="text-left px-4 py-3 font-medium">#</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Amount</th>
                <th className="text-left px-4 py-3 font-medium">Started</th>
                <th className="text-left px-4 py-3 font-medium">Lock End</th>
                <th className="text-left px-4 py-3 font-medium">Time Left</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {stakes.map((stake, index) => {
                const c =
                  PROGRAM_CONFIGS[stake.programType as 0 | 1] ||
                  PROGRAM_CONFIGS[0];
                const lockEnd = Number(stake.startTime) + c.lockSeconds;
                const remaining = lockEnd - now;
                const isLocked = remaining > 0;

                return (
                  <tr
                    key={index}
                    className={clsx(
                      "border-b border-gray-800/50",
                      !stake.active && "opacity-50"
                    )}
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
                        {c.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {formatBTN(stake.amount)} BTN
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {formatDate(stake.startTime)}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {formatDate(BigInt(lockEnd))}
                    </td>
                    <td className="px-4 py-3">
                      {stake.active ? (
                        <span
                          className={
                            remaining <= 0
                              ? "text-green-400"
                              : "text-yellow-400"
                          }
                        >
                          {formatCountdown(remaining)}
                        </span>
                      ) : (
                        <span className="text-gray-500">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={clsx(
                          "px-2 py-0.5 rounded text-xs",
                          stake.active
                            ? "bg-green-900/50 text-green-400"
                            : "bg-gray-800 text-gray-500"
                        )}
                      >
                        {stake.active ? "Active" : "Closed"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {stake.active && (
                        <button
                          onClick={() => {
                            setUnstakeIndex(index);
                            setShowUnstakeModal(true);
                          }}
                          className="text-red-400 hover:text-red-300 text-xs font-medium"
                        >
                          Unstake
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Unstake Confirmation Modal */}
      <Modal
        open={showUnstakeModal}
        onClose={() => {
          setShowUnstakeModal(false);
          setUnstakeIndex(null);
          unstakeHook.reset();
        }}
        title="Confirm Unstake"
      >
        {unstakeIndex !== null && stakes[unstakeIndex] && (
          <div>
            {(() => {
              const s = stakes[unstakeIndex];
              const c =
                PROGRAM_CONFIGS[s.programType as 0 | 1] || PROGRAM_CONFIGS[0];
              const lockEnd = Number(s.startTime) + c.lockSeconds;
              const isEarlyExit = now < lockEnd;

              return (
                <div className="space-y-4">
                  <div className="bg-gray-800 rounded-lg p-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Stake Amount</span>
                      <span>{formatBTN(s.amount)} BTN</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Program</span>
                      <span>{c.name}</span>
                    </div>
                    {isEarlyExit && s.programType === 0 && (
                      <div className="flex justify-between text-yellow-400">
                        <span>Early Exit Penalty (15%)</span>
                        <span>
                          -{formatBTN((s.amount * 15n) / 100n)} BTN
                        </span>
                      </div>
                    )}
                    {isEarlyExit && s.programType === 1 && (
                      <p className="text-red-400 text-xs">
                        Long stakes cannot be exited early. Lock period has not ended.
                      </p>
                    )}
                  </div>

                  {isEarlyExit && s.programType === 0 && (
                    <p className="text-yellow-400 text-xs">
                      Warning: Early exit incurs a 15% penalty on your staked amount. The penalty goes to the treasury.
                    </p>
                  )}

                  {(!isEarlyExit || s.programType === 0) && (
                    <TxButton
                      label="Confirm Unstake"
                      pendingLabel="Unstaking..."
                      onClick={() => unstakeHook.unstake(unstakeIndex)}
                      isPending={unstakeHook.isPending}
                      isSuccess={unstakeHook.isSuccess}
                      isError={unstakeHook.isError}
                      hash={unstakeHook.hash}
                      variant="danger"
                      className="w-full"
                    />
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </Modal>
    </div>
  );
}
