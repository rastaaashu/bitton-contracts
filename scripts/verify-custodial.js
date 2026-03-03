const { ethers } = require("hardhat");

async function main() {
  const custodialAddr = "0x71dB030B792E9D4CfdCC7e452e0Ff55CdB5A4D99";
  const custodial = await ethers.getContractAt("CustodialDistribution", custodialAddr);

  console.log("=== CustodialDistribution Verification ===");
  console.log("Address:", custodialAddr);
  console.log("btnToken:", await custodial.btnToken());
  console.log("finalized:", await custodial.isFinalized());
  console.log("migrationEnabled:", await custodial.isMigrationEnabled());
  console.log("distributionCap:", (await custodial.distributionCap()).toString());
  console.log("balance:", ethers.formatUnits(await custodial.getBalance(), 6), "BTN");
  console.log("totalDistributed:", ethers.formatUnits(await custodial.totalDistributed(), 6), "BTN");
  console.log("totalReturned:", ethers.formatUnits(await custodial.totalReturned(), 6), "BTN");
  console.log("totalMigrated:", ethers.formatUnits(await custodial.totalMigrated(), 6), "BTN");

  const deployer = "0x1DaE2C7aeC8850f1742fE96045c23d1AaE3FCf2A";
  const DEFAULT_ADMIN = await custodial.DEFAULT_ADMIN_ROLE();
  const OPERATOR_ROLE = await custodial.OPERATOR_ROLE();
  const EMERGENCY_ROLE = await custodial.EMERGENCY_ROLE();
  console.log("\nRoles for deployer:", deployer);
  console.log("  ADMIN:", await custodial.hasRole(DEFAULT_ADMIN, deployer));
  console.log("  OPERATOR:", await custodial.hasRole(OPERATOR_ROLE, deployer));
  console.log("  EMERGENCY:", await custodial.hasRole(EMERGENCY_ROLE, deployer));
  console.log("\n=== Done ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
