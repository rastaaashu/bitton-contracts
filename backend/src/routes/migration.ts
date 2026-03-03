import { Router, Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { chainService } from "../services/chain.service";
import { logger } from "../utils/logger";

const router = Router();

/**
 * GET /migration/status/:evmAddress
 * Check migration status for a user
 */
router.get("/status/:evmAddress", async (req: Request, res: Response) => {
  try {
    const evmAddress = req.params.evmAddress as string;

    // Check on-chain first
    const onChainMigrated = await chainService.hasMigrated(evmAddress);

    // Check DB
    const claim = await prisma.migrationClaim.findFirst({
      where: { evmAddress: evmAddress.toLowerCase() },
    });

    const user = await prisma.user.findFirst({
      where: { evmAddress: evmAddress.toLowerCase() },
    });

    res.json({
      evmAddress,
      onChainMigrated,
      claim: claim
        ? {
            status: claim.status,
            amount: claim.amountBtn,
            txHash: claim.txHash,
            claimedAt: claim.claimedAt,
          }
        : null,
      userExists: !!user,
    });
  } catch (err: any) {
    logger.error("Migration status error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /migration/link-wallet
 * Link a TON wallet to an EVM wallet
 */
router.post("/link-wallet", async (req: Request, res: Response) => {
  try {
    const { tonAddress, evmAddress, signature } = req.body;
    if (!tonAddress || !evmAddress || !signature) {
      res.status(400).json({
        error: "tonAddress, evmAddress, and signature are required",
      });
      return;
    }

    // Find or create user
    let user = await prisma.user.findFirst({
      where: { evmAddress: evmAddress.toLowerCase() },
    });
    if (!user) {
      user = await prisma.user.create({
        data: { evmAddress: evmAddress.toLowerCase() },
      });
    }

    // Check if link already exists
    const existingLink = await prisma.walletLink.findFirst({
      where: {
        tonAddress: tonAddress.toLowerCase(),
        evmAddress: evmAddress.toLowerCase(),
      },
    });
    if (existingLink) {
      res.json({ success: true, linkId: existingLink.id, existing: true });
      return;
    }

    // TODO: Verify TON signature in production
    // For now, accept the signature as-is (verification logic depends on TON SDK)

    const link = await prisma.walletLink.create({
      data: {
        userId: user.id,
        tonAddress: tonAddress.toLowerCase(),
        evmAddress: evmAddress.toLowerCase(),
        signature,
        verified: true, // In production, verify signature first
      },
    });

    // Update user's TON address
    await prisma.user.update({
      where: { id: user.id },
      data: { tonAddress: tonAddress.toLowerCase() },
    });

    await prisma.auditLog.create({
      data: {
        actor: evmAddress,
        action: "migration.link_wallet",
        target: tonAddress,
        detail: { linkId: link.id },
      },
    });

    res.json({ success: true, linkId: link.id });
  } catch (err: any) {
    logger.error("Link wallet error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
