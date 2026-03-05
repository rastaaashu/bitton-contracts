"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSignMessage } from "wagmi";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/config/constants";

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="text-gray-400 p-6">Loading...</div>}>
      <RegisterContent />
    </Suspense>
  );
}

function RegisterContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { isConnected, address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const sponsorCode = searchParams.get("ref") || "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, router]);

  // Sponsor code is required
  if (!sponsorCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-md w-full text-center">
          <h2 className="text-2xl font-bold mb-4">Referral Required</h2>
          <p className="text-gray-400 mb-6">
            You need a referral link to register. Please ask an existing member for an invite.
          </p>
          <Link
            href="/login"
            className="text-brand-400 hover:text-brand-300 underline"
          >
            Already have an account? Login
          </Link>
        </div>
      </div>
    );
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!isConnected || !address) {
      setError("Please connect your wallet first.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      // Sign registration message
      const timestamp = new Date().toISOString();
      const message = `Sign this message to register with BitTON.AI\n\nEmail: ${email}\nAddress: ${address}\nTimestamp: ${timestamp}`;
      const signature = await signMessageAsync({ message });

      // Send to backend
      const res = await fetch(`${API_BASE_URL}/auth/register-wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          sponsorCode,
          address,
          signature,
          message,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess("Registration successful! Check your email to verify your account.");
        setEmail("");
        setPassword("");
        setConfirmPassword("");
      } else {
        setError(data.error || "Registration failed. Please try again.");
      }
    } catch (err: any) {
      if (err?.name === "UserRejectedRequestError" || err?.message?.includes("User rejected")) {
        setError("Signature rejected. Please try again.");
      } else {
        setError("Unable to connect to server. Please try again later.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-md w-full">
        <h2 className="text-2xl font-bold mb-2 text-center">
          Create Account
        </h2>
        <p className="text-gray-400 text-sm text-center mb-2">
          Register to start using BitTON.AI
        </p>
        <p className="text-xs text-gray-500 text-center mb-6">
          Referred by: <span className="text-brand-400">{sponsorCode}</span>
        </p>

        {/* Wallet Connection */}
        <div className="mb-6">
          <p className="text-sm text-gray-400 mb-2">Connect your wallet (required)</p>
          <div className="flex justify-center">
            <ConnectButton />
          </div>
          {isConnected && address && (
            <p className="text-xs text-green-400 text-center mt-2">
              Wallet connected
            </p>
          )}
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && (
            <div className="text-sm text-green-400">
              <p>{success}</p>
              <Link
                href="/login"
                className="underline text-brand-400 hover:text-brand-300"
              >
                Go to Login
              </Link>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !isConnected}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium transition-colors"
          >
            {loading ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-brand-400 hover:text-brand-300 underline"
          >
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
