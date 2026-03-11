"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

interface GatedConnectButtonProps {
  agreed: boolean;
}

/**
 * Wraps RainbowKit's ConnectButton.
 * When `agreed` is false, an overlay blocks all clicks and shows a hint.
 */
export function GatedConnectButton({ agreed }: GatedConnectButtonProps) {
  return (
    <div className="relative">
      {!agreed && (
        <div
          className="absolute inset-0 z-10 cursor-not-allowed rounded-lg bg-gray-900/60 flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-xs text-yellow-400 font-medium px-2 text-center">
            Accept the disclaimer below first
          </span>
        </div>
      )}
      <div className={agreed ? "" : "pointer-events-none opacity-50"}>
        <ConnectButton />
      </div>
    </div>
  );
}
