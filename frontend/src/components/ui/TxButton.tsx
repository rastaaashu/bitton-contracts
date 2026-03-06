"use client";

import { clsx } from "clsx";
import { txUrl } from "@/lib/format";

interface TxButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isPending?: boolean;
  isSuccess?: boolean;
  isError?: boolean;
  hash?: string;
  label: string;
  pendingLabel?: string;
  successLabel?: string;
  className?: string;
  variant?: "primary" | "secondary" | "danger";
}

export function TxButton({
  onClick,
  disabled = false,
  isPending = false,
  isSuccess = false,
  isError = false,
  hash,
  label,
  pendingLabel = "Confirming...",
  successLabel = "Success!",
  className,
  variant = "primary",
}: TxButtonProps) {
  const baseClasses =
    "px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const variantClasses = {
    primary: "bg-brand-600 hover:bg-brand-700 text-white",
    secondary:
      "border border-brand-600 text-brand-400 hover:bg-brand-600/10",
    danger: "bg-red-600 hover:bg-red-700 text-white",
  };

  if (isSuccess && hash) {
    return (
      <div className="space-y-2">
        <button
          className={clsx(
            baseClasses,
            "bg-green-600 text-white cursor-default",
            className
          )}
          disabled
        >
          {successLabel}
        </button>
        <a
          href={txUrl(hash)}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs text-brand-400 hover:text-brand-300 underline"
        >
          View transaction
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        onClick={onClick}
        disabled={disabled || isPending}
        className={clsx(baseClasses, variantClasses[variant], className)}
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <svg
              className="animate-spin h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            {pendingLabel}
          </span>
        ) : (
          label
        )}
      </button>
      {isError && (
        <p className="text-xs text-red-400">Transaction failed. Please try again.</p>
      )}
    </div>
  );
}
