/**
 * BitTON.AI — Genesis → Custodial → Lockdown Runbook
 *
 * This script executes the full setup and lockdown sequence:
 *   Phase A: Deploy/Connect Custodial, transfer BTN, lock down Genesis
 *   Phase B: Setup roles, fund contracts, run migration
 *   Phase C: Finalize Custodial (renounce admin, permanent lockdown)
 *
 * Handles "already minted" state: BTNToken mints 21M in constructor,
 * so totalSupply > 0 on a deployed token. The script checks and branches.
 *
 * Usage:
 *   DRY RUN (local):  npx hardhat run scripts/genesis-to-custodial-runbook.js
 *   TESTNET:           npx hardhat run scripts/genesis-to-custodial-runbook.js --network base_sepolia
 *
 * IMPORTANT: Review each phase carefully. This is a ONE-WAY operation.
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// === CONFIGURATION ===
// Set these before running on mainnet/testnet
const CONFIG = {
  // Existing BTN Token address (Genesis contract)
  // If empty on local, deploys a fresh BTNToken for testing
  btnTokenAddress: "", // e.g., "0x5b964baafEDf002e5364F37848DCa1908D3e4e9f"

  // Pre-deployed CustodialDistribution address (skip deploy if set)
  custodialAddress: "", // e.g., "0x71dB030B792E9D4CfdCC7e452e0Ff55CdB5A4D99"

  // Addresses to grant roles on Custodial (set before Phase B)
  operatorAddresses: [
    // Backend relayer hot wallet
    // Team multisig
  ],
  emergencyAddresses: [
    // Team multisig
  ],

  // Reward Engine address to fund (set before Phase B)
  rewardEngineAddress: "",
  initialRewardFunding: 0n, // BTN amount (6 decimals), e.g., 1_000_000n * 10n**6n

  // Distribution cap (0 = unlimited, set before Phase C)
  distributionCap: 0n,

  // Migration data (loaded from file or hardcoded for small batches)
  // Format: [{ address: "0x...", amount: BigInt }]
  migrationFile: "", // path to JSON file, or empty for no migration in this run

  // Whether to lock down Genesis (disable minting + renounce ownership)
  // WARNING: This is irreversible on the BTN Token!
  lockdownGenesis: true,

  // Phases to execute (set to true to run)
  runPhaseA: true,
  runPhaseB: true,
  runPhaseC: false, // WARNING: This is IRREVERSIBLE. Set to true only when ready.
};

const TOTAL_SUPPLY = 21_000_000n * 10n ** 6n;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== BitTON.AI Genesis → Custodial Runbook ===");
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Network: ${(await ethers.provider.getNetwork()).name}`);
  console.log("");

  let custodialAddress = CONFIG.custodialAddress || "";
  const txHashes = {}; // Record all tx hashes for reporting

  // =====================================================================
  //                     PHASE A: Deploy + Transfer + Lock Genesis
  // =====================================================================
  if (CONFIG.runPhaseA) {
    console.log("=== PHASE A: Deploy/Connect Custodial + Transfer + Lock Genesis ===");

    // Step 1: Connect to BTN Token
    const btnAddress =
      CONFIG.btnTokenAddress ||
      (await deployMockBTN(deployer)); // If no address, deploy mock for testing
    const btn = await ethers.getContractAt("BTNToken", btnAddress);
    console.log(`[1] BTN Token: ${btnAddress}`);

    const totalSupply = await btn.totalSupply();
    console.log(`    Total supply: ${ethers.formatUnits(totalSupply, 6)} BTN`);

    const balance = await btn.balanceOf(deployer.address);
    console.log(`    Deployer BTN balance: ${ethers.formatUnits(balance, 6)}`);

    // Branch: totalSupply check
    if (totalSupply === 0n) {
      console.log("    STATUS: No tokens minted yet. This BTNToken mints in constructor,");
      console.log("    so totalSupply=0 means the token was not deployed properly.");
      console.log("    ABORTING. Deploy BTNToken first (constructor mints 21M).");
      process.exit(1);
    } else {
      console.log(`    STATUS: ${ethers.formatUnits(totalSupply, 6)} BTN already minted (constructor mint).`);
      console.log("    Proceeding to transfer phase.");
    }

    // Step 2: Deploy or connect to CustodialDistribution
    let custodial;
    if (custodialAddress) {
      console.log(`[2] Connecting to existing Custodial: ${custodialAddress}`);
      custodial = await ethers.getContractAt("CustodialDistribution", custodialAddress);
      const custodialBTN = await custodial.btnToken();
      if (custodialBTN.toLowerCase() !== btnAddress.toLowerCase()) {
        console.error(`    ERROR: Custodial btnToken (${custodialBTN}) != expected BTN (${btnAddress})`);
        process.exit(1);
      }
      console.log(`    Custodial btnToken matches: ${custodialBTN}`);
    } else {
      console.log("[2] Deploying CustodialDistribution...");
      const Custodial = await ethers.getContractFactory("CustodialDistribution");
      custodial = await Custodial.deploy(btnAddress, deployer.address);
      const deployTx = custodial.deploymentTransaction();
      txHashes.custodialDeploy = deployTx.hash;
      console.log(`    Deploy tx: ${deployTx.hash}`);
      await custodial.waitForDeployment();
      custodialAddress = await custodial.getAddress();
      console.log(`    Custodial deployed at: ${custodialAddress}`);
    }

    // Step 3: Transfer deployer's BTN balance to Custodial
    if (balance > 0n) {
      console.log(`[3] Transferring ${ethers.formatUnits(balance, 6)} BTN to Custodial...`);
      const tx1 = await btn.connect(deployer).transfer(custodialAddress, balance);
      await tx1.wait();
      txHashes.transferToCustodial = tx1.hash;
      console.log(`    Transfer tx: ${tx1.hash}`);

      const custodialBalance = await btn.balanceOf(custodialAddress);
      console.log(`    Custodial balance: ${ethers.formatUnits(custodialBalance, 6)} BTN`);
    } else {
      console.log("[3] Deployer has 0 BTN — skipping transfer.");
    }

    // Step 4: Verify state
    const deployerBalanceAfter = await btn.balanceOf(deployer.address);
    const custodialBalanceFinal = await btn.balanceOf(custodialAddress);
    console.log(`[4] Post-transfer state:`);
    console.log(`    Deployer balance: ${ethers.formatUnits(deployerBalanceAfter, 6)} BTN`);
    console.log(`    Custodial balance: ${ethers.formatUnits(custodialBalanceFinal, 6)} BTN`);
    if (deployerBalanceAfter !== 0n) {
      console.warn("    WARNING: Deployer still has BTN tokens!");
    }

    // Step 5: Lock down Genesis token (optional, controlled by config)
    if (CONFIG.lockdownGenesis) {
      console.log("[5] Locking down Genesis BTN Token...");

      // Check if we still have ownership
      const currentOwner = await btn.owner();
      if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
        console.log(`    BTN owner is ${currentOwner} (not deployer). Skipping lockdown.`);
        if (currentOwner === ethers.ZeroAddress) {
          console.log("    Genesis already locked down (owner = zero address).");
        }
      } else {
        // 5a: Disable minting
        if (await btn.mintingActive()) {
          const tx2 = await btn.connect(deployer).setMintingActive(false);
          await tx2.wait();
          txHashes.disableMinting = tx2.hash;
          console.log(`    Minting disabled. Tx: ${tx2.hash}`);
        } else {
          console.log("    Minting already disabled.");
        }

        // 5b: Remove deployer as minter
        if (await btn.isMinter(deployer.address)) {
          const tx3 = await btn.connect(deployer).renounceMinting();
          await tx3.wait();
          txHashes.renounceMinting = tx3.hash;
          console.log(`    Minter renounced. Tx: ${tx3.hash}`);
        } else {
          console.log("    Deployer not a minter (already renounced).");
        }

        // 5c: Renounce ownership
        const tx4 = await btn.connect(deployer).renounceOwnership();
        await tx4.wait();
        txHashes.renounceOwnership = tx4.hash;
        const newOwner = await btn.owner();
        console.log(`    Ownership renounced. Tx: ${tx4.hash}`);
        console.log(`    BTN owner: ${newOwner} (is zero: ${newOwner === ethers.ZeroAddress})`);
      }
    } else {
      console.log("[5] Skipping Genesis lockdown (lockdownGenesis = false).");
    }

    console.log("");
    console.log("PHASE A COMPLETE");
    console.log(`  Custodial address: ${custodialAddress}`);
    console.log("");
  }

  // =====================================================================
  //                     PHASE B: Roles + Funding + Migration
  // =====================================================================
  if (CONFIG.runPhaseB) {
    if (!custodialAddress) {
      console.error("ERROR: No custodialAddress. Run Phase A first or set CONFIG.custodialAddress.");
      process.exit(1);
    }
    console.log("=== PHASE B: Setup Roles + Fund + Migrate ===");

    const custodial = await ethers.getContractAt(
      "CustodialDistribution",
      custodialAddress
    );
    const OPERATOR_ROLE = await custodial.OPERATOR_ROLE();
    const EMERGENCY_ROLE = await custodial.EMERGENCY_ROLE();

    // Step 6: Grant OPERATOR_ROLE
    for (const addr of CONFIG.operatorAddresses) {
      if (addr) {
        const hasRole = await custodial.hasRole(OPERATOR_ROLE, addr);
        if (hasRole) {
          console.log(`[6] ${addr} already has OPERATOR_ROLE — skipping`);
        } else {
          const tx = await custodial.connect(deployer).grantRole(OPERATOR_ROLE, addr);
          await tx.wait();
          txHashes[`grantOperator_${addr.slice(0, 8)}`] = tx.hash;
          console.log(`[6] Granted OPERATOR_ROLE to: ${addr} (tx: ${tx.hash})`);
        }
      }
    }

    // Step 7: Grant EMERGENCY_ROLE
    for (const addr of CONFIG.emergencyAddresses) {
      if (addr) {
        const hasRole = await custodial.hasRole(EMERGENCY_ROLE, addr);
        if (hasRole) {
          console.log(`[7] ${addr} already has EMERGENCY_ROLE — skipping`);
        } else {
          const tx = await custodial.connect(deployer).grantRole(EMERGENCY_ROLE, addr);
          await tx.wait();
          txHashes[`grantEmergency_${addr.slice(0, 8)}`] = tx.hash;
          console.log(`[7] Granted EMERGENCY_ROLE to: ${addr} (tx: ${tx.hash})`);
        }
      }
    }

    // Step 8: Fund RewardEngine
    if (CONFIG.rewardEngineAddress && CONFIG.initialRewardFunding > 0n) {
      console.log("[8] Funding RewardEngine...");
      const tx = await custodial
        .connect(deployer)
        .fundContract(CONFIG.rewardEngineAddress, CONFIG.initialRewardFunding);
      await tx.wait();
      txHashes.fundRewardEngine = tx.hash;
      console.log(
        `    Funded ${ethers.formatUnits(CONFIG.initialRewardFunding, 6)} BTN (tx: ${tx.hash})`
      );
    } else {
      console.log("[8] Skipping RewardEngine funding (not configured)");
    }

    // Step 9: Run migration (if configured)
    if (CONFIG.migrationFile) {
      console.log("[9] Running migration batches...");
      const migrationData = JSON.parse(
        fs.readFileSync(CONFIG.migrationFile, "utf8")
      );
      const BATCH_SIZE = 200;
      let totalMigrated = 0n;
      let batchCount = 0;

      for (let i = 0; i < migrationData.length; i += BATCH_SIZE) {
        const batch = migrationData.slice(i, i + BATCH_SIZE);
        const addresses = batch.map((e) => e.address);
        const amounts = batch.map((e) => BigInt(e.amount));

        const tx = await custodial
          .connect(deployer)
          .batchMigrate(addresses, amounts);
        await tx.wait();

        const batchTotal = amounts.reduce((a, b) => a + b, 0n);
        totalMigrated += batchTotal;
        batchCount++;
        txHashes[`migration_batch_${batchCount}`] = tx.hash;
        console.log(
          `    Batch ${batchCount}: ${batch.length} users, ${ethers.formatUnits(batchTotal, 6)} BTN (tx: ${tx.hash})`
        );
      }
      console.log(
        `    Total migrated: ${ethers.formatUnits(totalMigrated, 6)} BTN across ${batchCount} batches`
      );
    } else {
      console.log("[9] Skipping migration (no file configured)");
    }

    // Step 10: Disable migration (only if still enabled)
    const migEnabled = await custodial.isMigrationEnabled();
    if (migEnabled) {
      console.log("[10] Disabling migration...");
      const tx10 = await custodial.connect(deployer).disableMigration();
      await tx10.wait();
      txHashes.disableMigration = tx10.hash;
      console.log(`     Migration disabled. Tx: ${tx10.hash}`);
    } else {
      console.log("[10] Migration already disabled — skipping.");
    }

    console.log("");
    console.log("PHASE B COMPLETE — Roles set, funded, migration done");
    console.log("");
  }

  // =====================================================================
  //                     PHASE C: Finalize (IRREVERSIBLE)
  // =====================================================================
  if (CONFIG.runPhaseC) {
    if (!custodialAddress) {
      console.error("ERROR: No custodialAddress. Run Phase A first or set CONFIG.custodialAddress.");
      process.exit(1);
    }
    console.log("=== PHASE C: FINALIZE (IRREVERSIBLE!) ===");
    console.log("WARNING: After this, no admin changes are possible.");
    console.log("");

    const custodial = await ethers.getContractAt(
      "CustodialDistribution",
      custodialAddress
    );
    const DEFAULT_ADMIN = await custodial.DEFAULT_ADMIN_ROLE();
    const OPERATOR_ROLE = await custodial.OPERATOR_ROLE();

    // Pre-finalization verification
    console.log("[PRE-CHECK] Verifying state before finalization...");
    console.log(
      `  Balance: ${ethers.formatUnits(await custodial.getBalance(), 6)} BTN`
    );
    console.log(
      `  Total distributed: ${ethers.formatUnits(await custodial.totalDistributed(), 6)} BTN`
    );
    console.log(`  Migration enabled: ${await custodial.isMigrationEnabled()}`);
    console.log(`  Current cap: ${await custodial.distributionCap()}`);

    // Check all operator addresses
    for (const addr of CONFIG.operatorAddresses) {
      if (addr) {
        const hasRole = await custodial.hasRole(OPERATOR_ROLE, addr);
        console.log(`  OPERATOR ${addr}: ${hasRole}`);
      }
    }

    // Set distribution cap if configured
    if (CONFIG.distributionCap > 0n) {
      console.log(
        `[PRE] Setting distribution cap to ${ethers.formatUnits(CONFIG.distributionCap, 6)} BTN`
      );
      const tx = await custodial
        .connect(deployer)
        .setDistributionCap(CONFIG.distributionCap);
      await tx.wait();
    }

    // FINALIZE
    console.log("[FINALIZE] Calling finalize()...");
    const txF = await custodial.connect(deployer).finalize();
    await txF.wait();
    txHashes.finalize = txF.hash;

    // Post-finalization verification
    console.log("[POST-CHECK] Verifying finalization...");
    console.log(`  Finalized: ${await custodial.isFinalized()}`);
    console.log(
      `  Admin has DEFAULT_ADMIN_ROLE: ${await custodial.hasRole(DEFAULT_ADMIN, deployer.address)}`
    );

    console.log("");
    console.log("PHASE C COMPLETE — Contract permanently locked down");
    console.log("  No more role changes, cap changes, or migration re-enable possible.");
    console.log("  Operators can still distribute. Emergency can still pause.");
  }

  // Print all tx hashes
  if (Object.keys(txHashes).length > 0) {
    console.log("");
    console.log("=== TRANSACTION HASHES ===");
    for (const [key, hash] of Object.entries(txHashes)) {
      console.log(`  ${key}: ${hash}`);
    }
  }

  // Save tx hashes to file
  const outputPath = path.join(__dirname, "..", "runbook-tx-hashes.json");
  fs.writeFileSync(outputPath, JSON.stringify({ network: (await ethers.provider.getNetwork()).name, timestamp: new Date().toISOString(), custodialAddress, txHashes }, null, 2));
  console.log(`\nTx hashes saved to: ${outputPath}`);

  console.log("");
  console.log("=== RUNBOOK COMPLETE ===");
}

/**
 * Helper: Deploy a fresh BTNToken for local testing
 */
async function deployMockBTN(deployer) {
  console.log("  (Deploying fresh BTNToken for local test...)");
  const BTNToken = await ethers.getContractFactory("BTNToken");
  const btn = await BTNToken.deploy();
  await btn.waitForDeployment();
  const addr = await btn.getAddress();
  console.log(`  BTN Token deployed at: ${addr}`);
  return addr;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
