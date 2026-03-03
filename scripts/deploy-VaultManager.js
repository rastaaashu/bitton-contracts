const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying VaultManager with:", deployer.address);

  // ── Addresses (replace with real values for mainnet) ──
  // For Base Sepolia: deploy MockUSDT + MockAggregator first, or use real addresses
  const BTN_TOKEN = process.env.BTN_TOKEN_ADDRESS;
  const USDT_TOKEN = process.env.USDT_TOKEN_ADDRESS;
  const ORACLE_ADDRESS = process.env.ORACLE_ADDRESS;
  const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || deployer.address;

  if (!BTN_TOKEN || !USDT_TOKEN || !ORACLE_ADDRESS) {
    console.error(
      "Missing env vars: BTN_TOKEN_ADDRESS, USDT_TOKEN_ADDRESS, ORACLE_ADDRESS"
    );
    process.exit(1);
  }

  const VaultManager = await ethers.getContractFactory("VaultManager");
  const vaultManager = await upgrades.deployProxy(
    VaultManager,
    [BTN_TOKEN, USDT_TOKEN, ORACLE_ADDRESS, TREASURY_ADDRESS, deployer.address],
    { kind: "uups" }
  );

  await vaultManager.waitForDeployment();
  const addr = await vaultManager.getAddress();
  console.log("VaultManager proxy deployed to:", addr);
  console.log("Treasury:", TREASURY_ADDRESS);
  console.log("Oracle:", ORACLE_ADDRESS);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
