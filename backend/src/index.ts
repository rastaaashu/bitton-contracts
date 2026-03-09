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

// CORS: production only allows APP_URL; development also allows localhost
const corsOrigins: string[] = [env.appUrl].filter(Boolean);
if (env.nodeEnv !== "production") {
  corsOrigins.push(
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003"
  );
}
app.use(cors({ origin: corsOrigins, credentials: true }));
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
  logger.error("Unhandled express error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Global error handlers — prevent silent crashes
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled promise rejection:", { reason, promise: String(promise) });
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception — shutting down:", err);
  process.exit(1);
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

// Startup validation
function validateStartupConfig() {
  const critical: string[] = [];
  if (!env.authSecret || env.authSecret === "dev-secret") {
    if (env.nodeEnv === "production") critical.push("AUTH_SECRET must be set in production");
  }
  if (!env.appUrl || env.appUrl === "http://localhost:3000") {
    if (env.nodeEnv === "production") critical.push("APP_URL must be set to frontend URL in production");
  }
  if (critical.length > 0) {
    logger.error("STARTUP VALIDATION FAILED:");
    critical.forEach((msg) => logger.error(`  - ${msg}`));
    // Log warnings but don't crash — allow deployment to proceed for configuration in dashboard
  }

  // Informational warnings
  if (!env.emailApiKey && !env.smtpHost) {
    logger.warn("No email provider configured (EMAIL_API_KEY or SMTP_HOST). Email OTPs will only log to console.");
  }
  if (!env.telegramBotToken || !env.telegramBotUsername) {
    logger.warn("Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME). Telegram auth disabled.");
  }
}

// Start
async function main() {
  validateStartupConfig();

  // Connect to DB
  await prisma.$connect();
  logger.info("Database connected");

  // Initial cleanup + schedule every 30 min
  await cleanupExpiredAuthData();
  setInterval(cleanupExpiredAuthData, 30 * 60 * 1000);

  // Start HTTP server
  const server = app.listen(env.port, () => {
    logger.info(`BitTON.AI backend running on port ${env.port} (${env.nodeEnv})`);
    logger.info(`CORS origin: ${corsOrigins.join(", ")}`);
    logger.info(`Health check: /health`);
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
