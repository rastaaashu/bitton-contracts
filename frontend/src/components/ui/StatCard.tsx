"use client";

import { clsx } from "clsx";

interface StatCardProps {
  label: string;
  value: string;
  subtitle?: string;
  loading?: boolean;
  className?: string;
  valueClassName?: string;
}

export function StatCard({
  label,
  value,
  subtitle,
  loading = false,
  className,
  valueClassName,
}: StatCardProps) {
  return (
    <div
      className={clsx(
        "bg-gray-900 border border-gray-800 rounded-xl p-5",
        className
      )}
    >
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      {loading ? (
        <div className="h-7 w-24 bg-gray-800 rounded animate-pulse" />
      ) : (
        <p className={clsx("text-xl font-semibold", valueClassName)}>
          {value}
        </p>
      )}
      {subtitle && (
        <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
      )}
    </div>
  );
}
