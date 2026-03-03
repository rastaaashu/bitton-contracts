import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { prisma } from "../utils/prisma";
import { logger } from "../utils/logger";
import { jwtAuth, signAccessToken, signRefreshToken, JwtPayload } from "../middleware/jwtAuth";
import { sendVerificationEmail, sendSponsorNotification } from "../services/email.service";
import {
  registerEmailSchema,
  verifyEmailSchema,
  loginEmailSchema,
  sponsorConfirmSchema,
  challengeSchema,
  walletVerifySchema,
  linkEmailSchema,
  linkWalletSchema,
} from "../utils/validation";
import rateLimit from "express-rate-limit";

const router = Router();

const SALT_ROUNDS = 12;
const VERIFICATION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7d

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  message: { error: "Too many requests, try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts, try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// In-memory nonce store (use Redis in production)
const challenges = new Map<string, { nonce: string; expiresAt: number }>();

// ──────────────────────────────────────
// POST /auth/register-email
// ──────────────────────────────────────
router.post("/register-email", authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = registerEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { email, password, sponsorCode } = parsed.data;

    // Check duplicate email
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    // Validate sponsor code if provided
    let sponsorId: string | null = null;
    if (sponsorCode) {
      const sc = await prisma.sponsorCode.findUnique({ where: { code: sponsorCode } });
      if (!sc || !sc.active) {
        res.status(400).json({ error: "Invalid or inactive sponsor code" });
        return;
      }
      if (sc.maxUses > 0 && sc.usedCount >= sc.maxUses) {
        res.status(400).json({ error: "Sponsor code usage limit reached" });
        return;
      }
      sponsorId = sc.userId;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        status: "PENDING_EMAIL",
        sponsorId,
      },
    });

    // Increment sponsor code usage
    if (sponsorCode) {
      await prisma.sponsorCode.update({
        where: { code: sponsorCode },
        data: { usedCount: { increment: 1 } },
      });
    }

    // Create verification token
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_MS),
      },
    });

    // Send verification email
    await sendVerificationEmail(email, token);

    await prisma.auditLog.create({
      data: { actor: email, action: "auth.register_email", target: user.id },
    });

    res.status(201).json({
      success: true,
      userId: user.id,
      status: user.status,
      message: "Verification email sent. Please check your inbox.",
    });
  } catch (err: any) {
    logger.error("Register email error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────
// POST /auth/verify-email
// ──────────────────────────────────────
router.post("/verify-email", async (req: Request, res: Response) => {
  try {
    const parsed = verifyEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { token } = parsed.data;

    const record = await prisma.emailVerificationToken.findUnique({ where: { token } });
    if (!record) {
      res.status(400).json({ error: "Invalid verification token" });
      return;
    }
    if (record.usedAt) {
      res.status(400).json({ error: "Token already used" });
      return;
    }
    if (record.expiresAt < new Date()) {
      res.status(400).json({ error: "Token expired" });
      return;
    }

    // Mark token used
    await prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    const user = await prisma.user.findUnique({ where: { id: record.userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Transition: PENDING_EMAIL → PENDING_SPONSOR (if sponsor exists) or CONFIRMED
    const nextStatus = user.sponsorId ? "PENDING_SPONSOR" : "CONFIRMED";

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        status: nextStatus,
      },
    });

    // Notify sponsor if transitioning to PENDING_SPONSOR
    if (nextStatus === "PENDING_SPONSOR" && user.sponsorId) {
      const sponsor = await prisma.user.findUnique({ where: { id: user.sponsorId } });
      if (sponsor?.email) {
        await sendSponsorNotification(sponsor.email, user.email!, user.id);
      }
    }

    await prisma.auditLog.create({
      data: { actor: user.email || user.id, action: "auth.verify_email", target: user.id, detail: { newStatus: nextStatus } },
    });

    res.json({
      success: true,
      status: nextStatus,
      message: nextStatus === "CONFIRMED"
        ? "Email verified. Account is active."
        : "Email verified. Waiting for sponsor confirmation.",
    });
  } catch (err: any) {
    logger.error("Verify email error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────
// POST /auth/sponsor/confirm
// ──────────────────────────────────────
router.post("/sponsor/confirm", jwtAuth, async (req: Request, res: Response) => {
  try {
    const parsed = sponsorConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { userId } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.status !== "PENDING_SPONSOR") {
      res.status(400).json({ error: `Cannot confirm: user status is ${user.status}` });
      return;
    }

    // Verify caller is the sponsor
    if (user.sponsorId !== req.user!.userId) {
      res.status(403).json({ error: "Only the sponsor can confirm this user" });
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { status: "CONFIRMED" },
    });

    await prisma.auditLog.create({
      data: { actor: req.user!.userId, action: "auth.sponsor_confirm", target: userId },
    });

    res.json({ success: true, status: "CONFIRMED" });
  } catch (err: any) {
    logger.error("Sponsor confirm error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────
// POST /auth/login-email
// ──────────────────────────────────────
router.post("/login-email", loginLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = loginEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    if (!user.emailVerifiedAt) {
      res.status(403).json({ error: "Email not verified. Check your inbox." });
      return;
    }

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email || undefined,
      evmAddress: user.evmAddress || undefined,
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    // Store refresh token
    await prisma.loginSession.create({
      data: {
        userId: user.id,
        refreshToken,
        userAgent: req.headers["user-agent"] || null,
        ipAddress: req.ip || null,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
      },
    });

    await prisma.auditLog.create({
      data: { actor: email, action: "auth.login_email", target: user.id },
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        status: user.status,
        evmAddress: user.evmAddress,
      },
    });
  } catch (err: any) {
    logger.error("Login email error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────
// POST /auth/challenge (wallet auth step 1)
// ──────────────────────────────────────
router.post("/challenge", authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = challengeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { address } = parsed.data;

    const nonce = crypto.randomBytes(32).toString("hex");
    const message = `Sign this message to authenticate with BitTON.AI\n\nNonce: ${nonce}\nAddress: ${address}\nTimestamp: ${new Date().toISOString()}`;

    challenges.set(address.toLowerCase(), {
      nonce,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    res.json({ message, nonce });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────
// POST /auth/verify (wallet auth step 2 — JWT issued)
// ──────────────────────────────────────
router.post("/verify", authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = walletVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { address, signature, message } = parsed.data;

    const normalizedAddr = address.toLowerCase();
    const challenge = challenges.get(normalizedAddr);
    if (!challenge || challenge.expiresAt < Date.now()) {
      res.status(401).json({ error: "Challenge expired or not found" });
      return;
    }

    const recoveredAddress = ethers.verifyMessage(message, signature);
    if (recoveredAddress.toLowerCase() !== normalizedAddr) {
      res.status(401).json({ error: "Signature verification failed" });
      return;
    }

    challenges.delete(normalizedAddr);

    // Find or create wallet-only user (CONFIRMED immediately)
    let user = await prisma.user.findFirst({ where: { evmAddress: normalizedAddr } });
    if (!user) {
      user = await prisma.user.create({
        data: { evmAddress: normalizedAddr, status: "CONFIRMED" },
      });
    }

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email || undefined,
      evmAddress: user.evmAddress || undefined,
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await prisma.loginSession.create({
      data: {
        userId: user.id,
        refreshToken,
        userAgent: req.headers["user-agent"] || null,
        ipAddress: req.ip || null,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
      },
    });

    await prisma.auditLog.create({
      data: { actor: normalizedAddr, action: "auth.wallet_verify", target: user.id },
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        status: user.status,
        evmAddress: user.evmAddress,
      },
    });
  } catch (err: any) {
    logger.error("Wallet verify error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────
// POST /auth/link-email (attach email to wallet user)
// ──────────────────────────────────────
router.post("/link-email", jwtAuth, async (req: Request, res: Response) => {
  try {
    const parsed = linkEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.email) {
      res.status(400).json({ error: "User already has an email linked" });
      return;
    }

    // Check email not taken
    const emailTaken = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (emailTaken) {
      res.status(409).json({ error: "Email already in use" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: email.toLowerCase(),
        passwordHash,
      },
    });

    // Create verification token
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_MS),
      },
    });

    await sendVerificationEmail(email, token);

    await prisma.auditLog.create({
      data: { actor: user.id, action: "auth.link_email", target: email },
    });

    res.json({ success: true, message: "Verification email sent to linked address" });
  } catch (err: any) {
    logger.error("Link email error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────
// POST /auth/link-wallet (attach wallet to email user)
// ──────────────────────────────────────
router.post("/link-wallet", jwtAuth, async (req: Request, res: Response) => {
  try {
    const parsed = linkWalletSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { address, signature, message } = parsed.data;

    const normalizedAddr = address.toLowerCase();

    // Verify signature
    const recoveredAddress = ethers.verifyMessage(message, signature);
    if (recoveredAddress.toLowerCase() !== normalizedAddr) {
      res.status(401).json({ error: "Signature verification failed" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.evmAddress) {
      res.status(400).json({ error: "User already has a wallet linked" });
      return;
    }

    // Check wallet not taken
    const walletTaken = await prisma.user.findFirst({ where: { evmAddress: normalizedAddr } });
    if (walletTaken) {
      res.status(409).json({ error: "Wallet already linked to another account" });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { evmAddress: normalizedAddr },
    });

    await prisma.auditLog.create({
      data: { actor: user.id, action: "auth.link_wallet", target: normalizedAddr },
    });

    res.json({ success: true, evmAddress: normalizedAddr });
  } catch (err: any) {
    logger.error("Link wallet error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
