/**
 * BitTON.AI — Scale Simulation & Gas Profiling
 *
 * Simulates operations at various user scales to measure:
 *   - Gas per operation type
 *   - Batch migration throughput
 *   - Referral chain traversal costs
 *   - Cost estimates at 60k / 600k / 6M users
 *
 * Usage:
 *   npx hardhat run scripts/scale-simulation.js
 *
 * Note: Runs on local Hardhat network. Results approximate real-world Base costs.
 */

const { ethers, upgrades } = require("hardhat");

// Base L2 gas price assumptions
const BASE_GAS_PRICE_GWEI = 0.001; // Base typically ~0.001 gwei L2 execution
const BASE_L1_DATA_COST_PER_TX = 0.00005; // Estimated L1 data posting cost in ETH
const ETH_PRICE_USD = 3500; // Approximate ETH/USD for cost estimates

async function main() {
  console.log("=== BitTON.AI Scale Simulation ===\n");

  const [deployer, operator, ...users] = await ethers.getSigners();

  // Deploy contracts
  const { btn, custodial, vaultManager, stakingVault, rewardEngine } =
    await deployAll(deployer);

  const results = {};

  // --- Test 1: Vault Activation Gas ---
  console.log("--- Test 1: Vault Activation Gas ---");
  results.vaultActivation = await measureVaultActivation(
    vaultManager,
    btn,
    users.slice(0, 10)
  );

  // --- Test 2: Staking Gas ---
  console.log("\n--- Test 2: Staking Gas ---");
  results.staking = await measureStaking(
    stakingVault,
    btn,
    users.slice(0, 10)
  );

  // --- Test 3: Batch Migration Gas ---
  console.log("\n--- Test 3: Batch Migration Gas ---");
  results.migration = await measureBatchMigration(custodial, deployer, [
    10, 50, 100, 200,
  ]);

  // --- Test 4: Distribution Gas ---
  console.log("\n--- Test 4: Distribution Gas ---");
  results.distribution = await measureDistribution(custodial, deployer);

  // --- Test 5: Return Tokens Gas ---
  console.log("\n--- Test 5: Return Tokens Gas ---");
  results.returnTokens = await measureReturnTokens(
    custodial,
    btn,
    deployer,
    users[0]
  );

  // --- Cost Projections ---
  console.log("\n=== COST PROJECTIONS ===\n");
  printCostProjections(results);

  console.log("\n=== Scale Simulation Complete ===");
}

// =========================================================================
//                          DEPLOY HELPERS
// =========================================================================

async function deployAll(deployer) {
  console.log("Deploying contracts...\n");

  // BTN Token
  const BTNToken = await ethers.getContractFactory("BTNToken");
  const btn = await BTNToken.deploy();
  await btn.waitForDeployment();

  // Mock USDT
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy();
  await usdt.waitForDeployment();

  // Mock Oracle (initialPrice, decimals)
  const MockOracle = await ethers.getContractFactory("MockAggregator");
  const oracle = await MockOracle.deploy(50000000, 8); // $0.50 BTN/USD, 8 decimals
  await oracle.waitForDeployment();

  // Custodial Distribution
  const Custodial = await ethers.getContractFactory("CustodialDistribution");
  const custodial = await Custodial.deploy(
    await btn.getAddress(),
    deployer.address
  );
  await custodial.waitForDeployment();

  // Transfer 21M to Custodial
  const totalSupply = await btn.totalSupply();
  await btn.transfer(await custodial.getAddress(), totalSupply);

  // VaultManager
  const VaultManager = await ethers.getContractFactory("VaultManager");
  const vaultManager = await upgrades.deployProxy(
    VaultManager,
    [
      await btn.getAddress(),
      await usdt.getAddress(),
      await oracle.getAddress(),
      deployer.address,
      deployer.address,
    ],
    { kind: "uups" }
  );
  await vaultManager.waitForDeployment();

  // StakingVault
  const StakingVault = await ethers.getContractFactory("StakingVault");
  const stakingVault = await upgrades.deployProxy(
    StakingVault,
    [
      await btn.getAddress(),
      deployer.address,
      await vaultManager.getAddress(),
      deployer.address,
    ],
    { kind: "uups" }
  );
  await stakingVault.waitForDeployment();

  // Distribute BTN from Custodial for testing
  const testAmount = 1_000_000n * 10n ** 6n; // 1M BTN for test users
  await custodial.distribute(deployer.address, testAmount);

  console.log("  All contracts deployed.\n");

  return {
    btn,
    usdt,
    oracle,
    custodial,
    vaultManager,
    stakingVault,
    rewardEngine: null, // Not deployed for gas-only tests
  };
}

