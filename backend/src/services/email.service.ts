import nodemailer from "nodemailer";
import { env } from "../config/env";
import { logger } from "../utils/logger";

let cachedTransporter: nodemailer.Transporter | null = null;

function getSmtpTransporter(): nodemailer.Transporter | null {
  if (!env.smtpHost) return null;
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: { user: env.smtpUser, pass: env.smtpPass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return cachedTransporter;
}

/**
 * Send email via HTTP API (Resend or SendGrid).
 * Works on platforms that block outbound SMTP (e.g. Render free tier).
 */
async function sendViaHttpApi(
  to: string, subject: string, text: string, html: string
): Promise<string> {
  const provider = env.emailApiProvider;
  const apiKey = env.emailApiKey;
  // Use Resend's free onboarding domain unless SMTP_FROM looks like a verified domain
  // On Resend free plan, you MUST use onboarding@resend.dev as the from address
  let from = env.smtpFrom;
  if (provider === "resend") {
    // Only use custom from if it's explicitly set to a non-default value that doesn't contain bitton.ai
    // (bitton.ai domain needs to be verified on Resend first)
    const isDefaultOrUnverified = !from || from === "noreply@bitton.ai" || from.includes("@bitton.ai");
    if (isDefaultOrUnverified) {
      from = "BitTON.AI <onboarding@resend.dev>";
    }
  }

  if (provider === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, text, html }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Resend API error: ${res.status} ${err}`);
    }
    const data = (await res.json()) as { id: string };
    return data.id;
  }

  if (provider === "sendgrid") {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: env.smtpUser, name: "BitTON.AI" },
        subject,
        content: [
          { type: "text/plain", value: text },
          { type: "text/html", value: html },
        ],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`SendGrid API error: ${res.status} ${err}`);
    }
    return res.headers.get("x-message-id") || "sendgrid-" + Date.now();
  }

  throw new Error(`Unknown email provider: ${provider}`);
}

async function sendEmail(
  to: string, subject: string, text: string, html: string
): Promise<void> {
  // Priority 1: HTTP email API (works on all platforms)
  if (env.emailApiKey) {
    try {
      const id = await sendViaHttpApi(to, subject, text, html);
      logger.info(`Email sent to ${to} via ${env.emailApiProvider} API, id=${id}`);
      return;
    } catch (apiErr: any) {
      logger.error(`Email API (${env.emailApiProvider}) failed for ${to}: ${apiErr.message}`);
      // Fall through to SMTP if available
      if (!getSmtpTransporter()) throw apiErr;
      logger.info("Falling back to SMTP...");
    }
  }

  // Priority 2: SMTP (works locally, blocked on some hosts)
  const transporter = getSmtpTransporter();
  if (transporter) {
    const result = await transporter.sendMail({
      from: env.smtpFrom, to, subject, text, html,
    });
    logger.info(`Email sent to ${to} via SMTP, messageId=${result.messageId}`);
    return;
  }

  // Priority 3: Dev console fallback
  logger.warn(`[DEV EMAIL] No email provider configured! Email NOT actually sent.`);
  logger.info(`[DEV EMAIL] To: ${to} | Subject: ${subject}`);
  logger.info(`[DEV EMAIL] Body: ${text}`);
}

export async function sendOtpEmail(email: string, otp: string): Promise<void> {
  try {
    await sendEmail(
      email,
      "BitTON.AI - Your verification code",
      `Your verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not request this code, please ignore this email.`,
      `<div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">BitTON.AI Verification</h2>
        <p>Your verification code is:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 20px; background: #f5f5f5; border-radius: 8px; margin: 16px 0;">
          ${otp}
        </div>
        <p style="color: #666; font-size: 14px;">This code expires in 10 minutes.</p>
        <p style="color: #999; font-size: 12px;">If you did not request this code, please ignore this email.</p>
      </div>`
    );
  } catch (err: any) {
    logger.error(`Failed to send OTP email to ${email}: ${err.message}`);
    cachedTransporter = null;
    throw err;
  }
}

// Legacy functions kept for backwards compatibility
export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const verifyUrl = `${env.appUrl}/verify-email?token=${token}`;
  await sendEmail(
    email,
    "BitTON.AI - Verify your email",
    `Verify your email by visiting: ${verifyUrl}\n\nThis link expires in 24 hours.`,
    `<p>Click to verify your email:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`
  );
}

export async function sendSponsorNotification(
  sponsorEmail: string, newUserEmail: string, userId: string
): Promise<void> {
  const confirmUrl = `${env.appUrl}/sponsor/confirm?userId=${userId}`;
  await sendEmail(
    sponsorEmail,
    "BitTON.AI - New referral pending your confirmation",
    `${newUserEmail} registered with your sponsor code.\n\nConfirm: ${confirmUrl}`,
    `<p><strong>${newUserEmail}</strong> registered with your sponsor code.</p><p><a href="${confirmUrl}">Confirm referral</a></p>`
  );
}
