const { ethers, upgrades } = require("hardhat");

/**
 * Deploy VestingPool as a UUPS proxy.
 *
 * Prerequisites:
 *   - BTN token deployed
 *   - WithdrawalWallet deployed (or use address(0) to wire later)
 *
 * After deployment:
 *   - Grant OPERATOR_ROLE on VestingPool to RewardEngine
 *   - Wire VestingPool address into RewardEngine via setVestingPool()
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying VestingPool with account:", deployer.address);

  // ─── Configuration (update before mainnet deploy) ──────
  const BTN_TOKEN = process.env.BTN_TOKEN || "";
  const WITHDRAWAL_WALLET = process.env.WITHDRAWAL_WALLET || ethers.ZeroAddress;
  const ADMIN = process.env.ADMIN || deployer.address;

  if (!BTN_TOKEN) {
    throw new Error("BTN_TOKEN env var is required");
  }

  console.log("Config:");
  console.log("  BTN_TOKEN:", BTN_TOKEN);
  console.log("  WITHDRAWAL_WALLET:", WITHDRAWAL_WALLET);
  console.log("  ADMIN:", ADMIN);

  const VestingPool = await ethers.getContractFactory("VestingPool");
  const proxy = await upgrades.deployProxy(
    VestingPool,
    [BTN_TOKEN, WITHDRAWAL_WALLET, ADMIN],
    { kind: "uups" }
  );

  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();

  console.log("\nVestingPool proxy deployed to:", proxyAddress);
  console.log(
    "Implementation:",
    await upgrades.erc1967.getImplementationAddress(proxyAddress)
  );

  console.log("\n--- Post-deployment steps ---");
  console.log("1. Grant OPERATOR_ROLE on VestingPool to RewardEngine:");
  console.log(`   vestingPool.grantRole(OPERATOR_ROLE, rewardEngineAddress)`);
  console.log("2. Wire VestingPool into RewardEngine:");
  console.log(`   rewardEngine.setVestingPool("${proxyAddress}")`);
  console.log("3. Wire WithdrawalWallet if not set:");
  console.log("   vestingPool.setWithdrawalWallet(withdrawalWalletAddress)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
