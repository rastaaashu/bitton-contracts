import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { logger } from "../utils/logger";
import {
  getProvider,
  getBtnTokenContract,
  getVaultManagerContract,
  getStakingVaultContract,
  getVestingPoolContract,
  getWithdrawalWalletContract,
  getRewardEngineContract,
  getBonusEngineContract,
} from "../config/contracts";

const router = Router();

// Helper: validate Ethereum address
function isValidAddress(address: string): boolean {
  try {
    ethers.getAddress(address);
    return true;
  } catch {
    return false;
  }
}

// ──────────────────────────────────────
// GET /api/dashboard/:address
// Aggregated dashboard data from on-chain contracts
// ──────────────────────────────────────
router.get("/dashboard/:address", async (req: Request, res: Response) => {
  try {
    const address = req.params.address as string;
    if (!isValidAddress(address)) {
      res.status(400).json({ error: "Invalid Ethereum address" });
      return;
    }

    const normalizedAddr = ethers.getAddress(address);
    const provider = getProvider();
    const btnToken = getBtnTokenContract();
    const vaultManager = getVaultManagerContract();
    const stakingVault = getStakingVaultContract();
    const vestingPool = getVestingPoolContract();
    const withdrawalWallet = getWithdrawalWalletContract();
    const rewardEngine = getRewardEngineContract(provider);
    const bonusEngine = getBonusEngineContract();

    // Fetch all data in parallel for performance
    const [
      btnBalance,
      ethBalance,
      vaultActive,
      userTier,
      stakes,
      vestedBalance,
      pendingRelease,
      withdrawableBalance,
      rewardPoolBalance,
      referrer,
      downline,
    ] = await Promise.all([
      btnToken.balanceOf(normalizedAddr).catch(() => BigInt(0)),
      provider.getBalance(normalizedAddr).catch(() => BigInt(0)),
      vaultManager.isVaultActive(normalizedAddr).catch(() => false),
      vaultManager.getUserTier(normalizedAddr).catch(() => 0),
      stakingVault.getStakes(normalizedAddr).catch(() => []),
      vestingPool.getVestedBalance(normalizedAddr).catch(() => BigInt(0)),
      vestingPool.getPendingRelease(normalizedAddr).catch(() => BigInt(0)),
      withdrawalWallet.getWithdrawableBalance(normalizedAddr).catch(() => BigInt(0)),
      rewardEngine.rewardPoolBalance().catch(() => BigInt(0)),
      bonusEngine.getReferrer(normalizedAddr).catch(() => ethers.ZeroAddress),
      bonusEngine.getDownline(normalizedAddr).catch(() => []),
    ]);

    // Calculate total staked and pending rewards across all stakes
    let totalStaked = BigInt(0);
    let totalPendingRewards = BigInt(0);
    const formattedStakes = [];

    for (let i = 0; i < stakes.length; i++) {
      const stake = stakes[i];
      const amount = stake.amount ?? stake[0];
      const startTime = stake.startTime ?? stake[1];
      const programType = stake.programType ?? stake[2];
      const lastRewardTime = stake.lastRewardTime ?? stake[3];
      const isActive = stake.active ?? stake[4];

      const lockDays = Number(programType) === 0 ? 30 : 180;
      const endTime = Number(startTime) + lockDays * 86400;

      if (isActive) {
        totalStaked += BigInt(amount);
      }

      let pendingReward = BigInt(0);
      if (isActive) {
        try {
          pendingReward = await stakingVault.getPendingRewards(normalizedAddr, i);
        } catch {
          // Stake may not have pending rewards
        }
        totalPendingRewards += pendingReward;
      }

      formattedStakes.push({
        index: i,
        amount: ethers.formatUnits(amount, 6),
        programType: Number(programType) === 0 ? "SHORT" : "LONG",
        startTime: Number(startTime),
        endTime,
        active: Boolean(isActive),
        lastRewardTime: Number(lastRewardTime),
        pendingReward: ethers.formatUnits(pendingReward, 6),
      });
    }

    const tierNames = ["NONE", "T1", "T2", "T3"];

    res.json({
      address: normalizedAddr,
      balances: {
        btn: ethers.formatUnits(btnBalance, 6),
        eth: ethers.formatEther(ethBalance),
        withdrawable: ethers.formatUnits(withdrawableBalance, 6),
        vested: ethers.formatUnits(vestedBalance, 6),
        pendingVestingRelease: ethers.formatUnits(pendingRelease, 6),
      },
      vault: {
        active: vaultActive,
        tier: Number(userTier),
        tierName: tierNames[Number(userTier)] || "UNKNOWN",
      },
      staking: {
        totalStaked: ethers.formatUnits(totalStaked, 6),
        totalPendingRewards: ethers.formatUnits(totalPendingRewards, 6),
        activeStakes: formattedStakes.filter((s) => s.active).length,
        stakes: formattedStakes,
      },
      referral: {
        referrer: referrer === ethers.ZeroAddress ? null : referrer,
        downlineCount: downline.length,
      },
      protocol: {
        rewardPoolBalance: ethers.formatUnits(rewardPoolBalance, 6),
      },
    });
  } catch (err: any) {
    logger.error("Dashboard fetch error:", err);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

// ──────────────────────────────────────
// GET /api/history/:address
// Transaction history from contract events
// ──────────────────────────────────────
router.get("/history/:address", async (req: Request, res: Response) => {
  try {
    const address = req.params.address as string;
    if (!isValidAddress(address)) {
      res.status(400).json({ error: "Invalid Ethereum address" });
      return;
    }

    const normalizedAddr = ethers.getAddress(address);
    const provider = getProvider();

    // Parse query params for pagination
    const fromBlock = parseInt(req.query.fromBlock as string) || 0;
    const toBlock = req.query.toBlock === "latest" || !req.query.toBlock
      ? "latest"
      : parseInt(req.query.toBlock as string);

    const stakingVault = getStakingVaultContract();
    const withdrawalWallet = getWithdrawalWalletContract();
    const vestingPool = getVestingPoolContract();
    const rewardEngine = getRewardEngineContract(provider);
    const bonusEngine = getBonusEngineContract();

    // Query events in parallel
    const [
      stakeEvents,
      unstakeEvents,
      withdrawEvents,
      vestingAddedEvents,
      vestingReleasedEvents,
      settlementEvents,
      directBonusEvents,
      matchingBonusEvents,
    ] = await Promise.all([
      stakingVault.queryFilter(
        stakingVault.filters.Staked(normalizedAddr),
        fromBlock,
        toBlock
      ).catch(() => []),
      stakingVault.queryFilter(
        stakingVault.filters.Unstaked(normalizedAddr),
        fromBlock,
        toBlock
      ).catch(() => []),
      withdrawalWallet.queryFilter(
        withdrawalWallet.filters.Withdrawn(normalizedAddr),
        fromBlock,
        toBlock
      ).catch(() => []),
      vestingPool.queryFilter(
        vestingPool.filters.VestingAdded(normalizedAddr),
        fromBlock,
        toBlock
      ).catch(() => []),
      vestingPool.queryFilter(
        vestingPool.filters.VestingReleased(normalizedAddr),
        fromBlock,
        toBlock
      ).catch(() => []),
      rewardEngine.queryFilter(
        rewardEngine.filters.WeeklySettlement(normalizedAddr),
        fromBlock,
        toBlock
      ).catch(() => []),
      bonusEngine.queryFilter(
        bonusEngine.filters.DirectBonusPaid(normalizedAddr),
        fromBlock,
        toBlock
      ).catch(() => []),
      bonusEngine.queryFilter(
        bonusEngine.filters.MatchingBonusPaid(normalizedAddr),
        fromBlock,
        toBlock
      ).catch(() => []),
    ]);

    // Format all events into a unified history
    const history: any[] = [];

    for (const ev of stakeEvents) {
      const log = ev as ethers.EventLog;
      const block = await provider.getBlock(log.blockNumber);
      history.push({
        type: "STAKE",
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: block?.timestamp || 0,
        data: {
          amount: ethers.formatUnits(log.args[1], 6),
          programType: Number(log.args[2]) === 0 ? "SHORT" : "LONG",
          stakeIndex: Number(log.args[3]),
        },
      });
    }

    for (const ev of unstakeEvents) {
      const log = ev as ethers.EventLog;
      const block = await provider.getBlock(log.blockNumber);
      history.push({
        type: "UNSTAKE",
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: block?.timestamp || 0,
        data: {
          stakeIndex: Number(log.args[1]),
          amount: ethers.formatUnits(log.args[2], 6),
          penalty: ethers.formatUnits(log.args[3], 6),
        },
      });
    }

    for (const ev of withdrawEvents) {
      const log = ev as ethers.EventLog;
      const block = await provider.getBlock(log.blockNumber);
      history.push({
        type: "WITHDRAWAL",
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: block?.timestamp || 0,
        data: {
          amount: ethers.formatUnits(log.args[1], 6),
        },
      });
    }

    for (const ev of vestingAddedEvents) {
      const log = ev as ethers.EventLog;
      const block = await provider.getBlock(log.blockNumber);
      history.push({
        type: "VESTING_ADDED",
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: block?.timestamp || 0,
        data: {
          amount: ethers.formatUnits(log.args[1], 6),
        },
      });
    }

    for (const ev of vestingReleasedEvents) {
      const log = ev as ethers.EventLog;
      const block = await provider.getBlock(log.blockNumber);
      history.push({
        type: "VESTING_RELEASED",
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: block?.timestamp || 0,
        data: {
          amount: ethers.formatUnits(log.args[1], 6),
        },
      });
    }

    for (const ev of settlementEvents) {
      const log = ev as ethers.EventLog;
      const block = await provider.getBlock(log.blockNumber);
      history.push({
        type: "WEEKLY_SETTLEMENT",
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: block?.timestamp || 0,
        data: {
          totalReward: ethers.formatUnits(log.args[1], 6),
          withdrawable: ethers.formatUnits(log.args[2], 6),
          vested: ethers.formatUnits(log.args[3], 6),
        },
      });
    }

    for (const ev of directBonusEvents) {
      const log = ev as ethers.EventLog;
      const block = await provider.getBlock(log.blockNumber);
      history.push({
        type: "DIRECT_BONUS",
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: block?.timestamp || 0,
        data: {
          staker: log.args[1],
          amount: ethers.formatUnits(log.args[2], 6),
        },
      });
    }

    for (const ev of matchingBonusEvents) {
      const log = ev as ethers.EventLog;
      const block = await provider.getBlock(log.blockNumber);
      history.push({
        type: "MATCHING_BONUS",
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: block?.timestamp || 0,
        data: {
          source: log.args[1],
          amount: ethers.formatUnits(log.args[2], 6),
          level: Number(log.args[3]),
        },
      });
    }

    // Sort by block number descending (most recent first)
    history.sort((a, b) => b.blockNumber - a.blockNumber);

    res.json({
      address: normalizedAddr,
      count: history.length,
      history,
    });
  } catch (err: any) {
    logger.error("History fetch error:", err);
    res.status(500).json({ error: "Failed to fetch transaction history" });
  }
});

export default router;
