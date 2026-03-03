/**
 * BitTON.AI — Testnet End-to-End Runbook
 *
 * Executes a safe end-to-end test on Base Sepolia:
 *   1. Transfer BTN to CustodialDistribution
 *   2. Verify Custodial state
 *   3. Run a small migration batch (3 test users)
 *   4. Run one distribute() call
 *   5. Run one returnTokens() call
 *   6. Print summary with all tx hashes
 *
 * Does NOT lock down Genesis or finalize Custodial (safe for repeated testing).
 *
 * Usage:
 *   npx hardhat run scripts/testnet-e2e-runbook.js --network base_sepolia
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Helper: wait for RPC propagation on public testnets
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RPC_DELAY = 5000; // 5s between txs for public RPC nonce propagation

// Load deployment addresses
const addressesPath = path.join(__dirname, "..", "deployment-addresses.json");
const ADDRS = JSON.parse(fs.readFileSync(addressesPath, "utf8"));

const BTN_ADDR = ADDRS.btnToken;
const CUSTODIAL_ADDR = ADDRS.custodialDistribution;

// Amount to transfer to Custodial (100k BTN for testing)
const TRANSFER_AMOUNT = 100_000n * 10n ** 6n;
// Migration test amounts
const MIGRATION_AMOUNTS = [100n * 10n ** 6n, 200n * 10n ** 6n, 50n * 10n ** 6n]; // 100, 200, 50 BTN
// Distribute test amount
const DISTRIBUTE_AMOUNT = 25n * 10n ** 6n; // 25 BTN
// Return test amount
const RETURN_AMOUNT = 10n * 10n ** 6n; // 10 BTN

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("=== BitTON.AI Testnet E2E Runbook ===");
  console.log(`Network:  ${network.name} (chainId: ${network.chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`BTN:      ${BTN_ADDR}`);
  console.log(`Custodial: ${CUSTODIAL_ADDR}`);
  console.log("");

  const btn = await ethers.getContractAt("BTNToken", BTN_ADDR);
  const custodial = await ethers.getContractAt("CustodialDistribution", CUSTODIAL_ADDR);

  const txLog = [];
  const log = (step, hash, detail) => {
    txLog.push({ step, hash, detail, timestamp: new Date().toISOString() });
    console.log(`  TX: ${hash}`);
  };

  // ── Step 1: Check initial state ──
  console.log("--- Step 1: Initial State ---");
  const deployerBal = await btn.balanceOf(deployer.address);
  const custodialBal = await btn.balanceOf(CUSTODIAL_ADDR);
  console.log(`  Deployer BTN:  ${ethers.formatUnits(deployerBal, 6)}`);
  console.log(`  Custodial BTN: ${ethers.formatUnits(custodialBal, 6)}`);
  console.log(`  Custodial finalized: ${await custodial.isFinalized()}`);
  console.log(`  Migration enabled: ${await custodial.isMigrationEnabled()}`);
  console.log("");

  // ── Step 2: Transfer BTN to Custodial ──
  console.log("--- Step 2: Transfer BTN to Custodial ---");
  const transferAmt = deployerBal < TRANSFER_AMOUNT ? deployerBal : TRANSFER_AMOUNT;
  if (transferAmt === 0n) {
    console.log("  Deployer has 0 BTN. Skipping transfer.");
  } else {
    console.log(`  Transferring ${ethers.formatUnits(transferAmt, 6)} BTN...`);
    const tx1 = await btn.transfer(CUSTODIAL_ADDR, transferAmt);
    await tx1.wait();
    log("transfer_to_custodial", tx1.hash, `${ethers.formatUnits(transferAmt, 6)} BTN`);
    await sleep(RPC_DELAY);
    console.log(`  Custodial balance: ${ethers.formatUnits(await btn.balanceOf(CUSTODIAL_ADDR), 6)} BTN`);
  }
  console.log("");

  // ── Step 3: Migration batch ──
  console.log("--- Step 3: Migration Batch (3 test addresses) ---");
  const migEnabled = await custodial.isMigrationEnabled();
  if (!migEnabled) {
    console.log("  Migration disabled. Skipping.");
  } else {
    // Generate 3 random addresses for test migration
    const migAddrs = [
      ethers.Wallet.createRandom().address,
      ethers.Wallet.createRandom().address,
      ethers.Wallet.createRandom().address,
    ];
    console.log(`  Migrating to:`);
    for (let i = 0; i < migAddrs.length; i++) {
      console.log(`    ${migAddrs[i]} → ${ethers.formatUnits(MIGRATION_AMOUNTS[i], 6)} BTN`);
    }

    const tx2 = await custodial.batchMigrate(migAddrs, MIGRATION_AMOUNTS);
    await tx2.wait();
    log("batch_migrate", tx2.hash, `3 addresses, ${ethers.formatUnits(MIGRATION_AMOUNTS.reduce((a, b) => a + b, 0n), 6)} BTN total`);
    await sleep(RPC_DELAY);
    console.log(`  Total migrated: ${ethers.formatUnits(await custodial.totalMigrated(), 6)} BTN`);
  }
  console.log("");

  // ── Step 4: Distribute ──
  console.log("--- Step 4: Distribute ---");
  const distTarget = ethers.Wallet.createRandom().address;
  console.log(`  Distributing ${ethers.formatUnits(DISTRIBUTE_AMOUNT, 6)} BTN to ${distTarget}`);
  const tx3 = await custodial.distribute(distTarget, DISTRIBUTE_AMOUNT);
  await tx3.wait();
  log("distribute", tx3.hash, `${ethers.formatUnits(DISTRIBUTE_AMOUNT, 6)} BTN to ${distTarget}`);
  await sleep(RPC_DELAY);
  console.log(`  Total distributed: ${ethers.formatUnits(await custodial.totalDistributed(), 6)} BTN`);
  console.log("");

  // ── Step 5: Return Tokens ──
  console.log("--- Step 5: Return Tokens ---");
  // Deployer needs to approve first
  const deployerBalNow = await btn.balanceOf(deployer.address);
  const returnAmt = deployerBalNow < RETURN_AMOUNT ? deployerBalNow : RETURN_AMOUNT;
  if (returnAmt === 0n) {
    console.log("  Deployer has 0 BTN. Skipping returnTokens.");
  } else {
    console.log(`  Approving ${ethers.formatUnits(returnAmt, 6)} BTN...`);
    const txApprove = await btn.approve(CUSTODIAL_ADDR, returnAmt);
    await txApprove.wait();
    log("approve_return", txApprove.hash, `approve ${ethers.formatUnits(returnAmt, 6)} BTN`);
    await sleep(RPC_DELAY);

    console.log(`  Returning ${ethers.formatUnits(returnAmt, 6)} BTN...`);
    const tx4 = await custodial.returnTokens(returnAmt);
    await tx4.wait();
    log("return_tokens", tx4.hash, `${ethers.formatUnits(returnAmt, 6)} BTN`);
    await sleep(RPC_DELAY);
    console.log(`  Total returned: ${ethers.formatUnits(await custodial.totalReturned(), 6)} BTN`);
  }
  console.log("");

  // ── Step 6: Final state ──
  console.log("--- Step 6: Final State ---");
  console.log(`  Custodial balance:    ${ethers.formatUnits(await custodial.getBalance(), 6)} BTN`);
  console.log(`  Total distributed:    ${ethers.formatUnits(await custodial.totalDistributed(), 6)} BTN`);
  console.log(`  Total returned:       ${ethers.formatUnits(await custodial.totalReturned(), 6)} BTN`);
  console.log(`  Total migrated:       ${ethers.formatUnits(await custodial.totalMigrated(), 6)} BTN`);
  console.log(`  Migration enabled:    ${await custodial.isMigrationEnabled()}`);
  console.log(`  Finalized:            ${await custodial.isFinalized()}`);
  console.log("");

  // ── Save results ──
  const results = {
    network: network.name,
    chainId: Number(network.chainId),
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      btnToken: BTN_ADDR,
      custodialDistribution: CUSTODIAL_ADDR,
    },
    transactions: txLog,
  };

  const outPath = path.join(__dirname, "..", "testnet-e2e-results.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Results saved to: ${outPath}`);

  // Print Basescan links
  const explorerBase = network.chainId === 84532n
    ? "https://sepolia.basescan.org"
    : "https://basescan.org";

  console.log("");
  console.log("=== Basescan Links ===");
  for (const tx of txLog) {
    console.log(`  ${tx.step}: ${explorerBase}/tx/${tx.hash}`);
  }

  console.log("");
  console.log("=== E2E RUNBOOK COMPLETE ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
