import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { prisma } from "./utils/prisma";
import { operatorRunner } from "./jobs/operator.runner";

// Routes
import healthRouter from "./routes/health";
import authRouter from "./routes/auth";
import adminRouter from "./routes/admin";
import migrationRouter from "./routes/migration";
import sponsorRouter from "./routes/sponsor";
import dashboardRouter from "./routes/dashboard";
import contractsRouter from "./routes/contracts";

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    env.appUrl,
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
  ].filter(Boolean),
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

// Routes
app.use("/", healthRouter);
app.use("/auth", authRouter);
app.use("/admin", adminRouter);
app.use("/migration", migrationRouter);
app.use("/sponsor", sponsorRouter);
app.use("/api", dashboardRouter);
app.use("/api", contractsRouter);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Cleanup expired auth data periodically
async function cleanupExpiredAuthData() {
  try {
    const now = new Date();
    const [sessions, otps, challenges] = await prisma.$transaction([
      prisma.pendingSession.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.otpCode.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.walletChallenge.deleteMany({ where: { expiresAt: { lt: now } } }),
    ]);
    if (sessions.count + otps.count + challenges.count > 0) {
      logger.info(`Cleanup: removed ${sessions.count} sessions, ${otps.count} OTPs, ${challenges.count} challenges`);
    }
  } catch (err: any) {
    logger.warn(`Cleanup error: ${err.message}`);
  }
}

// Start
async function main() {
  // Connect to DB
  await prisma.$connect();
  logger.info("Database connected");

  // Initial cleanup + schedule every 30 min
  await cleanupExpiredAuthData();
  setInterval(cleanupExpiredAuthData, 30 * 60 * 1000);

  // Start HTTP server
  const server = app.listen(env.port, () => {
    logger.info(`BitTON.AI backend running on port ${env.port} (${env.nodeEnv})`);
    logger.info(`Health check: http://localhost:${env.port}/health`);
  });

  // Start operator job runner (background)
  if (env.nodeEnv !== "test") {
    operatorRunner.start().catch((err) => {
      logger.error("Operator runner crashed:", err);
    });
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down...");
    operatorRunner.stop();
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error("Fatal startup error:", err);
  process.exit(1);
});

export { app };
