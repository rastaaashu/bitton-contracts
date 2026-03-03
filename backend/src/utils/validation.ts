import { z } from "zod";

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

export const challengeSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address"),
});

export const walletVerifySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address"),
  signature: z.string().min(1, "Signature is required"),
  message: z.string().min(1, "Message is required"),
});

export const linkEmailSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const linkWalletSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address"),
  signature: z.string().min(1, "Signature is required"),
  message: z.string().min(1, "Message is required"),
});

export const createSponsorCodeSchema = z.object({
  code: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/, "Code must be alphanumeric with dashes/underscores"),
  maxUses: z.number().int().min(0).optional().default(0),
});
