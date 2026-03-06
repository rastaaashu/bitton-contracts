import dotenv from "dotenv";
dotenv.config();

const isTest = process.env.NODE_ENV === "test";

function required(key: string): string {
  const val = process.env[key];
  if (!val) {
    if (isTest) return `test-${key}`;
    throw new Error(`Missing required env var: ${key}`);
  }
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const env = {
  port: parseInt(optional("PORT", "3001"), 10),
  nodeEnv: optional("NODE_ENV", "development"),
  databaseUrl: required("DATABASE_URL"),

  // Blockchain
  rpcUrl: required("RPC_URL"),
  chainId: parseInt(optional("CHAIN_ID", "84532"), 10),
  relayerPrivateKey: required("RELAYER_PRIVATE_KEY"),

  // Contract addresses
  contracts: {
    btnToken: required("BTN_TOKEN_ADDRESS"),
    custodial: required("CUSTODIAL_ADDRESS"),
    vaultManager: optional("VAULT_MANAGER_ADDRESS", ""),
    stakingVault: optional("STAKING_VAULT_ADDRESS", ""),
    rewardEngine: optional("REWARD_ENGINE_ADDRESS", ""),
    vestingPool: optional("VESTING_POOL_ADDRESS", ""),
    withdrawalWallet: optional("WITHDRAWAL_WALLET_ADDRESS", ""),
    bonusEngine: optional("BONUS_ENGINE_ADDRESS", ""),
  },

  // Auth
  authSecret: process.env.NODE_ENV === "production" ? required("AUTH_SECRET") : optional("AUTH_SECRET", "dev-secret"),
  jwtAccessExpiry: optional("JWT_ACCESS_EXPIRY", "15m"),
  jwtRefreshExpiry: optional("JWT_REFRESH_EXPIRY", "7d"),
  adminApiKey: optional("ADMIN_API_KEY", "dev-admin-key"),

  // Email (SMTP)
  smtpHost: optional("SMTP_HOST", ""),
  smtpPort: parseInt(optional("SMTP_PORT", "587"), 10),
  smtpUser: optional("SMTP_USER", ""),
  smtpPass: optional("SMTP_PASS", ""),
  smtpFrom: optional("SMTP_FROM", "noreply@bitton.ai"),

  // HTTP Email API (for platforms that block SMTP ports like Render)
  emailApiKey: optional("EMAIL_API_KEY", ""),
  emailApiProvider: optional("EMAIL_API_PROVIDER", "resend"), // "resend" or "sendgrid"

  // Telegram
  telegramBotToken: optional("TELEGRAM_BOT_TOKEN", ""),
  telegramBotUsername: optional("TELEGRAM_BOT_USERNAME", ""),

  // App
  appUrl: optional("APP_URL", "http://localhost:3000"),
};
