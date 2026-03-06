"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSignMessage } from "wagmi";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/config/constants";

type AuthTab = "wallet" | "email" | "telegram";

const REF_STORAGE_KEY = "bitton_ref_code";

/** Persist ref code to localStorage so it survives redirects */
function useSponsorCode(): string {
  const searchParams = useSearchParams();
  const refFromUrl = searchParams.get("ref") || "";

  const [sponsorCode, setSponsorCode] = useState<string>(() => {
    // On first render, prefer URL param, then localStorage
    if (typeof window !== "undefined") {
      return refFromUrl || localStorage.getItem(REF_STORAGE_KEY) || "";
    }
    return refFromUrl;
  });

  useEffect(() => {
    // If ref is in URL, save it
    if (refFromUrl) {
      localStorage.setItem(REF_STORAGE_KEY, refFromUrl);
      setSponsorCode(refFromUrl);
    } else {
      // Try to recover from localStorage
      const stored = localStorage.getItem(REF_STORAGE_KEY);
      if (stored) setSponsorCode(stored);
    }
  }, [refFromUrl]);

  return sponsorCode;
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<RegisterLoading />}>
      <RegisterContent />
    </Suspense>
  );
}

function RegisterLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-md w-full text-center">
        <div className="text-gray-400">Loading registration...</div>
      </div>
    </div>
  );
}

