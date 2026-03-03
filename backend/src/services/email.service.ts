import nodemailer from "nodemailer";
import { env } from "../config/env";
import { logger } from "../utils/logger";

function getTransporter(): nodemailer.Transporter {
  if (env.smtpHost) {
    return nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: { user: env.smtpUser, pass: env.smtpPass },
    });
  }

  // Dev fallback: log emails to console
  return {
    sendMail: async (opts: any) => {
      logger.info(`[DEV EMAIL] To: ${opts.to} Subject: ${opts.subject}`);
      logger.debug(`[DEV EMAIL] Body: ${opts.text || opts.html}`);
      return { messageId: "dev-" + Date.now() };
    },
  } as any;
}

export async function sendVerificationEmail(
  email: string,
  token: string
): Promise<void> {
  const verifyUrl = `${env.appUrl}/auth/verify-email?token=${token}`;

  await getTransporter().sendMail({
    from: env.smtpFrom,
    to: email,
    subject: "BitTON.AI — Verify your email",
    text: `Verify your email by visiting: ${verifyUrl}\n\nThis link expires in 24 hours.`,
    html: `<p>Click to verify your email:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`,
  });

  logger.info(`Verification email sent to ${email}`);
}

export async function sendSponsorNotification(
  sponsorEmail: string,
  newUserEmail: string,
  userId: string
): Promise<void> {
  const confirmUrl = `${env.appUrl}/sponsor/confirm?userId=${userId}`;

  await getTransporter().sendMail({
    from: env.smtpFrom,
    to: sponsorEmail,
    subject: "BitTON.AI — New referral pending your confirmation",
    text: `${newUserEmail} registered with your sponsor code.\n\nConfirm: ${confirmUrl}`,
    html: `<p><strong>${newUserEmail}</strong> registered with your sponsor code.</p><p><a href="${confirmUrl}">Confirm referral</a></p>`,
  });

  logger.info(`Sponsor notification sent to ${sponsorEmail}`);
}
