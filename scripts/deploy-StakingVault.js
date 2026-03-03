const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying StakingVault with:", deployer.address);

  const BTN_TOKEN = process.env.BTN_TOKEN_ADDRESS;
  const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || deployer.address;
  const VAULT_MANAGER = process.env.VAULT_MANAGER_ADDRESS;

  if (!BTN_TOKEN) {
    console.error("Missing env var: BTN_TOKEN_ADDRESS");
    process.exit(1);
  }

  const StakingVault = await ethers.getContractFactory("StakingVault");
  const stakingVault = await upgrades.deployProxy(
    StakingVault,
    [BTN_TOKEN, TREASURY_ADDRESS, VAULT_MANAGER || ethers.ZeroAddress, deployer.address],
    { kind: "uups" }
  );

  await stakingVault.waitForDeployment();
  const addr = await stakingVault.getAddress();
  console.log("StakingVault proxy deployed to:", addr);
  console.log("Treasury:", TREASURY_ADDRESS);
  console.log("VaultManager:", VAULT_MANAGER || "not set (gating disabled)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
