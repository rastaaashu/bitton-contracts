import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import crypto from "crypto";
import { prisma } from "../utils/prisma";
import { logger } from "../utils/logger";
import { jwtAuth, signAccessToken, signRefreshToken, JwtPayload } from "../middleware/jwtAuth";
import { sendOtpEmail } from "../services/email.service";
import { verifyTelegramAuth, TelegramLoginData } from "../utils/telegram";
import {
  registerWalletSchema,
  registerEmailInitSchema,
  verifyOtpSchema,
  registerEmailCompleteSchema,
  registerTelegramInitSchema,
  registerTelegramCompleteSchema,
  challengeSchema,
  walletVerifySchema,
  loginEmailInitSchema,
  loginCompleteSchema,
  loginTelegramInitSchema,
  unifiedWalletCompleteSchema,
  unifiedEmailInitSchema,
  unifiedEmailCompleteSchema,
  unifiedTelegramCompleteSchema,
  linkEmailInitSchema,
  linkEmailVerifySchema,
  linkTelegramSchema,
} from "../utils/validation";
import rateLimit from "express-rate-limit";

const router = Router();

const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7d
const SESSION_EXPIRY_MS = 30 * 60 * 1000; // 30 min
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 min
const OTP_MAX_ATTEMPTS = 5;

