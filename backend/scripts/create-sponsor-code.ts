/**
 * Creates a sponsor code directly in the database.
 *
 * Usage: npx tsx scripts/create-sponsor-code.ts <code> <evmAddress> [maxUses]
 * Example: npx tsx scripts/create-sponsor-code.ts BTN-ACC 0x71dB030B792E9D4CfdCC7e452e0Ff55CdB5A4D99 0
 *
 * maxUses=0 means unlimited
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [, , code, evmAddress, maxUsesStr] = process.argv;

  if (!code || !evmAddress) {
    console.error("Usage: npx tsx scripts/create-sponsor-code.ts <code> <evmAddress> [maxUses]");
    console.error("Example: npx tsx scripts/create-sponsor-code.ts BTN-ACC 0x71dB...99 0");
    process.exit(1);
  }

  const maxUses = parseInt(maxUsesStr || "0", 10);
  const normalizedAddr = evmAddress.toLowerCase();

  // Find or create user
  let user = await prisma.user.findFirst({ where: { evmAddress: normalizedAddr } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        evmAddress: normalizedAddr,
        status: "CONFIRMED",
        authMethod: "WALLET",
      },
    });
    console.log(`Created user ${user.id} for ${normalizedAddr}`);
  } else {
    console.log(`Found existing user ${user.id} for ${normalizedAddr}`);
  }

  // Check if code exists
  const existing = await prisma.sponsorCode.findUnique({ where: { code } });
  if (existing) {
    console.log(`Sponsor code "${code}" already exists (userId: ${existing.userId}, maxUses: ${existing.maxUses}, usedCount: ${existing.usedCount})`);
    // Update to unlimited if needed
    if (existing.maxUses !== maxUses) {
      await prisma.sponsorCode.update({
        where: { code },
        data: { maxUses },
      });
      console.log(`Updated maxUses to ${maxUses}`);
    }
    return;
  }

  const sponsorCode = await prisma.sponsorCode.create({
    data: {
      userId: user.id,
      code,
      maxUses,
      active: true,
    },
  });

  console.log(`\nCreated sponsor code:`);
  console.log(`  Code: ${sponsorCode.code}`);
  console.log(`  User: ${user.id}`);
  console.log(`  Max Uses: ${maxUses === 0 ? "Unlimited" : maxUses}`);
  console.log(`  Referral Link: /register?ref=${sponsorCode.code}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