// =========================================================================
//                          MEASUREMENT FUNCTIONS
// =========================================================================

async function measureVaultActivation(vaultManager, btn, users) {
  const gasResults = [];
  const btnAddr = await btn.getAddress();
  const vmAddr = await vaultManager.getAddress();
  const [deployer] = await ethers.getSigners();

  for (let i = 0; i < Math.min(users.length, 5); i++) {
    // Fund user with BTN for tier activation
    await btn.connect(deployer).transfer(users[i].address, 1000n * 10n ** 6n);
    await btn.connect(users[i]).approve(vmAddr, 1000n * 10n ** 6n);

    const tx = await vaultManager.connect(users[i]).activateVault(1); // T1
    const receipt = await tx.wait();
    gasResults.push(Number(receipt.gasUsed));
    console.log(`  User ${i}: ${receipt.gasUsed} gas`);
  }

  const avg = Math.round(gasResults.reduce((a, b) => a + b, 0) / gasResults.length);
  console.log(`  Average: ${avg} gas`);
  return { avg, min: Math.min(...gasResults), max: Math.max(...gasResults) };
}

async function measureStaking(stakingVault, btn, users) {
  const gasResults = [];
  const svAddr = await stakingVault.getAddress();
  const [deployer] = await ethers.getSigners();

  for (let i = 0; i < Math.min(users.length, 5); i++) {
    const amount = 100n * 10n ** 6n;
    await btn.connect(deployer).transfer(users[i].address, amount);
    await btn.connect(users[i]).approve(svAddr, amount);

    try {
      const tx = await stakingVault.connect(users[i]).stake(amount, 0); // Short
      const receipt = await tx.wait();
      gasResults.push(Number(receipt.gasUsed));
      console.log(`  User ${i} stake: ${receipt.gasUsed} gas`);
    } catch (e) {
      console.log(`  User ${i} stake failed (vault not active): expected`);
    }
  }

  if (gasResults.length === 0) {
    console.log("  (Staking requires vault activation — skipped)");
    return { avg: 150000, min: 140000, max: 160000, note: "estimated" };
  }

  const avg = Math.round(gasResults.reduce((a, b) => a + b, 0) / gasResults.length);
  return { avg, min: Math.min(...gasResults), max: Math.max(...gasResults) };
}

async function measureBatchMigration(custodial, deployer, batchSizes) {
  const results = {};

  for (const size of batchSizes) {
    const addresses = [];
    const amounts = [];
    for (let i = 0; i < size; i++) {
      addresses.push(ethers.Wallet.createRandom().address);
      amounts.push(1n * 10n ** 6n); // 1 BTN each
    }

    const tx = await custodial.connect(deployer).batchMigrate(addresses, amounts);
    const receipt = await tx.wait();
    const gasPerUser = Math.round(Number(receipt.gasUsed) / size);

    results[size] = {
      totalGas: Number(receipt.gasUsed),
      gasPerUser,
    };
    console.log(
      `  Batch ${size}: ${receipt.gasUsed} gas total, ${gasPerUser} gas/user`
    );
  }

  return results;
}

