"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { truncateAddress, txUrl } from "@/lib/format";
import { API_BASE_URL } from "@/config/constants";
import type { HistoryEntry } from "@/types";

export default function HistoryPage() {
  const { isConnected, address } = useAccount();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!address) return;

    async function fetchHistory() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_BASE_URL}/api/history/${address}`);
        if (res.ok) {
          const data = await res.json();
          setHistory(data.history || data || []);
        } else {
          // Backend not available, show empty state
          setHistory([]);
        }
      } catch {
        // Backend not available
        setHistory([]);
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, [address]);

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Transaction History</h2>
        <p className="text-gray-400">
          Connect your wallet to view transaction history.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Transaction History</h2>
      <p className="text-gray-400 text-sm mb-6">
        View your recent on-chain transactions and activities.
      </p>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400">
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-left px-4 py-3 font-medium">Amount</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Tx Hash</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <>
                {[1, 2, 3].map((i) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    <td colSpan={4} className="px-4 py-3">
                      <div className="h-5 bg-gray-800 rounded animate-pulse" />
                    </td>
                  </tr>
                ))}
              </>
            ) : history.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-12 text-center text-gray-500"
                >
                  <div className="space-y-2">
                    <p>No transaction history available.</p>
                    <p className="text-xs">
                      History is fetched from the backend API. If the backend
                      is not running, this page will show empty.
                    </p>
                    <a
                      href={`https://sepolia.basescan.org/address/${address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-400 hover:text-brand-300 text-xs underline"
                    >
                      View all transactions on BaseScan
                    </a>
                  </div>
                </td>
              </tr>
            ) : (
              history.map((entry, i) => (
                <tr
                  key={i}
                  className="border-b border-gray-800/50 hover:bg-gray-800/30"
                >
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-gray-800 rounded text-xs">
                      {entry.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{entry.amount}</td>
                  <td className="px-4 py-3 text-gray-400">{entry.date}</td>
                  <td className="px-4 py-3">
                    <a
                      href={txUrl(entry.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-400 hover:text-brand-300 font-mono text-xs"
                    >
                      {truncateAddress(entry.txHash)}
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* BaseScan Link */}
      <div className="mt-4 text-center">
        <a
          href={`https://sepolia.basescan.org/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-brand-400 hover:text-brand-300 underline"
        >
          View full transaction history on BaseScan
        </a>
      </div>
    </div>
  );
}
