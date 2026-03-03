const { ethers, upgrades } = require("hardhat");

/**
 * Deploy WithdrawalWallet as a UUPS proxy.
 *
 * Prerequisites:
 *   - BTN token deployed
 *
 * After deployment:
 *   - Grant OPERATOR_ROLE on WithdrawalWallet to RewardEngine and VestingPool
 *   - Wire WithdrawalWallet address into RewardEngine via setWithdrawalWallet()
 *   - Wire WithdrawalWallet address into VestingPool via setWithdrawalWallet()
 *   - Optionally set weekly withdrawal cap via setWeeklyWithdrawalCap()
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying WithdrawalWallet with account:", deployer.address);

  // ─── Configuration (update before mainnet deploy) ──────
  const BTN_TOKEN = process.env.BTN_TOKEN || "";
  const ADMIN = process.env.ADMIN || deployer.address;

  if (!BTN_TOKEN) {
    throw new Error("BTN_TOKEN env var is required");
  }

  console.log("Config:");
  console.log("  BTN_TOKEN:", BTN_TOKEN);
  console.log("  ADMIN:", ADMIN);

  const WithdrawalWallet = await ethers.getContractFactory("WithdrawalWallet");
  const proxy = await upgrades.deployProxy(
    WithdrawalWallet,
    [BTN_TOKEN, ADMIN],
    { kind: "uups" }
  );

  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();

  console.log("\nWithdrawalWallet proxy deployed to:", proxyAddress);
  console.log(
    "Implementation:",
    await upgrades.erc1967.getImplementationAddress(proxyAddress)
  );

  console.log("\n--- Post-deployment steps ---");
  console.log("1. Grant OPERATOR_ROLE on WithdrawalWallet to RewardEngine:");
  console.log(`   withdrawalWallet.grantRole(OPERATOR_ROLE, rewardEngineAddress)`);
  console.log("2. Grant OPERATOR_ROLE on WithdrawalWallet to VestingPool:");
  console.log(`   withdrawalWallet.grantRole(OPERATOR_ROLE, vestingPoolAddress)`);
  console.log("3. Wire into RewardEngine:");
  console.log(`   rewardEngine.setWithdrawalWallet("${proxyAddress}")`);
  console.log("4. Wire into VestingPool:");
  console.log(`   vestingPool.setWithdrawalWallet("${proxyAddress}")`);
  console.log("5. Optionally set weekly withdrawal cap:");
  console.log("   withdrawalWallet.setWeeklyWithdrawalCap(amount)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