function RegisterContent() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const sponsorCode = useSponsorCode();
  const [activeTab, setActiveTab] = useState<AuthTab>("wallet");
  const [ready, setReady] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [refValid, setRefValid] = useState<boolean | null>(null); // null = checking
  const [refLabel, setRefLabel] = useState<string>("");

  // Wait a tick for localStorage/searchParams to resolve
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, isLoading, router]);

  // Validate the referral code/address on the backend
  useEffect(() => {
    if (!sponsorCode || !ready) return;

    setRefValid(null);
    fetch(`${API_BASE_URL}/sponsor/validate/${encodeURIComponent(sponsorCode)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setRefValid(true);
          // Show truncated address or code name
          if (data.type === "wallet") {
            setRefLabel(`${data.referrer.slice(0, 6)}...${data.referrer.slice(-4)}`);
          } else {
            setRefLabel(data.code);
          }
        } else {
          setRefValid(false);
        }
      })
      .catch(() => {
        // Network error - still allow attempt, backend will validate at registration
        setRefValid(true);
        setRefLabel(sponsorCode.length === 42 ? `${sponsorCode.slice(0, 6)}...${sponsorCode.slice(-4)}` : sponsorCode);
      });
  }, [sponsorCode, ready]);

  // Don't show "Referral Required" until we've had a chance to read localStorage
  if (!ready || isLoading) {
    return <RegisterLoading />;
  }

  if (!sponsorCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-md w-full text-center">
          <h2 className="text-2xl font-bold mb-4">Referral Required</h2>
          <p className="text-gray-400 mb-6">
            You need a referral link to register. Please ask an existing member for an invite.
          </p>
          <Link href="/login" className="text-brand-400 hover:text-brand-300 underline">
            Already have an account? Login
          </Link>
        </div>
      </div>
    );
  }

  if (refValid === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-md w-full text-center">
          <h2 className="text-2xl font-bold mb-4 text-red-400">Invalid Referral</h2>
          <p className="text-gray-400 mb-2">
            The referral link you used is no longer valid or the referrer account was not found.
          </p>
          <p className="text-gray-500 text-sm mb-6">
            Code: <span className="font-mono text-gray-300">{sponsorCode.length > 20 ? `${sponsorCode.slice(0, 10)}...${sponsorCode.slice(-6)}` : sponsorCode}</span>
          </p>
          <p className="text-gray-400 mb-6">
            Please ask an existing member for a new invite link.
          </p>
          <Link href="/login" className="text-brand-400 hover:text-brand-300 underline">
            Already have an account? Login
          </Link>
        </div>
      </div>
    );
  }

  const tabs: { key: AuthTab; label: string }[] = [
    { key: "wallet", label: "EVM Wallet" },
    { key: "email", label: "Email" },
    { key: "telegram", label: "Telegram" },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-md w-full">
        <h2 className="text-2xl font-bold mb-2 text-center">Create Account</h2>
        <p className="text-gray-400 text-sm text-center mb-1">Register to start using BitTON.AI</p>
        <p className="text-xs text-gray-500 text-center mb-6">
          Referred by: <span className="text-brand-400">{refLabel || sponsorCode}</span>
          {refValid === null && <span className="text-gray-600 ml-1">(verifying...)</span>}
        </p>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
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

        {activeTab === "wallet" && <WalletRegister sponsorCode={sponsorCode} agreed={agreed} />}
        {activeTab === "email" && <EmailRegister sponsorCode={sponsorCode} agreed={agreed} />}
        {activeTab === "telegram" && <TelegramRegister sponsorCode={sponsorCode} agreed={agreed} />}

        {/* Risk Disclaimer */}
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
          Already have an account?{" "}
          <Link href="/login" className="text-brand-400 hover:text-brand-300 underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}

// ── Wallet Registration ──
function WalletRegister({ sponsorCode, agreed }: { sponsorCode: string; agreed: boolean }) {
  const { isConnected, address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { login } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRegister = async () => {
    if (!address) return;
    setLoading(true);
    setError("");

    try {
      const timestamp = new Date().toISOString();
      const message = `Sign this message to register with BitTON.AI\n\nAddress: ${address}\nTimestamp: ${timestamp}`;
      const signature = await signMessageAsync({ message });

      const res = await fetch(`${API_BASE_URL}/auth/register/wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature, message, sponsorCode }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }

      // Clear stored ref code on successful registration
      localStorage.removeItem(REF_STORAGE_KEY);
      login(data.accessToken, data.refreshToken, data.user);
      router.replace("/dashboard");
    } catch (err: any) {
      if (err?.message?.includes("User rejected")) {
        setError("Signature rejected.");
      } else {
        setError("Unable to connect to server. Please wait a moment and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">Connect your wallet and sign a message to register.</p>
      <div className="flex justify-center">
        <ConnectButton />
      </div>
      {isConnected && (
        <button
          onClick={handleRegister}
          disabled={loading || !agreed}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium transition-colors"
        >
          {loading ? "Registering..." : "Sign & Register"}
        </button>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

// ── Email Registration ──
function EmailRegister({ sponsorCode, agreed }: { sponsorCode: string; agreed: boolean }) {
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
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE_URL}/auth/register/email/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send verification code");
        return;
      }
      setSessionId(data.sessionId);
      setStep("otp");
    } catch {
      setError("Unable to connect to server. Please wait a moment and try again.");
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
      setError("Unable to connect to server. Please wait a moment and try again.");
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
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to resend");
        return;
      }
      setError("");
      setOtp("");
    } catch {
      setError("Unable to connect to server.");
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!address) return;
    setLoading(true);
    setError("");

    try {
      const timestamp = new Date().toISOString();
      const message = `Sign this message to register with BitTON.AI\n\nEmail: ${email}\nAddress: ${address}\nTimestamp: ${timestamp}`;
      const signature = await signMessageAsync({ message });

      const res = await fetch(`${API_BASE_URL}/auth/register/email/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, sponsorCode, address, signature, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }
      localStorage.removeItem(REF_STORAGE_KEY);
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
                  i <= currentIndex
                    ? "bg-brand-600 text-white"
                    : "bg-gray-700 text-gray-400"
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
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium"
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
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium"
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
          <div className="flex justify-center">
            <ConnectButton />
          </div>
          {isConnected && (
            <button
              onClick={handleComplete}
              disabled={loading || !agreed}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium"
            >
              {loading ? "Completing..." : "Sign & Complete Registration"}
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

// ── Telegram Registration ──
function TelegramRegister({ sponsorCode, agreed }: { sponsorCode: string; agreed: boolean }) {
  const { isConnected, address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { login } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<"telegram" | "wallet">("telegram");
  const [sessionId, setSessionId] = useState("");
  const [telegramUser, setTelegramUser] = useState<any>(null);
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
      const res = await fetch(`${API_BASE_URL}/auth/register/telegram/init`, {
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
      setTelegramUser(data.telegramUser);
      setStep("wallet");
    } catch {
      setError("Unable to connect to server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!botConfigured || !botUsername || step !== "telegram") return;

    (window as any).onTelegramAuth = handleTelegramAuth;

    const container = document.getElementById("telegram-login-container");
    if (!container) return;
    container.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?23";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    container.appendChild(script);

    return () => {
      delete (window as any).onTelegramAuth;
    };
  }, [botConfigured, botUsername, step, handleTelegramAuth]);

  const handleComplete = async () => {
    if (!address) return;
    setLoading(true);
    setError("");

    try {
      const timestamp = new Date().toISOString();
      const message = `Sign this message to register with BitTON.AI\n\nAddress: ${address}\nTimestamp: ${timestamp}`;
      const signature = await signMessageAsync({ message });

      const res = await fetch(`${API_BASE_URL}/auth/register/telegram/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, sponsorCode, address, signature, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }
      localStorage.removeItem(REF_STORAGE_KEY);
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
          The administrator needs to set up a Telegram Bot and configure
          TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME in the backend.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {step === "telegram" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">Log in with your Telegram account.</p>
          <div id="telegram-login-container" className="flex justify-center" />
          {loading && <p className="text-sm text-gray-400 text-center">Verifying...</p>}
        </div>
      )}

      {step === "wallet" && (
        <div className="space-y-4">
          <p className="text-sm text-green-400">
            Telegram verified as {telegramUser?.firstName || telegramUser?.username}! Now connect your wallet.
          </p>
          <div className="flex justify-center">
            <ConnectButton />
          </div>
          {isConnected && (
            <button
              onClick={handleComplete}
              disabled={loading || !agreed}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium"
            >
              {loading ? "Completing..." : "Sign & Complete Registration"}
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
