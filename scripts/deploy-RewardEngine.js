const { ethers, upgrades } = require("hardhat");

/**
 * Deploy RewardEngine as a UUPS proxy.
 *
 * Prerequisites:
 *   - BTN token deployed
 *   - StakingVault deployed (UUPS proxy)
 *   - VestingPool deployed (or use address(0) to wire later)
 *   - WithdrawalWallet deployed (or use address(0) to wire later)
 *   - VaultManager deployed (or use address(0) to skip gating)
 *
 * After deployment:
 *   - Grant RewardEngine OPERATOR_ROLE on StakingVault (for resetLastRewardTime)
 *   - Fund the reward pool via fundRewards()
 *   - Wire BonusEngine via setBonusEngine() when ready
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying RewardEngine with account:", deployer.address);

  // ─── Configuration (update these before mainnet deploy) ──
  const BTN_TOKEN = process.env.BTN_TOKEN || "";
  const STAKING_VAULT = process.env.STAKING_VAULT || "";
  const VESTING_POOL = process.env.VESTING_POOL || ethers.ZeroAddress;
  const WITHDRAWAL_WALLET = process.env.WITHDRAWAL_WALLET || ethers.ZeroAddress;
  const VAULT_MANAGER = process.env.VAULT_MANAGER || ethers.ZeroAddress;
  const ADMIN = process.env.ADMIN || deployer.address;

  if (!BTN_TOKEN || !STAKING_VAULT) {
    throw new Error("BTN_TOKEN and STAKING_VAULT env vars are required");
  }

  console.log("Config:");
  console.log("  BTN_TOKEN:", BTN_TOKEN);
  console.log("  STAKING_VAULT:", STAKING_VAULT);
  console.log("  VESTING_POOL:", VESTING_POOL);
  console.log("  WITHDRAWAL_WALLET:", WITHDRAWAL_WALLET);
  console.log("  VAULT_MANAGER:", VAULT_MANAGER);
  console.log("  ADMIN:", ADMIN);

  const RewardEngine = await ethers.getContractFactory("RewardEngine");
  const proxy = await upgrades.deployProxy(
    RewardEngine,
    [BTN_TOKEN, STAKING_VAULT, VESTING_POOL, WITHDRAWAL_WALLET, VAULT_MANAGER, ADMIN],
    { kind: "uups" }
  );

  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();

  console.log("\nRewardEngine proxy deployed to:", proxyAddress);
  console.log(
    "Implementation:",
    await upgrades.erc1967.getImplementationAddress(proxyAddress)
  );

  console.log("\n--- Post-deployment steps ---");
  console.log("1. Grant OPERATOR_ROLE on StakingVault to RewardEngine:");
  console.log(`   stakingVault.grantRole(OPERATOR_ROLE, "${proxyAddress}")`);
  console.log("2. Fund reward pool:");
  console.log(`   btnToken.approve("${proxyAddress}", amount)`);
  console.log(`   rewardEngine.fundRewards(amount)`);
  console.log("3. Wire downstream contracts if not set:");
  console.log("   rewardEngine.setVestingPool(vestingPoolAddress)");
  console.log("   rewardEngine.setWithdrawalWallet(withdrawalWalletAddress)");
  console.log("   rewardEngine.setBonusEngine(bonusEngineAddress)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
