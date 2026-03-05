"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { CONTRACTS } from "@/config/contracts";
import { StatCard } from "@/components/ui/StatCard";
import { TxButton } from "@/components/ui/TxButton";
import {
  useRewardPoolBalance,
  useGlobalTotalStaked,
  useHasAdminRole,
  useAllowance,
} from "@/hooks/useContracts";
import { useApproveToken, useFundRewards } from "@/hooks/useContractWrite";
import { formatBTN, parseBTN, tierName, truncateAddress } from "@/lib/format";
import VaultManagerABI from "@/abi/VaultManager.json";
import StakingVaultABI from "@/abi/StakingVault.json";
import RewardEngineABI from "@/abi/RewardEngine.json";
import VestingPoolABI from "@/abi/VestingPool.json";
import WithdrawalWalletABI from "@/abi/WithdrawalWallet.json";
import BonusEngineABI from "@/abi/BonusEngine.json";

const vmAbi = VaultManagerABI.abi as readonly unknown[];
const svAbi = StakingVaultABI.abi as readonly unknown[];
const reAbi = RewardEngineABI.abi as readonly unknown[];
const vpAbi = VestingPoolABI.abi as readonly unknown[];
const wwAbi = WithdrawalWalletABI.abi as readonly unknown[];
const beAbi = BonusEngineABI.abi as readonly unknown[];

