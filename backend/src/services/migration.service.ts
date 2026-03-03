import { prisma } from "../utils/prisma";
import { chainService } from "./chain.service";
import { logger } from "../utils/logger";
import { ClaimStatus, JobStatus, JobType } from "@prisma/client";

const BATCH_SIZE = 200;

export class MigrationService {
  /**
   * Import a TON snapshot CSV/JSON into the database
   */
  async importSnapshot(
    rows: Array<{ tonAddress: string; balanceTon: string; balanceBtn: string }>,
    snapshotAt: Date,
    batchId: string
  ): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const existing = await prisma.tonSnapshotRow.findUnique({
        where: { tonAddress: row.tonAddress },
      });
      if (existing) {
        skipped++;
        continue;
      }

      await prisma.tonSnapshotRow.create({
        data: {
          tonAddress: row.tonAddress,
          balanceTon: row.balanceTon,
          balanceBtn: row.balanceBtn,
          snapshotAt,
          batchId,
        },
      });
      imported++;
    }

    await prisma.auditLog.create({
      data: {
        actor: "system",
        action: "admin.import_snapshot",
        detail: { imported, skipped, batchId, total: rows.length },
      },
    });

    logger.info(`Snapshot import complete: ${imported} imported, ${skipped} skipped`);
    return { imported, skipped };
  }

  /**
   * Build migration claims for users who have linked wallets
   */
  async buildMigrationClaims(): Promise<{ created: number; skipped: number }> {
    // Find wallet links that have verified mappings AND have snapshot data
    const links = await prisma.walletLink.findMany({
      where: { verified: true },
      include: { user: true },
    });

    let created = 0;
    let skipped = 0;

    for (const link of links) {
      // Check if claim already exists
      const existingClaim = await prisma.migrationClaim.findUnique({
        where: { userId: link.userId },
      });
      if (existingClaim) {
        skipped++;
        continue;
      }

      // Find snapshot row
      const snapshot = await prisma.tonSnapshotRow.findUnique({
        where: { tonAddress: link.tonAddress },
      });
      if (!snapshot) {
        skipped++;
        continue;
      }

      // Check if already migrated on-chain
      const migrated = await chainService.hasMigrated(link.evmAddress);
      if (migrated) {
        skipped++;
        continue;
      }

      await prisma.migrationClaim.create({
        data: {
          userId: link.userId,
          tonAddress: link.tonAddress,
          evmAddress: link.evmAddress,
          amountBtn: snapshot.balanceBtn,
          status: ClaimStatus.PENDING,
        },
      });
      created++;
    }

    await prisma.auditLog.create({
      data: {
        actor: "system",
        action: "admin.build_migration_claims",
        detail: { created, skipped },
      },
    });

    logger.info(`Migration claims built: ${created} created, ${skipped} skipped`);
    return { created, skipped };
  }

  /**
   * Process pending migration claims in batches via operator jobs
   */
  async dispatchMigrationBatches(): Promise<{ batches: number; total: number }> {
    const pendingClaims = await prisma.migrationClaim.findMany({
      where: { status: ClaimStatus.PENDING },
      orderBy: { createdAt: "asc" },
    });

    let batches = 0;
    for (let i = 0; i < pendingClaims.length; i += BATCH_SIZE) {
      const batch = pendingClaims.slice(i, i + BATCH_SIZE);
      const recipients = batch.map((c) => c.evmAddress);
      const amounts = batch.map((c) => c.amountBtn);

      const idempotencyKey = `migrate_batch_${batch[0].id}_${batch[batch.length - 1].id}`;

      await prisma.operatorJob.create({
        data: {
          jobType: JobType.BATCH_MIGRATE,
          payload: { recipients, amounts },
          idempotencyKey,
        },
      });

      // Mark claims as QUEUED
      await prisma.migrationClaim.updateMany({
        where: { id: { in: batch.map((c) => c.id) } },
        data: { status: ClaimStatus.QUEUED },
      });

      batches++;
    }

    logger.info(`Dispatched ${batches} migration batches for ${pendingClaims.length} claims`);
    return { batches, total: pendingClaims.length };
  }
}

export const migrationService = new MigrationService();
