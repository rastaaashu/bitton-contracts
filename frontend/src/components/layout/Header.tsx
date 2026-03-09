"use client";

import { useRouter } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId } from "wagmi";
import { BASE_SEPOLIA_CHAIN_ID } from "@/config/constants";
import { useAuth } from "@/contexts/AuthContext";
import { truncateAddress } from "@/lib/format";

export function Header() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const isWrongNetwork = isConnected && chainId !== BASE_SEPOLIA_CHAIN_ID;

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  return (
    <header className="min-h-[4rem] border-b border-gray-800 flex flex-col">
      {isWrongNetwork && (
        <div className="bg-red-900/80 text-red-200 text-xs text-center py-1 px-4">
          Wrong network. Switch to Base Sepolia (ID: {BASE_SEPOLIA_CHAIN_ID}).
        </div>
      )}
      <div className="flex-1 flex items-center justify-between px-3 sm:px-6 pl-14 lg:pl-6">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs sm:text-sm text-gray-400 hidden sm:inline">Base Sepolia</span>
          <span className="inline-flex items-center gap-1 text-xs">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-green-400 hidden sm:inline">Live</span>
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          {isAuthenticated && user && (
            <div className="flex items-center gap-2 sm:gap-3">
              {user.email && (
                <span className="text-xs text-gray-400 hidden md:inline truncate max-w-[120px]">{user.email}</span>
              )}
              {user.evmAddress && (
                <span className="text-xs text-gray-500 hidden lg:inline">
                  {truncateAddress(user.evmAddress)}
                </span>
              )}
              <button
                onClick={handleLogout}
                className="text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-2 sm:px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              >
                Logout
              </button>
            </div>
          )}
          <ConnectButton
            showBalance={false}
            chainStatus="icon"
            accountStatus={{ smallScreen: "avatar", largeScreen: "address" }}
          />
        </div>
      </div>
    </header>
  );
}
