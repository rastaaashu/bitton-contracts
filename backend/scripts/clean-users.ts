import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // List all users first
  const users = await prisma.user.findMany({
    select: { id: true, email: true, evmAddress: true, status: true, authMethod: true },
  });
  console.log("Users to delete:");
  for (const u of users) {
    console.log(`  ${u.id} | ${u.evmAddress || "no-wallet"} | ${u.email || "no-email"} | ${u.authMethod}`);
  }

  // Keep the bootstrap admin (treasury wallet) sponsor code but delete the user
  // Delete in dependency order
  const bootstrapAddr = "0x1dae2c7aec8850f1742fe96045c23d1aae3fcf2a";

  // Get all user IDs except bootstrap
  const nonBootstrap = users.filter((u) => u.evmAddress !== bootstrapAddr);
  const allIds = users.map((u) => u.id);

  console.log(`\nDeleting ${allIds.length} users and all related data...`);

  // Delete dependent records first
  await prisma.auditLog.deleteMany({});
  await prisma.otpCode.deleteMany({});
  await prisma.pendingSession.deleteMany({});
  await prisma.loginSession.deleteMany({});
  await prisma.walletChallenge.deleteMany({});
  await prisma.sponsorCode.deleteMany({});
  await prisma.user.deleteMany({});

  console.log("All users and related data deleted.");

  // Re-create bootstrap admin + sponsor code
  const admin = await prisma.user.create({
    data: {
      evmAddress: bootstrapAddr,
      status: "CONFIRMED",
      authMethod: "WALLET",
    },
  });
  await prisma.sponsorCode.create({
    data: {
      userId: admin.id,
      code: "BITTON-ALPHA",
      maxUses: 0,
    },
  });
  console.log("Re-created bootstrap admin + BITTON-ALPHA sponsor code.");
  console.log("\nDatabase is clean and ready for testing.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
