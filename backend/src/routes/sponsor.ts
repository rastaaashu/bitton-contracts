import { Router, Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { logger } from "../utils/logger";
import { jwtAuth } from "../middleware/jwtAuth";
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
// GET /sponsor/code/:code
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

export default router;
