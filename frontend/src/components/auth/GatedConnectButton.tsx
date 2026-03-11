"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

interface GatedConnectButtonProps {
  agreed: boolean;
}

export function GatedConnectButton({ agreed }: GatedConnectButtonProps) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openChainModal, openAccountModal, mounted }) => {
        const connected = mounted && account && chain;

        return (
          <div
            className="flex justify-center"
            {...(!mounted && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    disabled={!agreed}
                    type="button"
                    className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 px-8 rounded-lg font-medium transition-colors text-sm"
                  >
                    Connect Wallet
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    type="button"
                    className="bg-red-600 hover:bg-red-700 text-white py-3 px-8 rounded-lg font-medium transition-colors text-sm"
                  >
                    Wrong Network
                  </button>
                );
              }

              return (
                <button
                  onClick={openAccountModal}
                  type="button"
                  className="bg-gray-800 hover:bg-gray-700 text-white py-3 px-8 rounded-lg font-medium transition-colors text-sm flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  {account.displayName}
                </button>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
