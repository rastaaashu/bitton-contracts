"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { clsx } from "clsx";
import { TIER_CONFIGS } from "@/config/constants";
import { CONTRACTS } from "@/config/contracts";
import {
  useVaultStatus,
  useBTNBalance,
  useUSDTBalance,
  useAllowance,
  useBTNAmountForUSD,
} from "@/hooks/useContracts";
import { useApproveToken, useActivateVault } from "@/hooks/useContractWrite";
import { formatBTN, tierName, tierColor } from "@/lib/format";
import { TxButton } from "@/components/ui/TxButton";
import type { TierConfig, VaultTier } from "@/types";

function TierCard({
  config,
  currentTier,
  onActivate,
  isActivating,
}: {
  config: TierConfig;
  currentTier: number;
  onActivate: (tier: number, payWithBTN: boolean) => void;
  isActivating: boolean;
}) {
  const isActive = currentTier === config.id;
  const isLower = config.id <= currentTier && currentTier > 0;
  const { data: btnEquivalent } = useBTNAmountForUSD(config.feeRaw);

  const borderColor =
    config.color === "blue"
      ? "border-blue-600/50"
      : config.color === "purple"
      ? "border-purple-600/50"
      : "border-amber-600/50";

  const glowColor =
    config.color === "blue"
      ? "shadow-blue-600/20"
      : config.color === "purple"
      ? "shadow-purple-600/20"
      : "shadow-amber-600/20";

  return (
    <div
      className={clsx(
        "bg-gray-900 border rounded-xl p-6 relative transition-all",
        isActive ? `${borderColor} shadow-lg ${glowColor}` : "border-gray-800",
        isLower && !isActive && "opacity-50"
      )}
    >
      {isActive && (
        <div
          className={clsx(
            "absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-medium",
            tierColor(config.id)
          )}
        >
          Current Tier
        </div>
      )}

      <h3 className="text-lg font-bold mb-2">{config.name}</h3>
      <p className="text-3xl font-bold mb-4">${config.feeUSD}</p>

      <ul className="text-sm text-gray-300 space-y-2 mb-6">
        <li className="flex justify-between">
          <span className="text-gray-500">Staking Multiplier</span>
          <span>{config.multiplier}x</span>
        </li>
        <li className="flex justify-between">
          <span className="text-gray-500">Matching Levels</span>
          <span>{config.matchingLevels}</span>
        </li>
        {btnEquivalent != null && (
          <li className="flex justify-between">
            <span className="text-gray-500">BTN Equivalent</span>
            <span className="text-brand-400">
              ~{formatBTN(btnEquivalent as bigint)} BTN
            </span>
          </li>
        )}
      </ul>

      {!isLower && (
        <div className="space-y-2">
          <button
            onClick={() => onActivate(config.id, false)}
            disabled={isActivating}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium transition-colors"
          >
            Pay with USDT
          </button>
          <button
            onClick={() => onActivate(config.id, true)}
            disabled={isActivating}
            className="w-full border border-brand-600 text-brand-400 hover:bg-brand-600/10 disabled:opacity-50 disabled:cursor-not-allowed py-2.5 rounded-lg font-medium transition-colors"
          >
            Pay with BTN
          </button>
        </div>
      )}

      {isLower && !isActive && (
        <p className="text-center text-gray-500 text-sm py-2">
          Already surpassed
        </p>
      )}
    </div>
  );
}

