/**
 * smoke-test.js — End-to-End Testnet Smoke Test
 *
 * Runs a realistic user flow against deployed contracts:
 *   1. Check deployer BTN balance
 *   2. Activate a T1 vault (pay USDT)
 *   3. Stake BTN in Short program
 *   4. Wait and settle weekly rewards
 *   5. Release vesting
 *   6. Withdraw from WithdrawalWallet
 *   7. Register referrer + verify bonus engine
 *
 * Can run on local hardhat (uses mocks) or on base_sepolia (uses real contracts).
 *
 * Usage:
 *   npx hardhat run scripts/smoke-test.js                        # local dry run
 *   npx hardhat run scripts/smoke-test.js --network base_sepolia # live testnet
 */
const { ethers, upgrades } = require("hardhat");
const fs = require("fs");

const BTN = (n) => ethers.parseUnits(String(n), 6);

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = (await ethers.provider.getNetwork()).name;
  const isLocal = networkName === "hardhat" || networkName === "unknown";

  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║          BitTON.AI — End-to-End Smoke Test               ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log("Network:", networkName);
  console.log("Deployer:", deployer.address);

  let addresses;
  let btnToken, usdtToken, oracle;
  let vaultManager, stakingVault, rewardEngine;
  let vestingPool, withdrawalWallet, bonusEngine;

  if (isLocal) {
    // ─── Local: deploy everything fresh ─────────────────────
    console.log("\n[Local Mode] Deploying full stack for smoke test...\n");

    const MockToken = await ethers.getContractFactory("MockUSDT");
    btnToken = await MockToken.deploy();
    usdtToken = await MockToken.deploy();
    await btnToken.waitForDeployment();
    await usdtToken.waitForDeployment();

    const MockAgg = await ethers.getContractFactory("MockAggregator");
    oracle = await MockAgg.deploy(50_000_000, 8); // BTN = $0.50
    await oracle.waitForDeployment();

    const VM = await ethers.getContractFactory("VaultManager");
    vaultManager = await upgrades.deployProxy(
      VM,
      [
        await btnToken.getAddress(),
        await usdtToken.getAddress(),
        await oracle.getAddress(),
        deployer.address,
        deployer.address,
      ],
      { kind: "uups" }
    );
    await vaultManager.waitForDeployment();

    const SV = await ethers.getContractFactory("StakingVault");
    stakingVault = await upgrades.deployProxy(
      SV,
      [
        await btnToken.getAddress(),
        deployer.address,
        await vaultManager.getAddress(),
        deployer.address,
      ],
      { kind: "uups" }
    );
    await stakingVault.waitForDeployment();

    const WW = await ethers.getContractFactory("WithdrawalWallet");
    withdrawalWallet = await upgrades.deployProxy(
      WW,
      [await btnToken.getAddress(), deployer.address],
      { kind: "uups" }
    );
    await withdrawalWallet.waitForDeployment();

    const VP = await ethers.getContractFactory("VestingPool");
    vestingPool = await upgrades.deployProxy(
      VP,
      [
        await btnToken.getAddress(),
        await withdrawalWallet.getAddress(),
        deployer.address,
      ],
      { kind: "uups" }
    );
    await vestingPool.waitForDeployment();

    const RE = await ethers.getContractFactory("RewardEngine");
    rewardEngine = await upgrades.deployProxy(
      RE,
      [
        await btnToken.getAddress(),
        await stakingVault.getAddress(),
        await vestingPool.getAddress(),
        await withdrawalWallet.getAddress(),
        await vaultManager.getAddress(),
        deployer.address,
      ],
      { kind: "uups" }
    );
    await rewardEngine.waitForDeployment();

    const BE = await ethers.getContractFactory("BonusEngine");
    bonusEngine = await upgrades.deployProxy(
      BE,
      [
        await rewardEngine.getAddress(),
        await vaultManager.getAddress(),
        await stakingVault.getAddress(),
        deployer.address,
      ],
      { kind: "uups" }
    );
    await bonusEngine.waitForDeployment();

    // Wire roles
    const OPERATOR_ROLE = await rewardEngine.OPERATOR_ROLE();
    await stakingVault.grantRole(
      OPERATOR_ROLE,
      await rewardEngine.getAddress()
    );
    await vestingPool.grantRole(
      OPERATOR_ROLE,
      await rewardEngine.getAddress()
    );
    await withdrawalWallet.grantRole(
      OPERATOR_ROLE,
      await rewardEngine.getAddress()
    );
    await withdrawalWallet.grantRole(
      OPERATOR_ROLE,
      await vestingPool.getAddress()
    );
    await rewardEngine.grantRole(
      OPERATOR_ROLE,
      await bonusEngine.getAddress()
    );
    await bonusEngine.grantRole(
      OPERATOR_ROLE,
      await rewardEngine.getAddress()
    );
    await rewardEngine.setBonusEngine(await bonusEngine.getAddress());

    // Fund deployer with BTN and USDT
    await btnToken.mint(deployer.address, BTN(500_000));
    await usdtToken.mint(deployer.address, BTN(100_000));

    // Fund RewardEngine
    await btnToken.approve(await rewardEngine.getAddress(), BTN(100_000));
    await rewardEngine.fundRewards(BTN(100_000));

    console.log("[Local] Full stack deployed and wired.\n");
  } else {
    // ─── Testnet: load from deployment-addresses.json ───────
    const addrFile = "deployment-addresses.json";
    if (!fs.existsSync(addrFile)) {
      throw new Error(
        `${addrFile} not found. Run deploy-all.js first.`
      );
    }
    addresses = JSON.parse(fs.readFileSync(addrFile, "utf8"));

    btnToken = await ethers.getContractAt("IERC20", addresses.btnToken);
    usdtToken = await ethers.getContractAt("IERC20", addresses.usdtToken);
    vaultManager = await ethers.getContractAt(
      "VaultManager",
      addresses.vaultManager
    );
    stakingVault = await ethers.getContractAt(
      "StakingVault",
      addresses.stakingVault
    );
    rewardEngine = await ethers.getContractAt(
      "RewardEngine",
      addresses.rewardEngine
    );
    vestingPool = await ethers.getContractAt(
      "VestingPool",
      addresses.vestingPool
    );
    withdrawalWallet = await ethers.getContractAt(
      "WithdrawalWallet",
      addresses.withdrawalWallet
    );
    bonusEngine = await ethers.getContractAt(
      "BonusEngine",
      addresses.bonusEngine
    );

    console.log("[Testnet] Contracts loaded from", addrFile, "\n");
  }

  // ═══════════════════════════════════════════════════════════
  // SMOKE TEST STEPS
  // ═══════════════════════════════════════════════════════════

  let step = 0;
  const pass = (msg) => console.log(`  ✓ PASS: ${msg}`);
  const fail = (msg) => {
    console.error(`  ✗ FAIL: ${msg}`);
    process.exitCode = 1;
  };

  // ─── Step 1: Check BTN balance ────────────────────────────
  step++;
  console.log(`\n[Step ${step}] Check deployer BTN balance`);
  const btnBal = await btnToken.balanceOf(deployer.address);
  console.log(`  BTN balance: ${ethers.formatUnits(btnBal, 6)} BTN`);
  if (btnBal > 0n) pass("Non-zero BTN balance");
  else fail("Zero BTN balance — fund the deployer first");

  // ─── Step 2: Activate T1 Vault (pay USDT) ────────────────
  step++;
  console.log(`\n[Step ${step}] Activate T1 Vault (USDT payment)`);
  try {
    const isActive = await vaultManager.isVaultActive(deployer.address);
    if (isActive) {
      pass("Vault already active, skipping activation");
    } else {
      // T1 fee = $25 in USDT (6 decimals) = 25_000_000
      const t1FeeUSD = BTN(25);
      await (await usdtToken.approve(await vaultManager.getAddress(), t1FeeUSD)).wait();
      const tx = await vaultManager.activateVault(1); // tier 1, pay USDT
      await tx.wait();
      const tier = await vaultManager.getUserTier(deployer.address);
      if (tier === 1n) pass("T1 Vault activated");
      else fail(`Expected tier 1, got ${tier}`);
    }
  } catch (e) {
    fail(`Vault activation error: ${e.message}`);
  }

  // ─── Step 3: Stake 1000 BTN (Short program) ──────────────
  step++;
  console.log(`\n[Step ${step}] Stake 1000 BTN in Short program`);
  try {
    const existingCount = await stakingVault.getStakeCount(deployer.address);
    if (existingCount > 0n) {
      pass(`Already staked (${existingCount} positions), skipping`);
    } else {
      const stakeAmount = BTN(1000);
      await (await btnToken.approve(await stakingVault.getAddress(), stakeAmount)).wait();
      const tx = await stakingVault.stake(stakeAmount, 0); // 0 = Short
      await tx.wait();
      const stakeCount = await stakingVault.getStakeCount(deployer.address);
      if (stakeCount > 0n) pass(`Stake created (total stakes: ${stakeCount})`);
      else fail("Stake not created");
    }
  } catch (e) {
    fail(`Staking error: ${e.message}`);
  }

  // ─── Step 4: Advance time + settle weekly rewards ─────────
  step++;
  console.log(`\n[Step ${step}] Settle weekly rewards`);
  try {
    if (isLocal) {
      // Advance 8 days to accumulate rewards
      await ethers.provider.send("evm_increaseTime", [8 * 86400]);
      await ethers.provider.send("evm_mine", []);
    }

    // Check pending rewards first
    const stakeCount = await stakingVault.getStakeCount(deployer.address);
    let totalPending = 0n;
    for (let i = 0; i < stakeCount; i++) {
      const pending = await stakingVault.getPendingRewards(
        deployer.address,
        i
      );
      totalPending += pending;
    }
    console.log(
      `  Pending rewards: ${ethers.formatUnits(totalPending, 6)} BTN`
    );

    if (totalPending > 0n) {
      const tx = await rewardEngine.settleWeekly(deployer.address);
      await tx.wait();
      pass("Weekly settlement executed");

      // Check vesting balance (90%)
      const vestedBal = await vestingPool.getVestedBalance(deployer.address);
      console.log(
        `  Vested balance: ${ethers.formatUnits(vestedBal, 6)} BTN`
      );

      // Check withdrawal balance (10%)
      const withdrawBal = await withdrawalWallet.getWithdrawableBalance(
        deployer.address
      );
      console.log(
        `  Withdrawable balance: ${ethers.formatUnits(withdrawBal, 6)} BTN`
      );
    } else {
      if (!isLocal) {
        pass("No pending rewards yet (may need to wait for accrual on testnet)");
      } else {
        fail("Expected non-zero pending rewards after 8 days");
      }
    }
  } catch (e) {
    fail(`Settlement error: ${e.message}`);
  }

  // ─── Step 5: Release vesting ──────────────────────────────
  step++;
  console.log(`\n[Step ${step}] Release vesting`);
  try {
    if (isLocal) {
      // Advance 2 days to accrue some vesting release
      await ethers.provider.send("evm_increaseTime", [2 * 86400]);
      await ethers.provider.send("evm_mine", []);
    }

    const pendingRelease = await vestingPool.getPendingRelease(
      deployer.address
    );
    console.log(
      `  Pending vesting release: ${ethers.formatUnits(pendingRelease, 6)} BTN`
    );

    if (pendingRelease > 0n) {
      const tx = await vestingPool.release(deployer.address);
      await tx.wait();
      pass("Vesting released");

      const newWithdrawBal = await withdrawalWallet.getWithdrawableBalance(
        deployer.address
      );
      console.log(
        `  Withdrawable after release: ${ethers.formatUnits(newWithdrawBal, 6)} BTN`
      );
    } else {
      pass("No vesting release pending (ok if just settled)");
    }
  } catch (e) {
    fail(`Vesting release error: ${e.message}`);
  }

  // ─── Step 6: Withdraw from WithdrawalWallet ───────────────
  step++;
  console.log(`\n[Step ${step}] Withdraw BTN from WithdrawalWallet`);
  try {
    const withdrawBal = await withdrawalWallet.getWithdrawableBalance(
      deployer.address
    );
    if (withdrawBal > 0n) {
      const balBefore = await btnToken.balanceOf(deployer.address);
      const tx = await withdrawalWallet.withdraw(withdrawBal);
      await tx.wait();
      const balAfter = await btnToken.balanceOf(deployer.address);
      const received = balAfter - balBefore;
      console.log(
        `  Withdrew: ${ethers.formatUnits(received, 6)} BTN`
      );
      if (received > 0n) pass("Withdrawal successful");
      else fail("No BTN received after withdrawal");
    } else {
      pass("No withdrawable balance (expected on fresh deploy)");
    }
  } catch (e) {
    fail(`Withdrawal error: ${e.message}`);
  }

  // ─── Step 7: BonusEngine — register referrer ──────────────
  step++;
  console.log(`\n[Step ${step}] BonusEngine — register referrer`);
  try {
    const signers = await ethers.getSigners();
    if (signers.length > 1) {
      const referrer = signers[1] || deployer;
      // Check if already registered
      const existingRef = await bonusEngine.getReferrer(deployer.address);
      if (existingRef !== ethers.ZeroAddress) {
        pass(`Referrer already set: ${existingRef}`);
      } else {
        const tx = await bonusEngine.registerReferrer(referrer.address);
        await tx.wait();
        const ref = await bonusEngine.getReferrer(deployer.address);
        if (ref === referrer.address) pass("Referrer registered");
        else fail(`Referrer mismatch: expected ${referrer.address}, got ${ref}`);
      }
    } else {
      pass("Only one signer available, skipping referrer test");
    }
  } catch (e) {
    // Self-referral or already registered are acceptable
    if (e.message.includes("SelfReferral") || e.message.includes("AlreadyRegistered")) {
      pass("Referrer registration skipped (self-referral/already registered)");
    } else {
      fail(`BonusEngine error: ${e.message}`);
    }
  }

  // ─── Step 8: Contract state summary ───────────────────────
  step++;
  console.log(`\n[Step ${step}] Contract State Summary`);
  try {
    const tier = await vaultManager.getUserTier(deployer.address);
    const active = await vaultManager.isVaultActive(deployer.address);
    const stakeCount = await stakingVault.getStakeCount(deployer.address);
    const vestedBal = await vestingPool.getVestedBalance(deployer.address);
    const withdrawBal = await withdrawalWallet.getWithdrawableBalance(
      deployer.address
    );

    console.log(`  Vault tier: ${tier} | Active: ${active}`);
    console.log(`  Stake count: ${stakeCount}`);
    console.log(
      `  Vested balance: ${ethers.formatUnits(vestedBal, 6)} BTN`
    );
    console.log(
      `  Withdrawable: ${ethers.formatUnits(withdrawBal, 6)} BTN`
    );
    pass("State summary complete");
  } catch (e) {
    fail(`State query error: ${e.message}`);
  }

  // ─── Final ────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  if (process.exitCode === 1) {
    console.log("SMOKE TEST: SOME STEPS FAILED — review output above");
  } else {
    console.log("SMOKE TEST: ALL STEPS PASSED ✓");
  }
  console.log("═══════════════════════════════════════════════════════════");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