function UserLookup() {
  const [lookupAddr, setLookupAddr] = useState("");
  const isValid =
    lookupAddr.length === 42 && lookupAddr.startsWith("0x");

  const { data: userTier } = useReadContract({
    address: CONTRACTS.vaultManager,
    abi: vmAbi,
    functionName: "getUserTier",
    args: isValid ? [lookupAddr as `0x${string}`] : undefined,
    query: { enabled: isValid },
  });

  const { data: isVaultActive } = useReadContract({
    address: CONTRACTS.vaultManager,
    abi: vmAbi,
    functionName: "isVaultActive",
    args: isValid ? [lookupAddr as `0x${string}`] : undefined,
    query: { enabled: isValid },
  });

  const { data: totalStaked } = useReadContract({
    address: CONTRACTS.stakingVault,
    abi: svAbi,
    functionName: "getUserTotalStaked",
    args: isValid ? [lookupAddr as `0x${string}`] : undefined,
    query: { enabled: isValid },
  });

  const { data: pendingRewards } = useReadContract({
    address: CONTRACTS.rewardEngine,
    abi: reAbi,
    functionName: "getTotalPending",
    args: isValid ? [lookupAddr as `0x${string}`] : undefined,
    query: { enabled: isValid },
  });

  const { data: vestedBalance } = useReadContract({
    address: CONTRACTS.vestingPool,
    abi: vpAbi,
    functionName: "getVestedBalance",
    args: isValid ? [lookupAddr as `0x${string}`] : undefined,
    query: { enabled: isValid },
  });

  const { data: withdrawable } = useReadContract({
    address: CONTRACTS.withdrawalWallet,
    abi: wwAbi,
    functionName: "getWithdrawableBalance",
    args: isValid ? [lookupAddr as `0x${string}`] : undefined,
    query: { enabled: isValid },
  });

  const { data: referrer } = useReadContract({
    address: CONTRACTS.bonusEngine,
    abi: beAbi,
    functionName: "getReferrer",
    args: isValid ? [lookupAddr as `0x${string}`] : undefined,
    query: { enabled: isValid },
  });

  const { data: downlineCount } = useReadContract({
    address: CONTRACTS.bonusEngine,
    abi: beAbi,
    functionName: "getDownlineCount",
    args: isValid ? [lookupAddr as `0x${string}`] : undefined,
    query: { enabled: isValid },
  });

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h3 className="text-lg font-bold mb-4">User Lookup</h3>
      <input
        type="text"
        placeholder="Enter user address (0x...)"
        value={lookupAddr}
        onChange={(e) => setLookupAddr(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm font-mono mb-4"
      />
      {isValid && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-gray-500 text-xs">Vault</p>
            <p className="font-medium">
              {(isVaultActive as boolean) ? tierName(userTier as number) : "Not Active"}
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-gray-500 text-xs">Total Staked</p>
            <p className="font-medium">
              {formatBTN(totalStaked as bigint | undefined)} BTN
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-gray-500 text-xs">Pending Rewards</p>
            <p className="font-medium">
              {formatBTN(pendingRewards as bigint | undefined)} BTN
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-gray-500 text-xs">Vested</p>
            <p className="font-medium">
              {formatBTN(vestedBalance as bigint | undefined)} BTN
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-gray-500 text-xs">Withdrawable</p>
            <p className="font-medium">
              {formatBTN(withdrawable as bigint | undefined)} BTN
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-gray-500 text-xs">Downline Count</p>
            <p className="font-medium">
              {downlineCount ? (downlineCount as bigint).toString() : "0"}
            </p>
          </div>
          <div className="col-span-2 bg-gray-800 rounded-lg p-3">
            <p className="text-gray-500 text-xs">Referrer</p>
            <p className="font-mono text-xs">
              {(referrer as string) &&
              referrer !==
                "0x0000000000000000000000000000000000000000"
                ? truncateAddress(referrer as string)
                : "None"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { isConnected, address } = useAccount();
  const { data: isAdmin, isLoading: adminLoading } = useHasAdminRole();
  const { data: rewardPool, isLoading: poolLoading, refetch: refetchPool } =
    useRewardPoolBalance();
  const { data: globalStaked, isLoading: stakedLoading } =
    useGlobalTotalStaked();

  const [fundAmount, setFundAmount] = useState("");
  const [fundStep, setFundStep] = useState<"idle" | "approve" | "fund">(
    "idle"
  );

  const approveHook = useApproveToken();
  const fundHook = useFundRewards();
  const parsedFundAmount = parseBTN(fundAmount);

  const { data: allowance, refetch: refetchAllowance } = useAllowance(
    CONTRACTS.btnToken,
    CONTRACTS.rewardEngine
  );

  // Step machine for funding
  useEffect(() => {
    if (fundStep === "approve" && parsedFundAmount > 0n) {
      const currentAllowance = (allowance as bigint) || 0n;
      if (currentAllowance >= parsedFundAmount) {
        setFundStep("fund");
      }
    }
  }, [allowance, fundStep, parsedFundAmount]);

  useEffect(() => {
    if (approveHook.isSuccess) refetchAllowance();
  }, [approveHook.isSuccess, refetchAllowance]);

  useEffect(() => {
    if (fundHook.isSuccess) {
      refetchPool();
      setFundStep("idle");
      setFundAmount("");
      fundHook.reset();
    }
  }, [fundHook.isSuccess, refetchPool]);

  const handleStartFund = () => {
    if (parsedFundAmount <= 0n) return;
    const currentAllowance = (allowance as bigint) || 0n;
    if (currentAllowance >= parsedFundAmount) {
      setFundStep("fund");
    } else {
      setFundStep("approve");
    }
  };

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Admin Dashboard</h2>
        <p className="text-gray-400">Connect your wallet to access admin.</p>
      </div>
    );
  }

  if (adminLoading) {
    return (
      <div className="text-center py-20">
        <div className="h-6 w-40 bg-gray-800 rounded animate-pulse mx-auto" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
        <p className="text-gray-400">
          Your wallet does not have admin/operator role on the contracts.
        </p>
        <p className="text-gray-500 text-sm mt-2 font-mono">
          {address}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Admin Dashboard</h2>
      <p className="text-gray-400 text-sm mb-6">
        System overview and administrative actions.
      </p>

      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Global Total Staked"
          value={`${formatBTN(globalStaked as bigint | undefined)} BTN`}
          loading={stakedLoading}
        />
        <StatCard
          label="Reward Pool Balance"
          value={`${formatBTN(rewardPool as bigint | undefined)} BTN`}
          loading={poolLoading}
        />
        <StatCard
          label="Admin Address"
          value={truncateAddress(address || "")}
          subtitle="DEFAULT_ADMIN_ROLE"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fund Rewards */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4">Fund Reward Pool</h3>
          <p className="text-sm text-gray-400 mb-4">
            Transfer BTN tokens into the RewardEngine reward pool. These tokens
            fund user staking rewards.
          </p>

          <input
            type="text"
            placeholder="Amount (BTN)"
            value={fundAmount}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9.]/g, "");
              setFundAmount(val);
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white mb-4"
          />

          {fundStep === "idle" && (
            <button
              onClick={handleStartFund}
              disabled={parsedFundAmount <= 0n}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium transition-colors"
            >
              Fund Rewards
            </button>
          )}

          {fundStep === "approve" && (
            <TxButton
              label={`Approve ${fundAmount} BTN`}
              pendingLabel="Approving..."
              onClick={() =>
                approveHook.approve(
                  CONTRACTS.btnToken,
                  CONTRACTS.rewardEngine,
                  parsedFundAmount
                )
              }
              isPending={approveHook.isPending}
              isSuccess={approveHook.isSuccess}
              isError={approveHook.isError}
              hash={approveHook.hash}
              className="w-full"
            />
          )}

          {fundStep === "fund" && (
            <TxButton
              label="Confirm Fund"
              pendingLabel="Funding..."
              successLabel="Funded!"
              onClick={() => fundHook.fund(parsedFundAmount)}
              isPending={fundHook.isPending}
              isSuccess={fundHook.isSuccess}
              isError={fundHook.isError}
              hash={fundHook.hash}
              className="w-full"
            />
          )}

          {fundStep !== "idle" && (
            <button
              onClick={() => {
                setFundStep("idle");
                approveHook.reset();
                fundHook.reset();
              }}
              className="w-full mt-2 text-sm text-gray-500 hover:text-gray-300"
            >
              Cancel
            </button>
          )}
        </div>

        {/* User Lookup */}
        <UserLookup />
      </div>

      {/* Contract Addresses Reference */}
      <div className="mt-8 bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-bold mb-4">Contract Addresses</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm font-mono">
          {Object.entries(CONTRACTS).map(([name, addr]) => (
            <div key={name} className="flex justify-between gap-2">
              <span className="text-gray-500">{name}</span>
              <a
                href={`https://sepolia.basescan.org/address/${addr}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-400 hover:text-brand-300 truncate"
              >
                {truncateAddress(addr)}
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
