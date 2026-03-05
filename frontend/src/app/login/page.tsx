"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSignMessage } from "wagmi";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/config/constants";

export default function LoginPage() {
  const { isConnected, address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { isAuthenticated, login } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, router]);

  const handleWalletLogin = async () => {
    if (!address) return;
    setLoading(true);
    setError("");

    try {
      // Step 1: Get challenge from backend
      const challengeRes = await fetch(`${API_BASE_URL}/auth/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });

      if (!challengeRes.ok) {
        const data = await challengeRes.json().catch(() => ({}));
        setError(data.error || "Failed to get challenge from server.");
        return;
      }

      const { message } = await challengeRes.json();

      // Step 2: Sign the challenge message
      const signature = await signMessageAsync({ message });

      // Step 3: Verify signature with backend
      const verifyRes = await fetch(`${API_BASE_URL}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature, message }),
      });

      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        setError(verifyData.error || "Login failed.");
        return;
      }

      // Step 4: Store tokens and redirect
      login(verifyData.accessToken, verifyData.refreshToken, verifyData.user);
      router.replace("/dashboard");
    } catch (err: any) {
      if (err?.name === "UserRejectedRequestError" || err?.message?.includes("User rejected")) {
        setError("Signature rejected. Please try again.");
      } else {
        setError("Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-md w-full">
        <h2 className="text-2xl font-bold mb-2 text-center">
          Welcome to BitTON.AI
        </h2>
        <p className="text-gray-400 text-sm text-center mb-8">
          Connect your wallet and sign to authenticate
        </p>

        {/* Step 1: Connect Wallet */}
        <div className="mb-6">
          <p className="text-sm text-gray-400 mb-3">Step 1: Connect your wallet</p>
          <div className="flex justify-center">
            <ConnectButton />
          </div>
        </div>

        {/* Step 2: Sign to Login */}
        {isConnected && (
          <div className="mb-6">
            <p className="text-sm text-gray-400 mb-3">Step 2: Sign message to login</p>
            <button
              onClick={handleWalletLogin}
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium transition-colors"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400 mb-4">{error}</p>
        )}

        <p className="text-center text-sm text-gray-500 mt-6">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="text-brand-400 hover:text-brand-300 underline"
          >
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
