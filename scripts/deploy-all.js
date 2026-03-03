/**
 * deploy-all.js — Unified BitTON.AI Full-Stack Deployment
 *
 * Deploys all 6 UUPS-proxy contracts in the correct order,
 * wires cross-contract addresses, grants OPERATOR_ROLE,
 * and optionally funds the RewardEngine reward pool.
 *
 * Prerequisites:
 *   - BTN_TOKEN_ADDRESS set in .env (already deployed)
 *   - USDT_TOKEN_ADDRESS set in .env (or deploys a MockUSDT)
 *   - ORACLE_ADDRESS set in .env (or deploys a MockAggregator)
 *   - Deployer wallet funded with ETH on Base Sepolia
 *
 * Usage:
 *   npx hardhat run scripts/deploy-all.js --network base_sepolia
 *   npx hardhat run scripts/deploy-all.js                        # local hardhat
 */
const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║          BitTON.AI — Full Stack Deployment               ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");
  console.log("");

  // ─── 0. Resolve external addresses ─────────────────────────
  let btnTokenAddr = process.env.BTN_TOKEN_ADDRESS || "";
  let usdtTokenAddr = process.env.USDT_TOKEN_ADDRESS || "";
  let oracleAddr = process.env.ORACLE_ADDRESS || "";
  const treasuryAddr = process.env.TREASURY_ADDRESS || deployer.address;

  // If no BTN token provided and on hardhat network, deploy MockUSDT as BTN
  const networkName = (await ethers.provider.getNetwork()).name;
  const isLocalNetwork =
    networkName === "hardhat" || networkName === "unknown";

  if (!btnTokenAddr) {
    if (isLocalNetwork) {
      console.log("[Mock] Deploying MockUSDT as BTN token (local network)...");
      const MockToken = await ethers.getContractFactory("MockUSDT");
      const mock = await MockToken.deploy();
      await mock.waitForDeployment();
      btnTokenAddr = await mock.getAddress();
      console.log("[Mock] BTN Token:", btnTokenAddr);
    } else {
      throw new Error(
        "BTN_TOKEN_ADDRESS is required for non-local networks. Set it in .env"
      );
    }
  }

  if (!usdtTokenAddr) {
    if (isLocalNetwork) {
      console.log("[Mock] Deploying MockUSDT as USDT (local network)...");
      const MockToken = await ethers.getContractFactory("MockUSDT");
      const mock = await MockToken.deploy();
      await mock.waitForDeployment();
      usdtTokenAddr = await mock.getAddress();
      console.log("[Mock] USDT Token:", usdtTokenAddr);
    } else {
      throw new Error(
        "USDT_TOKEN_ADDRESS is required for non-local networks. Set it in .env"
      );
    }
  }

  if (!oracleAddr) {
    if (isLocalNetwork) {
      console.log(
        "[Mock] Deploying MockAggregator (BTN=$0.50, 8 decimals)..."
      );
      const MockAgg = await ethers.getContractFactory("MockAggregator");
      const mock = await MockAgg.deploy(50_000_000, 8);
      await mock.waitForDeployment();
      oracleAddr = await mock.getAddress();
      console.log("[Mock] Oracle:", oracleAddr);
    } else {
      throw new Error(
        "ORACLE_ADDRESS is required for non-local networks. Set it in .env"
      );
    }
  }

  console.log("\n─── External Addresses ─────────────────────────────────");
  console.log("  BTN Token:  ", btnTokenAddr);
  console.log("  USDT Token: ", usdtTokenAddr);
  console.log("  Oracle:     ", oracleAddr);
  console.log("  Treasury:   ", treasuryAddr);

  // ─── 1. Deploy VaultManager ─────────────────────────────────
  console.log("\n[1/6] Deploying VaultManager...");
  const VM = await ethers.getContractFactory("VaultManager");
  const vaultManager = await upgrades.deployProxy(
    VM,
    [btnTokenAddr, usdtTokenAddr, oracleAddr, treasuryAddr, deployer.address],
    { kind: "uups" }
  );
  await vaultManager.waitForDeployment();
  const vaultManagerAddr = await vaultManager.getAddress();
  console.log("  VaultManager proxy:", vaultManagerAddr);

  // ─── 2. Deploy StakingVault ─────────────────────────────────
  console.log("\n[2/6] Deploying StakingVault...");
  const SV = await ethers.getContractFactory("StakingVault");
  const stakingVault = await upgrades.deployProxy(
    SV,
    [btnTokenAddr, treasuryAddr, vaultManagerAddr, deployer.address],
    { kind: "uups" }
  );
  await stakingVault.waitForDeployment();
  const stakingVaultAddr = await stakingVault.getAddress();
  console.log("  StakingVault proxy:", stakingVaultAddr);

  // ─── 3. Deploy WithdrawalWallet ─────────────────────────────
  console.log("\n[3/6] Deploying WithdrawalWallet...");
  const WW = await ethers.getContractFactory("WithdrawalWallet");
  const withdrawalWallet = await upgrades.deployProxy(
    WW,
    [btnTokenAddr, deployer.address],
    { kind: "uups" }
  );
  await withdrawalWallet.waitForDeployment();
  const withdrawalWalletAddr = await withdrawalWallet.getAddress();
  console.log("  WithdrawalWallet proxy:", withdrawalWalletAddr);

  // ─── 4. Deploy VestingPool ──────────────────────────────────
  console.log("\n[4/6] Deploying VestingPool...");
  const VP = await ethers.getContractFactory("VestingPool");
  const vestingPool = await upgrades.deployProxy(
    VP,
    [btnTokenAddr, withdrawalWalletAddr, deployer.address],
    { kind: "uups" }
  );
  await vestingPool.waitForDeployment();
  const vestingPoolAddr = await vestingPool.getAddress();
  console.log("  VestingPool proxy:", vestingPoolAddr);

  // ─── 5. Deploy RewardEngine ─────────────────────────────────
  console.log("\n[5/6] Deploying RewardEngine...");
  const RE = await ethers.getContractFactory("RewardEngine");
  const rewardEngine = await upgrades.deployProxy(
    RE,
    [
      btnTokenAddr,
      stakingVaultAddr,
      vestingPoolAddr,
      withdrawalWalletAddr,
      vaultManagerAddr,
      deployer.address,
    ],
    { kind: "uups" }
  );
  await rewardEngine.waitForDeployment();
  const rewardEngineAddr = await rewardEngine.getAddress();
  console.log("  RewardEngine proxy:", rewardEngineAddr);

  // ─── 6. Deploy BonusEngine ──────────────────────────────────
  console.log("\n[6/6] Deploying BonusEngine...");
  const BE = await ethers.getContractFactory("BonusEngine");
  const bonusEngine = await upgrades.deployProxy(
    BE,
    [rewardEngineAddr, vaultManagerAddr, stakingVaultAddr, deployer.address],
    { kind: "uups" }
  );
  await bonusEngine.waitForDeployment();
  const bonusEngineAddr = await bonusEngine.getAddress();
  console.log("  BonusEngine proxy:", bonusEngineAddr);

  // ─── 7. Cross-Contract Wiring ───────────────────────────────
  console.log("\n─── Cross-Contract Wiring ──────────────────────────────");
  const OPERATOR_ROLE = await rewardEngine.OPERATOR_ROLE();

  // 7a. RewardEngine → OPERATOR on StakingVault (resetLastRewardTime)
  console.log("  [7a] Grant OPERATOR on StakingVault → RewardEngine");
  await (await stakingVault.grantRole(OPERATOR_ROLE, rewardEngineAddr)).wait();

  // 7b. RewardEngine → OPERATOR on VestingPool (addVesting)
  console.log("  [7b] Grant OPERATOR on VestingPool → RewardEngine");
  await (await vestingPool.grantRole(OPERATOR_ROLE, rewardEngineAddr)).wait();

  // 7c. RewardEngine → OPERATOR on WithdrawalWallet (addWithdrawable)
  console.log("  [7c] Grant OPERATOR on WithdrawalWallet → RewardEngine");
  await (await withdrawalWallet.grantRole(OPERATOR_ROLE, rewardEngineAddr)).wait();

  // 7d. VestingPool → OPERATOR on WithdrawalWallet (addWithdrawable on release)
  console.log("  [7d] Grant OPERATOR on WithdrawalWallet → VestingPool");
  await (await withdrawalWallet.grantRole(OPERATOR_ROLE, vestingPoolAddr)).wait();

  // 7e. BonusEngine → OPERATOR on RewardEngine (addPendingReward)
  console.log("  [7e] Grant OPERATOR on RewardEngine → BonusEngine");
  await (await rewardEngine.grantRole(OPERATOR_ROLE, bonusEngineAddr)).wait();

  // 7f. RewardEngine → OPERATOR on BonusEngine (processMatchingBonus)
  console.log("  [7f] Grant OPERATOR on BonusEngine → RewardEngine");
  await (await bonusEngine.grantRole(OPERATOR_ROLE, rewardEngineAddr)).wait();

  // 7g. Wire BonusEngine into RewardEngine
  console.log("  [7g] Set BonusEngine address in RewardEngine");
  await (await rewardEngine.setBonusEngine(bonusEngineAddr)).wait();

  // ─── 8. Fund RewardEngine (optional) ───────────────────────
  const rewardFundStr = process.env.REWARD_FUND_AMOUNT || "0";
  const rewardFundBTN = parseInt(rewardFundStr, 10);
  if (rewardFundBTN > 0) {
    const fundAmount = ethers.parseUnits(String(rewardFundBTN), 6);
    console.log(
      `\n─── Funding RewardEngine with ${rewardFundBTN} BTN ──────────`
    );
    const btnToken = await ethers.getContractAt("IERC20", btnTokenAddr);
    const deployerBTNBalance = await btnToken.balanceOf(deployer.address);
    if (deployerBTNBalance >= fundAmount) {
      await (await btnToken.approve(rewardEngineAddr, fundAmount)).wait();
      await (await rewardEngine.fundRewards(fundAmount)).wait();
      console.log("  RewardEngine funded with", rewardFundBTN, "BTN");
    } else {
      console.log(
        "  WARNING: Deployer BTN balance too low to fund. Skipping."
      );
      console.log(
        "  Deployer BTN balance:",
        ethers.formatUnits(deployerBTNBalance, 6)
      );
    }
  }

  // ─── 9. Summary ─────────────────────────────────────────────
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║               DEPLOYMENT SUMMARY                        ║");
  console.log("╠═══════════════════════════════════════════════════════════╣");
  console.log("║ Contract           │ Proxy Address                      ║");
  console.log("╠═══════════════════════════════════════════════════════════╣");
  console.log(`║ VaultManager       │ ${vaultManagerAddr}`);
  console.log(`║ StakingVault       │ ${stakingVaultAddr}`);
  console.log(`║ WithdrawalWallet   │ ${withdrawalWalletAddr}`);
  console.log(`║ VestingPool        │ ${vestingPoolAddr}`);
  console.log(`║ RewardEngine       │ ${rewardEngineAddr}`);
  console.log(`║ BonusEngine        │ ${bonusEngineAddr}`);
  console.log("╠═══════════════════════════════════════════════════════════╣");
  console.log("║ External           │ Address                            ║");
  console.log("╠═══════════════════════════════════════════════════════════╣");
  console.log(`║ BTN Token          │ ${btnTokenAddr}`);
  console.log(`║ USDT Token         │ ${usdtTokenAddr}`);
  console.log(`║ Oracle             │ ${oracleAddr}`);
  console.log(`║ Treasury           │ ${treasuryAddr}`);
  console.log(`║ Admin/Deployer     │ ${deployer.address}`);
  console.log("╚═══════════════════════════════════════════════════════════╝");

  console.log("\n─── OPERATOR_ROLE Grants (7 total) ─────────────────────");
  console.log("  StakingVault      → RewardEngine   ✓ (resetLastRewardTime)");
  console.log("  VestingPool       → RewardEngine   ✓ (addVesting)");
  console.log("  WithdrawalWallet  → RewardEngine   ✓ (addWithdrawable)");
  console.log("  WithdrawalWallet  → VestingPool    ✓ (addWithdrawable)");
  console.log("  RewardEngine      → BonusEngine    ✓ (addPendingReward)");
  console.log("  BonusEngine       → RewardEngine   ✓ (processMatchingBonus)");
  console.log("  RewardEngine.setBonusEngine(...)    ✓ (address wired)");

  console.log("\n─── Post-Deployment Notes ──────────────────────────────");
  console.log("1. Verify all contracts on Basescan:");
  console.log("   npx hardhat run scripts/verify-all.js --network base_sepolia");
  console.log("2. Run smoke test on testnet:");
  console.log("   npx hardhat run scripts/smoke-test.js --network base_sepolia");
  console.log("3. Fund RewardEngine with BTN if not done:");
  console.log("   Set REWARD_FUND_AMOUNT in .env and re-run, or call fundRewards() manually.");
  console.log("4. For StakingVault direct bonuses, grant OPERATOR on BonusEngine to StakingVault");
  console.log("   if you want on-chain auto-processing (currently manual via operator EOA).");

  // Output as JSON for scripting
  const addresses = {
    vaultManager: vaultManagerAddr,
    stakingVault: stakingVaultAddr,
    withdrawalWallet: withdrawalWalletAddr,
    vestingPool: vestingPoolAddr,
    rewardEngine: rewardEngineAddr,
    bonusEngine: bonusEngineAddr,
    btnToken: btnTokenAddr,
    usdtToken: usdtTokenAddr,
    oracle: oracleAddr,
    treasury: treasuryAddr,
    admin: deployer.address,
  };

  // Write addresses to file for downstream scripts
  const fs = require("fs");
  const outPath = "deployment-addresses.json";
  fs.writeFileSync(outPath, JSON.stringify(addresses, null, 2));
  console.log(`\nAddresses written to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
