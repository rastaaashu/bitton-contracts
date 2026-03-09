"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/config/constants";
import { truncateAddress } from "@/lib/format";

interface Profile {
  id: string;
  email: string | null;
  evmAddress: string | null;
  telegramId: string | null;
  authMethod: string | null;
  status: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  sponsorCodes: { code: string; usedCount: number; maxUses: number }[];
  sponsor: { evmAddress: string | null; email: string | null } | null;
}

export default function SettingsPage() {
  const { address } = useAccount();
  const { user, authFetch, logout } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchProfile = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE_URL}/auth/profile`);
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      }
    } catch {
      setError("Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400">Loading profile...</div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Profile & Settings</h2>
      <p className="text-gray-400 text-sm mb-6">
        Manage your account and linked authentication methods.
      </p>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Account Info */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4">Account Information</h3>
          <div className="space-y-3">
            <InfoRow label="User ID" value={profile?.id || "-"} mono />
            <InfoRow label="Status" value={profile?.status || "-"} />
            <InfoRow
              label="Auth Method"
              value={profile?.authMethod || "WALLET"}
            />
            <InfoRow
              label="Member Since"
              value={
                profile?.createdAt
                  ? new Date(profile.createdAt).toLocaleDateString()
                  : "-"
              }
            />
            <InfoRow
              label="Last Login"
              value={
                profile?.lastLoginAt
                  ? new Date(profile.lastLoginAt).toLocaleString()
                  : "-"
              }
            />
          </div>
        </div>

        {/* Linked Methods */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4">Linked Auth Methods</h3>
          <div className="space-y-4">
            {/* Wallet */}
            <div className="flex items-center justify-between py-2 border-b border-gray-800">
              <div>
                <p className="text-sm font-medium text-white">EVM Wallet</p>
                <p className="text-xs text-gray-400 font-mono">
                  {profile?.evmAddress
                    ? truncateAddress(profile.evmAddress)
                    : "Not linked"}
                </p>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-green-900/30 text-green-400">
                Linked
              </span>
            </div>

            {/* Email */}
            <div className="flex items-center justify-between py-2 border-b border-gray-800">
              <div>
                <p className="text-sm font-medium text-white">Email</p>
                <p className="text-xs text-gray-400">
                  {profile?.email || "Not linked"}
                </p>
              </div>
              {profile?.email ? (
                <span className="text-xs px-2 py-1 rounded bg-green-900/30 text-green-400">
                  Verified
                </span>
              ) : (
                <LinkEmailButton onSuccess={fetchProfile} />
              )}
            </div>

            {/* Telegram */}
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-white">Telegram</p>
                <p className="text-xs text-gray-400">
                  {profile?.telegramId
                    ? `ID: ${profile.telegramId}`
                    : "Not linked"}
                </p>
              </div>
              {profile?.telegramId ? (
                <span className="text-xs px-2 py-1 rounded bg-green-900/30 text-green-400">
                  Linked
                </span>
              ) : (
                <LinkTelegramButton onSuccess={fetchProfile} />
              )}
            </div>
          </div>
        </div>

        {/* Sponsor Info */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4">Referral Info</h3>
          <div className="space-y-3">
            <InfoRow
              label="Your Sponsor"
              value={
                profile?.sponsor
                  ? profile.sponsor.email ||
                    truncateAddress(profile.sponsor.evmAddress || "")
                  : "None"
              }
            />
            {profile?.sponsorCodes && profile.sponsorCodes.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Your Referral Codes</p>
                {profile.sponsorCodes.map((sc) => (
                  <div
                    key={sc.code}
                    className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 mb-1"
                  >
                    <span className="text-sm font-mono text-brand-400">
                      {sc.code}
                    </span>
                    <span className="text-xs text-gray-500">
                      Used: {sc.usedCount}
                      {sc.maxUses > 0 ? `/${sc.maxUses}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-gray-900 border border-red-900/30 rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4 text-red-400">Session</h3>
          <p className="text-sm text-gray-400 mb-4">
            Sign out of your current session on this device.
          </p>
          <button
            onClick={logout}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-gray-500">{label}</span>
      <span
        className={`text-sm text-gray-300 ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

// ── Link Email ──
function LinkEmailButton({ onSuccess }: { onSuccess: () => void }) {
  const { authFetch } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleInit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`${API_BASE_URL}/auth/profile/link-email/init`, {
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

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(
        `${API_BASE_URL}/auth/profile/link-email/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, otp }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed");
        return;
      }
      setOpen(false);
      setStep("email");
      setEmail("");
      setOtp("");
      onSuccess();
    } catch {
      setError("Unable to connect to server.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-2 py-1 rounded bg-brand-600 hover:bg-brand-700 text-white transition-colors"
      >
        Link Email
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full">
        <h4 className="text-lg font-bold mb-4">Link Email Address</h4>

        {step === "email" && (
          <form onSubmit={handleInit} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm"
              >
                {loading ? "Sending..." : "Send Code"}
              </button>
            </div>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerify} className="space-y-4">
            <p className="text-sm text-gray-400">
              Enter the 6-digit code sent to{" "}
              <span className="text-white">{email}</span>
            </p>
            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) =>
                setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="000000"
              maxLength={6}
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-center text-2xl tracking-widest"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setStep("email");
                }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm"
              >
                {loading ? "Verifying..." : "Verify & Link"}
              </button>
            </div>
          </form>
        )}

        {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      </div>
    </div>
  );
}

// ── Link Telegram ──
function LinkTelegramButton({ onSuccess }: { onSuccess: () => void }) {
  const { authFetch } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [botUsername, setBotUsername] = useState("");
  const [botConfigured, setBotConfigured] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch(`${API_BASE_URL}/auth/telegram/config`)
      .then((r) => r.json())
      .then((data) => {
        setBotUsername(data.botUsername);
        setBotConfigured(data.configured);
      })
      .catch(() => {});
  }, [open]);

  const handleTelegramAuth = useCallback(
    async (telegramData: any) => {
      setLoading(true);
      setError("");
      try {
        const res = await authFetch(
          `${API_BASE_URL}/auth/profile/link-telegram`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(telegramData),
          }
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to link Telegram");
          return;
        }
        setOpen(false);
        onSuccess();
      } catch {
        setError("Unable to connect to server.");
      } finally {
        setLoading(false);
      }
    },
    [authFetch, onSuccess]
  );

  useEffect(() => {
    if (!open || !botConfigured || !botUsername) return;

    (window as any).onTelegramAuthLink = handleTelegramAuth;

    const container = document.getElementById("telegram-link-container");
    if (!container) return;
    container.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?23";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuthLink(user)");
    script.setAttribute("data-request-access", "write");
    container.appendChild(script);

    return () => {
      delete (window as any).onTelegramAuthLink;
    };
  }, [open, botConfigured, botUsername, handleTelegramAuth]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-2 py-1 rounded bg-brand-600 hover:bg-brand-700 text-white transition-colors"
      >
        Link Telegram
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full">
        <h4 className="text-lg font-bold mb-4">Link Telegram Account</h4>

        {!botConfigured ? (
          <p className="text-sm text-gray-400">
            Telegram is not configured. Contact the administrator.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Click the Telegram button below to link your account.
            </p>
            <div
              id="telegram-link-container"
              className="flex justify-center"
            />
            {loading && (
              <p className="text-sm text-gray-400 text-center">Linking...</p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-400 mt-2">{error}</p>}

        <button
          onClick={() => setOpen(false)}
          className="w-full mt-4 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