export default function VaultPage() {
  const { isConnected, address } = useAccount();
  const { isActive, tier, isLoading: vaultLoading, refetch: refetchVault } = useVaultStatus();
  const { data: btnBalance } = useBTNBalance();
  const { data: usdtBalance } = useUSDTBalance();
  const currentTier = (tier as number) || 0;

  const [activatingTier, setActivatingTier] = useState<number | null>(null);
  const [payWithBTN, setPayWithBTN] = useState(false);
  const [step, setStep] = useState<"idle" | "approve" | "activate">("idle");

  const approveHook = useApproveToken();
  const activateHook = useActivateVault();

  // Get the tier fee for allowance check
  const tierFee = activatingTier
    ? TIER_CONFIGS[activatingTier as 1 | 2 | 3]?.feeRaw
    : 0n;
  const { data: btnForUSD } = useBTNAmountForUSD(tierFee || 0n);

  const tokenAddr = payWithBTN ? CONTRACTS.btnToken : CONTRACTS.usdtToken;
  const { data: allowance, refetch: refetchAllowance } = useAllowance(
    tokenAddr,
    CONTRACTS.vaultManager
  );

  const neededAmount = payWithBTN ? (btnForUSD as bigint) || 0n : tierFee || 0n;

  const handleActivate = (tierId: number, withBTN: boolean) => {
    setActivatingTier(tierId);
    setPayWithBTN(withBTN);
    setStep("approve");
  };

  // Step machine
  useEffect(() => {
    if (step === "approve" && activatingTier) {
      const currentAllowance = (allowance as bigint) || 0n;
      if (currentAllowance >= neededAmount && neededAmount > 0n) {
        setStep("activate");
      }
    }
  }, [allowance, step, neededAmount, activatingTier]);

  useEffect(() => {
    if (approveHook.isSuccess) {
      refetchAllowance();
    }
  }, [approveHook.isSuccess, refetchAllowance]);

  useEffect(() => {
    if (activateHook.isSuccess) {
      refetchVault();
      setStep("idle");
      setActivatingTier(null);
    }
  }, [activateHook.isSuccess, refetchVault]);

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Vault Activation</h2>
        <p className="text-gray-400">Connect your wallet to activate a vault.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Vault Activation</h2>
      <p className="text-gray-400 text-sm mb-6">
        Activate a vault tier to unlock staking multipliers and matching bonus
        levels. You can upgrade to a higher tier at any time.
      </p>

      {/* Current status */}
      {!vaultLoading && isActive && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 flex items-center gap-4">
          <div
            className={clsx(
              "w-10 h-10 rounded-full flex items-center justify-center text-white font-bold",
              tierColor(currentTier)
            )}
          >
            T{currentTier}
          </div>
          <div>
            <p className="font-medium">{tierName(currentTier)}</p>
            <p className="text-sm text-gray-400">Your vault is active</p>
          </div>
        </div>
      )}

      {/* Wallet balances */}
      <div className="flex gap-4 mb-6 text-sm">
        <span className="text-gray-400">
          BTN: <span className="text-white">{formatBTN(btnBalance as bigint | undefined)}</span>
        </span>
        <span className="text-gray-400">
          USDT: <span className="text-white">{formatBTN(usdtBalance as bigint | undefined)}</span>
        </span>
      </div>

      {/* Tier Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {([1, 2, 3] as const).map((t) => (
          <TierCard
            key={t}
            config={TIER_CONFIGS[t]}
            currentTier={currentTier}
            onActivate={handleActivate}
            isActivating={
              activatingTier === t &&
              (approveHook.isPending || activateHook.isPending)
            }
          />
        ))}
      </div>

      {/* Approval / Activation Flow */}
      {step !== "idle" && activatingTier && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-md">
          <h3 className="font-bold mb-4">
            Activating {tierName(activatingTier)} with{" "}
            {payWithBTN ? "BTN" : "USDT"}
          </h3>

          {step === "approve" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-400">
                Step 1: Approve {formatBTN(neededAmount)}{" "}
                {payWithBTN ? "BTN" : "USDT"} spending
              </p>
              <TxButton
                label={`Approve ${payWithBTN ? "BTN" : "USDT"}`}
                pendingLabel="Approving..."
                onClick={() =>
                  approveHook.approve(
                    tokenAddr,
                    CONTRACTS.vaultManager,
                    neededAmount
                  )
                }
                isPending={approveHook.isPending}
                isSuccess={approveHook.isSuccess}
                isError={approveHook.isError}
                hash={approveHook.hash}
              />
            </div>
          )}

          {step === "activate" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-400">Step 2: Activate vault</p>
              <TxButton
                label="Activate Vault"
                pendingLabel="Activating..."
                onClick={() => activateHook.activate(activatingTier)}
                isPending={activateHook.isPending}
                isSuccess={activateHook.isSuccess}
                isError={activateHook.isError}
                hash={activateHook.hash}
                successLabel="Vault Activated!"
              />
            </div>
          )}

          <button
            onClick={() => {
              setStep("idle");
              setActivatingTier(null);
              approveHook.reset();
              activateHook.reset();
            }}
            className="mt-4 text-sm text-gray-500 hover:text-gray-300"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
