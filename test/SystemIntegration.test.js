const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * System Integration Tests — Full Cross-Contract Wiring
 *
 * Deploys ALL real contracts (no mocks except BTN/USDT/Oracle tokens)
 * and verifies end-to-end flows:
 *   1. Vault activation → Stake → Settle → Vest release → Withdraw
 *   2. Referral registration → Direct bonus → Matching bonus → Settlement
 *   3. Multi-user, multi-tier scenarios
 *   4. Withdrawal cap enforcement
 *   5. Reward pool accounting
 */
describe("System Integration — Full Cross-Contract Wiring", function () {
  // ─── Constants ─────────────────────────────────────────────
  const BTN = (n) => ethers.parseUnits(String(n), 6);
  const DAY = 86400;
  const WEEK = 7 * DAY;

  // ─── Signers ───────────────────────────────────────────────
  let admin, treasury, operator;
  let alice, bob, charlie, dave;

  // ─── Token & Oracle ────────────────────────────────────────
  let btnToken, usdtToken, oracle;

  // ─── Contracts ─────────────────────────────────────────────
  let vaultManager, stakingVault, rewardEngine;
  let vestingPool, withdrawalWallet, bonusEngine;

  // ─── Role hashes ───────────────────────────────────────────
  let OPERATOR_ROLE;

  // ─── Deploy & Wire Everything ──────────────────────────────
  beforeEach(async function () {
    [admin, treasury, operator, alice, bob, charlie, dave] =
      await ethers.getSigners();

    // ── 1. Tokens & Oracle ──
    const MockToken = await ethers.getContractFactory("MockUSDT");
    btnToken = await MockToken.deploy();
    usdtToken = await MockToken.deploy();
    await btnToken.waitForDeployment();
    await usdtToken.waitForDeployment();

    // Oracle: BTN = $0.50 (8 decimals → 50_000_000)
    const MockAgg = await ethers.getContractFactory("MockAggregator");
    oracle = await MockAgg.deploy(50_000_000, 8);
    await oracle.waitForDeployment();

    // ── 2. Deploy VaultManager ──
    const VM = await ethers.getContractFactory("VaultManager");
    vaultManager = await upgrades.deployProxy(
      VM,
      [
        await btnToken.getAddress(),
        await usdtToken.getAddress(),
        await oracle.getAddress(),
        treasury.address,
        admin.address,
      ],
      { kind: "uups" }
    );
    await vaultManager.waitForDeployment();

    // ── 3. Deploy StakingVault ──
    const SV = await ethers.getContractFactory("StakingVault");
    stakingVault = await upgrades.deployProxy(
      SV,
      [
        await btnToken.getAddress(),
        treasury.address,
        await vaultManager.getAddress(),
        admin.address,
      ],
      { kind: "uups" }
    );
    await stakingVault.waitForDeployment();

    // ── 4. Deploy WithdrawalWallet ──
    const WW = await ethers.getContractFactory("WithdrawalWallet");
    withdrawalWallet = await upgrades.deployProxy(
      WW,
      [await btnToken.getAddress(), admin.address],
      { kind: "uups" }
    );
    await withdrawalWallet.waitForDeployment();

    // ── 5. Deploy VestingPool ──
    const VP = await ethers.getContractFactory("VestingPool");
    vestingPool = await upgrades.deployProxy(
      VP,
      [
        await btnToken.getAddress(),
        await withdrawalWallet.getAddress(),
        admin.address,
      ],
      { kind: "uups" }
    );
    await vestingPool.waitForDeployment();

    // ── 6. Deploy RewardEngine ──
    const RE = await ethers.getContractFactory("RewardEngine");
    rewardEngine = await upgrades.deployProxy(
      RE,
      [
        await btnToken.getAddress(),
        await stakingVault.getAddress(),
        await vestingPool.getAddress(),
        await withdrawalWallet.getAddress(),
        await vaultManager.getAddress(),
        admin.address,
      ],
      { kind: "uups" }
    );
    await rewardEngine.waitForDeployment();

    // ── 7. Deploy BonusEngine ──
    const BE = await ethers.getContractFactory("BonusEngine");
    bonusEngine = await upgrades.deployProxy(
      BE,
      [
        await rewardEngine.getAddress(),
        await vaultManager.getAddress(),
        await stakingVault.getAddress(),
        admin.address,
      ],
      { kind: "uups" }
    );
    await bonusEngine.waitForDeployment();

    // ── 8. Cross-contract OPERATOR_ROLE grants ──
    OPERATOR_ROLE = await rewardEngine.OPERATOR_ROLE();

    // RewardEngine needs OPERATOR on StakingVault (resetLastRewardTime)
    await stakingVault
      .connect(admin)
      .grantRole(OPERATOR_ROLE, await rewardEngine.getAddress());

    // RewardEngine needs OPERATOR on VestingPool (addVesting)
    await vestingPool
      .connect(admin)
      .grantRole(OPERATOR_ROLE, await rewardEngine.getAddress());

    // RewardEngine needs OPERATOR on WithdrawalWallet (addWithdrawable)
    await withdrawalWallet
      .connect(admin)
      .grantRole(OPERATOR_ROLE, await rewardEngine.getAddress());

    // VestingPool needs OPERATOR on WithdrawalWallet (addWithdrawable on release)
    await withdrawalWallet
      .connect(admin)
      .grantRole(OPERATOR_ROLE, await vestingPool.getAddress());

    // BonusEngine needs OPERATOR on RewardEngine (addPendingReward)
    await rewardEngine
      .connect(admin)
      .grantRole(OPERATOR_ROLE, await bonusEngine.getAddress());

    // RewardEngine needs OPERATOR on BonusEngine (processMatchingBonus during settlement)
    await bonusEngine
      .connect(admin)
      .grantRole(OPERATOR_ROLE, await rewardEngine.getAddress());

    // Grant operator signer OPERATOR on BonusEngine (processDirectBonus/processMatchingBonus)
    await bonusEngine
      .connect(admin)
      .grantRole(OPERATOR_ROLE, operator.address);

    // Grant operator signer OPERATOR on RewardEngine (settleWeekly on behalf)
    await rewardEngine
      .connect(admin)
      .grantRole(OPERATOR_ROLE, operator.address);

    // Wire BonusEngine into RewardEngine
    await rewardEngine
      .connect(admin)
      .setBonusEngine(await bonusEngine.getAddress());

    // ── 9. Fund users with BTN and USDT ──
    const fundAmount = BTN(100_000);
    for (const user of [alice, bob, charlie, dave]) {
      await btnToken.mint(user.address, fundAmount);
      await usdtToken.mint(user.address, fundAmount);
    }

    // ── 10. Fund RewardEngine reward pool ──
    const rewardFund = BTN(500_000);
    await btnToken.mint(admin.address, rewardFund);
    await btnToken
      .connect(admin)
      .approve(await rewardEngine.getAddress(), rewardFund);
    await rewardEngine.connect(admin).fundRewards(rewardFund);
  });

  // ─── Helpers ───────────────────────────────────────────────

  async function activateVault(user, tier) {
    const feeUSD = await vaultManager.tierFeeUSD(tier);
    await usdtToken
      .connect(user)
      .approve(await vaultManager.getAddress(), feeUSD);
    await vaultManager.connect(user).activateVault(tier);
  }

  async function stakeBtn(user, amount, programType) {
    await btnToken
      .connect(user)
      .approve(await stakingVault.getAddress(), amount);
    await stakingVault.connect(user).stake(amount, programType);
  }

  async function getStakeStart(user, index) {
    const stake = await stakingVault.getStake(user.address, index);
    return Number(stake.startTime);
  }

  function calcReward(principal, multiplier, elapsed) {
    return (principal * 5n * multiplier * BigInt(elapsed)) / (10_000n * BigInt(DAY));
  }

  function calcRelease(balance, elapsed) {
    const r = (balance * 5n * BigInt(elapsed)) / (1000n * BigInt(DAY));
    return r > balance ? balance : r;
  }

  // ═══════════════════════════════════════════════════════════
  // Scenario 1: Full lifecycle
  // ═══════════════════════════════════════════════════════════

  describe("Scenario 1: Full lifecycle — activate → stake → settle → vest → withdraw", function () {
    it("should complete the full staking-to-withdrawal flow for T1 Short", async function () {
      // 1. Alice activates T1 vault ($25 USDT)
      await activateVault(alice, 1);
      expect(await vaultManager.isVaultActive(alice.address)).to.be.true;
      expect(await vaultManager.getUserTier(alice.address)).to.equal(1);

      // 2. Alice stakes 10,000 BTN Short
      const stakeAmount = BTN(10_000);
      await stakeBtn(alice, stakeAmount, 0);
      const stakeStart = await getStakeStart(alice, 0);

      // 3. Advance 7 days and settle
      const settleTime = stakeStart + 7 * DAY;
      await time.setNextBlockTimestamp(settleTime);
      await rewardEngine.connect(alice).settleWeekly(alice.address);

      // Expected reward: T1 Short = multiplier 10 (1.0x)
      const expectedReward = calcReward(stakeAmount, 10n, 7 * DAY);
      const expectedWithdrawable = (expectedReward * 10n) / 100n;
      const expectedVested = expectedReward - expectedWithdrawable;

      expect(
        await withdrawalWallet.withdrawableBalance(alice.address)
      ).to.equal(expectedWithdrawable);
      expect(await vestingPool.vestedBalance(alice.address)).to.equal(
        expectedVested
      );

      // 4. Advance 1 day and release vesting
      const releaseTime = settleTime + DAY;
      await time.setNextBlockTimestamp(releaseTime);
      await vestingPool.connect(alice).release(alice.address);

      const expectedRelease = calcRelease(expectedVested, DAY);
      expect(expectedRelease).to.be.gt(0n);

      const totalWithdrawable = expectedWithdrawable + expectedRelease;
      expect(
        await withdrawalWallet.withdrawableBalance(alice.address)
      ).to.equal(totalWithdrawable);
      expect(await vestingPool.vestedBalance(alice.address)).to.equal(
        expectedVested - expectedRelease
      );

      // 5. Alice withdraws everything
      const aliceBefore = await btnToken.balanceOf(alice.address);
      await withdrawalWallet.connect(alice).withdraw(totalWithdrawable);
      expect(await btnToken.balanceOf(alice.address)).to.equal(
        aliceBefore + totalWithdrawable
      );
      expect(
        await withdrawalWallet.withdrawableBalance(alice.address)
      ).to.equal(0n);
    });

    it("should complete the full flow for T3 Long stake", async function () {
      await activateVault(alice, 3);
      const stakeAmount = BTN(5_000);
      await stakeBtn(alice, stakeAmount, 1); // Long
      const stakeStart = await getStakeStart(alice, 0);

      // Settle after 14 days
      const settleTime = stakeStart + 14 * DAY;
      await time.setNextBlockTimestamp(settleTime);
      await rewardEngine.connect(alice).settleWeekly(alice.address);

      // Long = multiplier 12 (1.2x)
      const expectedReward = calcReward(stakeAmount, 12n, 14 * DAY);
      const withdrawable = (expectedReward * 10n) / 100n;
      const vested = expectedReward - withdrawable;

      expect(
        await withdrawalWallet.withdrawableBalance(alice.address)
      ).to.equal(withdrawable);
      expect(await vestingPool.vestedBalance(alice.address)).to.equal(vested);
      expect(await rewardEngine.rewardPoolBalance()).to.equal(
        BTN(500_000) - expectedReward
      );
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Scenario 2: Consecutive settlements with vesting
  // ═══════════════════════════════════════════════════════════

  describe("Scenario 2: Consecutive settlements + vesting releases", function () {
    it("should handle settle → vest release → settle again", async function () {
      await activateVault(alice, 2); // T2
      const stakeAmount = BTN(10_000);
      await stakeBtn(alice, stakeAmount, 0);
      const stakeStart = await getStakeStart(alice, 0);

      // Settlement 1: 7 days
      const settle1Time = stakeStart + 7 * DAY;
      await time.setNextBlockTimestamp(settle1Time);
      await rewardEngine.connect(alice).settleWeekly(alice.address);

      const reward1 = calcReward(stakeAmount, 11n, 7 * DAY);
      const withdrawable1 = (reward1 * 10n) / 100n;
      const vested1 = reward1 - withdrawable1;

      // Vest release after 3 days
      const releaseTime = settle1Time + 3 * DAY;
      await time.setNextBlockTimestamp(releaseTime);
      await vestingPool.connect(alice).release(alice.address);

      const released = calcRelease(vested1, 3 * DAY);
      const remainingVested = vested1 - released;

      expect(await vestingPool.vestedBalance(alice.address)).to.equal(
        remainingVested
      );
      expect(
        await withdrawalWallet.withdrawableBalance(alice.address)
      ).to.equal(withdrawable1 + released);

      // Settlement 2: 7 more days from settlement 1
      const settle2Time = settle1Time + 7 * DAY;
      await time.setNextBlockTimestamp(settle2Time);
      await rewardEngine.connect(alice).settleWeekly(alice.address);

      const reward2 = calcReward(stakeAmount, 11n, 7 * DAY);
      const withdrawable2 = (reward2 * 10n) / 100n;
      const vested2 = reward2 - withdrawable2;

      expect(await vestingPool.vestedBalance(alice.address)).to.equal(
        remainingVested + vested2
      );
      expect(
        await withdrawalWallet.withdrawableBalance(alice.address)
      ).to.equal(withdrawable1 + released + withdrawable2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Scenario 3: Referral chain with bonuses
  // ═══════════════════════════════════════════════════════════

  describe("Scenario 3: Referral chain — direct + matching bonuses", function () {
    it("should process direct bonus when referred user stakes", async function () {
      await bonusEngine.connect(alice).registerReferrer(bob.address);
      await activateVault(alice, 1);
      await activateVault(bob, 1);

      const stakeAmount = BTN(10_000);
      await stakeBtn(alice, stakeAmount, 0);

      await bonusEngine
        .connect(operator)
        .processDirectBonus(alice.address, stakeAmount);

      const expectedDirectBonus = (stakeAmount * 500n) / 10_000n;
      expect(await rewardEngine.pendingReward(bob.address)).to.equal(
        expectedDirectBonus
      );
    });

    it("should process matching bonus on settlement and settle referrer correctly", async function () {
      // Chain: Alice → Bob → Charlie
      await bonusEngine.connect(alice).registerReferrer(bob.address);
      await bonusEngine.connect(bob).registerReferrer(charlie.address);

      await activateVault(alice, 1);
      await activateVault(bob, 1);
      await activateVault(charlie, 1);

      await stakeBtn(bob, BTN(1_000), 0);
      await stakeBtn(charlie, BTN(1_000), 0);

      const stakeAmount = BTN(10_000);
      await stakeBtn(alice, stakeAmount, 0);
      const aliceStakeStart = await getStakeStart(alice, 0);

      // Settle Alice after 7 days
      const settleTime = aliceStakeStart + 7 * DAY;
      await time.setNextBlockTimestamp(settleTime);
      await rewardEngine.connect(operator).settleWeekly(alice.address);

      const aliceReward = calcReward(stakeAmount, 10n, 7 * DAY);
      const bobMatching = (aliceReward * 1000n) / 10_000n; // L1=10%
      const charlieMatching = (aliceReward * 500n) / 10_000n; // L2=5%

      expect(await rewardEngine.pendingReward(bob.address)).to.equal(
        bobMatching
      );
      expect(await rewardEngine.pendingReward(charlie.address)).to.equal(
        charlieMatching
      );

      // Now settle Bob — his matching bonus + his own stake reward
      const bobStakeStart = await getStakeStart(bob, 0);
      const bobSettleTime = settleTime + 1;
      await time.setNextBlockTimestamp(bobSettleTime);
      await rewardEngine.connect(operator).settleWeekly(bob.address);

      const bobStakeElapsed = bobSettleTime - bobStakeStart;
      const bobStakeReward = calcReward(BTN(1_000), 10n, bobStakeElapsed);
      const bobTotalReward = bobStakeReward + bobMatching;

      const bobWithdrawable = (bobTotalReward * 10n) / 100n;
      const bobVested = bobTotalReward - bobWithdrawable;

      expect(
        await withdrawalWallet.withdrawableBalance(bob.address)
      ).to.equal(bobWithdrawable);
      expect(await vestingPool.vestedBalance(bob.address)).to.equal(bobVested);
    });

    it("should handle complete flow: register → stake → direct → settle → matching → vest → withdraw", async function () {
      await bonusEngine.connect(alice).registerReferrer(bob.address);
      await activateVault(alice, 2);
      await activateVault(bob, 2);

      await stakeBtn(bob, BTN(1_000), 0);

      const aliceStake = BTN(20_000);
      await stakeBtn(alice, aliceStake, 0);

      // Direct bonus
      await bonusEngine
        .connect(operator)
        .processDirectBonus(alice.address, aliceStake);

      const directBonus = (aliceStake * 500n) / 10_000n;

      // Settle Alice after 7 days (triggers matching for Bob)
      const aliceStakeStart = await getStakeStart(alice, 0);
      const settleTime = aliceStakeStart + 7 * DAY;
      await time.setNextBlockTimestamp(settleTime);
      await rewardEngine.connect(operator).settleWeekly(alice.address);

      const aliceReward = calcReward(aliceStake, 11n, 7 * DAY);
      const matchingBonus = (aliceReward * 1000n) / 10_000n;

      expect(await rewardEngine.pendingReward(bob.address)).to.equal(
        directBonus + matchingBonus
      );

      // Settle Bob
      const bobStakeStart = await getStakeStart(bob, 0);
      const bobSettleTime = settleTime + 1;
      await time.setNextBlockTimestamp(bobSettleTime);
      await rewardEngine.connect(operator).settleWeekly(bob.address);

      const bobStakeElapsed = bobSettleTime - bobStakeStart;
      const bobStakeReward = calcReward(BTN(1_000), 11n, bobStakeElapsed);
      const bobTotal = bobStakeReward + directBonus + matchingBonus;
      const bobWithdrawable = (bobTotal * 10n) / 100n;
      const bobVested = bobTotal - bobWithdrawable;

      expect(
        await withdrawalWallet.withdrawableBalance(bob.address)
      ).to.equal(bobWithdrawable);

      // Release vesting after 1 day
      const releaseTime = bobSettleTime + DAY;
      await time.setNextBlockTimestamp(releaseTime);
      await vestingPool.connect(bob).release(bob.address);

      const vestRelease = calcRelease(bobVested, DAY);
      const totalWithdrawable = bobWithdrawable + vestRelease;

      // Withdraw everything
      const bobBefore = await btnToken.balanceOf(bob.address);
      await withdrawalWallet.connect(bob).withdraw(totalWithdrawable);
      expect(await btnToken.balanceOf(bob.address)).to.equal(
        bobBefore + totalWithdrawable
      );
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Scenario 4: Multi-user, different tiers
  // ═══════════════════════════════════════════════════════════

  describe("Scenario 4: Multi-user, different tiers", function () {
    it("should produce different rewards for different tiers", async function () {
      await activateVault(alice, 1); // T1 = 1.0x
      await activateVault(bob, 3); // T3 = 1.2x

      const stakeAmount = BTN(10_000);
      await stakeBtn(alice, stakeAmount, 0);
      await stakeBtn(bob, stakeAmount, 0);

      const aliceStart = await getStakeStart(alice, 0);
      const bobStart = await getStakeStart(bob, 0);

      // Settle Alice
      const aliceSettleTime = aliceStart + 7 * DAY;
      await time.setNextBlockTimestamp(aliceSettleTime);
      await rewardEngine.connect(alice).settleWeekly(alice.address);

      // Settle Bob
      const bobSettleTime = bobStart + 7 * DAY;
      if (bobSettleTime > aliceSettleTime) {
        await time.setNextBlockTimestamp(bobSettleTime);
      }
      await rewardEngine.connect(bob).settleWeekly(bob.address);

      const aliceReward = calcReward(stakeAmount, 10n, 7 * DAY);
      const bobReward = calcReward(stakeAmount, 12n, 7 * DAY);

      expect(bobReward).to.be.gt(aliceReward);

      expect(
        await withdrawalWallet.withdrawableBalance(alice.address)
      ).to.equal((aliceReward * 10n) / 100n);
      expect(
        await withdrawalWallet.withdrawableBalance(bob.address)
      ).to.equal((bobReward * 10n) / 100n);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Scenario 5: Vault gating
  // ═══════════════════════════════════════════════════════════

  describe("Scenario 5: Vault gating enforcement", function () {
    it("should prevent staking without active vault", async function () {
      await btnToken
        .connect(alice)
        .approve(await stakingVault.getAddress(), BTN(1_000));
      await expect(
        stakingVault.connect(alice).stake(BTN(1_000), 0)
      ).to.be.revertedWithCustomError(stakingVault, "VaultNotActive");
    });

    it("should prevent settlement without active vault", async function () {
      await expect(
        rewardEngine.connect(alice).settleWeekly(alice.address)
      ).to.be.revertedWithCustomError(rewardEngine, "VaultNotActive");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Scenario 6: Weekly withdrawal cap
  // ═══════════════════════════════════════════════════════════

  describe("Scenario 6: Weekly withdrawal cap enforcement", function () {
    it("should enforce weekly cap and reset after week boundary", async function () {
      await withdrawalWallet
        .connect(admin)
        .setWeeklyWithdrawalCap(BTN(100));

      await activateVault(alice, 3);
      await stakeBtn(alice, BTN(50_000), 0);

      const stakeStart = await getStakeStart(alice, 0);
      const settleTime = stakeStart + 7 * DAY;
      await time.setNextBlockTimestamp(settleTime);
      await rewardEngine.connect(alice).settleWeekly(alice.address);

      const aliceWithdrawable = await withdrawalWallet.withdrawableBalance(
        alice.address
      );
      expect(aliceWithdrawable).to.be.gt(BTN(100));

      // Withdraw up to cap
      await withdrawalWallet.connect(alice).withdraw(BTN(100));

      // Cannot exceed cap
      await expect(
        withdrawalWallet.connect(alice).withdraw(BTN(1))
      ).to.be.revertedWithCustomError(withdrawalWallet, "WeeklyCapExceeded");

      // Advance to next week
      const nextWeek = settleTime + 7 * DAY;
      await time.setNextBlockTimestamp(nextWeek);
      await withdrawalWallet.connect(alice).withdraw(BTN(100));
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Scenario 7: Early unstake penalty
  // ═══════════════════════════════════════════════════════════

  describe("Scenario 7: Early unstake penalty + reward pool accounting", function () {
    it("should deduct 15% penalty and update reward pool correctly", async function () {
      await activateVault(alice, 1);
      await stakeBtn(alice, BTN(10_000), 0);
      const stakeStart = await getStakeStart(alice, 0);

      // Settle after 7 days
      const settleTime = stakeStart + 7 * DAY;
      await time.setNextBlockTimestamp(settleTime);
      await rewardEngine.connect(alice).settleWeekly(alice.address);

      const reward = calcReward(BTN(10_000), 10n, 7 * DAY);
      expect(await rewardEngine.rewardPoolBalance()).to.equal(
        BTN(500_000) - reward
      );

      // Early unstake
      const unstakeTime = settleTime + 1;
      await time.setNextBlockTimestamp(unstakeTime);
      const aliceBefore = await btnToken.balanceOf(alice.address);
      const treasuryBefore = await btnToken.balanceOf(treasury.address);

      await stakingVault.connect(alice).unstake(0);

      const penalty = (BTN(10_000) * 1500n) / 10_000n;
      expect(await btnToken.balanceOf(alice.address)).to.equal(
        aliceBefore + BTN(10_000) - penalty
      );
      expect(await btnToken.balanceOf(treasury.address)).to.equal(
        treasuryBefore + penalty
      );
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Scenario 8: Matching bonus qualification
  // ═══════════════════════════════════════════════════════════

  describe("Scenario 8: Matching bonus qualification checks", function () {
    it("should skip unqualified referrers (no stake)", async function () {
      await bonusEngine.connect(alice).registerReferrer(bob.address);
      await bonusEngine.connect(bob).registerReferrer(charlie.address);

      await activateVault(alice, 1);
      await activateVault(bob, 1);
      await activateVault(charlie, 1);

      // Bob has NO stake (< 500 BTN minimum), Charlie qualifies
      await stakeBtn(charlie, BTN(1_000), 0);

      await stakeBtn(alice, BTN(10_000), 0);
      const stakeStart = await getStakeStart(alice, 0);
      const settleTime = stakeStart + 7 * DAY;
      await time.setNextBlockTimestamp(settleTime);
      await rewardEngine.connect(operator).settleWeekly(alice.address);

      const aliceReward = calcReward(BTN(10_000), 10n, 7 * DAY);

      // Bob skipped, Charlie gets L2 bonus
      expect(await rewardEngine.pendingReward(bob.address)).to.equal(0n);
      expect(await rewardEngine.pendingReward(charlie.address)).to.equal(
        (aliceReward * 500n) / 10_000n
      );
    });

    it("should respect T1 depth limit (3 levels)", async function () {
      await bonusEngine.connect(alice).registerReferrer(bob.address);
      await bonusEngine.connect(bob).registerReferrer(charlie.address);
      await bonusEngine.connect(charlie).registerReferrer(dave.address);

      for (const u of [alice, bob, charlie, dave]) {
        await activateVault(u, 1);
        await stakeBtn(u, BTN(1_000), 0);
      }

      // Alice stakes more
      await stakeBtn(alice, BTN(10_000), 0);
      const stakeStart = await getStakeStart(alice, 1);
      const settleTime = stakeStart + 7 * DAY;
      await time.setNextBlockTimestamp(settleTime);
      await rewardEngine.connect(operator).settleWeekly(alice.address);

      // Alice has 2 stakes, both accrue rewards
      const stake0Start = await getStakeStart(alice, 0);
      const aliceReward1 = calcReward(BTN(1_000), 10n, settleTime - stake0Start);
      const aliceReward2 = calcReward(BTN(10_000), 10n, 7 * DAY);
      const aliceTotalReward = aliceReward1 + aliceReward2;

      // Bob=L1 (10%), Charlie=L2 (5%), Dave=L3 (3%)
      expect(await rewardEngine.pendingReward(bob.address)).to.equal(
        (aliceTotalReward * 1000n) / 10_000n
      );
      expect(await rewardEngine.pendingReward(charlie.address)).to.equal(
        (aliceTotalReward * 500n) / 10_000n
      );
      expect(await rewardEngine.pendingReward(dave.address)).to.equal(
        (aliceTotalReward * 300n) / 10_000n
      );
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Scenario 9: Reward pool exhaustion
  // ═══════════════════════════════════════════════════════════

  describe("Scenario 9: Reward pool exhaustion", function () {
    it("should revert settlement if reward pool is insufficient", async function () {
      await activateVault(alice, 3);
      await btnToken.mint(alice.address, BTN(10_000_000));
      await stakeBtn(alice, BTN(10_000_000), 0);

      const stakeStart = await getStakeStart(alice, 0);
      const settleTime = stakeStart + 200 * DAY;
      await time.setNextBlockTimestamp(settleTime);

      await expect(
        rewardEngine.connect(alice).settleWeekly(alice.address)
      ).to.be.revertedWithCustomError(rewardEngine, "InsufficientRewardPool");
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Scenario 10: Cross-contract wiring verification
  // ═══════════════════════════════════════════════════════════

  describe("Scenario 10: Cross-contract role & address verification", function () {
    it("should have all OPERATOR_ROLE grants correct", async function () {
      expect(
        await stakingVault.hasRole(OPERATOR_ROLE, await rewardEngine.getAddress())
      ).to.be.true;
      expect(
        await vestingPool.hasRole(OPERATOR_ROLE, await rewardEngine.getAddress())
      ).to.be.true;
      expect(
        await withdrawalWallet.hasRole(OPERATOR_ROLE, await rewardEngine.getAddress())
      ).to.be.true;
      expect(
        await withdrawalWallet.hasRole(OPERATOR_ROLE, await vestingPool.getAddress())
      ).to.be.true;
      expect(
        await rewardEngine.hasRole(OPERATOR_ROLE, await bonusEngine.getAddress())
      ).to.be.true;
      // RewardEngine needs OPERATOR on BonusEngine (processMatchingBonus)
      expect(
        await bonusEngine.hasRole(OPERATOR_ROLE, await rewardEngine.getAddress())
      ).to.be.true;
    });

    it("should have all contract addresses wired correctly", async function () {
      expect(await stakingVault.vaultManager()).to.equal(
        await vaultManager.getAddress()
      );
      expect(await rewardEngine.stakingVault()).to.equal(
        await stakingVault.getAddress()
      );
      expect(await rewardEngine.vestingPool()).to.equal(
        await vestingPool.getAddress()
      );
      expect(await rewardEngine.withdrawalWallet()).to.equal(
        await withdrawalWallet.getAddress()
      );
      expect(await rewardEngine.vaultManager()).to.equal(
        await vaultManager.getAddress()
      );
      expect(await rewardEngine.bonusEngine()).to.equal(
        await bonusEngine.getAddress()
      );
      expect(await vestingPool.withdrawalWallet()).to.equal(
        await withdrawalWallet.getAddress()
      );
      expect(await bonusEngine.rewardEngine()).to.equal(
        await rewardEngine.getAddress()
      );
      expect(await bonusEngine.vaultManager()).to.equal(
        await vaultManager.getAddress()
      );
      expect(await bonusEngine.stakingVault()).to.equal(
        await stakingVault.getAddress()
      );
    });
  });
});
