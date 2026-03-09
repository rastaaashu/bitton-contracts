import { z } from "zod";

const evmAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address");

// ── Registration: Wallet ──
export const registerWalletSchema = z.object({
  address: evmAddress,
  signature: z.string().min(1, "Signature is required"),
  message: z.string().min(1, "Message is required"),
  sponsorCode: z.string().min(1, "Sponsor code is required"),
});

// ── Registration: Email init ──
export const registerEmailInitSchema = z.object({
  email: z.string().email("Invalid email address"),
});

// ── Verify OTP (shared for email register + login) ──
export const verifyOtpSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  otp: z.string().length(6, "OTP must be 6 digits").regex(/^\d{6}$/, "OTP must be numeric"),
});

// ── Registration: Email complete ──
export const registerEmailCompleteSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  sponsorCode: z.string().min(1, "Sponsor code is required"),
  address: evmAddress,
  signature: z.string().min(1, "Signature is required"),
  message: z.string().min(1, "Message is required"),
});

// ── Registration: Telegram init ──
export const registerTelegramInitSchema = z.object({
  id: z.number().int(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.number().int(),
  hash: z.string().min(1, "Hash is required"),
});

// ── Registration: Telegram complete ──
export const registerTelegramCompleteSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  sponsorCode: z.string().min(1, "Sponsor code is required"),
  address: evmAddress,
  signature: z.string().min(1, "Signature is required"),
  message: z.string().min(1, "Message is required"),
});

// ── Login: Wallet challenge ──
export const challengeSchema = z.object({
  address: evmAddress,
});

// ── Login: Wallet verify ──
export const walletVerifySchema = z.object({
  address: evmAddress,
  signature: z.string().min(1, "Signature is required"),
  message: z.string().min(1, "Message is required"),
});

// ── Login: Email init ──
export const loginEmailInitSchema = z.object({
  email: z.string().email("Invalid email address"),
});

// ── Login: Email/Telegram complete ──
export const loginCompleteSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  address: evmAddress,
  signature: z.string().min(1, "Signature is required"),
  message: z.string().min(1, "Message is required"),
});

// ── Login: Telegram init ──
export const loginTelegramInitSchema = z.object({
  id: z.number().int(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.number().int(),
  hash: z.string().min(1, "Hash is required"),
});

// ── Unified auth (auto-detect login/register) ──
export const unifiedWalletCompleteSchema = z.object({
  address: evmAddress,
  signature: z.string().min(1, "Signature is required"),
  message: z.string().min(1, "Message is required"),
  sponsorCode: z.string().optional(),
});

export const unifiedEmailInitSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const unifiedEmailCompleteSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  address: evmAddress,
  signature: z.string().min(1, "Signature is required"),
  message: z.string().min(1, "Message is required"),
  sponsorCode: z.string().optional(),
});

export const unifiedTelegramCompleteSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  address: evmAddress,
  signature: z.string().min(1, "Signature is required"),
  message: z.string().min(1, "Message is required"),
  sponsorCode: z.string().optional(),
});

export const linkEmailInitSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const linkEmailVerifySchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  otp: z.string().length(6, "OTP must be 6 digits").regex(/^\d{6}$/, "OTP must be numeric"),
});

export const linkTelegramSchema = z.object({
  id: z.number().int(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.number().int(),
  hash: z.string().min(1, "Hash is required"),
});

// ── Sponsor codes (admin) ──
export const createSponsorCodeSchema = z.object({
  code: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/, "Code must be alphanumeric with dashes/underscores"),
  maxUses: z.number().int().min(0).optional().default(0),
});

// ── Legacy schemas (kept for backwards compat) ──
export const registerEmailSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  sponsorCode: z.string().optional(),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export const loginEmailSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const sponsorConfirmSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
});

export const linkEmailSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const linkWalletSchema = z.object({
  address: evmAddress,
  signature: z.string().min(1, "Signature is required"),
  message: z.string().min(1, "Message is required"),
});
