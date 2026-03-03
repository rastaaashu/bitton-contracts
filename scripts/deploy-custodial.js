/**
 * BitTON.AI — Deploy CustodialDistribution to Base Sepolia
 *
 * This script:
 *   1. Deploys the CustodialDistribution contract (non-upgradeable)
 *   2. Updates deployment-addresses.json
 *   3. Prints verification command
 *
 * NOTE: This does NOT execute the lockdown runbook.
 *       Use genesis-to-custodial-runbook.js for the full mint → transfer → lock sequence.
 *
 * Usage:
 *   LOCAL:   npx hardhat run scripts/deploy-custodial.js
 *   TESTNET: npx hardhat run scripts/deploy-custodial.js --network base_sepolia
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("=== Deploy CustodialDistribution ===");
  console.log(`Network:  ${network.name} (chainId: ${network.chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log("");

  // Load existing addresses
  const addressesPath = path.join(__dirname, "..", "deployment-addresses.json");
  let addresses = {};
  if (fs.existsSync(addressesPath)) {
    addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
  }

  const btnTokenAddress = addresses.btnToken || process.env.BTN_TOKEN_ADDRESS;
  if (!btnTokenAddress) {
    throw new Error("BTN token address not found. Set BTN_TOKEN_ADDRESS in .env or deploy BTN first.");
  }
  console.log(`BTN Token: ${btnTokenAddress}`);

  // Deploy CustodialDistribution
  console.log("\nDeploying CustodialDistribution...");
  const Custodial = await ethers.getContractFactory("CustodialDistribution");
  const custodial = await Custodial.deploy(btnTokenAddress, deployer.address);
  const deployTx = custodial.deploymentTransaction();
  console.log(`  Tx hash: ${deployTx.hash}`);
  console.log("  Waiting for confirmation...");
  await custodial.waitForDeployment();
  const custodialAddress = await custodial.getAddress();
  console.log(`  CustodialDistribution deployed at: ${custodialAddress}`);

  // Verify initial state
  console.log("\nVerifying initial state...");
  console.log(`  btnToken:         ${await custodial.btnToken()}`);
  console.log(`  finalized:        ${await custodial.isFinalized()}`);
  console.log(`  migrationEnabled: ${await custodial.isMigrationEnabled()}`);
  console.log(`  distributionCap:  ${await custodial.distributionCap()}`);
  console.log(`  balance:          ${ethers.formatUnits(await custodial.getBalance(), 6)} BTN`);

  // Check roles
  const DEFAULT_ADMIN = await custodial.DEFAULT_ADMIN_ROLE();
  const OPERATOR_ROLE = await custodial.OPERATOR_ROLE();
  const EMERGENCY_ROLE = await custodial.EMERGENCY_ROLE();
  console.log(`  deployer has ADMIN:     ${await custodial.hasRole(DEFAULT_ADMIN, deployer.address)}`);
  console.log(`  deployer has OPERATOR:  ${await custodial.hasRole(OPERATOR_ROLE, deployer.address)}`);
  console.log(`  deployer has EMERGENCY: ${await custodial.hasRole(EMERGENCY_ROLE, deployer.address)}`);

  // Update deployment-addresses.json
  addresses.custodialDistribution = custodialAddress;
  fs.writeFileSync(addressesPath, JSON.stringify(addresses, null, 2));
  console.log(`\nUpdated deployment-addresses.json`);

  // Print verification command
  console.log("\n=== Verification Command ===");
  console.log(`npx hardhat verify --network base_sepolia ${custodialAddress} ${btnTokenAddress} ${deployer.address}`);

  console.log("\n=== Next Steps ===");
  console.log("1. Verify on Basescan (run command above)");
  console.log("2. Transfer BTN tokens to CustodialDistribution");
  console.log("3. Grant OPERATOR_ROLE to backend relayer / other operators");
  console.log("4. Grant EMERGENCY_ROLE to multisig");
  console.log("5. Run genesis-to-custodial-runbook.js when ready for full lockdown");
  console.log("\n=== Done ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
