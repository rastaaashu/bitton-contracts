"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, useSignMessage } from "wagmi";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/config/constants";
import { InAppBrowserBanner } from "@/components/auth/InAppBrowserBanner";
import { GatedConnectButton } from "@/components/auth/GatedConnectButton";

type AuthTab = "wallet" | "email" | "telegram";

export default function LoginPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AuthTab>("wallet");
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, router]);

  const tabs: { key: AuthTab; label: string }[] = [
    { key: "wallet", label: "EVM Wallet" },
    { key: "email", label: "Email" },
    { key: "telegram", label: "Telegram" },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 sm:p-8 max-w-md w-full">
        <h2 className="text-2xl font-bold mb-2 text-center">Welcome to BitTON.AI</h2>
        <p className="text-gray-400 text-sm text-center mb-6">
          Sign in to your account
        </p>

        {/* Tabs */}
        <div className={`flex border-b border-gray-700 mb-6 ${!agreed ? "opacity-50 pointer-events-none" : ""}`}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              disabled={!agreed}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "text-brand-400 border-b-2 border-brand-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Auth forms — all disabled until agreed */}
        <div className={!agreed ? "opacity-40 pointer-events-none select-none" : ""}>
          {activeTab === "wallet" && <WalletLogin agreed={agreed} />}
          {activeTab === "email" && <EmailLogin agreed={agreed} />}
          {activeTab === "telegram" && <TelegramLogin agreed={agreed} />}
        </div>

        {/* Risk Disclaimer — at bottom */}
        <div className="mt-6 border-t border-gray-700 pt-4">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-brand-600 focus:ring-brand-500 flex-shrink-0"
            />
            <span className="text-xs text-gray-400 leading-relaxed group-hover:text-gray-300">
              <strong className="text-gray-300">Risk Disclaimer:</strong> Digital assets and blockchain-based products involve significant risk and may result in the loss of all invested funds. Past performance does not guarantee future results. BitTON.AI does not provide financial, investment, or legal advice. Users are solely responsible for their decisions and should carefully evaluate all risks before participating.
            </span>
          </label>
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-brand-400 hover:text-brand-300 underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════
// Wallet Login (direct — no email/telegram needed)
// ══════════════════════════════════════
function WalletLogin({ agreed }: { agreed: boolean }) {
  const { isConnected, address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { login } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSign = async () => {
    if (!address) return;
    setLoading(true);
    setError("");

    try {
      const challengeRes = await fetch(
        `${API_BASE_URL}/auth/login/wallet/challenge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        }
      );
      const challengeData = await challengeRes.json();
      if (!challengeRes.ok) {
        setError(challengeData.error || "Failed to get challenge");
        return;
      }

      const signature = await signMessageAsync({
        message: challengeData.message,
      });

      const res = await fetch(`${API_BASE_URL}/auth/login/wallet/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature, message: challengeData.message }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error?.includes("not found") || data.error?.includes("No account")) {
          setError("No account found for this wallet. Please register first.");
        } else {
          setError(data.error || "Login failed");
        }
        return;
      }

      login(data.accessToken, data.refreshToken, data.user);
      router.replace("/dashboard");
    } catch (err: any) {
      if (err?.message?.includes("User rejected")) {
        setError("Signature rejected.");
      } else {
        setError("Unable to connect to server.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <InAppBrowserBanner />

      <p className="text-sm text-gray-400">
        Connect your EVM wallet and sign to log in.
      </p>

      <GatedConnectButton agreed={agreed} />

      {isConnected && (
        <button
          onClick={handleSign}
          disabled={loading || !agreed}
          className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium transition-colors"
        >
          {loading ? "Signing in..." : "Sign & Login"}
        </button>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

// ══════════════════════════════════════
// Email Login
// ══════════════════════════════════════
function EmailLogin({ agreed }: { agreed: boolean }) {
  const { isConnected, address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { login } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp" | "wallet">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login/email/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send code");
        return;
      }
      setSessionId(data.sessionId);
      setStep("otp");
    } catch {
      setError("Unable to connect to server.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid code");
        return;
      }
      setStep("wallet");
    } catch {
      setError("Unable to connect to server.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/auth/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to resend");
        return;
      }
      setOtp("");
    } catch {
      setError("Unable to connect to server.");
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!address || !agreed) return;
    setLoading(true);
    setError("");

    try {
      const timestamp = new Date().toISOString();
      const message = `Sign this message to authenticate with BitTON.AI\n\nEmail: ${email}\nAddress: ${address}\nTimestamp: ${timestamp}`;
      const signature = await signMessageAsync({ message });

      const res = await fetch(`${API_BASE_URL}/auth/login/email/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, address, signature, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      login(data.accessToken, data.refreshToken, data.user);
      router.replace("/dashboard");
    } catch (err: any) {
      if (err?.message?.includes("User rejected")) {
        setError("Signature rejected.");
      } else {
        setError("Unable to connect to server.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 mb-2">
        {["Email", "Verify", "Wallet"].map((label, i) => {
          const currentIndex = step === "email" ? 0 : step === "otp" ? 1 : 2;
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                  i <= currentIndex ? "bg-brand-600 text-white" : "bg-gray-700 text-gray-400"
                }`}
              >
                {i + 1}
              </div>
              <span className={`text-xs ${i <= currentIndex ? "text-white" : "text-gray-500"}`}>
                {label}
              </span>
              {i < 2 && <div className="w-6 h-px bg-gray-700" />}
            </div>
          );
        })}
      </div>

      {step === "email" && (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={!agreed}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !agreed}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium"
          >
            {loading ? "Sending..." : "Send Verification Code"}
          </button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <p className="text-sm text-gray-400">
            A 6-digit code was sent to <span className="text-white">{email}</span>
          </p>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Verification Code</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              required
              maxLength={6}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-center text-2xl tracking-widest"
            />
          </div>
          <button
            type="submit"
            disabled={loading || otp.length !== 6}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium"
          >
            {loading ? "Verifying..." : "Verify Code"}
          </button>
          <button
            type="button"
            onClick={handleResendOtp}
            disabled={loading}
            className="w-full text-sm text-gray-400 hover:text-white"
          >
            Resend code
          </button>
        </form>
      )}

      {step === "wallet" && (
        <div className="space-y-4">
          <p className="text-sm text-green-400">Email verified! Now connect your wallet.</p>
          <InAppBrowserBanner />
          <GatedConnectButton agreed={agreed} />
          {isConnected && (
            <button
              onClick={handleComplete}
              disabled={loading || !agreed}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium"
            >
              {loading ? "Signing in..." : "Sign & Login"}
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

// ══════════════════════════════════════
// Telegram Login
// ══════════════════════════════════════
function TelegramLogin({ agreed }: { agreed: boolean }) {
  const { isConnected, address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { login } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<"telegram" | "wallet">("telegram");
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [botUsername, setBotUsername] = useState("");
  const [botConfigured, setBotConfigured] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/auth/telegram/config`)
      .then((r) => r.json())
      .then((data) => {
        setBotUsername(data.botUsername);
        setBotConfigured(data.configured);
      })
      .catch(() => {});
  }, []);

  const handleTelegramAuth = useCallback(async (telegramData: any) => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login/telegram/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(telegramData),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Telegram auth failed");
        return;
      }
      setSessionId(data.sessionId);
      setStep("wallet");
    } catch {
      setError("Unable to connect to server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!botConfigured || !botUsername || step !== "telegram") return;

    (window as any).onTelegramAuthLogin = handleTelegramAuth;

    const container = document.getElementById("telegram-login-container-login");
    if (!container) return;
    container.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?23";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuthLogin(user)");
    script.setAttribute("data-request-access", "write");
    container.appendChild(script);

    return () => {
      delete (window as any).onTelegramAuthLogin;
    };
  }, [botConfigured, botUsername, step, handleTelegramAuth]);

  const handleComplete = async () => {
    if (!address || !agreed) return;
    setLoading(true);
    setError("");

    try {
      const timestamp = new Date().toISOString();
      const message = `Sign this message to authenticate with BitTON.AI\n\nAddress: ${address}\nTimestamp: ${timestamp}`;
      const signature = await signMessageAsync({ message });

      const res = await fetch(`${API_BASE_URL}/auth/login/telegram/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, address, signature, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      login(data.accessToken, data.refreshToken, data.user);
      router.replace("/dashboard");
    } catch (err: any) {
      if (err?.message?.includes("User rejected")) {
        setError("Signature rejected.");
      } else {
        setError("Unable to connect to server.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!botConfigured) {
    return (
      <div className="text-center py-4">
        <p className="text-gray-400 text-sm mb-2">Telegram login is not yet configured.</p>
        <p className="text-gray-500 text-xs">
          The administrator needs to set up TELEGRAM_BOT_TOKEN and
          TELEGRAM_BOT_USERNAME environment variables.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {step === "telegram" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">Log in with your Telegram account.</p>
          <div id="telegram-login-container-login" className="flex justify-center" />
          {loading && <p className="text-sm text-gray-400 text-center">Verifying...</p>}
        </div>
      )}

      {step === "wallet" && (
        <div className="space-y-4">
          <p className="text-sm text-green-400">Telegram verified! Now connect your wallet.</p>
          <InAppBrowserBanner />
          <GatedConnectButton agreed={agreed} />
          {isConnected && (
            <button
              onClick={handleComplete}
              disabled={loading || !agreed}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium"
            >
              {loading ? "Signing in..." : "Sign & Login"}
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
