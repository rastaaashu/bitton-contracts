import crypto from "crypto";
import { env } from "../config/env";

export interface TelegramLoginData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/**
 * Verify Telegram Login Widget data using HMAC-SHA256.
 * See: https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyTelegramAuth(data: TelegramLoginData): boolean {
  if (!env.telegramBotToken) {
    return false;
  }

  const { hash, ...rest } = data;

  // Build data-check-string: sort keys alphabetically, join with \n
  const checkString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${(rest as Record<string, any>)[key]}`)
    .join("\n");

  // Secret key = SHA256(bot_token)
  const secretKey = crypto
    .createHash("sha256")
    .update(env.telegramBotToken)
    .digest();

  // HMAC-SHA256 of the data-check-string
  const hmac = crypto
    .createHmac("sha256", secretKey)
    .update(checkString)
    .digest("hex");

  // Timing-safe comparison to prevent side-channel attacks
  const hmacBuf = Buffer.from(hmac, "hex");
  const hashBuf = Buffer.from(hash, "hex");
  if (hmacBuf.length !== hashBuf.length || !crypto.timingSafeEqual(hmacBuf, hashBuf)) {
    return false;
  }

  // Check auth_date is not too old (allow 1 hour)
  const now = Math.floor(Date.now() / 1000);
  if (now - data.auth_date > 3600) {
    return false;
  }

  return true;
}
