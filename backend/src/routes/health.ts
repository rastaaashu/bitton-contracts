import { Router, Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { getProvider, getRelayerSigner } from "../config/contracts";
import { env } from "../config/env";

const router = Router();

router.get("/health", async (_req: Request, res: Response) => {
  try {
    // DB check
    await prisma.$queryRaw`SELECT 1`;

    // RPC check
    const provider = getProvider();
    const blockNumber = await provider.getBlockNumber();

    // Relayer check
    const signer = getRelayerSigner();
    const ethBalance = await provider.getBalance(signer.address);

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      env: env.nodeEnv,
      chain: {
        chainId: env.chainId,
        blockNumber,
      },
      relayer: {
        address: signer.address,
        ethBalance: parseFloat(
          (Number(ethBalance) / 1e18).toFixed(6)
        ),
      },
      db: "connected",
    });
  } catch (err: any) {
    res.status(503).json({
      status: "error",
      error: err.message,
    });
  }
});

export default router;
