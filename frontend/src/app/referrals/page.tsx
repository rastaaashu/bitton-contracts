"use client";

import { useState, useEffect, Suspense } from "react";
import { useAccount } from "wagmi";
import { useSearchParams } from "next/navigation";
import { StatCard } from "@/components/ui/StatCard";
import { TxButton } from "@/components/ui/TxButton";
import {
  useReferralInfo,
  useVaultStatus,
  useTotalStaked,
  useIsQualified,
} from "@/hooks/useContracts";
import { useRegisterReferrer } from "@/hooks/useContractWrite";
import { truncateAddress, tierName, formatBTN } from "@/lib/format";
import { TIER_CONFIGS, MATCHING_LEVELS, MIN_PERSONAL_STAKE } from "@/config/constants";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export default function ReferralsPage() {
  return (
    <Suspense fallback={<div className="text-gray-400 p-6">Loading...</div>}>
      <ReferralsContent />
    </Suspense>
  );
}

function ReferralsContent() {
  const { isConnected, address } = useAccount();
  const searchParams = useSearchParams();
  const refFromUrl = searchParams.get("ref") || "";
  const { referrer, downline, downlineCount, isLoading, refetch } =
    useReferralInfo();
  const { isActive, tier } = useVaultStatus();
  const { data: totalStaked } = useTotalStaked();
  const { data: qualified } = useIsQualified(1);

  const registerHook = useRegisterReferrer();
  const [referrerInput, setReferrerInput] = useState(refFromUrl);
  const [copied, setCopied] = useState(false);

  const hasReferrer =
    referrer && referrer !== ZERO_ADDRESS;
  const currentTier = (tier as number) || 0;
  const matchingDepth =
    currentTier > 0
      ? TIER_CONFIGS[currentTier as 1 | 2 | 3]?.matchingLevels || 0
      : 0;

  useEffect(() => {
    if (registerHook.isSuccess) {
      refetch();
    }
  }, [registerHook.isSuccess, refetch]);

  // Set referrer from URL param
  useEffect(() => {
    if (refFromUrl && !referrerInput) {
      setReferrerInput(refFromUrl);
    }
  }, [refFromUrl, referrerInput]);

  const referralLink = address
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/?ref=${address}`
    : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Referrals & Bonuses</h2>
        <p className="text-gray-400">
          Connect your wallet to view referral info.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Referrals & Bonuses</h2>
      <p className="text-gray-400 text-sm mb-6">
        Earn 5% direct bonus on referred stakes, plus level-based matching bonuses on their rewards.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Referral Link */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4">Your Referral Link</h3>
          <div className="bg-gray-800 rounded-lg px-4 py-2.5 text-sm text-gray-300 mb-4 break-all font-mono">
            {referralLink || "Connect wallet to generate link"}
          </div>
          <button
            onClick={handleCopy}
            disabled={!referralLink}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {copied ? "Copied!" : "Copy Link"}
          </button>
        </div>

        {/* Register Referrer */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4">
            {hasReferrer ? "Your Referrer" : "Register Referrer"}
          </h3>
          {hasReferrer ? (
            <div>
              <p className="text-sm text-gray-400 mb-2">Your referrer is set to:</p>
              <div className="bg-gray-800 rounded-lg px-4 py-2.5 text-sm text-green-400 font-mono break-all">
                {referrer}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Referrer is permanent and cannot be changed.
              </p>
            </div>
          ) : (
            <div>
              <input
                type="text"
                placeholder="Referrer address (0x...)"
                value={referrerInput}
                onChange={(e) => setReferrerInput(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 mb-4 text-white text-sm font-mono"
              />
              <TxButton
                label="Set Referrer"
                pendingLabel="Registering..."
                successLabel="Referrer Set!"
                onClick={() =>
                  registerHook.register(referrerInput as `0x${string}`)
                }
                disabled={
                  !referrerInput ||
                  referrerInput.length !== 42 ||
                  !referrerInput.startsWith("0x")
                }
                isPending={registerHook.isPending}
                isSuccess={registerHook.isSuccess}
                isError={registerHook.isError}
                hash={registerHook.hash}
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-2">
                This action is one-time and irreversible.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Downline Count"
          value={downlineCount ? downlineCount.toString() : "0"}
          loading={isLoading}
        />
        <StatCard
          label="Matching Depth"
          value={`${matchingDepth} levels`}
          subtitle={currentTier > 0 ? tierName(currentTier) : "Activate vault"}
        />
        <StatCard
          label="Qualified"
          value={(qualified as boolean) ? "Yes" : "No"}
          valueClassName={
            (qualified as boolean) ? "text-green-400" : "text-red-400"
          }
          subtitle={`Min 500 BTN staked + active vault`}
        />
        <StatCard
          label="Personal Staked"
          value={`${formatBTN(totalStaked as bigint | undefined)} BTN`}
          subtitle={
            (totalStaked as bigint | undefined) &&
            (totalStaked as bigint) >= MIN_PERSONAL_STAKE
              ? "Meets minimum"
              : "Need 500 BTN minimum"
          }
        />
      </div>

      {/* Matching Bonus Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4">Matching Bonus Levels</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="text-left py-2 font-medium">Level</th>
                <th className="text-left py-2 font-medium">Percentage</th>
                <th className="text-left py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {MATCHING_LEVELS.map((level) => {
                const unlocked = level.level <= matchingDepth;
                return (
                  <tr
                    key={level.level}
                    className="border-b border-gray-800/50"
                  >
                    <td className="py-2">Level {level.level}</td>
                    <td className="py-2">{level.percentage}</td>
                    <td className="py-2">
                      <span
                        className={
                          unlocked
                            ? "text-green-400 text-xs"
                            : "text-gray-600 text-xs"
                        }
                      >
                        {unlocked ? "Unlocked" : "Locked"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Downline List */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4">Downline</h3>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-8 bg-gray-800 rounded animate-pulse"
                />
              ))}
            </div>
          ) : !downline || downline.length === 0 ? (
            <p className="text-gray-400 text-sm">
              No referrals yet. Share your link to start building your
              network.
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {downline.map((addr, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2"
                >
                  <span className="text-sm font-mono text-gray-300">
                    {truncateAddress(addr)}
                  </span>
                  <a
                    href={`https://sepolia.basescan.org/address/${addr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand-400 hover:text-brand-300"
                  >
                    View
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
