import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Bootstrap admin user — use the treasury wallet as the first user
  const adminAddress = (process.env.BOOTSTRAP_ADMIN_ADDRESS || "0x1dae2c7aec8850f1742fe96045c23d1aae3fcf2a").toLowerCase();
  const sponsorCode = process.env.BOOTSTRAP_SPONSOR_CODE || "BITTON-ALPHA";

  let user = await prisma.user.findFirst({ where: { evmAddress: adminAddress } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        evmAddress: adminAddress,
        authMethod: "WALLET",
        status: "CONFIRMED",
      },
    });
    console.log(`Created bootstrap admin user: ${user.id} (${adminAddress})`);
  } else {
    console.log(`Bootstrap admin user already exists: ${user.id}`);
  }

  // Create default sponsor code
  const existing = await prisma.sponsorCode.findUnique({ where: { code: sponsorCode } });
  if (!existing) {
    await prisma.sponsorCode.create({
      data: {
        userId: user.id,
        code: sponsorCode,
        maxUses: 0, // unlimited
      },
    });
    console.log(`Created sponsor code: ${sponsorCode}`);
  } else {
    console.log(`Sponsor code already exists: ${sponsorCode}`);
  }

  console.log(`\nReferral links:`);
  console.log(`  By code:    /register?ref=${sponsorCode}`);
  console.log(`  By wallet:  /register?ref=${adminAddress}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
