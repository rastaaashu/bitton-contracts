import { prisma } from "../utils/prisma";
import { chainService } from "../services/chain.service";
import { logger } from "../utils/logger";
import { JobStatus, JobType, ClaimStatus } from "@prisma/client";

const POLL_INTERVAL_MS = 10_000; // 10 seconds

/**
 * Operator Job Runner
 *
 * Polls for pending operator jobs and executes them on-chain.
 * Handles retries, idempotency, and status tracking.
 */
export class OperatorRunner {
  private running = false;

  async start(): Promise<void> {
    this.running = true;
    logger.info("Operator runner started");

    while (this.running) {
      try {
        await this.processNextJob();
      } catch (err) {
        logger.error("Operator runner error:", err);
      }
      await this.sleep(POLL_INTERVAL_MS);
    }
  }

  stop(): void {
    this.running = false;
    logger.info("Operator runner stopping");
  }

  private async processNextJob(): Promise<void> {
    // Pick the oldest pending or retryable failed job
    const job = await prisma.operatorJob.findFirst({
      where: {
        OR: [
          { status: JobStatus.PENDING },
          {
            status: JobStatus.FAILED,
            retryCount: { lt: 3 }, // maxRetries default
          },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    if (!job) return;

    // Check retry eligibility
    if (job.status === JobStatus.FAILED && job.retryCount >= job.maxRetries) {
      await prisma.operatorJob.update({
        where: { id: job.id },
        data: { status: JobStatus.CANCELLED },
      });
      return;
    }

    logger.info(`Processing job ${job.id} (${job.jobType})`);

    await prisma.operatorJob.update({
      where: { id: job.id },
      data: { status: JobStatus.PROCESSING },
    });

    try {
      let result: { txHash: string; gasUsed: string };

      switch (job.jobType) {
        case JobType.DISTRIBUTE: {
          const { to, amount } = job.payload as { to: string; amount: string };
          result = await chainService.distribute(to, amount);
          break;
        }

        case JobType.BATCH_MIGRATE: {
          const { recipients, amounts } = job.payload as {
            recipients: string[];
            amounts: string[];
          };
          result = await chainService.batchMigrate(recipients, amounts);

          // Update migration claims
          await prisma.migrationClaim.updateMany({
            where: {
              evmAddress: { in: recipients },
              status: ClaimStatus.QUEUED,
            },
            data: {
              status: ClaimStatus.CONFIRMED,
              txHash: result.txHash,
              claimedAt: new Date(),
            },
          });
          break;
        }

        case JobType.FUND_CONTRACT: {
          const { target, amount: fundAmt } = job.payload as {
            target: string;
            amount: string;
          };
          // Use distribute for funding (same contract function)
          const custodial = (await import("../config/contracts")).getCustodialContract();
          const { ethers } = await import("ethers");
          const tx = await custodial.fundContract(target, ethers.parseUnits(fundAmt, 6));
          const receipt = await tx.wait();
          result = { txHash: receipt.hash, gasUsed: receipt.gasUsed.toString() };
          break;
        }

        default:
          throw new Error(`Unknown job type: ${job.jobType}`);
      }

      await prisma.operatorJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.CONFIRMED,
          txHash: result.txHash,
          gasUsed: result.gasUsed,
          completedAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          actor: "operator_runner",
          action: `job.${job.jobType.toLowerCase()}.confirmed`,
          target: job.id,
          detail: { txHash: result.txHash, gasUsed: result.gasUsed },
          txHash: result.txHash,
        },
      });

      logger.info(`Job ${job.id} confirmed: ${result.txHash}`);
    } catch (err: any) {
      logger.error(`Job ${job.id} failed:`, err);

      await prisma.operatorJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.FAILED,
          errorMessage: err.message || String(err),
          retryCount: { increment: 1 },
        },
      });

      // If batch migrate failed, mark claims as failed too
      if (job.jobType === JobType.BATCH_MIGRATE) {
        const { recipients } = job.payload as { recipients: string[] };
        await prisma.migrationClaim.updateMany({
          where: {
            evmAddress: { in: recipients },
            status: ClaimStatus.QUEUED,
          },
          data: {
            status: ClaimStatus.FAILED,
            errorMessage: err.message || String(err),
          },
        });
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const operatorRunner = new OperatorRunner();
