"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { TxButton } from "@/components/ui/TxButton";
import { useWithdrawableBalance } from "@/hooks/useContracts";
import { useWithdraw } from "@/hooks/useContractWrite";
import { formatBTN, parseBTN } from "@/lib/format";

export default function WithdrawPage() {
  const { isConnected } = useAccount();
  const {
    data: withdrawable,
    isLoading,
    refetch,
  } = useWithdrawableBalance();
  const withdrawHook = useWithdraw();

  const [amount, setAmount] = useState("");
  const parsedAmount = parseBTN(amount);
  const balance = (withdrawable as bigint) || 0n;
  const hasBalance = balance > 0n;
  const isValidAmount = parsedAmount > 0n && parsedAmount <= balance;

  useEffect(() => {
    if (withdrawHook.isSuccess) {
      refetch();
      setAmount("");
    }
  }, [withdrawHook.isSuccess, refetch]);

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Withdrawal Wallet</h2>
        <p className="text-gray-400">
          Connect your wallet to withdraw BTN.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Withdrawal Wallet</h2>
      <p className="text-gray-400 text-sm mb-6">
        Withdraw your available BTN tokens to your wallet. This balance comes
        from reward settlements and vesting releases.
      </p>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-8 max-w-md">
        <p className="text-sm text-gray-400 mb-1">Withdrawable Balance</p>
        {isLoading ? (
          <div className="h-8 w-32 bg-gray-800 rounded animate-pulse" />
        ) : (
          <p className="text-2xl font-semibold">
            {formatBTN(balance)} <span className="text-gray-500">BTN</span>
          </p>
        )}
      </div>

      <div className="max-w-md">
        <div className="relative mb-2">
          <input
            type="text"
            placeholder="Amount to withdraw (BTN)"
            value={amount}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9.]/g, "");
              setAmount(val);
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white pr-16"
          />
          <button
            onClick={() =>
              setAmount(formatBTN(balance).replace(/,/g, ""))
            }
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-brand-400 hover:text-brand-300"
          >
            MAX
          </button>
        </div>

        {parsedAmount > balance && (
          <p className="text-xs text-red-400 mb-2">
            Amount exceeds your withdrawable balance.
          </p>
        )}

        <TxButton
          label="Withdraw BTN"
          pendingLabel="Withdrawing..."
          successLabel="Withdrawn!"
          onClick={() => withdrawHook.withdraw(parsedAmount)}
          disabled={!isValidAmount}
          isPending={withdrawHook.isPending}
          isSuccess={withdrawHook.isSuccess}
          isError={withdrawHook.isError}
          hash={withdrawHook.hash}
          className="w-full"
        />

        <p className="text-xs text-gray-500 mt-3">
          BTN tokens will be transferred directly to your connected wallet.
        </p>
      </div>
    </div>
  );
}