// Rate limiters (disabled in test env)
const isTest = process.env.NODE_ENV === "test";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 1000 : 20,
  message: { error: "Too many requests, try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 1000 : 5,
  message: { error: "Too many OTP requests, try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Helpers ──

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateSponsorCode(): string {
  return "BTN-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

function isPrismaUniqueError(err: any): boolean {
  return err?.code === "P2002";
}

/** Auto-create a sponsor code for a newly registered user */
async function autoCreateSponsorCode(userId: string): Promise<void> {
  try {
    const code = generateSponsorCode();
    await prisma.sponsorCode.create({
      data: { userId, code, maxUses: 0 },
    });
  } catch (err: any) {
    // Non-critical — log and continue
    logger.warn(`Failed to auto-create sponsor code for user ${userId}: ${err.message}`);
  }
}

/**
 * Validate a sponsor reference - accepts EITHER a sponsor code string OR an EVM wallet address.
 * If it's an EVM address (0x + 40 hex chars), look up the user by wallet address.
 * Otherwise, look it up as a SponsorCode.code string.
 */
async function validateSponsorCode(codeOrAddress: string): Promise<{ valid: boolean; sponsorId?: string; sponsorCodeRecord?: string; error?: string }> {
  const isEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(codeOrAddress);

  if (isEvmAddress) {
    // Look up user by wallet address directly
    const user = await prisma.user.findFirst({
      where: { evmAddress: codeOrAddress.toLowerCase() },
    });
    if (!user || user.status !== "CONFIRMED") {
      return { valid: false, error: "Referrer wallet address not found or not active" };
    }
    return { valid: true, sponsorId: user.id };
  }

  // Otherwise treat as sponsor code string
  const sc = await prisma.sponsorCode.findUnique({ where: { code: codeOrAddress } });
  if (!sc || !sc.active) {
    return { valid: false, error: "Invalid or inactive sponsor code" };
  }
  if (sc.maxUses > 0 && sc.usedCount >= sc.maxUses) {
    return { valid: false, error: "Sponsor code usage limit reached" };
  }
  return { valid: true, sponsorId: sc.userId, sponsorCodeRecord: sc.code };
}

async function incrementSponsorCode(code: string | undefined): Promise<void> {
  if (!code) return; // No sponsor code to increment (was a wallet address referral)
  // Atomic increment with limit check to prevent race condition
  const result = await prisma.$executeRaw`
    UPDATE sponsor_codes
    SET used_count = used_count + 1
    WHERE code = ${code}
    AND (max_uses = 0 OR used_count < max_uses)
  `;
  if (result === 0) {
    logger.warn(`Sponsor code ${code} increment failed (limit reached or not found)`);
  }
}

async function createSession(userId: string, req: Request): Promise<{ accessToken: string; refreshToken: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const payload: JwtPayload = {
    userId: user.id,
    email: user.email || undefined,
    evmAddress: user.evmAddress || undefined,
    telegramId: user.telegramId || undefined,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await prisma.$transaction([
    prisma.loginSession.create({
      data: {
        userId: user.id,
        refreshToken,
        userAgent: req.headers["user-agent"] || null,
        ipAddress: req.ip || null,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    }),
  ]);

  return { accessToken, refreshToken };
}

function userResponse(user: any) {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    evmAddress: user.evmAddress,
    telegramId: user.telegramId,
    authMethod: user.authMethod,
    createdAt: user.createdAt,
  };
}

// ════════════════════════════════════════
// REGISTRATION: EVM WALLET
// ════════════════════════════════════════
router.post("/register/wallet", authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = registerWalletSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { address, signature, message, sponsorCode } = parsed.data;
    const normalizedAddr = address.toLowerCase();

    // Verify wallet signature
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== normalizedAddr) {
      res.status(401).json({ error: "Wallet signature verification failed" });
      return;
    }

    // Check duplicate wallet
    const existingWallet = await prisma.user.findFirst({ where: { evmAddress: normalizedAddr } });
    if (existingWallet) {
      res.status(409).json({ error: "Wallet already registered" });
      return;
    }

    // Validate sponsor (accepts sponsor code OR wallet address)
    const sponsor = await validateSponsorCode(sponsorCode);
    if (!sponsor.valid) {
      res.status(400).json({ error: sponsor.error });
      return;
    }

    // Create user (immediately CONFIRMED)
    let user;
    try {
      user = await prisma.user.create({
        data: {
          evmAddress: normalizedAddr,
          authMethod: "WALLET",
          status: "CONFIRMED",
          sponsorId: sponsor.sponsorId,
        },
      });
    } catch (createErr: any) {
      if (isPrismaUniqueError(createErr)) {
        res.status(409).json({ error: "Wallet or identity already registered" });
        return;
      }
      throw createErr;
    }

    await incrementSponsorCode(sponsor.sponsorCodeRecord);
    await autoCreateSponsorCode(user.id);

    const tokens = await createSession(user.id, req);

    await prisma.auditLog.create({
      data: { actor: normalizedAddr, action: "auth.register.wallet", target: user.id },
    });

    res.status(201).json({
      ...tokens,
      user: userResponse(user),
    });
  } catch (err: any) {
    logger.error("Register wallet error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// REGISTRATION: EMAIL - Step 1 (send OTP)
// ════════════════════════════════════════
router.post("/register/email/init", otpLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = registerEmailInitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const email = parsed.data.email.toLowerCase();

    // Check if email already registered
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    // Create pending session
    const session = await prisma.pendingSession.create({
      data: {
        type: "REGISTER_EMAIL",
        email,
        expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS),
      },
    });

    // Generate and store OTP
    const otp = generateOtp();
    await prisma.otpCode.create({
      data: {
        sessionId: session.id,
        code: otp,
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
      },
    });

    // Send OTP email
    try {
      await sendOtpEmail(email, otp);
    } catch (emailErr: any) {
      logger.error("Failed to send OTP email during registration:", emailErr.message);
      // Still return session so user can try resending
      await prisma.auditLog.create({
        data: { actor: email, action: "auth.register.email.init.email_failed", target: session.id },
      });
      res.json({ sessionId: session.id, message: "Verification code sent to your email" });
      return;
    }

    await prisma.auditLog.create({
      data: { actor: email, action: "auth.register.email.init", target: session.id },
    });

    res.json({ sessionId: session.id, message: "Verification code sent to your email" });
  } catch (err: any) {
    logger.error("Register email init error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// REGISTRATION/LOGIN: Verify OTP (shared)
// ════════════════════════════════════════
router.post("/verify-otp", authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { sessionId, otp } = parsed.data;

    const session = await prisma.pendingSession.findUnique({
      where: { id: sessionId },
      include: { otpCodes: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    if (!session || session.expiresAt < new Date()) {
      res.status(400).json({ error: "Session expired or not found. Please start over." });
      return;
    }

    if (session.verified) {
      res.json({ sessionId, verified: true, message: "Already verified" });
      return;
    }

    const latestOtp = session.otpCodes[0];
    if (!latestOtp) {
      res.status(400).json({ error: "No OTP found for this session" });
      return;
    }

    if (latestOtp.usedAt) {
      res.status(400).json({ error: "OTP already used. Request a new one." });
      return;
    }

    if (latestOtp.expiresAt < new Date()) {
      res.status(400).json({ error: "OTP expired. Request a new one." });
      return;
    }

    if (latestOtp.attempts >= OTP_MAX_ATTEMPTS) {
      res.status(429).json({ error: "Too many failed attempts. Request a new OTP." });
      return;
    }

    if (latestOtp.code !== otp) {
      await prisma.otpCode.update({
        where: { id: latestOtp.id },
        data: { attempts: { increment: 1 } },
      });
      logger.warn(`Failed OTP attempt for session ${sessionId} (attempt ${latestOtp.attempts + 1}/${OTP_MAX_ATTEMPTS})`);
      await prisma.auditLog.create({
        data: { actor: session.email || `session:${sessionId}`, action: "auth.otp.failed", target: sessionId },
      }).catch(() => {});
      res.status(400).json({ error: "Invalid verification code" });
      return;
    }

    // Mark OTP as used and session as verified
    await prisma.otpCode.update({
      where: { id: latestOtp.id },
      data: { usedAt: new Date() },
    });

    await prisma.pendingSession.update({
      where: { id: sessionId },
      data: { verified: true },
    });

    res.json({ sessionId, verified: true, message: "Email verified successfully" });
  } catch (err: any) {
    logger.error("Verify OTP error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// RESEND OTP (for email flows)
// ════════════════════════════════════════
router.post("/resend-otp", otpLimiter, async (req: Request, res: Response) => {
  try {
    const sessionId = req.body?.sessionId;
    if (!sessionId || typeof sessionId !== "string") {
      res.status(400).json({ error: "Session ID is required" });
      return;
    }

    const session = await prisma.pendingSession.findUnique({ where: { id: sessionId } });
    if (!session || session.expiresAt < new Date()) {
      res.status(400).json({ error: "Session expired or not found. Please start over." });
      return;
    }

    if (session.verified) {
      res.status(400).json({ error: "Session already verified" });
      return;
    }

    if (!session.email) {
      res.status(400).json({ error: "No email associated with this session" });
      return;
    }

    const otp = generateOtp();
    await prisma.otpCode.create({
      data: {
        sessionId: session.id,
        code: otp,
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
      },
    });

    try {
      await sendOtpEmail(session.email, otp);
    } catch (emailErr: any) {
      logger.error("Failed to resend OTP email:", emailErr.message);
    }

    res.json({ message: "New verification code sent" });
  } catch (err: any) {
    logger.error("Resend OTP error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// REGISTRATION: EMAIL - Step 3 (complete with wallet)
// ════════════════════════════════════════
router.post("/register/email/complete", authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = registerEmailCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { sessionId, sponsorCode, address, signature, message } = parsed.data;
    const normalizedAddr = address.toLowerCase();

    // Validate session
    const session = await prisma.pendingSession.findUnique({ where: { id: sessionId } });
    if (!session || session.expiresAt < new Date()) {
      res.status(400).json({ error: "Session expired. Please start over." });
      return;
    }
    if (!session.verified) {
      res.status(400).json({ error: "Email not verified. Please verify your OTP first." });
      return;
    }
    if (session.type !== "REGISTER_EMAIL") {
      res.status(400).json({ error: "Invalid session type" });
      return;
    }

    // Verify wallet signature
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== normalizedAddr) {
      res.status(401).json({ error: "Wallet signature verification failed" });
      return;
    }

    // Check duplicates
    const existingEmail = await prisma.user.findUnique({ where: { email: session.email! } });
    if (existingEmail) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const existingWallet = await prisma.user.findFirst({ where: { evmAddress: normalizedAddr } });
    if (existingWallet) {
      res.status(409).json({ error: "Wallet already registered to another account" });
      return;
    }

    // Validate sponsor (accepts sponsor code OR wallet address)
    const sponsor = await validateSponsorCode(sponsorCode);
    if (!sponsor.valid) {
      res.status(400).json({ error: sponsor.error });
      return;
    }

    // Create user
    let user;
    try {
      user = await prisma.user.create({
        data: {
          email: session.email!,
          evmAddress: normalizedAddr,
          authMethod: "EMAIL",
          status: "CONFIRMED",
          emailVerifiedAt: new Date(),
          sponsorId: sponsor.sponsorId,
        },
      });
    } catch (createErr: any) {
      if (isPrismaUniqueError(createErr)) {
        res.status(409).json({ error: "Email or wallet already registered" });
        return;
      }
      throw createErr;
    }

    await incrementSponsorCode(sponsor.sponsorCodeRecord);
    await autoCreateSponsorCode(user.id);

    // Clean up session
    await prisma.pendingSession.delete({ where: { id: sessionId } }).catch(() => {});

    const tokens = await createSession(user.id, req);

    await prisma.auditLog.create({
      data: { actor: session.email!, action: "auth.register.email.complete", target: user.id },
    });

    res.status(201).json({
      ...tokens,
      user: userResponse(user),
    });
  } catch (err: any) {
    logger.error("Register email complete error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// REGISTRATION: TELEGRAM - Step 1 (verify widget)
// ════════════════════════════════════════
router.post("/register/telegram/init", authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = registerTelegramInitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const telegramData = parsed.data as TelegramLoginData;

    // Verify Telegram auth
    if (!verifyTelegramAuth(telegramData)) {
      res.status(401).json({ error: "Telegram authentication failed. Ensure TELEGRAM_BOT_TOKEN is configured." });
      return;
    }

    const telegramId = telegramData.id.toString();

    // Check if telegram ID already registered
    const existing = await prisma.user.findFirst({ where: { telegramId } });
    if (existing) {
      res.status(409).json({ error: "Telegram account already registered" });
      return;
    }

    // Create pending session
    const session = await prisma.pendingSession.create({
      data: {
        type: "REGISTER_TELEGRAM",
        telegramId,
        telegramData: JSON.stringify(telegramData),
        verified: true, // Telegram widget already verified
        expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS),
      },
    });

    await prisma.auditLog.create({
      data: { actor: `tg:${telegramId}`, action: "auth.register.telegram.init", target: session.id },
    });

    res.json({
      sessionId: session.id,
      telegramUser: {
        id: telegramData.id,
        firstName: telegramData.first_name,
        username: telegramData.username,
      },
      message: "Telegram verified. Please connect your wallet to complete registration.",
    });
  } catch (err: any) {
    logger.error("Register telegram init error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// REGISTRATION: TELEGRAM - Step 2 (complete with wallet)
// ════════════════════════════════════════
router.post("/register/telegram/complete", authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = registerTelegramCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { sessionId, sponsorCode, address, signature, message } = parsed.data;
    const normalizedAddr = address.toLowerCase();

    // Validate session
    const session = await prisma.pendingSession.findUnique({ where: { id: sessionId } });
    if (!session || session.expiresAt < new Date()) {
      res.status(400).json({ error: "Session expired. Please start over." });
      return;
    }
    if (!session.verified || session.type !== "REGISTER_TELEGRAM") {
      res.status(400).json({ error: "Invalid session" });
      return;
    }

    // Verify wallet signature
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== normalizedAddr) {
      res.status(401).json({ error: "Wallet signature verification failed" });
      return;
    }

    // Check duplicates
    const existingTelegram = await prisma.user.findFirst({ where: { telegramId: session.telegramId! } });
    if (existingTelegram) {
      res.status(409).json({ error: "Telegram account already registered" });
      return;
    }

    const existingWallet = await prisma.user.findFirst({ where: { evmAddress: normalizedAddr } });
    if (existingWallet) {
      res.status(409).json({ error: "Wallet already registered to another account" });
      return;
    }

    // Validate sponsor (accepts sponsor code OR wallet address)
    const sponsor = await validateSponsorCode(sponsorCode);
    if (!sponsor.valid) {
      res.status(400).json({ error: sponsor.error });
      return;
    }

    // Create user
    let user;
    try {
      user = await prisma.user.create({
        data: {
          telegramId: session.telegramId!,
          evmAddress: normalizedAddr,
          authMethod: "TELEGRAM",
          status: "CONFIRMED",
          sponsorId: sponsor.sponsorId,
        },
      });
    } catch (createErr: any) {
      if (isPrismaUniqueError(createErr)) {
        res.status(409).json({ error: "Telegram account or wallet already registered" });
        return;
      }
      throw createErr;
    }

    await incrementSponsorCode(sponsor.sponsorCodeRecord);
    await autoCreateSponsorCode(user.id);

    await prisma.pendingSession.delete({ where: { id: sessionId } }).catch(() => {});

    const tokens = await createSession(user.id, req);

    await prisma.auditLog.create({
      data: { actor: `tg:${session.telegramId}`, action: "auth.register.telegram.complete", target: user.id },
    });

    res.status(201).json({
      ...tokens,
      user: userResponse(user),
    });
  } catch (err: any) {
    logger.error("Register telegram complete error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// LOGIN: WALLET - Step 1 (challenge)
// ════════════════════════════════════════
router.post("/login/wallet/challenge", authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = challengeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { address } = parsed.data;

    const nonce = crypto.randomBytes(32).toString("hex");
    const message = `Sign this message to authenticate with BitTON.AI\n\nNonce: ${nonce}\nAddress: ${address}\nTimestamp: ${new Date().toISOString()}`;
    const normalizedAddr = address.toLowerCase();

    // Upsert challenge to DB (production-safe, survives restarts)
    await prisma.walletChallenge.upsert({
      where: { address: normalizedAddr },
      update: {
        nonce,
        message,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
      create: {
        address: normalizedAddr,
        nonce,
        message,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    res.json({ message, nonce });
  } catch (err: any) {
    logger.error("Wallet challenge error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// LOGIN: WALLET - Step 2 (verify signature)
// ════════════════════════════════════════
router.post("/login/wallet/verify", authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = walletVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { address, signature, message } = parsed.data;
    const normalizedAddr = address.toLowerCase();

    // Retrieve challenge from DB
    const challenge = await prisma.walletChallenge.findUnique({
      where: { address: normalizedAddr },
    });
    if (!challenge || challenge.expiresAt < new Date()) {
      res.status(401).json({ error: "Challenge expired or not found. Please try again." });
      return;
    }

    // Verify the signed message matches the issued challenge
    if (message !== challenge.message) {
      res.status(401).json({ error: "Message does not match the issued challenge" });
      return;
    }

    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== normalizedAddr) {
      res.status(401).json({ error: "Signature verification failed" });
      return;
    }

    // Clean up used challenge
    await prisma.walletChallenge.delete({ where: { address: normalizedAddr } }).catch(() => {});

    const user = await prisma.user.findFirst({ where: { evmAddress: normalizedAddr } });
    if (!user) {
      res.status(404).json({ error: "No account found for this wallet. Please register first." });
      return;
    }
    if (user.status !== "CONFIRMED") {
      res.status(403).json({ error: `Account not confirmed. Current status: ${user.status}` });
      return;
    }

    const tokens = await createSession(user.id, req);

    await prisma.auditLog.create({
      data: { actor: normalizedAddr, action: "auth.login.wallet", target: user.id },
    });

    res.json({
      ...tokens,
      user: userResponse(user),
    });
  } catch (err: any) {
    logger.error("Wallet login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// LOGIN: EMAIL - Step 1 (send OTP)
// ════════════════════════════════════════
router.post("/login/email/init", otpLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = loginEmailInitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const email = parsed.data.email.toLowerCase();

    // Check if user exists with this email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal whether email exists - still send a generic response
      // but don't actually send an OTP
      res.json({ sessionId: crypto.randomUUID(), message: "If this email is registered, a verification code has been sent." });
      return;
    }

    // Create pending session
    const session = await prisma.pendingSession.create({
      data: {
        type: "LOGIN_EMAIL",
        email,
        expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS),
      },
    });

    const otp = generateOtp();
    await prisma.otpCode.create({
      data: {
        sessionId: session.id,
        code: otp,
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
      },
    });

    try {
      await sendOtpEmail(email, otp);
    } catch (emailErr: any) {
      logger.error("Failed to send OTP email during login:", emailErr.message);
    }

    res.json({ sessionId: session.id, message: "If this email is registered, a verification code has been sent." });
  } catch (err: any) {
    logger.error("Login email init error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// LOGIN: EMAIL - Step 3 (complete with wallet)
// ════════════════════════════════════════
router.post("/login/email/complete", authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = loginCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { sessionId, address, signature, message } = parsed.data;
    const normalizedAddr = address.toLowerCase();

    // Validate session
    const session = await prisma.pendingSession.findUnique({ where: { id: sessionId } });
    if (!session || session.expiresAt < new Date()) {
      res.status(400).json({ error: "Session expired. Please start over." });
      return;
    }
    if (!session.verified || session.type !== "LOGIN_EMAIL") {
      res.status(400).json({ error: "Email not verified. Please verify your OTP first." });
      return;
    }

    // Verify wallet signature
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== normalizedAddr) {
      res.status(401).json({ error: "Wallet signature verification failed" });
      return;
    }

    // Find user by email
    const user = await prisma.user.findUnique({ where: { email: session.email! } });
    if (!user) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    // Verify wallet matches the user's registered wallet
    if (user.evmAddress && user.evmAddress !== normalizedAddr) {
      res.status(403).json({ error: "Wallet does not match the registered wallet for this account" });
      return;
    }

    if (user.status !== "CONFIRMED") {
      res.status(403).json({ error: `Account not confirmed. Current status: ${user.status}` });
      return;
    }

    await prisma.pendingSession.delete({ where: { id: sessionId } });

    const tokens = await createSession(user.id, req);

    await prisma.auditLog.create({
      data: { actor: session.email!, action: "auth.login.email", target: user.id },
    });

    res.json({
      ...tokens,
      user: userResponse(user),
    });
  } catch (err: any) {
    logger.error("Login email complete error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// LOGIN: TELEGRAM - Step 1 (verify widget)
// ════════════════════════════════════════
router.post("/login/telegram/init", authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = loginTelegramInitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const telegramData = parsed.data as TelegramLoginData;

    if (!verifyTelegramAuth(telegramData)) {
      res.status(401).json({ error: "Telegram authentication failed" });
      return;
    }

    const telegramId = telegramData.id.toString();

    // Check user exists
    const user = await prisma.user.findFirst({ where: { telegramId } });
    if (!user) {
      res.status(404).json({ error: "No account found for this Telegram user. Please register first." });
      return;
    }

    // Create pending session
    const session = await prisma.pendingSession.create({
      data: {
        type: "LOGIN_TELEGRAM",
        telegramId,
        telegramData: JSON.stringify(telegramData),
        verified: true,
        expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS),
      },
    });

    res.json({
      sessionId: session.id,
      message: "Telegram verified. Please connect your wallet to complete login.",
    });
  } catch (err: any) {
    logger.error("Login telegram init error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// LOGIN: TELEGRAM - Step 2 (complete with wallet)
// ════════════════════════════════════════
router.post("/login/telegram/complete", authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = loginCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { sessionId, address, signature, message } = parsed.data;
    const normalizedAddr = address.toLowerCase();

    const session = await prisma.pendingSession.findUnique({ where: { id: sessionId } });
    if (!session || session.expiresAt < new Date()) {
      res.status(400).json({ error: "Session expired. Please start over." });
      return;
    }
    if (!session.verified || session.type !== "LOGIN_TELEGRAM") {
      res.status(400).json({ error: "Invalid session" });
      return;
    }

    // Verify wallet signature
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== normalizedAddr) {
      res.status(401).json({ error: "Wallet signature verification failed" });
      return;
    }

    // Find user by telegram ID
    const user = await prisma.user.findFirst({ where: { telegramId: session.telegramId! } });
    if (!user) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    // Verify wallet matches
    if (user.evmAddress && user.evmAddress !== normalizedAddr) {
      res.status(403).json({ error: "Wallet does not match the registered wallet for this account" });
      return;
    }

    if (user.status !== "CONFIRMED") {
      res.status(403).json({ error: `Account not confirmed. Current status: ${user.status}` });
      return;
    }

    await prisma.pendingSession.delete({ where: { id: sessionId } });

    const tokens = await createSession(user.id, req);

    await prisma.auditLog.create({
      data: { actor: `tg:${session.telegramId}`, action: "auth.login.telegram", target: user.id },
    });

    res.json({
      ...tokens,
      user: userResponse(user),
    });
  } catch (err: any) {
    logger.error("Login telegram complete error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// UNIFIED: WALLET (auto-detect login/register)
// Uses the existing /login/wallet/challenge for step 1
// ════════════════════════════════════════
router.post("/wallet/complete", authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = unifiedWalletCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { address, signature, message, sponsorCode } = parsed.data;
    const normalizedAddr = address.toLowerCase();

    // Verify the challenge exists and matches
    const challenge = await prisma.walletChallenge.findUnique({
      where: { address: normalizedAddr },
    });
    if (!challenge || challenge.expiresAt < new Date()) {
      res.status(401).json({ error: "Challenge expired or not found. Please try again." });
      return;
    }
    if (message !== challenge.message) {
      res.status(401).json({ error: "Message does not match the issued challenge" });
      return;
    }

    // Verify signature
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== normalizedAddr) {
      res.status(401).json({ error: "Signature verification failed" });
      return;
    }

    // Clean up challenge
    await prisma.walletChallenge.delete({ where: { address: normalizedAddr } }).catch(() => {});

    // Check if user exists
    const existingUser = await prisma.user.findFirst({ where: { evmAddress: normalizedAddr } });

    if (existingUser) {
      // ── LOGIN ──
      if (existingUser.status !== "CONFIRMED") {
        res.status(403).json({ error: `Account not confirmed. Current status: ${existingUser.status}` });
        return;
      }
      const tokens = await createSession(existingUser.id, req);
      await prisma.auditLog.create({
        data: { actor: normalizedAddr, action: "auth.unified.wallet.login", target: existingUser.id },
      });
      res.json({ ...tokens, user: userResponse(existingUser), isNewUser: false });
    } else {
      // ── REGISTER ──
      if (!sponsorCode) {
        res.status(400).json({ error: "NEEDS_SPONSOR", message: "Referral code is required for new accounts" });
        return;
      }

      const sponsor = await validateSponsorCode(sponsorCode);
      if (!sponsor.valid) {
        res.status(400).json({ error: sponsor.error });
        return;
      }

      let user;
      try {
        user = await prisma.user.create({
          data: {
            evmAddress: normalizedAddr,
            authMethod: "WALLET",
            status: "CONFIRMED",
            sponsorId: sponsor.sponsorId,
          },
        });
      } catch (createErr: any) {
        if (isPrismaUniqueError(createErr)) {
          res.status(409).json({ error: "Wallet or identity already registered" });
          return;
        }
        throw createErr;
      }

      await incrementSponsorCode(sponsor.sponsorCodeRecord);
      await autoCreateSponsorCode(user.id);
      const tokens = await createSession(user.id, req);

      await prisma.auditLog.create({
        data: { actor: normalizedAddr, action: "auth.unified.wallet.register", target: user.id },
      });

      res.status(201).json({ ...tokens, user: userResponse(user), isNewUser: true });
    }
  } catch (err: any) {
    logger.error("Unified wallet complete error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// UNIFIED: EMAIL - init (auto-detect login/register)
// ════════════════════════════════════════
router.post("/email/init", otpLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = unifiedEmailInitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const email = parsed.data.email.toLowerCase();

    // Auto-detect: does user exist?
    const existingUser = await prisma.user.findUnique({ where: { email } });
    const sessionType = existingUser ? "LOGIN_EMAIL" : "REGISTER_EMAIL";

    const session = await prisma.pendingSession.create({
      data: {
        type: sessionType,
        email,
        expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS),
      },
    });

    const otp = generateOtp();
    await prisma.otpCode.create({
      data: {
        sessionId: session.id,
        code: otp,
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
      },
    });

    try {
      await sendOtpEmail(email, otp);
    } catch (emailErr: any) {
      logger.error("Failed to send OTP email:", emailErr.message);
    }

    await prisma.auditLog.create({
      data: { actor: email, action: `auth.unified.email.init.${sessionType}`, target: session.id },
    });

    res.json({
      sessionId: session.id,
      isNewUser: !existingUser,
      message: "Verification code sent to your email",
    });
  } catch (err: any) {
    logger.error("Unified email init error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// UNIFIED: EMAIL - complete (auto-detect login/register)
// ════════════════════════════════════════
router.post("/email/complete", authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = unifiedEmailCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { sessionId, address, signature, message, sponsorCode } = parsed.data;
    const normalizedAddr = address.toLowerCase();

    const session = await prisma.pendingSession.findUnique({ where: { id: sessionId } });
    if (!session || session.expiresAt < new Date()) {
      res.status(400).json({ error: "Session expired. Please start over." });
      return;
    }
    if (!session.verified) {
      res.status(400).json({ error: "Email not verified. Please verify your OTP first." });
      return;
    }
    if (session.type !== "LOGIN_EMAIL" && session.type !== "REGISTER_EMAIL") {
      res.status(400).json({ error: "Invalid session type" });
      return;
    }

    // Verify wallet signature
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== normalizedAddr) {
      res.status(401).json({ error: "Wallet signature verification failed" });
      return;
    }

    if (session.type === "LOGIN_EMAIL") {
      // ── LOGIN ──
      const user = await prisma.user.findUnique({ where: { email: session.email! } });
      if (!user) {
        res.status(404).json({ error: "Account not found" });
        return;
      }
      if (user.evmAddress && user.evmAddress !== normalizedAddr) {
        res.status(403).json({ error: "Wallet does not match the registered wallet for this account" });
        return;
      }
      if (user.status !== "CONFIRMED") {
        res.status(403).json({ error: `Account not confirmed. Current status: ${user.status}` });
        return;
      }

      await prisma.pendingSession.delete({ where: { id: sessionId } }).catch(() => {});
      const tokens = await createSession(user.id, req);

      await prisma.auditLog.create({
        data: { actor: session.email!, action: "auth.unified.email.login", target: user.id },
      });

      res.json({ ...tokens, user: userResponse(user), isNewUser: false });
    } else {
      // ── REGISTER ──
      if (!sponsorCode) {
        res.status(400).json({ error: "NEEDS_SPONSOR", message: "Referral code is required for new accounts" });
        return;
      }

      // Check duplicates
      const existingEmail = await prisma.user.findUnique({ where: { email: session.email! } });
      if (existingEmail) {
        res.status(409).json({ error: "Email already registered" });
        return;
      }
      const existingWallet = await prisma.user.findFirst({ where: { evmAddress: normalizedAddr } });
      if (existingWallet) {
        res.status(409).json({ error: "Wallet already registered to another account" });
        return;
      }

      const sponsor = await validateSponsorCode(sponsorCode);
      if (!sponsor.valid) {
        res.status(400).json({ error: sponsor.error });
        return;
      }

      let user;
      try {
        user = await prisma.user.create({
          data: {
            email: session.email!,
            evmAddress: normalizedAddr,
            authMethod: "EMAIL",
            status: "CONFIRMED",
            emailVerifiedAt: new Date(),
            sponsorId: sponsor.sponsorId,
          },
        });
      } catch (createErr: any) {
        if (isPrismaUniqueError(createErr)) {
          res.status(409).json({ error: "Email or wallet already registered" });
          return;
        }
        throw createErr;
      }

      await incrementSponsorCode(sponsor.sponsorCodeRecord);
      await autoCreateSponsorCode(user.id);
      await prisma.pendingSession.delete({ where: { id: sessionId } }).catch(() => {});
      const tokens = await createSession(user.id, req);

      await prisma.auditLog.create({
        data: { actor: session.email!, action: "auth.unified.email.register", target: user.id },
      });

      res.status(201).json({ ...tokens, user: userResponse(user), isNewUser: true });
    }
  } catch (err: any) {
    logger.error("Unified email complete error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// UNIFIED: TELEGRAM - init (auto-detect login/register)
// ════════════════════════════════════════
router.post("/telegram/init", authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = loginTelegramInitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const telegramData = parsed.data as TelegramLoginData;

    if (!verifyTelegramAuth(telegramData)) {
      res.status(401).json({ error: "Telegram authentication failed. Ensure TELEGRAM_BOT_TOKEN is configured correctly." });
      return;
    }

    const telegramId = telegramData.id.toString();
    const existingUser = await prisma.user.findFirst({ where: { telegramId } });

    const sessionType = existingUser ? "LOGIN_TELEGRAM" : "REGISTER_TELEGRAM";

    const session = await prisma.pendingSession.create({
      data: {
        type: sessionType,
        telegramId,
        telegramData: JSON.stringify(telegramData),
        verified: true,
        expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS),
      },
    });

    await prisma.auditLog.create({
      data: { actor: `tg:${telegramId}`, action: `auth.unified.telegram.init.${sessionType}`, target: session.id },
    });

    res.json({
      sessionId: session.id,
      isNewUser: !existingUser,
      telegramUser: {
        id: telegramData.id,
        firstName: telegramData.first_name,
        username: telegramData.username,
      },
      message: "Telegram verified. Please connect your wallet to continue.",
    });
  } catch (err: any) {
    logger.error("Unified telegram init error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// UNIFIED: TELEGRAM - complete (auto-detect login/register)
// ════════════════════════════════════════
router.post("/telegram/complete", authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = unifiedTelegramCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { sessionId, address, signature, message, sponsorCode } = parsed.data;
    const normalizedAddr = address.toLowerCase();

    const session = await prisma.pendingSession.findUnique({ where: { id: sessionId } });
    if (!session || session.expiresAt < new Date()) {
      res.status(400).json({ error: "Session expired. Please start over." });
      return;
    }
    if (!session.verified) {
      res.status(400).json({ error: "Invalid session" });
      return;
    }
    if (session.type !== "LOGIN_TELEGRAM" && session.type !== "REGISTER_TELEGRAM") {
      res.status(400).json({ error: "Invalid session type" });
      return;
    }

    // Verify wallet signature
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== normalizedAddr) {
      res.status(401).json({ error: "Wallet signature verification failed" });
      return;
    }

    if (session.type === "LOGIN_TELEGRAM") {
      // ── LOGIN ──
      const user = await prisma.user.findFirst({ where: { telegramId: session.telegramId! } });
      if (!user) {
        res.status(404).json({ error: "Account not found" });
        return;
      }
      if (user.evmAddress && user.evmAddress !== normalizedAddr) {
        res.status(403).json({ error: "Wallet does not match the registered wallet for this account" });
        return;
      }
      if (user.status !== "CONFIRMED") {
        res.status(403).json({ error: `Account not confirmed. Current status: ${user.status}` });
        return;
      }

      await prisma.pendingSession.delete({ where: { id: sessionId } }).catch(() => {});
      const tokens = await createSession(user.id, req);

      await prisma.auditLog.create({
        data: { actor: `tg:${session.telegramId}`, action: "auth.unified.telegram.login", target: user.id },
      });

      res.json({ ...tokens, user: userResponse(user), isNewUser: false });
    } else {
      // ── REGISTER ──
      if (!sponsorCode) {
        res.status(400).json({ error: "NEEDS_SPONSOR", message: "Referral code is required for new accounts" });
        return;
      }

      // Check duplicates
      const existingTelegram = await prisma.user.findFirst({ where: { telegramId: session.telegramId! } });
      if (existingTelegram) {
        res.status(409).json({ error: "Telegram account already registered" });
        return;
      }
      const existingWallet = await prisma.user.findFirst({ where: { evmAddress: normalizedAddr } });
      if (existingWallet) {
        res.status(409).json({ error: "Wallet already registered to another account" });
        return;
      }

      const sponsor = await validateSponsorCode(sponsorCode);
      if (!sponsor.valid) {
        res.status(400).json({ error: sponsor.error });
        return;
      }

      let user;
      try {
        user = await prisma.user.create({
          data: {
            telegramId: session.telegramId!,
            evmAddress: normalizedAddr,
            authMethod: "TELEGRAM",
            status: "CONFIRMED",
            sponsorId: sponsor.sponsorId,
          },
        });
      } catch (createErr: any) {
        if (isPrismaUniqueError(createErr)) {
          res.status(409).json({ error: "Telegram account or wallet already registered" });
          return;
        }
        throw createErr;
      }

      await incrementSponsorCode(sponsor.sponsorCodeRecord);
      await autoCreateSponsorCode(user.id);
      await prisma.pendingSession.delete({ where: { id: sessionId } }).catch(() => {});
      const tokens = await createSession(user.id, req);

      await prisma.auditLog.create({
        data: { actor: `tg:${session.telegramId}`, action: "auth.unified.telegram.register", target: user.id },
      });

      res.status(201).json({ ...tokens, user: userResponse(user), isNewUser: true });
    }
  } catch (err: any) {
    logger.error("Unified telegram complete error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// PROFILE: Get user profile
// ════════════════════════════════════════
router.get("/profile", jwtAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: {
        sponsorCodes: { where: { active: true }, select: { code: true, usedCount: true, maxUses: true } },
        sponsor: { select: { id: true, evmAddress: true, email: true } },
      },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({
      id: user.id,
      email: user.email,
      evmAddress: user.evmAddress,
      telegramId: user.telegramId,
      authMethod: user.authMethod,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      sponsorCodes: user.sponsorCodes,
      sponsor: user.sponsor ? {
        evmAddress: user.sponsor.evmAddress,
        email: user.sponsor.email,
      } : null,
    });
  } catch (err: any) {
    logger.error("Get profile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// PROFILE: Link email to existing account
// ════════════════════════════════════════
router.post("/profile/link-email/init", jwtAuth, otpLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = linkEmailInitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const email = parsed.data.email.toLowerCase();

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.email) {
      res.status(409).json({ error: "Account already has an email linked" });
      return;
    }

    // Check if email is taken
    const emailTaken = await prisma.user.findUnique({ where: { email } });
    if (emailTaken) {
      res.status(409).json({ error: "Email already used by another account" });
      return;
    }

    const session = await prisma.pendingSession.create({
      data: {
        type: "LINK_EMAIL",
        email,
        expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS),
      },
    });

    const otp = generateOtp();
    await prisma.otpCode.create({
      data: {
        sessionId: session.id,
        code: otp,
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
      },
    });

    try {
      await sendOtpEmail(email, otp);
    } catch (emailErr: any) {
      logger.error("Failed to send link-email OTP:", emailErr.message);
    }

    res.json({ sessionId: session.id, message: "Verification code sent to your email" });
  } catch (err: any) {
    logger.error("Link email init error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/profile/link-email/verify", jwtAuth, authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = linkEmailVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { sessionId, otp } = parsed.data;

    const session = await prisma.pendingSession.findUnique({
      where: { id: sessionId },
      include: { otpCodes: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    if (!session || session.expiresAt < new Date() || session.type !== "LINK_EMAIL") {
      res.status(400).json({ error: "Session expired or invalid. Please start over." });
      return;
    }

    const latestOtp = session.otpCodes[0];
    if (!latestOtp || latestOtp.usedAt || latestOtp.expiresAt < new Date()) {
      res.status(400).json({ error: "OTP expired. Request a new one." });
      return;
    }
    if (latestOtp.attempts >= OTP_MAX_ATTEMPTS) {
      res.status(429).json({ error: "Too many failed attempts. Request a new OTP." });
      return;
    }
    if (latestOtp.code !== otp) {
      await prisma.otpCode.update({ where: { id: latestOtp.id }, data: { attempts: { increment: 1 } } });
      res.status(400).json({ error: "Invalid verification code" });
      return;
    }

    // OTP correct — link email
    await prisma.otpCode.update({ where: { id: latestOtp.id }, data: { usedAt: new Date() } });

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.email) {
      res.status(409).json({ error: "Account already has an email linked" });
      return;
    }

    // Double check email not taken
    const emailTaken = await prisma.user.findUnique({ where: { email: session.email! } });
    if (emailTaken) {
      res.status(409).json({ error: "Email already used by another account" });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { email: session.email!, emailVerifiedAt: new Date() },
    });

    await prisma.pendingSession.delete({ where: { id: sessionId } }).catch(() => {});

    await prisma.auditLog.create({
      data: { actor: user.id, action: "auth.profile.link_email", target: session.email! },
    });

    res.json({ success: true, email: session.email!, message: "Email linked successfully" });
  } catch (err: any) {
    logger.error("Link email verify error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// PROFILE: Link Telegram to existing account
// ════════════════════════════════════════
router.post("/profile/link-telegram", jwtAuth, authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = linkTelegramSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const telegramData = parsed.data as TelegramLoginData;

    if (!verifyTelegramAuth(telegramData)) {
      res.status(401).json({ error: "Telegram authentication failed" });
      return;
    }

    const telegramId = telegramData.id.toString();

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.telegramId) {
      res.status(409).json({ error: "Account already has Telegram linked" });
      return;
    }

    // Check if telegram ID is taken
    const tgTaken = await prisma.user.findFirst({ where: { telegramId } });
    if (tgTaken) {
      res.status(409).json({ error: "Telegram account already used by another user" });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { telegramId },
    });

    await prisma.auditLog.create({
      data: { actor: user.id, action: "auth.profile.link_telegram", target: `tg:${telegramId}` },
    });

    res.json({ success: true, telegramId, message: "Telegram linked successfully" });
  } catch (err: any) {
    logger.error("Link telegram error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// TOKEN: Refresh
// ════════════════════════════════════════
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: "Refresh token is required" });
      return;
    }

    const session = await prisma.loginSession.findUnique({ where: { refreshToken } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      res.status(401).json({ error: "Invalid or expired refresh token" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email || undefined,
      evmAddress: user.evmAddress || undefined,
      telegramId: user.telegramId || undefined,
    };

    const accessToken = signAccessToken(payload);

    // Rotate refresh token: revoke old, issue new
    const newRefreshToken = signRefreshToken(payload);
    await prisma.$transaction([
      prisma.loginSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      }),
      prisma.loginSession.create({
        data: {
          userId: user.id,
          refreshToken: newRefreshToken,
          userAgent: req.headers["user-agent"] || null,
          ipAddress: req.ip || null,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
        },
      }),
    ]);

    res.json({
      accessToken,
      refreshToken: newRefreshToken,
      user: userResponse(user),
    });
  } catch (err: any) {
    logger.error("Refresh token error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// TOKEN: Logout
// ════════════════════════════════════════
router.post("/logout", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: "Refresh token is required" });
      return;
    }

    await prisma.loginSession.updateMany({
      where: { refreshToken, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    res.json({ success: true });
  } catch (err: any) {
    logger.error("Logout error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════
// INFO: Get Telegram bot config (for frontend widget)
// ════════════════════════════════════════
// Diagnostic: test SMTP connection (admin only, remove in production)
router.post("/test-smtp", async (req: Request, res: Response) => {
  const apiKey = req.headers["x-admin-key"];
  if (apiKey !== process.env.ADMIN_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const nodemailer = await import("nodemailer");
    const t = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });
    await t.verify();
    // Optionally send a test email
    const { to } = req.body || {};
    if (to) {
      const result = await t.sendMail({
        from: process.env.SMTP_FROM,
        to,
        subject: "BitTON.AI - SMTP Test",
        text: "If you see this, SMTP is working!",
      });
      res.json({ status: "ok", sent: true, messageId: result.messageId });
    } else {
      res.json({ status: "ok", verified: true, host: process.env.SMTP_HOST, user: process.env.SMTP_USER });
    }
  } catch (err: any) {
    res.json({ status: "error", message: err.message, code: err.code });
  }
});

router.get("/telegram/config", (_req: Request, res: Response) => {
  res.json({
    botUsername: process.env.TELEGRAM_BOT_USERNAME || "",
    configured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME),
  });
});

export default router;
