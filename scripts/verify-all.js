/**
 * verify-all.js — Verify all UUPS proxy implementations on Basescan
 *
 * Reads deployed addresses from deployment-addresses.json (output of deploy-all.js)
 * and verifies each proxy's implementation contract on Basescan.
 *
 * Usage:
 *   npx hardhat run scripts/verify-all.js --network base_sepolia
 */
const { ethers, upgrades, run } = require("hardhat");
const fs = require("fs");

async function verifyImpl(proxyAddress, contractName) {
  try {
    const implAddress =
      await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log(
      `  ${contractName} implementation: ${implAddress}`
    );
    await run("verify:verify", {
      address: implAddress,
      constructorArguments: [],
    });
    console.log(`  ✓ ${contractName} verified on Basescan`);
    return true;
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log(`  ✓ ${contractName} already verified`);
      return true;
    }
    console.error(`  ✗ ${contractName} verification failed:`, error.message);
    return false;
  }
}

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║        BitTON.AI — Basescan Contract Verification        ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  // Load deployment addresses
  const addrFile = "deployment-addresses.json";
  if (!fs.existsSync(addrFile)) {
    console.error(
      `${addrFile} not found. Run deploy-all.js first.`
    );
    process.exit(1);
  }

  const addresses = JSON.parse(fs.readFileSync(addrFile, "utf8"));

  const contracts = [
    { name: "VaultManager", proxy: addresses.vaultManager },
    { name: "StakingVault", proxy: addresses.stakingVault },
    { name: "WithdrawalWallet", proxy: addresses.withdrawalWallet },
    { name: "VestingPool", proxy: addresses.vestingPool },
    { name: "RewardEngine", proxy: addresses.rewardEngine },
    { name: "BonusEngine", proxy: addresses.bonusEngine },
  ];

  let passed = 0;
  let failed = 0;

  for (const c of contracts) {
    if (!c.proxy || c.proxy === ethers.ZeroAddress) {
      console.log(`\n[SKIP] ${c.name} — no proxy address`);
      continue;
    }
    console.log(`\n[Verifying] ${c.name} (proxy: ${c.proxy})`);
    const ok = await verifyImpl(c.proxy, c.name);
    if (ok) passed++;
    else failed++;
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`Verification complete: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════════════════");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
