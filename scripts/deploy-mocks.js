/**
 * deploy-mocks.js — Deploy MockUSDT + MockAggregator to Base Sepolia
 *
 * These stand-in for real USDT and Chainlink oracle on testnet.
 * MockAggregator returns BTN = $0.50 (50_000_000 with 8 decimals).
 *
 * Usage:
 *   npx hardhat run scripts/deploy-mocks.js --network base_sepolia
 */
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  // 1. Deploy MockUSDT
  console.log("\n[1/2] Deploying MockUSDT...");
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy();
  await usdt.waitForDeployment();
  const usdtAddr = await usdt.getAddress();
  console.log("  MockUSDT deployed to:", usdtAddr);

  // 2. Deploy MockAggregator (BTN = $0.50, 8 decimals)
  console.log("\n[2/2] Deploying MockAggregator (BTN=$0.50)...");
  const MockAgg = await ethers.getContractFactory("MockAggregator");
  const oracle = await MockAgg.deploy(50_000_000, 8);
  await oracle.waitForDeployment();
  const oracleAddr = await oracle.getAddress();
  console.log("  MockAggregator deployed to:", oracleAddr);

  // Mint some USDT to deployer for vault activation tests
  console.log("\nMinting 100,000 USDT to deployer...");
  await usdt.mint(deployer.address, ethers.parseUnits("100000", 6));
  const usdtBal = await usdt.balanceOf(deployer.address);
  console.log("  Deployer USDT balance:", ethers.formatUnits(usdtBal, 6));

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("MOCK DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════════════");
  console.log("MockUSDT:        ", usdtAddr);
  console.log("MockAggregator:  ", oracleAddr);
  console.log("\nAdd these to your .env:");
  console.log(`USDT_TOKEN_ADDRESS=${usdtAddr}`);
  console.log(`ORACLE_ADDRESS=${oracleAddr}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
