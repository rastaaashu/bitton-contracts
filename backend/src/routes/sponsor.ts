import { Router, Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { logger } from "../utils/logger";
import { jwtAuth } from "../middleware/jwtAuth";
import { adminAuth } from "../middleware/adminAuth";
import { createSponsorCodeSchema } from "../utils/validation";

const router = Router();

// ──────────────────────────────────────
// POST /sponsor/code/create
// ──────────────────────────────────────
router.post("/code/create", jwtAuth, async (req: Request, res: Response) => {
  try {
    const parsed = createSponsorCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    const { code, maxUses } = parsed.data;

    // Check user is confirmed
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user || user.status !== "CONFIRMED") {
      res.status(403).json({ error: "Only confirmed users can create sponsor codes" });
      return;
    }

    // Check code uniqueness
    const existing = await prisma.sponsorCode.findUnique({ where: { code } });
    if (existing) {
      res.status(409).json({ error: "Sponsor code already exists" });
      return;
    }

    const sponsorCode = await prisma.sponsorCode.create({
      data: {
        userId: user.id,
        code,
        maxUses: maxUses || 0,
      },
    });

    await prisma.auditLog.create({
      data: { actor: user.id, action: "sponsor.code_create", target: code },
    });

    res.status(201).json({
      success: true,
      code: sponsorCode.code,
      maxUses: sponsorCode.maxUses,
    });
  } catch (err: any) {
    logger.error("Create sponsor code error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────
// GET /sponsor/validate/:codeOrAddress
// Accepts either a sponsor code string or an EVM wallet address
// ──────────────────────────────────────
router.get("/validate/:codeOrAddress", async (req: Request, res: Response) => {
  try {
    const codeOrAddress = req.params.codeOrAddress as string;
    const isEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(codeOrAddress);

    if (isEvmAddress) {
      // Validate as wallet address referral
      const user = await prisma.user.findFirst({
        where: { evmAddress: codeOrAddress.toLowerCase() },
      });
      if (!user || user.status !== "CONFIRMED") {
        res.status(404).json({ error: "Referrer not found", valid: false });
        return;
      }
      res.json({
        valid: true,
        type: "wallet",
        referrer: codeOrAddress.toLowerCase(),
      });
      return;
    }

    // Validate as sponsor code
    const sponsorCode = await prisma.sponsorCode.findUnique({
      where: { code: codeOrAddress },
    });

    if (!sponsorCode || !sponsorCode.active) {
      res.status(404).json({ error: "Sponsor code not found or inactive", valid: false });
      return;
    }

    const available = sponsorCode.maxUses === 0 || sponsorCode.usedCount < sponsorCode.maxUses;

    res.json({
      valid: available,
      type: "code",
      code: sponsorCode.code,
      active: sponsorCode.active,
      maxUses: sponsorCode.maxUses,
      usedCount: sponsorCode.usedCount,
      available,
    });
  } catch (err: any) {
    logger.error("Validate sponsor error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────
// GET /sponsor/code/:code (legacy, still works)
// ──────────────────────────────────────
router.get("/code/:code", async (req: Request, res: Response) => {
  try {
    const code = req.params.code as string;
    const sponsorCode = await prisma.sponsorCode.findUnique({
      where: { code },
    });

    if (!sponsorCode) {
      res.status(404).json({ error: "Sponsor code not found" });
      return;
    }

    res.json({
      code: sponsorCode.code,
      active: sponsorCode.active,
      maxUses: sponsorCode.maxUses,
      usedCount: sponsorCode.usedCount,
      available: sponsorCode.maxUses === 0 || sponsorCode.usedCount < sponsorCode.maxUses,
      sponsorId: sponsorCode.userId,
    });
  } catch (err: any) {
    logger.error("Get sponsor code error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ──────────────────────────────────────
// POST /sponsor/bootstrap (admin API key — creates first user + sponsor code)
// ──────────────────────────────────────
router.post("/bootstrap", adminAuth, async (req: Request, res: Response) => {
  try {
    const { code, evmAddress } = req.body;

    if (!code || typeof code !== "string" || code.length < 3) {
      res.status(400).json({ error: "code is required (min 3 chars)" });
      return;
    }
    if (!evmAddress || typeof evmAddress !== "string") {
      res.status(400).json({ error: "evmAddress is required" });
      return;
    }

    const normalizedAddr = evmAddress.toLowerCase();

    // Find or create admin user
    let user = await prisma.user.findFirst({ where: { evmAddress: normalizedAddr } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          evmAddress: normalizedAddr,
          status: "CONFIRMED",
        },
      });
      logger.info(`Bootstrap: created admin user ${user.id} for ${normalizedAddr}`);
    }

    // Create sponsor code if it doesn't exist
    const existing = await prisma.sponsorCode.findUnique({ where: { code } });
    if (existing) {
      res.json({
        success: true,
        message: "Sponsor code already exists",
        code: existing.code,
        userId: user.id,
        referralLink: `/?ref=${existing.code}`,
      });
      return;
    }

    const sponsorCode = await prisma.sponsorCode.create({
      data: {
        userId: user.id,
        code,
        maxUses: 0, // unlimited
      },
    });

    await prisma.auditLog.create({
      data: { actor: "admin-bootstrap", action: "sponsor.bootstrap", target: code },
    });

    logger.info(`Bootstrap: created sponsor code "${code}" for user ${user.id}`);

    res.status(201).json({
      success: true,
      code: sponsorCode.code,
      userId: user.id,
      referralLink: `/?ref=${sponsorCode.code}`,
    });
  } catch (err: any) {
    logger.error("Bootstrap error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
