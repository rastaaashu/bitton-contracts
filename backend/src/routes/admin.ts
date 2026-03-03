import { Router, Request, Response } from "express";
import { adminAuth } from "../middleware/adminAuth";
import { migrationService } from "../services/migration.service";
import { chainService } from "../services/chain.service";
import { prisma } from "../utils/prisma";
import { logger } from "../utils/logger";
import { JobType, JobStatus } from "@prisma/client";

const router = Router();

// All admin routes require API key
router.use(adminAuth);

/**
 * POST /admin/ton/import-snapshot
 * Import TON snapshot data into the database
 */
router.post("/ton/import-snapshot", async (req: Request, res: Response) => {
  try {
    const { rows, snapshotAt, batchId } = req.body;
    if (!rows || !Array.isArray(rows)) {
      res.status(400).json({ error: "rows must be an array" });
      return;
    }
    if (!snapshotAt || !batchId) {
      res.status(400).json({ error: "snapshotAt and batchId are required" });
      return;
    }

    const result = await migrationService.importSnapshot(
      rows,
      new Date(snapshotAt),
      batchId
    );
    res.json({ success: true, ...result });
  } catch (err: any) {
    logger.error("Import snapshot error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /admin/migration/build
 * Build migration claims from verified wallet links + snapshot data
 */
router.post("/migration/build", async (_req: Request, res: Response) => {
  try {
    const result = await migrationService.buildMigrationClaims();
    res.json({ success: true, ...result });
  } catch (err: any) {
    logger.error("Build migration error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /admin/jobs/dispatch
 * Dispatch pending migration claims as operator jobs
 */
router.post("/jobs/dispatch", async (_req: Request, res: Response) => {
  try {
    const result = await migrationService.dispatchMigrationBatches();
    res.json({ success: true, ...result });
  } catch (err: any) {
    logger.error("Dispatch jobs error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /admin/jobs/distribute
 * Create a distribute job (send BTN from Custodial to a user)
 */
router.post("/jobs/distribute", async (req: Request, res: Response) => {
  try {
    const { to, amount, idempotencyKey } = req.body;
    if (!to || !amount) {
      res.status(400).json({ error: "to and amount are required" });
      return;
    }

    // Idempotency check
    if (idempotencyKey) {
      const existing = await prisma.operatorJob.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        res.json({ success: true, jobId: existing.id, status: existing.status, duplicate: true });
        return;
      }
    }

    const job = await prisma.operatorJob.create({
      data: {
        jobType: JobType.DISTRIBUTE,
        payload: { to, amount },
        idempotencyKey: idempotencyKey || undefined,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor: "admin",
        action: "admin.create_distribute_job",
        target: to,
        detail: { amount, jobId: job.id },
      },
    });

    res.json({ success: true, jobId: job.id });
  } catch (err: any) {
    logger.error("Create distribute job error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /admin/status
 * Overall system status: on-chain state, job queue, migration stats
 */
router.get("/status", async (_req: Request, res: Response) => {
  try {
    const [custodialState, relayerInfo, jobCounts, migrationStats] = await Promise.all([
      chainService.getCustodialState(),
      chainService.getRelayerInfo(),
      prisma.operatorJob.groupBy({
        by: ["status"],
        _count: true,
      }),
      prisma.migrationClaim.groupBy({
        by: ["status"],
        _count: true,
      }),
    ]);

    const jobsByStatus: Record<string, number> = {};
    for (const g of jobCounts) {
      jobsByStatus[g.status] = g._count;
    }

    const migByStatus: Record<string, number> = {};
    for (const g of migrationStats) {
      migByStatus[g.status] = g._count;
    }

    const totalUsers = await prisma.user.count();
    const totalSnapshots = await prisma.tonSnapshotRow.count();

    res.json({
      custodial: custodialState,
      relayer: relayerInfo,
      jobs: jobsByStatus,
      migration: migByStatus,
      users: totalUsers,
      snapshots: totalSnapshots,
    });
  } catch (err: any) {
    logger.error("Status error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /admin/jobs
 * List operator jobs with pagination
 */
router.get("/jobs", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as JobStatus | undefined;

    const where = status ? { status } : {};
    const [jobs, total] = await Promise.all([
      prisma.operatorJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.operatorJob.count({ where }),
    ]);

    res.json({ jobs, total, page, limit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /admin/audit
 * View audit log
 */
router.get("/audit", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