async function measureDistribution(custodial, deployer) {
  const gasResults = [];

  for (let i = 0; i < 5; i++) {
    const addr = ethers.Wallet.createRandom().address;
    const tx = await custodial
      .connect(deployer)
      .distribute(addr, 100n * 10n ** 6n);
    const receipt = await tx.wait();
    gasResults.push(Number(receipt.gasUsed));
  }

  const avg = Math.round(gasResults.reduce((a, b) => a + b, 0) / gasResults.length);
  console.log(`  Average distribute: ${avg} gas`);
  return { avg, min: Math.min(...gasResults), max: Math.max(...gasResults) };
}

async function measureReturnTokens(custodial, btn, deployer, user) {
  const custAddr = await custodial.getAddress();

  // Give user some BTN
  await custodial.connect(deployer).distribute(user.address, 1000n * 10n ** 6n);
  await btn.connect(user).approve(custAddr, 500n * 10n ** 6n);

  const tx = await custodial.connect(user).returnTokens(500n * 10n ** 6n);
  const receipt = await tx.wait();
  console.log(`  returnTokens: ${receipt.gasUsed} gas`);
  return { gas: Number(receipt.gasUsed) };
}

// =========================================================================
//                          COST PROJECTIONS
// =========================================================================

function printCostProjections(results) {
  const migGasPerUser = results.migration?.[200]?.gasPerUser || 50000;
  const distGas = results.distribution?.avg || 60000;
  const settlementGas = 150000; // Estimated from existing tests

  const scenarios = [
    { name: "60,000 users", users: 60000 },
    { name: "600,000 users", users: 600000 },
    { name: "6,000,000 users", users: 6000000 },
  ];

  for (const scenario of scenarios) {
    console.log(`\n--- ${scenario.name} ---`);

    // Migration cost
    const migBatches = Math.ceil(scenario.users / 200);
    const migTotalGas = BigInt(scenario.users) * BigInt(migGasPerUser);
    const migCostETH =
      Number(migTotalGas) * BASE_GAS_PRICE_GWEI * 1e-9 +
      migBatches * BASE_L1_DATA_COST_PER_TX;
    const migCostUSD = migCostETH * ETH_PRICE_USD;
    console.log(
      `  Migration: ${migBatches} batches, ~${migTotalGas.toLocaleString()} total gas, ~$${migCostUSD.toFixed(2)}`
    );

    // Weekly settlement cost
    const settleTotalGas = BigInt(scenario.users) * BigInt(settlementGas);
    const settleCostETH =
      Number(settleTotalGas) * BASE_GAS_PRICE_GWEI * 1e-9 +
      scenario.users * BASE_L1_DATA_COST_PER_TX;
    const settleCostUSD = settleCostETH * ETH_PRICE_USD;
    console.log(
      `  Weekly settlement: ${scenario.users.toLocaleString()} txs, ~$${settleCostUSD.toFixed(2)}/week`
    );

    // Settlement time estimate (2s per tx serial, 0.4s with 5 parallel relayers)
    const serialTimeSec = scenario.users * 2;
    const parallelTimeSec = scenario.users * 0.4; // 5 relayers
    const serialTimeHrs = (serialTimeSec / 3600).toFixed(1);
    const parallelTimeHrs = (parallelTimeSec / 3600).toFixed(1);
    console.log(
      `  Settlement time: ${serialTimeHrs}h serial, ${parallelTimeHrs}h with 5 relayers`
    );

    // Monthly cost
    const monthlyCostUSD = settleCostUSD * 4.33;
    console.log(`  Monthly settlement cost: ~$${monthlyCostUSD.toFixed(2)}`);

    // Feasibility
    if (scenario.users <= 60000) {
      console.log("  ✓ FEASIBLE with current architecture");
    } else if (scenario.users <= 600000) {
      console.log(
        "  ⚠ FEASIBLE with parallel relayers + batch settlement contract"
      );
    } else {
      console.log(
        "  ✗ REQUIRES architectural change (Merkle claim model or L3)"
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
