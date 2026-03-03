import { ethers } from "ethers";
import {
  getProvider,
  getRelayerSigner,
  getCustodialContract,
  getBtnTokenContract,
} from "../config/contracts";
import { logger } from "../utils/logger";

type SignerOrProvider = ethers.Signer | ethers.Provider;

export class ChainService {
  /**
   * Get current on-chain state of CustodialDistribution
   */
  async getCustodialState(): Promise<{
    balance: string;
    totalDistributed: string;
    totalReturned: string;
    totalMigrated: string;
    migrationEnabled: boolean;
    finalized: boolean;
    distributionCap: string;
  }> {
    const custodial = getCustodialContract(getProvider());
    const [balance, totalDistributed, totalReturned, totalMigrated, migrationEnabled, finalized, distributionCap] =
      await Promise.all([
        custodial.getBalance(),
        custodial.totalDistributed(),
        custodial.totalReturned(),
        custodial.totalMigrated(),
        custodial.isMigrationEnabled(),
        custodial.isFinalized(),
        custodial.distributionCap(),
      ]);

    return {
      balance: ethers.formatUnits(balance, 6),
      totalDistributed: ethers.formatUnits(totalDistributed, 6),
      totalReturned: ethers.formatUnits(totalReturned, 6),
      totalMigrated: ethers.formatUnits(totalMigrated, 6),
      migrationEnabled,
      finalized,
      distributionCap: ethers.formatUnits(distributionCap, 6),
    };
  }

  /**
   * Distribute BTN from Custodial to a user
   */
  async distribute(to: string, amountBtn: string): Promise<{ txHash: string; gasUsed: string }> {
    const custodial = getCustodialContract();
    const amount = ethers.parseUnits(amountBtn, 6);

    logger.info(`Distributing ${amountBtn} BTN to ${to}`);
    const tx = await custodial.distribute(to, amount);
    const receipt = await tx.wait();

    logger.info(`Distribution confirmed: ${receipt.hash}`);
    return {
      txHash: receipt.hash,
      gasUsed: receipt.gasUsed.toString(),
    };
  }

  /**
   * Batch migrate TON users to Base
   */
  async batchMigrate(
    recipients: string[],
    amounts: string[]
  ): Promise<{ txHash: string; gasUsed: string }> {
    const custodial = getCustodialContract();
    const amountsBigInt = amounts.map((a) => ethers.parseUnits(a, 6));

    logger.info(`Batch migrating ${recipients.length} users`);
    const tx = await custodial.batchMigrate(recipients, amountsBigInt);
    const receipt = await tx.wait();

    logger.info(`Migration batch confirmed: ${receipt.hash}`);
    return {
      txHash: receipt.hash,
      gasUsed: receipt.gasUsed.toString(),
    };
  }

  /**
   * Check if a user has already migrated
   */
  async hasMigrated(address: string): Promise<boolean> {
    const custodial = getCustodialContract(getProvider());
    return custodial.hasMigrated(address);
  }

  /**
   * Get BTN balance for an address
   */
  async getBtnBalance(address: string): Promise<string> {
    const btn = getBtnTokenContract();
    const balance = await btn.balanceOf(address);
    return ethers.formatUnits(balance, 6);
  }

  /**
   * Get relayer wallet info
   */
  async getRelayerInfo(): Promise<{ address: string; ethBalance: string }> {
    const signer = getRelayerSigner();
    const provider = getProvider();
    const balance = await provider.getBalance(signer.address);
    return {
      address: signer.address,
      ethBalance: ethers.formatEther(balance),
    };
  }
}

export const chainService = new ChainService();
