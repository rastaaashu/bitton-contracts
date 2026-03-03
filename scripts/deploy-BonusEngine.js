const { ethers, upgrades } = require("hardhat");

/**
 * Deploy BonusEngine as a UUPS proxy.
 *
 * Prerequisites:
 *   - RewardEngine deployed
 *   - VaultManager deployed
 *   - StakingVault deployed
 *
 * After deployment:
 *   - Grant OPERATOR_ROLE on BonusEngine to StakingVault (for processDirectBonus)
 *   - Grant OPERATOR_ROLE on BonusEngine to RewardEngine (for processMatchingBonus)
 *   - Grant OPERATOR_ROLE on RewardEngine to BonusEngine (so it can call addPendingReward)
 *   - Wire BonusEngine address into RewardEngine via setBonusEngine()
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying BonusEngine with account:", deployer.address);

  // ─── Configuration (update before mainnet deploy) ──────
  const REWARD_ENGINE = process.env.REWARD_ENGINE || ethers.ZeroAddress;
  const VAULT_MANAGER = process.env.VAULT_MANAGER || ethers.ZeroAddress;
  const STAKING_VAULT = process.env.STAKING_VAULT || ethers.ZeroAddress;
  const ADMIN = process.env.ADMIN || deployer.address;

  console.log("Config:");
  console.log("  REWARD_ENGINE:", REWARD_ENGINE);
  console.log("  VAULT_MANAGER:", VAULT_MANAGER);
  console.log("  STAKING_VAULT:", STAKING_VAULT);
  console.log("  ADMIN:", ADMIN);

  const BonusEngine = await ethers.getContractFactory("BonusEngine");
  const proxy = await upgrades.deployProxy(
    BonusEngine,
    [REWARD_ENGINE, VAULT_MANAGER, STAKING_VAULT, ADMIN],
    { kind: "uups" }
  );

  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();

  console.log("\nBonusEngine proxy deployed to:", proxyAddress);
  console.log(
    "Implementation:",
    await upgrades.erc1967.getImplementationAddress(proxyAddress)
  );

  console.log("\n--- Post-deployment steps ---");
  console.log("1. Grant OPERATOR_ROLE on BonusEngine to StakingVault:");
  console.log(`   bonusEngine.grantRole(OPERATOR_ROLE, stakingVaultAddress)`);
  console.log("2. Grant OPERATOR_ROLE on BonusEngine to RewardEngine:");
  console.log(`   bonusEngine.grantRole(OPERATOR_ROLE, rewardEngineAddress)`);
  console.log("3. Grant OPERATOR_ROLE on RewardEngine to BonusEngine:");
  console.log(`   rewardEngine.grantRole(OPERATOR_ROLE, "${proxyAddress}")`);
  console.log("4. Wire into RewardEngine:");
  console.log(`   rewardEngine.setBonusEngine("${proxyAddress}")`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
