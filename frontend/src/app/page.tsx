"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSignMessage } from "wagmi";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/config/constants";

type AuthTab = "wallet" | "email" | "telegram";

const REF_STORAGE_KEY = "bitton_ref_code";

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <AuthContent />
    </Suspense>
  );
}

function AuthLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-md w-full text-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    </div>
  );
}

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<AuthTab>("wallet");
  const [agreed, setAgreed] = useState(false);

  // Referral code from URL or localStorage
  const refFromUrl = searchParams.get("ref") || "";
  const [sponsorCode, setSponsorCode] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return refFromUrl || localStorage.getItem(REF_STORAGE_KEY) || "";
    }
    return refFromUrl;
  });
  const [refValid, setRefValid] = useState<boolean | null>(null);
  const [refLabel, setRefLabel] = useState("");

  // Persist ref code
  useEffect(() => {
    if (refFromUrl) {
      localStorage.setItem(REF_STORAGE_KEY, refFromUrl);
      setSponsorCode(refFromUrl);
    } else if (typeof window !== "undefined") {
      const stored = localStorage.getItem(REF_STORAGE_KEY);
      if (stored) setSponsorCode(stored);
    }
  }, [refFromUrl]);

  // Redirect if authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, isLoading, router]);

  // Validate referral code
  useEffect(() => {
    if (!sponsorCode) {
      setRefValid(null);
      setRefLabel("");
      return;
    }
    setRefValid(null);
    fetch(`${API_BASE_URL}/sponsor/validate/${encodeURIComponent(sponsorCode)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setRefValid(true);
          setRefLabel(
            data.type === "wallet"
              ? `${data.referrer.slice(0, 6)}...${data.referrer.slice(-4)}`
              : data.code
          );
        } else {
          setRefValid(false);
        }
      })
      .catch(() => {
        setRefValid(true);
        setRefLabel(
          sponsorCode.length === 42
            ? `${sponsorCode.slice(0, 6)}...${sponsorCode.slice(-4)}`
            : sponsorCode
        );
      });
  }, [sponsorCode]);

  if (isLoading) return <AuthLoading />;

  const tabs: { key: AuthTab; label: string }[] = [
    { key: "wallet", label: "EVM Wallet" },
    { key: "email", label: "Email" },
    { key: "telegram", label: "Telegram" },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 sm:p-8 max-w-md w-full">
        <h2 className="text-2xl font-bold mb-1 text-center">BitTON.AI</h2>
        <p className="text-gray-400 text-sm text-center mb-6">
          Sign in or create an account
        </p>

        {/* Referral Code */}
        <div className="mb-6">
          <label className="block text-xs text-gray-500 mb-1.5">
            Referral Code {sponsorCode ? "(required for new accounts)" : "(optional — enter if you have one)"}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={sponsorCode}
              onChange={(e) => {
                setSponsorCode(e.target.value);
                if (e.target.value) {
                  localStorage.setItem(REF_STORAGE_KEY, e.target.value);
                } else {
                  localStorage.removeItem(REF_STORAGE_KEY);
                }
              }}
              placeholder="Referral code or wallet address"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono"
            />
            {sponsorCode && (
              <div className="flex items-center">
                {refValid === null && (
                  <span className="text-xs text-gray-500">...</span>
                )}
                {refValid === true && (
                  <span className="text-xs text-green-400" title={refLabel}>Valid</span>
                )}
                {refValid === false && (
                  <span className="text-xs text-red-400">Invalid</span>
                )}
              </div>
            )}
          </div>
          {refValid === true && refLabel && (
            <p className="text-xs text-gray-500 mt-1">
              Referred by: <span className="text-brand-400">{refLabel}</span>
            </p>
          )}
        </div>

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

        {activeTab === "wallet" && (
          <WalletAuth agreed={agreed} sponsorCode={sponsorCode} />
        )}
        {activeTab === "email" && (
          <EmailAuth agreed={agreed} sponsorCode={sponsorCode} />
        )}
        {activeTab === "telegram" && (
          <TelegramAuth agreed={agreed} sponsorCode={sponsorCode} />
        )}

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
              <strong className="text-gray-300">Risk Disclaimer:</strong> Digital
              assets and blockchain-based products involve significant risk and may
              result in the loss of all invested funds. Past performance does not
              guarantee future results. BitTON.AI does not provide financial,
              investment, or legal advice.
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════
// Wallet Auth (unified login/register)
// ══════════════════════════════════════
function WalletAuth({
  agreed,
  sponsorCode,
}: {
  agreed: boolean;
  sponsorCode: string;
}) {
  const { isConnected, address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { login } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [needsSponsor, setNeedsSponsor] = useState(false);

  const handleSign = async () => {
    if (!address) return;
    setLoading(true);
    setError("");

    try {
      // Step 1: Get challenge
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

      // Step 2: Sign the challenge message
      const signature = await signMessageAsync({
        message: challengeData.message,
      });

      // Step 3: Complete (unified - auto-detects login/register)
      const body: any = {
        address,
        signature,
        message: challengeData.message,
      };
      if (sponsorCode) body.sponsorCode = sponsorCode;

      const res = await fetch(`${API_BASE_URL}/auth/wallet/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "NEEDS_SPONSOR") {
          setNeedsSponsor(true);
          setError(
            "This is a new wallet. Please enter a referral code above to create your account."
          );
        } else {
          setError(data.error || "Authentication failed");
        }
        return;
      }

      if (data.isNewUser) {
        localStorage.removeItem(REF_STORAGE_KEY);
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
      <p className="text-sm text-gray-400">
        Connect your EVM wallet to sign in or create an account.
      </p>

      <div className="flex justify-center">
        <ConnectButton />
      </div>

      {isConnected && (
        <button
          onClick={handleSign}
          disabled={loading || !agreed}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium transition-colors"
        >
          {loading ? "Authenticating..." : "Sign & Continue"}
        </button>
      )}

      {needsSponsor && !sponsorCode && (
        <p className="text-sm text-yellow-400">
          Enter a referral code above, then try again.
        </p>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

// ══════════════════════════════════════
// Email Auth (unified login/register)
// ══════════════════════════════════════
function EmailAuth({
  agreed,
  sponsorCode,
}: {
  agreed: boolean;
  sponsorCode: string;
}) {
  const { isConnected, address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { login } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp" | "wallet">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [isNewUser, setIsNewUser] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE_URL}/auth/email/init`, {
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
      setIsNewUser(data.isNewUser);
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
      setError("");
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
      const message = `Sign this message to authenticate with BitTON.AI\n\nEmail: ${email}\nAddress: ${address}\nTimestamp: ${timestamp}`;
      const signature = await signMessageAsync({ message });

      const body: any = { sessionId, address, signature, message };
      if (sponsorCode) body.sponsorCode = sponsorCode;

      const res = await fetch(`${API_BASE_URL}/auth/email/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "NEEDS_SPONSOR") {
          setError(
            "New account detected. Please enter a referral code above, then try again."
          );
        } else {
          setError(data.error || "Authentication failed");
        }
        return;
      }

      if (data.isNewUser) {
        localStorage.removeItem(REF_STORAGE_KEY);
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
          const currentIndex =
            step === "email" ? 0 : step === "otp" ? 1 : 2;
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
              <span
                className={`text-xs ${
                  i <= currentIndex ? "text-white" : "text-gray-500"
                }`}
              >
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
            <label className="block text-sm text-gray-400 mb-1">
              Email address
            </label>
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
            disabled={loading || !agreed}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium"
          >
            {loading ? "Sending..." : "Send Verification Code"}
          </button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <p className="text-sm text-gray-400">
            A 6-digit code was sent to{" "}
            <span className="text-white">{email}</span>
          </p>
          {isNewUser && (
            <p className="text-xs text-yellow-400">
              New account — make sure you have a referral code above.
            </p>
          )}
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Verification Code
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) =>
                setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
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
          <p className="text-sm text-green-400">
            Email verified! Now connect your wallet.
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
              {loading ? "Signing in..." : "Sign & Continue"}
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

// ══════════════════════════════════════
// Telegram Auth (unified login/register)
// ══════════════════════════════════════
function TelegramAuth({
  agreed,
  sponsorCode,
}: {
  agreed: boolean;
  sponsorCode: string;
}) {
  const { isConnected, address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { login } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<"telegram" | "wallet">("telegram");
  const [sessionId, setSessionId] = useState("");
  const [isNewUser, setIsNewUser] = useState(false);
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

  const handleTelegramAuth = useCallback(
    async (telegramData: any) => {
      setLoading(true);
      setError("");

      try {
        const res = await fetch(`${API_BASE_URL}/auth/telegram/init`, {
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
        setIsNewUser(data.isNewUser);
        setTelegramUser(data.telegramUser);
        setStep("wallet");
      } catch {
        setError("Unable to connect to server.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!botConfigured || !botUsername || step !== "telegram") return;

    (window as any).onTelegramAuthUnified = handleTelegramAuth;

    const container = document.getElementById("telegram-login-unified");
    if (!container) return;
    container.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?23";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuthUnified(user)");
    script.setAttribute("data-request-access", "write");
    container.appendChild(script);

    return () => {
      delete (window as any).onTelegramAuthUnified;
    };
  }, [botConfigured, botUsername, step, handleTelegramAuth]);

  const handleComplete = async () => {
    if (!address) return;
    setLoading(true);
    setError("");

    try {
      const timestamp = new Date().toISOString();
      const message = `Sign this message to authenticate with BitTON.AI\n\nAddress: ${address}\nTimestamp: ${timestamp}`;
      const signature = await signMessageAsync({ message });

      const body: any = { sessionId, address, signature, message };
      if (sponsorCode) body.sponsorCode = sponsorCode;

      const res = await fetch(`${API_BASE_URL}/auth/telegram/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "NEEDS_SPONSOR") {
          setError(
            "New account detected. Please enter a referral code above, then try again."
          );
        } else {
          setError(data.error || "Authentication failed");
        }
        return;
      }

      if (data.isNewUser) {
        localStorage.removeItem(REF_STORAGE_KEY);
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
        <p className="text-gray-400 text-sm mb-2">
          Telegram login is not yet configured.
        </p>
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
          <p className="text-sm text-gray-400">
            Authenticate with your Telegram account.
          </p>
          {isNewUser === false && sponsorCode === "" && null}
          <div id="telegram-login-unified" className="flex justify-center" />
          {loading && (
            <p className="text-sm text-gray-400 text-center">Verifying...</p>
          )}
        </div>
      )}

      {step === "wallet" && (
        <div className="space-y-4">
          <p className="text-sm text-green-400">
            Telegram verified
            {telegramUser?.firstName
              ? ` as ${telegramUser.firstName}`
              : telegramUser?.username
              ? ` as @${telegramUser.username}`
              : ""}
            ! Now connect your wallet.
          </p>
          {isNewUser && !sponsorCode && (
            <p className="text-xs text-yellow-400">
              New account — enter a referral code above before continuing.
            </p>
          )}
          <div className="flex justify-center">
            <ConnectButton />
          </div>
          {isConnected && (
            <button
              onClick={handleComplete}
              disabled={loading || !agreed}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium"
            >
              {loading ? "Signing in..." : "Sign & Continue"}
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
