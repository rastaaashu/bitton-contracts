"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useAccount } from "wagmi";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const { isConnected } = useAccount();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isConnected)) {
      router.replace("/");
    }
  }, [isAuthenticated, isConnected, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated || !isConnected) {
    return null;
  }

  return <>{children}</>;
}
