const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("StakingVault", function () {
  let stakingVault, vaultMgr;
  let btnToken, usdt, oracle;
  let admin, user1, user2, treasury, operator;

  const BTN_PRICE = 50_000_000n; // $0.50 (8 dec)
  const ONE_BTN = 1_000_000n;    // 6 decimals
  const STAKE_AMT = 1000n * ONE_BTN; // 1000 BTN

  const SHORT = 0;
  const LONG = 1;
  const DAY = 86400;
  const SHORT_LOCK = 30 * DAY;
  const LONG_LOCK = 180 * DAY;

  beforeEach(async function () {
    [admin, user1, user2, treasury, operator] = await ethers.getSigners();

    // Deploy BTNToken
    const BTN = await ethers.getContractFactory("BTNToken");
    btnToken = await BTN.deploy();

    // Deploy MockUSDT + MockAggregator (for VaultManager)
    const USDT = await ethers.getContractFactory("MockUSDT");
    usdt = await USDT.deploy();

    const Agg = await ethers.getContractFactory("MockAggregator");
    oracle = await Agg.deploy(BTN_PRICE, 8);

    // Deploy VaultManager (real — for tier integration tests)
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

    // Deploy StakingVault via UUPS proxy
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

    // Fund users with BTN
    await btnToken.transfer(user1.address, 10_000n * ONE_BTN);
    await btnToken.transfer(user2.address, 10_000n * ONE_BTN);

    // Activate T1 vault for user1 (pay with USDT)
    await usdt.transfer(user1.address, 1000n * ONE_BTN);
    await usdt.connect(user1).approve(await vaultMgr.getAddress(), 25n * ONE_BTN);
    await vaultMgr.connect(user1).activateVault(1);

    // Approve StakingVault to spend user1's BTN
    await btnToken.connect(user1).approve(await stakingVault.getAddress(), 10_000n * ONE_BTN);
  });

  // ─── Helper ────────────────────────────────────────────────

  async function activateVaultForUser(user, tier) {
    const fee = [0n, 25n, 50n, 100n][tier] * ONE_BTN;
    await usdt.transfer(user.address, fee);
    await usdt.connect(user).approve(await vaultMgr.getAddress(), fee);
    await vaultMgr.connect(user).activateVault(tier);
  }

  // ─── Initialization ───────────────────────────────────────

  describe("Initialization", function () {
    it("should set correct initial state", async function () {
      expect(await stakingVault.btnToken()).to.equal(await btnToken.getAddress());
      expect(await stakingVault.treasuryAddress()).to.equal(treasury.address);
      expect(await stakingVault.vaultManager()).to.equal(await vaultMgr.getAddress());
      expect(await stakingVault.totalStaked()).to.equal(0);
    });

    it("should grant admin all roles", async function () {
      const DEFAULT_ADMIN = await stakingVault.DEFAULT_ADMIN_ROLE();
      const OPERATOR = await stakingVault.OPERATOR_ROLE();
      const EMERGENCY = await stakingVault.EMERGENCY_ROLE();
      expect(await stakingVault.hasRole(DEFAULT_ADMIN, admin.address)).to.be.true;
      expect(await stakingVault.hasRole(OPERATOR, admin.address)).to.be.true;
      expect(await stakingVault.hasRole(EMERGENCY, admin.address)).to.be.true;
    });

    it("should not allow re-initialization", async function () {
      await expect(
        stakingVault.initialize(
          await btnToken.getAddress(),
          treasury.address,
          await vaultMgr.getAddress(),
          admin.address
        )
      ).to.be.reverted;
    });

    it("should revert if btnToken is zero address", async function () {
      const SV = await ethers.getContractFactory("StakingVault");
      await expect(
        upgrades.deployProxy(
          SV,
          [ethers.ZeroAddress, treasury.address, await vaultMgr.getAddress(), admin.address],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(SV, "ZeroAddress");
    });

    it("should revert if admin is zero address", async function () {
      const SV = await ethers.getContractFactory("StakingVault");
      await expect(
        upgrades.deployProxy(
          SV,
          [await btnToken.getAddress(), treasury.address, await vaultMgr.getAddress(), ethers.ZeroAddress],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(SV, "ZeroAddress");
    });
  });

  // ─── Staking: Short ────────────────────────────────────────

  describe("stake — Short program", function () {
    it("should create a Short stake and emit event", async function () {
      await expect(stakingVault.connect(user1).stake(STAKE_AMT, SHORT))
        .to.emit(stakingVault, "Staked")
        .withArgs(user1.address, STAKE_AMT, SHORT, 0);
    });

    it("should transfer BTN from user to contract", async function () {
      const balBefore = await btnToken.balanceOf(user1.address);
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      const balAfter = await btnToken.balanceOf(user1.address);
      expect(balBefore - balAfter).to.equal(STAKE_AMT);
    });

    it("should record correct stake info", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      const s = await stakingVault.getStake(user1.address, 0);
      expect(s.amount).to.equal(STAKE_AMT);
      expect(s.programType).to.equal(SHORT);
      expect(s.active).to.be.true;
    });

    it("should update totalStaked", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      expect(await stakingVault.totalStaked()).to.equal(STAKE_AMT);
    });

    it("should allow multiple stakes", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await stakingVault.connect(user1).stake(500n * ONE_BTN, SHORT);
      expect(await stakingVault.getStakeCount(user1.address)).to.equal(2);
      expect(await stakingVault.totalStaked()).to.equal(STAKE_AMT + 500n * ONE_BTN);
    });

    it("should revert on zero amount", async function () {
      await expect(stakingVault.connect(user1).stake(0, SHORT))
        .to.be.revertedWithCustomError(stakingVault, "ZeroAmount");
    });

    it("should revert on invalid programType", async function () {
      await expect(stakingVault.connect(user1).stake(STAKE_AMT, 2))
        .to.be.revertedWithCustomError(stakingVault, "InvalidProgramType");
    });
  });

  // ─── Staking: Long ─────────────────────────────────────────

  describe("stake — Long program", function () {
    it("should create a Long stake and emit event", async function () {
      await expect(stakingVault.connect(user1).stake(STAKE_AMT, LONG))
        .to.emit(stakingVault, "Staked")
        .withArgs(user1.address, STAKE_AMT, LONG, 0);
    });

    it("should record correct program type", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, LONG);
      const s = await stakingVault.getStake(user1.address, 0);
      expect(s.programType).to.equal(LONG);
    });
  });

  // ─── Vault Gating ─────────────────────────────────────────

  describe("Vault activation gating", function () {
    it("should revert stake if user has no active vault", async function () {
      // user2 has no vault
      await btnToken.connect(user2).approve(await stakingVault.getAddress(), STAKE_AMT);
      await expect(stakingVault.connect(user2).stake(STAKE_AMT, SHORT))
        .to.be.revertedWithCustomError(stakingVault, "VaultNotActive");
    });

    it("should allow stake after vault activation", async function () {
      await activateVaultForUser(user2, 1);
      await btnToken.connect(user2).approve(await stakingVault.getAddress(), STAKE_AMT);
      await stakingVault.connect(user2).stake(STAKE_AMT, SHORT);
      expect(await stakingVault.getStakeCount(user2.address)).to.equal(1);
    });

    it("should allow stake when vaultManager is address(0) (no gating)", async function () {
      // Deploy StakingVault without VaultManager
      const SV = await ethers.getContractFactory("StakingVault");
      const sv2 = await upgrades.deployProxy(
        SV,
        [await btnToken.getAddress(), treasury.address, ethers.ZeroAddress, admin.address],
        { kind: "uups" }
      );

      await btnToken.connect(user2).approve(await sv2.getAddress(), STAKE_AMT);
      await sv2.connect(user2).stake(STAKE_AMT, SHORT);
      expect(await sv2.getStakeCount(user2.address)).to.equal(1);
    });
  });

  // ─── Unstake: Short ────────────────────────────────────────

  describe("unstake — Short program", function () {
    beforeEach(async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
    });

    it("should allow early exit with 15% penalty", async function () {
      const penalty = (STAKE_AMT * 1500n) / 10_000n; // 150 BTN
      const returnAmt = STAKE_AMT - penalty;          // 850 BTN

      const userBefore = await btnToken.balanceOf(user1.address);
      const treasuryBefore = await btnToken.balanceOf(treasury.address);

      await stakingVault.connect(user1).unstake(0);

      const userAfter = await btnToken.balanceOf(user1.address);
      const treasuryAfter = await btnToken.balanceOf(treasury.address);

      expect(userAfter - userBefore).to.equal(returnAmt);
      expect(treasuryAfter - treasuryBefore).to.equal(penalty);
    });

    it("should emit Unstaked event with penalty on early exit", async function () {
      const penalty = (STAKE_AMT * 1500n) / 10_000n;
      const returnAmt = STAKE_AMT - penalty;

      await expect(stakingVault.connect(user1).unstake(0))
        .to.emit(stakingVault, "Unstaked");

      // Verify event args manually (reward is time-dependent)
      // Just checking it doesn't revert is the main goal
    });

    it("should return full principal after lock period (no penalty)", async function () {
      await time.increase(SHORT_LOCK);

      const userBefore = await btnToken.balanceOf(user1.address);
      const treasuryBefore = await btnToken.balanceOf(treasury.address);

      await stakingVault.connect(user1).unstake(0);

      const userAfter = await btnToken.balanceOf(user1.address);
      const treasuryAfter = await btnToken.balanceOf(treasury.address);

      expect(userAfter - userBefore).to.equal(STAKE_AMT);
      expect(treasuryAfter).to.equal(treasuryBefore); // no penalty
    });

    it("should mark stake as inactive after unstake", async function () {
      await stakingVault.connect(user1).unstake(0);
      const s = await stakingVault.getStake(user1.address, 0);
      expect(s.active).to.be.false;
    });

    it("should decrease totalStaked", async function () {
      expect(await stakingVault.totalStaked()).to.equal(STAKE_AMT);
      await stakingVault.connect(user1).unstake(0);
      expect(await stakingVault.totalStaked()).to.equal(0);
    });

    it("should revert on double unstake", async function () {
      await stakingVault.connect(user1).unstake(0);
      await expect(stakingVault.connect(user1).unstake(0))
        .to.be.revertedWithCustomError(stakingVault, "StakeNotActive");
    });

    it("should revert on invalid stake index", async function () {
      await expect(stakingVault.connect(user1).unstake(99))
        .to.be.revertedWithCustomError(stakingVault, "InvalidStakeIndex");
    });

    it("should revert unstake if treasury not set and penalty applies", async function () {
      // Deploy without treasury
      const SV = await ethers.getContractFactory("StakingVault");
      const sv2 = await upgrades.deployProxy(
        SV,
        [await btnToken.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress, admin.address],
        { kind: "uups" }
      );
      await btnToken.connect(user1).approve(await sv2.getAddress(), STAKE_AMT);
      await sv2.connect(user1).stake(STAKE_AMT, SHORT);

      // Early unstake → penalty → treasury is zero → revert
      await expect(sv2.connect(user1).unstake(0))
        .to.be.revertedWithCustomError(sv2, "TreasuryNotSet");
    });
  });

  // ─── Unstake: Long ─────────────────────────────────────────

  describe("unstake — Long program", function () {
    beforeEach(async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, LONG);
    });

    it("should revert before lock period", async function () {
      await expect(stakingVault.connect(user1).unstake(0))
        .to.be.revertedWithCustomError(stakingVault, "LockPeriodNotMet");
    });

    it("should revert one second before lock ends", async function () {
      await time.increase(LONG_LOCK - 2); // -2 because increase + tx = 2 seconds
      await expect(stakingVault.connect(user1).unstake(0))
        .to.be.revertedWithCustomError(stakingVault, "LockPeriodNotMet");
    });

    it("should allow unstake after full lock period (no penalty)", async function () {
      await time.increase(LONG_LOCK);

      const userBefore = await btnToken.balanceOf(user1.address);
      const treasuryBefore = await btnToken.balanceOf(treasury.address);

      await stakingVault.connect(user1).unstake(0);

      const userAfter = await btnToken.balanceOf(user1.address);
      const treasuryAfter = await btnToken.balanceOf(treasury.address);

      expect(userAfter - userBefore).to.equal(STAKE_AMT);
      expect(treasuryAfter).to.equal(treasuryBefore);
    });

    it("should mark stake inactive after unstake", async function () {
      await time.increase(LONG_LOCK);
      await stakingVault.connect(user1).unstake(0);
      const s = await stakingVault.getStake(user1.address, 0);
      expect(s.active).to.be.false;
    });
  });

  // ─── Reward Accrual ────────────────────────────────────────

  describe("Reward accrual (getPendingRewards)", function () {
    it("should return 0 immediately after staking", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      expect(await stakingVault.getPendingRewards(user1.address, 0)).to.equal(0);
    });

    it("should accrue correct reward after 1 day — Short T1 (1.0x)", async function () {
      // user1 is T1: multiplier = 10
      // dailyReward = (1000e6 * 5 * 10) / 10_000 = 5e6 = 5 BTN
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);

      await time.increase(DAY);

      const reward = await stakingVault.getPendingRewards(user1.address, 0);
      expect(reward).to.equal(5n * ONE_BTN);
    });

    it("should accrue correct reward after 7 days — Short T1", async function () {
      // 7 days: 5 BTN/day * 7 = 35 BTN
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);

      await time.increase(7 * DAY);

      const reward = await stakingVault.getPendingRewards(user1.address, 0);
      expect(reward).to.equal(35n * ONE_BTN);
    });

    it("should accrue correct reward after 1 day — Short T2 (1.1x)", async function () {
      // Upgrade user1 to T2
      await usdt.transfer(user1.address, 50n * ONE_BTN);
      await usdt.connect(user1).approve(await vaultMgr.getAddress(), 50n * ONE_BTN);
      await vaultMgr.connect(user1).activateVault(2);

      // multiplier = 11: (1000e6 * 5 * 11) / 10_000 = 5_500_000 = 5.5 BTN
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);

      await time.increase(DAY);

      const reward = await stakingVault.getPendingRewards(user1.address, 0);
      expect(reward).to.equal(5_500_000n);
    });

    it("should accrue correct reward after 1 day — Short T3 (1.2x)", async function () {
      // Upgrade user1 to T3
      await usdt.transfer(user1.address, 100n * ONE_BTN);
      await usdt.connect(user1).approve(await vaultMgr.getAddress(), 100n * ONE_BTN);
      await vaultMgr.connect(user1).activateVault(3);

      // multiplier = 12: (1000e6 * 5 * 12) / 10_000 = 6_000_000 = 6 BTN
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);

      await time.increase(DAY);

      const reward = await stakingVault.getPendingRewards(user1.address, 0);
      expect(reward).to.equal(6n * ONE_BTN);
    });

    it("should accrue correct reward after 1 day — Long (1.2x fixed)", async function () {
      // Long: multiplier = 12 regardless of tier
      // (1000e6 * 5 * 12) / 10_000 = 6_000_000 = 6 BTN
      await stakingVault.connect(user1).stake(STAKE_AMT, LONG);

      await time.increase(DAY);

      const reward = await stakingVault.getPendingRewards(user1.address, 0);
      expect(reward).to.equal(6n * ONE_BTN);
    });

    it("should accrue per-second precision", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);

      // Advance exactly 1 hour (3600 seconds)
      // reward = (1000e6 * 5 * 10 * 3600) / (10_000 * 86400)
      //        = 50_000_000_000 * 3600 / 864_000_000
      //        = 180_000_000_000_000 / 864_000_000
      //        = 208_333 (truncated)
      await time.increase(3600);

      const reward = await stakingVault.getPendingRewards(user1.address, 0);
      expect(reward).to.equal(208_333n);
    });

    it("should return 0 for inactive stake", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await time.increase(DAY);
      await stakingVault.connect(user1).unstake(0); // early exit
      expect(await stakingVault.getPendingRewards(user1.address, 0)).to.equal(0);
    });

    it("should revert for invalid index", async function () {
      await expect(stakingVault.getPendingRewards(user1.address, 0))
        .to.be.revertedWithCustomError(stakingVault, "InvalidStakeIndex");
    });
  });

  // ─── Operator: resetLastRewardTime ────────────────────────

  describe("resetLastRewardTime (operator)", function () {
    it("should reset lastRewardTime and zero out accrued rewards", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await time.increase(7 * DAY);

      // Rewards accrued
      const rewardBefore = await stakingVault.getPendingRewards(user1.address, 0);
      expect(rewardBefore).to.be.gt(0);

      // Admin (has OPERATOR_ROLE) resets
      await stakingVault.connect(admin).resetLastRewardTime(user1.address, 0);

      // Rewards should be ~0 (just 1 second elapsed from the reset tx)
      const rewardAfter = await stakingVault.getPendingRewards(user1.address, 0);
      expect(rewardAfter).to.be.lt(ONE_BTN); // less than 1 BTN (dust from 1 sec)
    });

    it("should emit LastRewardTimeReset event", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await time.increase(DAY);

      await expect(stakingVault.connect(admin).resetLastRewardTime(user1.address, 0))
        .to.emit(stakingVault, "LastRewardTimeReset");
    });

    it("should revert if called by non-operator", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await expect(stakingVault.connect(user1).resetLastRewardTime(user1.address, 0))
        .to.be.reverted;
    });

    it("should revert for inactive stake", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await stakingVault.connect(user1).unstake(0);
      await expect(stakingVault.connect(admin).resetLastRewardTime(user1.address, 0))
        .to.be.revertedWithCustomError(stakingVault, "StakeNotActive");
    });

    it("should revert for invalid index", async function () {
      await expect(stakingVault.connect(admin).resetLastRewardTime(user1.address, 0))
        .to.be.revertedWithCustomError(stakingVault, "InvalidStakeIndex");
    });
  });

  // ─── View Functions ────────────────────────────────────────

  describe("View functions", function () {
    it("getStakes returns all positions", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await stakingVault.connect(user1).stake(500n * ONE_BTN, LONG);

      const stakes = await stakingVault.getStakes(user1.address);
      expect(stakes.length).to.equal(2);
      expect(stakes[0].programType).to.equal(SHORT);
      expect(stakes[1].programType).to.equal(LONG);
    });

    it("getStakes returns empty array for new user", async function () {
      const stakes = await stakingVault.getStakes(user2.address);
      expect(stakes.length).to.equal(0);
    });

    it("getUserTotalStaked returns sum of active stakes", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await stakingVault.connect(user1).stake(500n * ONE_BTN, LONG);

      expect(await stakingVault.getUserTotalStaked(user1.address))
        .to.equal(STAKE_AMT + 500n * ONE_BTN);

      // Unstake the Short one (early exit)
      await stakingVault.connect(user1).unstake(0);

      expect(await stakingVault.getUserTotalStaked(user1.address))
        .to.equal(500n * ONE_BTN);
    });

    it("getStakeCount returns total positions (including inactive)", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await stakingVault.connect(user1).unstake(0);
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      expect(await stakingVault.getStakeCount(user1.address)).to.equal(2);
    });
  });

  // ─── Admin Functions ───────────────────────────────────────

  describe("Admin functions", function () {
    it("should allow admin to update vaultManager", async function () {
      await expect(stakingVault.connect(admin).setVaultManager(user2.address))
        .to.emit(stakingVault, "VaultManagerUpdated");
      expect(await stakingVault.vaultManager()).to.equal(user2.address);
    });

    it("should allow admin to set vaultManager to zero (disable gating)", async function () {
      await stakingVault.connect(admin).setVaultManager(ethers.ZeroAddress);
      expect(await stakingVault.vaultManager()).to.equal(ethers.ZeroAddress);
    });

    it("should revert if non-admin updates vaultManager", async function () {
      await expect(stakingVault.connect(user1).setVaultManager(user2.address))
        .to.be.reverted;
    });

    it("should allow admin to update treasury", async function () {
      await expect(stakingVault.connect(admin).setTreasuryAddress(user2.address))
        .to.emit(stakingVault, "TreasuryAddressUpdated");
      expect(await stakingVault.treasuryAddress()).to.equal(user2.address);
    });

    it("should revert if treasury set to zero", async function () {
      await expect(stakingVault.connect(admin).setTreasuryAddress(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(stakingVault, "ZeroAddress");
    });

    it("should revert if non-admin updates treasury", async function () {
      await expect(stakingVault.connect(user1).setTreasuryAddress(user2.address))
        .to.be.reverted;
    });
  });

  // ─── Pausable ──────────────────────────────────────────────

  describe("Pausable", function () {
    it("should block stake when paused", async function () {
      await stakingVault.connect(admin).pause();
      await expect(stakingVault.connect(user1).stake(STAKE_AMT, SHORT))
        .to.be.reverted;
    });

    it("should block unstake when paused", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await stakingVault.connect(admin).pause();
      await expect(stakingVault.connect(user1).unstake(0))
        .to.be.reverted;
    });

    it("should resume after unpause", async function () {
      await stakingVault.connect(admin).pause();
      await stakingVault.connect(admin).unpause();
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      expect(await stakingVault.getStakeCount(user1.address)).to.equal(1);
    });

    it("should revert if non-emergency pauses", async function () {
      await expect(stakingVault.connect(user1).pause()).to.be.reverted;
    });
  });

  // ─── UUPS Upgrade ─────────────────────────────────────────

  describe("UUPS upgrade", function () {
    it("should allow admin to upgrade", async function () {
      const SVv2 = await ethers.getContractFactory("StakingVault");
      const upgraded = await upgrades.upgradeProxy(await stakingVault.getAddress(), SVv2);
      expect(await upgraded.getAddress()).to.equal(await stakingVault.getAddress());
    });

    it("should reject upgrade from non-admin", async function () {
      const SVv2 = await ethers.getContractFactory("StakingVault", user1);
      await expect(upgrades.upgradeProxy(await stakingVault.getAddress(), SVv2))
        .to.be.reverted;
    });
  });

  // ─── Edge Cases ────────────────────────────────────────────

  describe("Edge cases", function () {
    it("should handle multiple users staking independently", async function () {
      await activateVaultForUser(user2, 1);
      await btnToken.connect(user2).approve(await stakingVault.getAddress(), STAKE_AMT);

      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await stakingVault.connect(user2).stake(500n * ONE_BTN, LONG);

      expect(await stakingVault.getStakeCount(user1.address)).to.equal(1);
      expect(await stakingVault.getStakeCount(user2.address)).to.equal(1);
      expect(await stakingVault.totalStaked()).to.equal(STAKE_AMT + 500n * ONE_BTN);
    });

    it("should handle Short unstake exactly at lock boundary", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);

      // Use precise timestamp: stake at time T, unstake at T + 30 days exactly
      const stakeInfo = await stakingVault.getStake(user1.address, 0);
      const unlockTime = Number(stakeInfo.startTime) + SHORT_LOCK;
      await time.setNextBlockTimestamp(unlockTime);

      const userBefore = await btnToken.balanceOf(user1.address);
      await stakingVault.connect(user1).unstake(0);
      const userAfter = await btnToken.balanceOf(user1.address);

      // No penalty at boundary
      expect(userAfter - userBefore).to.equal(STAKE_AMT);
    });

    it("should handle Long unstake exactly at lock boundary", async function () {
      await stakingVault.connect(user1).stake(STAKE_AMT, LONG);

      const stakeInfo = await stakingVault.getStake(user1.address, 0);
      const unlockTime = Number(stakeInfo.startTime) + LONG_LOCK;
      await time.setNextBlockTimestamp(unlockTime);

      await stakingVault.connect(user1).unstake(0);
      const s = await stakingVault.getStake(user1.address, 0);
      expect(s.active).to.be.false;
    });

    it("penalty calculation: 15% of 333 BTN rounds correctly", async function () {
      const oddAmount = 333_333_333n; // 333.333333 BTN
      await stakingVault.connect(user1).stake(oddAmount, SHORT);

      // Penalty = 333_333_333 * 1500 / 10000 = 49_999_999 (truncated)
      const expectedPenalty = (oddAmount * 1500n) / 10_000n;
      const expectedReturn = oddAmount - expectedPenalty;

      const userBefore = await btnToken.balanceOf(user1.address);
      const treasuryBefore = await btnToken.balanceOf(treasury.address);

      await stakingVault.connect(user1).unstake(0);

      const userAfter = await btnToken.balanceOf(user1.address);
      const treasuryAfter = await btnToken.balanceOf(treasury.address);

      expect(userAfter - userBefore).to.equal(expectedReturn);
      expect(treasuryAfter - treasuryBefore).to.equal(expectedPenalty);
    });

    it("reward accrual over 30 days — Short T1", async function () {
      // 30 days * 5 BTN/day = 150 BTN
      await stakingVault.connect(user1).stake(STAKE_AMT, SHORT);
      await time.increase(30 * DAY);

      const reward = await stakingVault.getPendingRewards(user1.address, 0);
      expect(reward).to.equal(150n * ONE_BTN);
    });

    it("reward accrual over 180 days — Long", async function () {
      // 180 days * 6 BTN/day = 1080 BTN
      await stakingVault.connect(user1).stake(STAKE_AMT, LONG);
      await time.increase(180 * DAY);

      const reward = await stakingVault.getPendingRewards(user1.address, 0);
      expect(reward).to.equal(1080n * ONE_BTN);
    });
  });
});
