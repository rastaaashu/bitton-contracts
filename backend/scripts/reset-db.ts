import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.auditLog.deleteMany({});
  await prisma.otpCode.deleteMany({});
  await prisma.pendingSession.deleteMany({});
  await prisma.loginSession.deleteMany({});
  await prisma.walletChallenge.deleteMany({});
  await prisma.sponsorCode.deleteMany({});
  await prisma.user.deleteMany({});

  // Bootstrap with a dummy address no one will use
  const admin = await prisma.user.create({
    data: {
      evmAddress: "0x0000000000000000000000000000000000000001",
      status: "CONFIRMED",
      authMethod: "WALLET",
    },
  });
  await prisma.sponsorCode.create({
    data: { userId: admin.id, code: "BITTON-ALPHA", maxUses: 0 },
  });

  const users = await prisma.user.findMany({ select: { id: true, evmAddress: true } });
  console.log("Users:", users);
  console.log("Done. Your wallet 0x1DaE... is now free to register.");
  await prisma.$disconnect();
}

main();
