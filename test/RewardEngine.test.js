const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("RewardEngine", function () {
  let rewardEngine, stakingVault, vaultMgr;
  let vestingPool, withdrawalWallet, bonusEngine;
  let btnToken, usdt, oracle;
  let admin, user1, user2, treasury, operator;

  const BTN_PRICE = 50_000_000n; // $0.50 (8 dec)
  const ONE_BTN = 1_000_000n;    // 6 decimals
  const STAKE_AMT = 1000n * ONE_BTN; // 1000 BTN
  const FUND_AMT = 100_000n * ONE_BTN; // 100,000 BTN for reward pool

  const SHORT = 0;
  const LONG = 1;
  const DAY = 86400;

  beforeEach(async function () {
    [admin, user1, user2, treasury, operator] = await ethers.getSigners();

    // ─── Deploy base tokens & oracle ─────────────────────
    const BTN = await ethers.getContractFactory("BTNToken");
    btnToken = await BTN.deploy();

    const USDT = await ethers.getContractFactory("MockUSDT");
    usdt = await USDT.deploy();

    const Agg = await ethers.getContractFactory("MockAggregator");
    oracle = await Agg.deploy(BTN_PRICE, 8);

    // ─── Deploy VaultManager ─────────────────────────────
    const VM = await ethers.getContractFactory("VaultManager");
    vaultMgr = await upgrades.deployProxy(
      VM,
      [
        await btnToken.getAddress(),
        await usdt.getAddress(),
        await oracle.getAddress(),
        treasury.address,
        admin.address,
      ],
      { kind: "uups" }
    );

    // ─── Deploy StakingVault ─────────────────────────────
    const SV = await ethers.getContractFactory("StakingVault");
    stakingVault = await upgrades.deployProxy(
      SV,
      [
        await btnToken.getAddress(),
        treasury.address,
        await vaultMgr.getAddress(),
        admin.address,
      ],
      { kind: "uups" }
    );

    // ─── Deploy mocks for downstream contracts ───────────
    const MVP = await ethers.getContractFactory("MockVestingPool");
    vestingPool = await MVP.deploy();

    const MWW = await ethers.getContractFactory("MockWithdrawalWallet");
    withdrawalWallet = await MWW.deploy();

    const MBE = await ethers.getContractFactory("MockBonusEngine");
    bonusEngine = await MBE.deploy();

    // ─── Deploy RewardEngine ─────────────────────────────
    const RE = await ethers.getContractFactory("RewardEngine");
    rewardEngine = await upgrades.deployProxy(
      RE,
      [
        await btnToken.getAddress(),
        await stakingVault.getAddress(),
        await vestingPool.getAddress(),
        await withdrawalWallet.getAddress(),
        await vaultMgr.getAddress(),
        admin.address,
      ],
      { kind: "uups" }
    );

    // ─── Grant RewardEngine OPERATOR_ROLE on StakingVault ─
    const OPERATOR_ROLE = await stakingVault.OPERATOR_ROLE();
    await stakingVault.connect(admin).grantRole(OPERATOR_ROLE, await rewardEngine.getAddress());

    // ─── Grant operator role on RewardEngine ─────────────
    const RE_OPERATOR = await rewardEngine.OPERATOR_ROLE();
    await rewardEngine.connect(admin).grantRole(RE_OPERATOR, operator.address);

    // ─── Fund users with BTN ─────────────────────────────
    await btnToken.transfer(user1.address, 50_000n * ONE_BTN);
    await btnToken.transfer(user2.address, 50_000n * ONE_BTN);

    // ─── Activate T1 vault for user1 (USDT) ──────────────
    await usdt.transfer(user1.address, 1000n * ONE_BTN);
    await usdt.connect(user1).approve(await vaultMgr.getAddress(), 25n * ONE_BTN);
    await vaultMgr.connect(user1).activateVault(1);

    // ─── Approve StakingVault for user1 ──────────────────
    await btnToken.connect(user1).approve(await stakingVault.getAddress(), 50_000n * ONE_BTN);

    // ─── Fund the reward pool ────────────────────────────
    await btnToken.approve(await rewardEngine.getAddress(), FUND_AMT);
    await rewardEngine.fundRewards(FUND_AMT);
  });

  // ─── Helpers ───────────────────────────────────────────────

  async function activateVaultForUser(user, tier) {
    const fee = [0n, 25n, 50n, 100n][tier] * ONE_BTN;
    await usdt.transfer(user.address, fee);
    await usdt.connect(user).approve(await vaultMgr.getAddress(), fee);
    await vaultMgr.connect(user).activateVault(tier);
  }

  /** Get the startTime (= lastRewardTime) of a just-created stake */
  async function getStakeStart(user, stakeIndex) {
    const s = await stakingVault.getStake(user, stakeIndex);
    return Number(s.startTime);
  }

  /**
   * Calculate expected reward using the same formula as StakingVault._calculateReward:
   *   reward = (principal * 5 * multiplier * elapsed) / (10_000 * 86400)
   */
  function calcReward(principal, multiplier, elapsedSec) {
    return (principal * 5n * multiplier * BigInt(elapsedSec)) / (10_000n * BigInt(DAY));
  }

  // ─── Initialization ────────────────────────────────────────

  describe("Initialization", function () {
    it("should set correct initial state", async function () {
      expect(await rewardEngine.btnToken()).to.equal(await btnToken.getAddress());
      expect(await rewardEngine.stakingVault()).to.equal(await stakingVault.getAddress());
      expect(await rewardEngine.vestingPool()).to.equal(await vestingPool.getAddress());
      expect(await rewardEngine.withdrawalWallet()).to.equal(await withdrawalWallet.getAddress());
      expect(await rewardEngine.vaultManager()).to.equal(await vaultMgr.getAddress());
      expect(await rewardEngine.rewardPoolBalance()).to.equal(FUND_AMT);
    });

    it("should grant admin all roles", async function () {
      const DEFAULT_ADMIN = await rewardEngine.DEFAULT_ADMIN_ROLE();
      const OPERATOR = await rewardEngine.OPERATOR_ROLE();
      const EMERGENCY = await rewardEngine.EMERGENCY_ROLE();
      expect(await rewardEngine.hasRole(DEFAULT_ADMIN, admin.address)).to.be.true;
      expect(await rewardEngine.hasRole(OPERATOR, admin.address)).to.be.true;
      expect(await rewardEngine.hasRole(EMERGENCY, admin.address)).to.be.true;
    });

    it("should not allow re-initialization", async function () {
      await expect(
        rewardEngine.initialize(
          await btnToken.getAddress(),
          await stakingVault.getAddress(),
          await vestingPool.getAddress(),
          await withdrawalWallet.getAddress(),
          await vaultMgr.getAddress(),
          admin.address
        )
      ).to.be.reverted;
    });

    it("should revert if btnToken is zero address", async function () {
      const RE = await ethers.getContractFactory("RewardEngine");
      await expect(
        upgrades.deployProxy(
          RE,
          [
            ethers.ZeroAddress,
            await stakingVault.getAddress(),
            await vestingPool.getAddress(),
            await withdrawalWallet.getAddress(),
            await vaultMgr.getAddress(),
            admin.address,
          ],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(RE, "ZeroAddress");
    });

    it("should revert if admin is zero address", async function () {
      const RE = await ethers.getContractFactory("RewardEngine");
      await expect(
        upgrades.deployProxy(
          RE,
          [
            await btnToken.getAddress(),
            await stakingVault.getAddress(),
            await vestingPool.getAddress(),
            await withdrawalWallet.getAddress(),
            await vaultMgr.getAddress(),
            ethers.ZeroAddress,
          ],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(RE, "ZeroAddress");
    });
  });

  // ─── fundRewards ───────────────────────────────────────────

  describe("fundRewards", function () {
    it("should accept BTN deposits and increase rewardPoolBalance", async function () {
      const extraFund = 5000n * ONE_BTN;
      await btnToken.approve(await rewardEngine.getAddress(), extraFund);

      await expect(rewardEngine.fundRewards(extraFund))
        .to.emit(rewardEngine, "RewardsFunded")
        .withArgs(admin.address, extraFund);

      expect(await rewardEngine.rewardPoolBalance()).to.equal(FUND_AMT + extraFund);
    });

    it("should transfer BTN from caller to RewardEngine", async function () {
      const extraFund = 1000n * ONE_BTN;
      await btnToken.approve(await rewardEngine.getAddress(), extraFund);

      const balBefore = await btnToken.balanceOf(admin.address);
      await rewardEngine.fundRewards(extraFund);
      const balAfter = await btnToken.balanceOf(admin.address);

      expect(balBefore - balAfter).to.equal(extraFund);
      expect(await btnToken.balanceOf(await rewardEngine.getAddress())).to.equal(FUND_AMT + extraFund);
    });

    it("should revert on zero amount", async function () {
      await expect(rewardEngine.fundRewards(0))
        .to.be.revertedWithCustomError(rewardEngine, "ZeroAmount");
    });

    it("should allow anyone to fund", async function () {
      await btnToken.transfer(user1.address, 1000n * ONE_BTN);
      await btnToken.connect(user1).approve(await rewardEngine.getAddress(), 1000n * ONE_BTN);
      await expect(rewardEngine.connect(user1).fundRewards(1000n * ONE_BTN))
        .to.emit(rewardEngine, "RewardsFunded");
    });
  });

  // ─── calculateReward ──────────────────────────────────────

  describe("calculateReward", function () {
    it("should delegate to StakingVault.getPendingRewards", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await time.increase(DAY);

      const fromSV = await stakingVault.getPendingRewards(user1.address, 0);
      const fromRE = await rewardEngine.calculateReward(user1.address, 0);
      expect(fromRE).to.equal(fromSV);
      expect(fromRE).to.equal(5n * ONE_BTN); // 1000 BTN * 0.5% * 1.0x = 5 BTN
    });

    it("should revert if stakingVault not set", async function () {
      const RE = await ethers.getContractFactory("RewardEngine");
      const re2 = await upgrades.deployProxy(
        RE,
        [
          await btnToken.getAddress(),
          ethers.ZeroAddress,
          await vestingPool.getAddress(),
          await withdrawalWallet.getAddress(),
          await vaultMgr.getAddress(),
          admin.address,
        ],
        { kind: "uups" }
      );
      await expect(re2.calculateReward(user1.address, 0))
        .to.be.revertedWithCustomError(re2, "StakingVaultNotSet");
    });
  });

  // ─── settleWeekly ─────────────────────────────────────────

  describe("settleWeekly — happy path", function () {
    it("should settle 7-day Short T1 rewards with correct 10/90 split", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      const startTime = await getStakeStart(user1.address, 0);
      const settleTime = startTime + 7 * DAY;
      await time.setNextBlockTimestamp(settleTime);

      // Expected: 1000 BTN * 0.5% * 1.0x * 7 days = 35 BTN
      const expectedReward = calcReward(STAKE_AMT, 10n, 7 * DAY);
      const expectedWithdrawable = (expectedReward * 10n) / 100n;
      const expectedVested = expectedReward - expectedWithdrawable;

      await expect(rewardEngine.connect(user1).settleWeekly(user1.address))
        .to.emit(rewardEngine, "RewardAccrued")
        .withArgs(user1.address, expectedReward)
        .and.to.emit(rewardEngine, "RewardSplit")
        .withArgs(user1.address, expectedWithdrawable, expectedVested);

      // Verify downstream mock balances
      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(expectedWithdrawable);
      expect(await vestingPool.vestedBalance(user1.address)).to.equal(expectedVested);

      // Verify reward pool deducted
      expect(await rewardEngine.rewardPoolBalance()).to.equal(FUND_AMT - expectedReward);
    });

    it("should settle Long staking rewards (1.2x)", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, LONG);
      const startTime = await getStakeStart(user1.address, 0);
      await time.setNextBlockTimestamp(startTime + 7 * DAY);

      // Expected: 1000 BTN * 0.5% * 1.2x * 7 days = 42 BTN
      const expectedReward = calcReward(STAKE_AMT, 12n, 7 * DAY);
      const expectedWithdrawable = (expectedReward * 10n) / 100n;
      const expectedVested = expectedReward - expectedWithdrawable;

      await rewardEngine.connect(user1).settleWeekly(user1.address);

      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(expectedWithdrawable);
      expect(await vestingPool.vestedBalance(user1.address)).to.equal(expectedVested);
    });

    it("should settle Short T2 rewards (1.1x)", async function () {
      // Upgrade to T2
      await usdt.transfer(user1.address, 50n * ONE_BTN);
      await usdt.connect(user1).approve(await vaultMgr.getAddress(), 50n * ONE_BTN);
      await vaultMgr.connect(user1).activateVault(2);

      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      const startTime = await getStakeStart(user1.address, 0);
      await time.setNextBlockTimestamp(startTime + 7 * DAY);

      // 1000 * 0.5% * 1.1 * 7 = 38.5 BTN
      const expectedReward = calcReward(STAKE_AMT, 11n, 7 * DAY);

      await rewardEngine.connect(user1).settleWeekly(user1.address);

      const wBal = await withdrawalWallet.withdrawableBalance(user1.address);
      const vBal = await vestingPool.vestedBalance(user1.address);
      expect(wBal + vBal).to.equal(expectedReward);
      expect(wBal).to.equal((expectedReward * 10n) / 100n);
    });

    it("should settle Short T3 rewards (1.2x)", async function () {
      // Upgrade to T3
      await usdt.transfer(user1.address, 100n * ONE_BTN);
      await usdt.connect(user1).approve(await vaultMgr.getAddress(), 100n * ONE_BTN);
      await vaultMgr.connect(user1).activateVault(3);

      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      const startTime = await getStakeStart(user1.address, 0);
      await time.setNextBlockTimestamp(startTime + 7 * DAY);

      // 1000 * 0.5% * 1.2 * 7 = 42 BTN
      const expectedReward = calcReward(STAKE_AMT, 12n, 7 * DAY);

      await rewardEngine.connect(user1).settleWeekly(user1.address);

      const wBal = await withdrawalWallet.withdrawableBalance(user1.address);
      const vBal = await vestingPool.vestedBalance(user1.address);
      expect(wBal + vBal).to.equal(expectedReward);
    });

    it("should aggregate rewards across multiple active stakes", async function () {
      // user1: 1000 BTN Short + 500 BTN Long
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await stakingVault.connect(user1).stake(500n * ONE_BTN, LONG);

      // Both stakes may have slightly different startTimes (1 block apart)
      const start0 = await getStakeStart(user1.address, 0);
      const start1 = await getStakeStart(user1.address, 1);

      // Settle at a fixed point: max(start0, start1) + 7 days
      const settleTime = Math.max(start0, start1) + 7 * DAY;
      await time.setNextBlockTimestamp(settleTime);

      // Short T1: 1000 * 0.5% * 1.0 * elapsed0
      // Long: 500 * 0.5% * 1.2 * elapsed1
      const expected0 = calcReward(STAKE_AMT, 10n, settleTime - start0);
      const expected1 = calcReward(500n * ONE_BTN, 12n, settleTime - start1);
      const expectedTotal = expected0 + expected1;

      await rewardEngine.connect(user1).settleWeekly(user1.address);

      const wBal = await withdrawalWallet.withdrawableBalance(user1.address);
      const vBal = await vestingPool.vestedBalance(user1.address);
      expect(wBal + vBal).to.equal(expectedTotal);
    });

    it("should skip inactive stakes during settlement", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await stakingVault.connect(user1).stake(500n * ONE_BTN, SHORT);

      // Unstake the first one (early exit)
      await stakingVault.connect(user1).unstake(0);

      // Get start time of the active stake (index 1)
      const start1 = await getStakeStart(user1.address, 1);
      const settleTime = start1 + 7 * DAY;
      await time.setNextBlockTimestamp(settleTime);

      // Only 500 BTN Short T1 active
      const expectedReward = calcReward(500n * ONE_BTN, 10n, 7 * DAY);

      await rewardEngine.connect(user1).settleWeekly(user1.address);

      const wBal = await withdrawalWallet.withdrawableBalance(user1.address);
      const vBal = await vestingPool.vestedBalance(user1.address);
      expect(wBal + vBal).to.equal(expectedReward);
    });

    it("should allow operator to settle for a user", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await time.increase(7 * DAY);

      await expect(rewardEngine.connect(operator).settleWeekly(user1.address))
        .to.emit(rewardEngine, "RewardSplit");
    });

    it("should allow admin (has OPERATOR_ROLE) to settle for a user", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await time.increase(7 * DAY);

      await expect(rewardEngine.connect(admin).settleWeekly(user1.address))
        .to.emit(rewardEngine, "RewardSplit");
    });

    it("should update lastSettlementTime", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await time.increase(7 * DAY);

      expect(await rewardEngine.lastSettlementTime(user1.address)).to.equal(0);
      await rewardEngine.connect(user1).settleWeekly(user1.address);
      expect(await rewardEngine.lastSettlementTime(user1.address)).to.be.gt(0);
    });

    it("should reset pending reward to 0 after settlement", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await time.increase(7 * DAY);

      await rewardEngine.connect(user1).settleWeekly(user1.address);
      expect(await rewardEngine.pendingReward(user1.address)).to.equal(0);
    });

    it("should transfer BTN tokens to downstream contracts", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      const startTime = await getStakeStart(user1.address, 0);
      await time.setNextBlockTimestamp(startTime + 7 * DAY);

      const vpBefore = await btnToken.balanceOf(await vestingPool.getAddress());
      const wwBefore = await btnToken.balanceOf(await withdrawalWallet.getAddress());

      await rewardEngine.connect(user1).settleWeekly(user1.address);

      const expectedReward = calcReward(STAKE_AMT, 10n, 7 * DAY);
      const expectedW = (expectedReward * 10n) / 100n;
      const expectedV = expectedReward - expectedW;

      expect(await btnToken.balanceOf(await withdrawalWallet.getAddress()) - wwBefore).to.equal(expectedW);
      expect(await btnToken.balanceOf(await vestingPool.getAddress()) - vpBefore).to.equal(expectedV);
    });
  });

  // ─── settleWeekly — accumulated rewards ────────────────────

  describe("settleWeekly — accumulated pending rewards", function () {
    it("should include pendingReward added by operator", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      const startTime = await getStakeStart(user1.address, 0);

      // Operator adds 10 BTN bonus to pending
      await rewardEngine.connect(admin).addPendingReward(user1.address, 10n * ONE_BTN);

      await time.setNextBlockTimestamp(startTime + 7 * DAY);

      // Total = 35 BTN (staking) + 10 BTN (bonus) = 45 BTN
      const stakingReward = calcReward(STAKE_AMT, 10n, 7 * DAY);
      const expectedTotal = stakingReward + 10n * ONE_BTN;

      await rewardEngine.connect(user1).settleWeekly(user1.address);

      const wBal = await withdrawalWallet.withdrawableBalance(user1.address);
      const vBal = await vestingPool.vestedBalance(user1.address);
      expect(wBal + vBal).to.equal(expectedTotal);
    });

    it("should settle correctly when only pending reward exists (no active stakes)", async function () {
      // User has vault but no active stakes — just a pending bonus
      await rewardEngine.connect(admin).addPendingReward(user1.address, 20n * ONE_BTN);

      await rewardEngine.connect(user1).settleWeekly(user1.address);

      const wBal = await withdrawalWallet.withdrawableBalance(user1.address);
      const vBal = await vestingPool.vestedBalance(user1.address);
      expect(wBal + vBal).to.equal(20n * ONE_BTN);
    });
  });

  // ─── settleWeekly — consecutive settlements ────────────────

  describe("settleWeekly — consecutive settlements", function () {
    it("should reset lastRewardTime and accumulate correctly across settlements", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      const startTime = await getStakeStart(user1.address, 0);

      // First settlement after exactly 7 days
      const firstSettleTime = startTime + 7 * DAY;
      await time.setNextBlockTimestamp(firstSettleTime);
      await rewardEngine.connect(user1).settleWeekly(user1.address);

      const firstW = await withdrawalWallet.withdrawableBalance(user1.address);
      const firstV = await vestingPool.vestedBalance(user1.address);
      const firstTotal = firstW + firstV;
      expect(firstTotal).to.equal(calcReward(STAKE_AMT, 10n, 7 * DAY));

      // Second settlement after another exactly 7 days
      // After resetLastRewardTime, the new lastRewardTime = firstSettleTime
      const secondSettleTime = firstSettleTime + 7 * DAY;
      await time.setNextBlockTimestamp(secondSettleTime);
      await rewardEngine.connect(user1).settleWeekly(user1.address);

      const secondW = await withdrawalWallet.withdrawableBalance(user1.address);
      const secondV = await vestingPool.vestedBalance(user1.address);
      const secondTotal = secondW + secondV;
      // Total should be 2 * 35 BTN = 70 BTN
      expect(secondTotal).to.equal(2n * calcReward(STAKE_AMT, 10n, 7 * DAY));
    });

    it("should accrue exact 1-day reward after reset", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      const startTime = await getStakeStart(user1.address, 0);

      // Settle after 1 day
      const firstSettleTime = startTime + DAY;
      await time.setNextBlockTimestamp(firstSettleTime);
      await rewardEngine.connect(user1).settleWeekly(user1.address);

      const first = await withdrawalWallet.withdrawableBalance(user1.address)
                   + await vestingPool.vestedBalance(user1.address);
      expect(first).to.equal(calcReward(STAKE_AMT, 10n, DAY));

      // Settle after another day
      const secondSettleTime = firstSettleTime + DAY;
      await time.setNextBlockTimestamp(secondSettleTime);
      await rewardEngine.connect(user1).settleWeekly(user1.address);

      const second = await withdrawalWallet.withdrawableBalance(user1.address)
                    + await vestingPool.vestedBalance(user1.address);
      expect(second).to.equal(2n * calcReward(STAKE_AMT, 10n, DAY));
    });
  });

  // ─── settleWeekly — error cases ────────────────────────────

  describe("settleWeekly — error cases", function () {
    it("should revert if called by non-user and non-operator", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await time.increase(7 * DAY);

      await expect(rewardEngine.connect(user2).settleWeekly(user1.address))
        .to.be.revertedWithCustomError(rewardEngine, "NotUserOrOperator");
    });

    it("should revert if vault not active", async function () {
      // user2 has no vault
      await expect(rewardEngine.connect(user2).settleWeekly(user2.address))
        .to.be.revertedWithCustomError(rewardEngine, "VaultNotActive");
    });

    it("should revert if no rewards to claim", async function () {
      // user1 has vault but no stakes and no pending
      await expect(rewardEngine.connect(user1).settleWeekly(user1.address))
        .to.be.revertedWithCustomError(rewardEngine, "NoRewardsToClaim");
    });

    it("should revert if reward pool insufficient", async function () {
      await btnToken.connect(user1).approve(await stakingVault.getAddress(), 50_000n * ONE_BTN);
      await stakingVault.connect(user1).stake(40_000n * ONE_BTN, SHORT);

      // 40000 BTN * 0.5% * 1.0 * 600 days = 120,000 BTN > 100,000 BTN pool
      await time.increase(600 * DAY);

      await expect(rewardEngine.connect(user1).settleWeekly(user1.address))
        .to.be.revertedWithCustomError(rewardEngine, "InsufficientRewardPool");
    });

    it("should revert if stakingVault not set", async function () {
      const RE = await ethers.getContractFactory("RewardEngine");
      const re2 = await upgrades.deployProxy(
        RE,
        [
          await btnToken.getAddress(),
          ethers.ZeroAddress,
          await vestingPool.getAddress(),
          await withdrawalWallet.getAddress(),
          await vaultMgr.getAddress(),
          admin.address,
        ],
        { kind: "uups" }
      );
      await expect(re2.connect(user1).settleWeekly(user1.address))
        .to.be.revertedWithCustomError(re2, "StakingVaultNotSet");
    });

    it("should revert if vestingPool not set", async function () {
      const RE = await ethers.getContractFactory("RewardEngine");
      const re2 = await upgrades.deployProxy(
        RE,
        [
          await btnToken.getAddress(),
          await stakingVault.getAddress(),
          ethers.ZeroAddress,
          await withdrawalWallet.getAddress(),
          await vaultMgr.getAddress(),
          admin.address,
        ],
        { kind: "uups" }
      );
      await expect(re2.connect(user1).settleWeekly(user1.address))
        .to.be.revertedWithCustomError(re2, "VestingPoolNotSet");
    });

    it("should revert if withdrawalWallet not set", async function () {
      const RE = await ethers.getContractFactory("RewardEngine");
      const re2 = await upgrades.deployProxy(
        RE,
        [
          await btnToken.getAddress(),
          await stakingVault.getAddress(),
          await vestingPool.getAddress(),
          ethers.ZeroAddress,
          await vaultMgr.getAddress(),
          admin.address,
        ],
        { kind: "uups" }
      );
      await expect(re2.connect(user1).settleWeekly(user1.address))
        .to.be.revertedWithCustomError(re2, "WithdrawalWalletNotSet");
    });
  });

  // ─── settleWeekly — BonusEngine integration ────────────────

  describe("settleWeekly — BonusEngine integration", function () {
    it("should call processMatchingBonus when bonusEngine is wired", async function () {
      await rewardEngine.connect(admin).setBonusEngine(await bonusEngine.getAddress());

      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      const startTime = await getStakeStart(user1.address, 0);
      await time.setNextBlockTimestamp(startTime + 7 * DAY);

      await rewardEngine.connect(user1).settleWeekly(user1.address);

      const expectedReward = calcReward(STAKE_AMT, 10n, 7 * DAY);

      // Verify mock recorded the call
      expect(await bonusEngine.getBonusCallCount()).to.equal(1);
      const call = await bonusEngine.bonusCalls(0);
      expect(call.user).to.equal(user1.address);
      expect(call.rewardAmount).to.equal(expectedReward);
    });

    it("should skip BonusEngine when not wired (address(0))", async function () {
      // bonusEngine not set by default in RewardEngine
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await time.increase(7 * DAY);

      // Should not revert
      await rewardEngine.connect(user1).settleWeekly(user1.address);
      expect(await bonusEngine.getBonusCallCount()).to.equal(0);
    });
  });

  // ─── settleWeekly — vault gating bypass ─────────────────────

  describe("settleWeekly — vault gating bypass", function () {
    it("should allow settlement when vaultManager is address(0)", async function () {
      // Deploy RewardEngine without VaultManager
      const RE = await ethers.getContractFactory("RewardEngine");
      const re2 = await upgrades.deployProxy(
        RE,
        [
          await btnToken.getAddress(),
          await stakingVault.getAddress(),
          await vestingPool.getAddress(),
          await withdrawalWallet.getAddress(),
          ethers.ZeroAddress, // no vault manager
          admin.address,
        ],
        { kind: "uups" }
      );

      // Grant OPERATOR_ROLE on StakingVault to re2
      const OPERATOR_ROLE = await stakingVault.OPERATOR_ROLE();
      await stakingVault.connect(admin).grantRole(OPERATOR_ROLE, await re2.getAddress());

      // Fund reward pool
      await btnToken.approve(await re2.getAddress(), FUND_AMT);
      await re2.fundRewards(FUND_AMT);

      // Disable gating on StakingVault too
      await stakingVault.connect(admin).setVaultManager(ethers.ZeroAddress);

      // user2 has no vault, but gating is off
      await btnToken.connect(user2).approve(await stakingVault.getAddress(), STAKE_AMT);
      await stakingVault.connect(user2).stake(STAKE_AMT, SHORT);
      const startTime = await getStakeStart(user2.address, 0);

      await time.setNextBlockTimestamp(startTime + 7 * DAY);

      // Use admin (operator) to settle for user2
      await re2.connect(admin).settleWeekly(user2.address);

      const wBal = await withdrawalWallet.withdrawableBalance(user2.address);
      const vBal = await vestingPool.vestedBalance(user2.address);
      expect(wBal + vBal).to.equal(calcReward(STAKE_AMT, 10n, 7 * DAY));
    });
  });

  // ─── addPendingReward ──────────────────────────────────────

  describe("addPendingReward", function () {
    it("should add to user pending balance", async function () {
      await expect(rewardEngine.connect(admin).addPendingReward(user1.address, 10n * ONE_BTN))
        .to.emit(rewardEngine, "RewardAccrued")
        .withArgs(user1.address, 10n * ONE_BTN);

      expect(await rewardEngine.pendingReward(user1.address)).to.equal(10n * ONE_BTN);
    });

    it("should accumulate across multiple calls", async function () {
      await rewardEngine.connect(admin).addPendingReward(user1.address, 10n * ONE_BTN);
      await rewardEngine.connect(admin).addPendingReward(user1.address, 5n * ONE_BTN);
      expect(await rewardEngine.pendingReward(user1.address)).to.equal(15n * ONE_BTN);
    });

    it("should revert if called by non-operator", async function () {
      await expect(rewardEngine.connect(user1).addPendingReward(user1.address, 10n * ONE_BTN))
        .to.be.reverted;
    });

    it("should revert on zero address", async function () {
      await expect(rewardEngine.connect(admin).addPendingReward(ethers.ZeroAddress, 10n * ONE_BTN))
        .to.be.revertedWithCustomError(rewardEngine, "ZeroAddress");
    });

    it("should revert on zero amount", async function () {
      await expect(rewardEngine.connect(admin).addPendingReward(user1.address, 0))
        .to.be.revertedWithCustomError(rewardEngine, "ZeroAmount");
    });
  });

  // ─── getTotalPending ───────────────────────────────────────

  describe("getTotalPending", function () {
    it("should return combined pending + accruing rewards", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      const startTime = await getStakeStart(user1.address, 0);

      // Add bonus
      await rewardEngine.connect(admin).addPendingReward(user1.address, 10n * ONE_BTN);

      // Set time for the view call — advance time and query
      await time.setNextBlockTimestamp(startTime + 7 * DAY);
      await ethers.provider.send("evm_mine", []); // mine so time advances

      const total = await rewardEngine.getTotalPending(user1.address);
      // 35 BTN (staking) + 10 BTN (bonus) = 45 BTN
      const expectedStaking = calcReward(STAKE_AMT, 10n, 7 * DAY);
      expect(total).to.equal(expectedStaking + 10n * ONE_BTN);
    });

    it("should return 0 for user with no activity", async function () {
      expect(await rewardEngine.getTotalPending(user2.address)).to.equal(0);
    });

    it("should only count active stakes", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await stakingVault.connect(user1).stake(500n * ONE_BTN, SHORT);

      // Unstake first
      await stakingVault.connect(user1).unstake(0);

      // Get start time of active stake
      const start1 = await getStakeStart(user1.address, 1);
      await time.setNextBlockTimestamp(start1 + 7 * DAY);
      await ethers.provider.send("evm_mine", []);

      // Only 500 BTN active
      const total = await rewardEngine.getTotalPending(user1.address);
      const expected = calcReward(500n * ONE_BTN, 10n, 7 * DAY);
      expect(total).to.equal(expected);
    });
  });

  // ─── 10/90 split precision ─────────────────────────────────

  describe("10/90 split precision", function () {
    it("should handle odd amounts correctly (no dust loss)", async function () {
      await rewardEngine.connect(admin).addPendingReward(user1.address, 33n * ONE_BTN);

      await rewardEngine.connect(user1).settleWeekly(user1.address);

      const wBal = await withdrawalWallet.withdrawableBalance(user1.address);
      const vBal = await vestingPool.vestedBalance(user1.address);
      expect(wBal).to.equal(3_300_000n);
      expect(vBal).to.equal(29_700_000n);
      expect(wBal + vBal).to.equal(33n * ONE_BTN);
    });

    it("should handle tiny reward (1 BTN unit = 0.000001 BTN)", async function () {
      await rewardEngine.connect(admin).addPendingReward(user1.address, 1n);

      await rewardEngine.connect(user1).settleWeekly(user1.address);

      const wBal = await withdrawalWallet.withdrawableBalance(user1.address);
      const vBal = await vestingPool.vestedBalance(user1.address);
      expect(wBal).to.equal(0n);
      expect(vBal).to.equal(1n);
    });

    it("should handle 9 units (withdrawable rounds down to 0)", async function () {
      await rewardEngine.connect(admin).addPendingReward(user1.address, 9n);

      await rewardEngine.connect(user1).settleWeekly(user1.address);

      const wBal = await withdrawalWallet.withdrawableBalance(user1.address);
      const vBal = await vestingPool.vestedBalance(user1.address);
      expect(wBal).to.equal(0n);
      expect(vBal).to.equal(9n);
    });

    it("should handle 10 units correctly", async function () {
      await rewardEngine.connect(admin).addPendingReward(user1.address, 10n);

      await rewardEngine.connect(user1).settleWeekly(user1.address);

      const wBal = await withdrawalWallet.withdrawableBalance(user1.address);
      const vBal = await vestingPool.vestedBalance(user1.address);
      expect(wBal).to.equal(1n);
      expect(vBal).to.equal(9n);
    });
  });

  // ─── Admin setters ─────────────────────────────────────────

  describe("Admin setters", function () {
    it("should allow admin to update stakingVault", async function () {
      await expect(rewardEngine.connect(admin).setStakingVault(user2.address))
        .to.emit(rewardEngine, "StakingVaultUpdated");
      expect(await rewardEngine.stakingVault()).to.equal(user2.address);
    });

    it("should allow admin to update vestingPool", async function () {
      await expect(rewardEngine.connect(admin).setVestingPool(user2.address))
        .to.emit(rewardEngine, "VestingPoolUpdated");
      expect(await rewardEngine.vestingPool()).to.equal(user2.address);
    });

    it("should allow admin to update withdrawalWallet", async function () {
      await expect(rewardEngine.connect(admin).setWithdrawalWallet(user2.address))
        .to.emit(rewardEngine, "WithdrawalWalletUpdated");
      expect(await rewardEngine.withdrawalWallet()).to.equal(user2.address);
    });

    it("should allow admin to update bonusEngine", async function () {
      await expect(rewardEngine.connect(admin).setBonusEngine(user2.address))
        .to.emit(rewardEngine, "BonusEngineUpdated");
      expect(await rewardEngine.bonusEngine()).to.equal(user2.address);
    });

    it("should allow admin to update vaultManager", async function () {
      await expect(rewardEngine.connect(admin).setVaultManager(user2.address))
        .to.emit(rewardEngine, "VaultManagerUpdated");
      expect(await rewardEngine.vaultManager()).to.equal(user2.address);
    });

    it("should revert if non-admin calls setters", async function () {
      await expect(rewardEngine.connect(user1).setStakingVault(user2.address)).to.be.reverted;
      await expect(rewardEngine.connect(user1).setVestingPool(user2.address)).to.be.reverted;
      await expect(rewardEngine.connect(user1).setWithdrawalWallet(user2.address)).to.be.reverted;
      await expect(rewardEngine.connect(user1).setBonusEngine(user2.address)).to.be.reverted;
      await expect(rewardEngine.connect(user1).setVaultManager(user2.address)).to.be.reverted;
    });
  });

  // ─── Pausable ──────────────────────────────────────────────

  describe("Pausable", function () {
    it("should block settleWeekly when paused", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await time.increase(7 * DAY);

      await rewardEngine.connect(admin).pause();
      await expect(rewardEngine.connect(user1).settleWeekly(user1.address))
        .to.be.reverted;
    });

    it("should resume after unpause", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await time.increase(7 * DAY);

      await rewardEngine.connect(admin).pause();
      await rewardEngine.connect(admin).unpause();

      await expect(rewardEngine.connect(user1).settleWeekly(user1.address))
        .to.emit(rewardEngine, "RewardSplit");
    });

    it("should revert if non-emergency pauses", async function () {
      await expect(rewardEngine.connect(user1).pause()).to.be.reverted;
    });

    it("should revert if non-admin unpauses", async function () {
      await rewardEngine.connect(admin).pause();
      await expect(rewardEngine.connect(user1).unpause()).to.be.reverted;
    });
  });

  // ─── UUPS upgrade ─────────────────────────────────────────

  describe("UUPS upgrade", function () {
    it("should allow admin to upgrade", async function () {
      const REv2 = await ethers.getContractFactory("RewardEngine");
      const upgraded = await upgrades.upgradeProxy(await rewardEngine.getAddress(), REv2);
      expect(await upgraded.getAddress()).to.equal(await rewardEngine.getAddress());
    });

    it("should reject upgrade from non-admin", async function () {
      const REv2 = await ethers.getContractFactory("RewardEngine", user1);
      await expect(upgrades.upgradeProxy(await rewardEngine.getAddress(), REv2))
        .to.be.reverted;
    });
  });

  // ─── Multi-user scenarios ─────────────────────────────────

  describe("Multi-user scenarios", function () {
    it("should settle independently for two users", async function () {
      // Activate user2
      await activateVaultForUser(user2, 1);
      await btnToken.connect(user2).approve(await stakingVault.getAddress(), 10_000n * ONE_BTN);

      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await stakingVault.connect(user2).stake(2000n * ONE_BTN, SHORT);

      const start1 = await getStakeStart(user1.address, 0);
      const start2 = await getStakeStart(user2.address, 0);

      // Settle both at same time: max start + 7 days
      const settleTime = Math.max(start1, start2) + 7 * DAY;

      await time.setNextBlockTimestamp(settleTime);
      await rewardEngine.connect(user1).settleWeekly(user1.address);

      await time.setNextBlockTimestamp(settleTime + 1);
      await rewardEngine.connect(user2).settleWeekly(user2.address);

      const u1Reward = calcReward(STAKE_AMT, 10n, settleTime - start1);
      const u2Reward = calcReward(2000n * ONE_BTN, 10n, settleTime + 1 - start2);

      const u1Total = await withdrawalWallet.withdrawableBalance(user1.address)
                     + await vestingPool.vestedBalance(user1.address);
      const u2Total = await withdrawalWallet.withdrawableBalance(user2.address)
                     + await vestingPool.vestedBalance(user2.address);

      expect(u1Total).to.equal(u1Reward);
      expect(u2Total).to.equal(u2Reward);

      // Pool should be deducted by both
      expect(await rewardEngine.rewardPoolBalance()).to.equal(FUND_AMT - u1Reward - u2Reward);
    });
  });

  // ─── Edge cases ────────────────────────────────────────────

  describe("Edge cases", function () {
    it("should handle settlement with minimal time elapsed (1 second)", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      const startTime = await getStakeStart(user1.address, 0);

      // Settle 1 second after staking
      await time.setNextBlockTimestamp(startTime + 1);

      // reward = (1000e6 * 5 * 10 * 1) / (10_000 * 86400) = 0 (rounds to 0 due to integer div)
      // Actually: 50_000_000_000 / 864_000_000 = 57 (not zero)
      // So there IS a tiny reward
      const expectedReward = calcReward(STAKE_AMT, 10n, 1);

      if (expectedReward > 0n) {
        await rewardEngine.connect(user1).settleWeekly(user1.address);
        const total = await withdrawalWallet.withdrawableBalance(user1.address)
                     + await vestingPool.vestedBalance(user1.address);
        expect(total).to.equal(expectedReward);
      } else {
        await expect(rewardEngine.connect(user1).settleWeekly(user1.address))
          .to.be.revertedWithCustomError(rewardEngine, "NoRewardsToClaim");
      }
    });

    it("should handle large accumulated rewards across 30 days", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      const startTime = await getStakeStart(user1.address, 0);

      await time.setNextBlockTimestamp(startTime + 30 * DAY);

      // 1000 * 0.5% * 1.0 * 30 = 150 BTN
      const expectedReward = calcReward(STAKE_AMT, 10n, 30 * DAY);

      await rewardEngine.connect(user1).settleWeekly(user1.address);

      const total = await withdrawalWallet.withdrawableBalance(user1.address)
                   + await vestingPool.vestedBalance(user1.address);
      expect(total).to.equal(expectedReward);
    });

    it("should handle per-second precision in settlement", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      const startTime = await getStakeStart(user1.address, 0);

      // Advance exactly 1 hour (3600 seconds)
      await time.setNextBlockTimestamp(startTime + 3600);

      const expectedReward = calcReward(STAKE_AMT, 10n, 3600);

      await rewardEngine.connect(user1).settleWeekly(user1.address);

      const total = await withdrawalWallet.withdrawableBalance(user1.address)
                   + await vestingPool.vestedBalance(user1.address);
      expect(total).to.equal(expectedReward);
    });
  });
});
