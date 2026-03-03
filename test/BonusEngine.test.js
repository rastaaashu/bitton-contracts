const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("BonusEngine", function () {
  // ─── Constants ─────────────────────────────────────────────
  const BTN = (n) => ethers.parseUnits(String(n), 6);
  const DIRECT_BONUS_BPS = 500n; // 5%
  const MIN_PERSONAL_STAKE = BTN(500);
  const ZERO_ADDRESS = ethers.ZeroAddress;

  // ─── Fixtures ──────────────────────────────────────────────
  let admin, operator, user1, user2, user3, user4, user5;
  let btnToken, bonusEngine;
  let mockRewardEngine, mockVaultManager, mockStakingVault;

  // Matching BPS per level
  const matchingBps = [0, 1000, 500, 300, 100, 100, 100, 100, 100, 100, 100]; // index 0 unused

  beforeEach(async function () {
    [admin, operator, user1, user2, user3, user4, user5] =
      await ethers.getSigners();

    // Deploy mock BTN token
    const MockToken = await ethers.getContractFactory("MockUSDT");
    btnToken = await MockToken.deploy();
    await btnToken.waitForDeployment();

    // Deploy mock contracts
    mockRewardEngine = await deployMockRewardEngine();
    mockVaultManager = await deployMockVaultManager();
    mockStakingVault = await deployMockStakingVault();

    // Deploy BonusEngine
    const BonusEngine = await ethers.getContractFactory("BonusEngine");
    bonusEngine = await upgrades.deployProxy(
      BonusEngine,
      [
        await mockRewardEngine.getAddress(),
        await mockVaultManager.getAddress(),
        await mockStakingVault.getAddress(),
        admin.address,
      ],
      { kind: "uups" }
    );
    await bonusEngine.waitForDeployment();

    // Grant OPERATOR_ROLE to operator
    const OPERATOR_ROLE = await bonusEngine.OPERATOR_ROLE();
    await bonusEngine.grantRole(OPERATOR_ROLE, operator.address);

    // Grant BonusEngine OPERATOR_ROLE on MockRewardEngine so it can call addPendingReward
    await mockRewardEngine.grantOperator(await bonusEngine.getAddress());
  });

  // ─── Mock Contracts ────────────────────────────────────────

  async function deployMockRewardEngine() {
    // Minimal mock that tracks addPendingReward calls
    const factory = await ethers.getContractFactory("MockRewardEngineForBonus");
    const mock = await factory.deploy();
    await mock.waitForDeployment();
    return mock;
  }

  async function deployMockVaultManager() {
    const factory = await ethers.getContractFactory("MockVaultManagerForBonus");
    const mock = await factory.deploy();
    await mock.waitForDeployment();
    return mock;
  }

  async function deployMockStakingVault() {
    const factory = await ethers.getContractFactory(
      "MockStakingVaultForBonus"
    );
    const mock = await factory.deploy();
    await mock.waitForDeployment();
    return mock;
  }

  // ─── Helpers ───────────────────────────────────────────────

  /** Set user as qualified: active vault at given tier + sufficient stake */
  async function qualifyUser(user, tier, stake) {
    await mockVaultManager.setVaultActive(user.address, true);
    await mockVaultManager.setUserTier(user.address, tier);
    await mockStakingVault.setUserTotalStaked(user.address, stake || MIN_PERSONAL_STAKE);
  }

  // ═══════════════════════════════════════════════════════════
  // Tests
  // ═══════════════════════════════════════════════════════════

  describe("Initialization", function () {
    it("should set correct initial state", async function () {
      expect(await bonusEngine.rewardEngine()).to.equal(
        await mockRewardEngine.getAddress()
      );
      expect(await bonusEngine.vaultManager()).to.equal(
        await mockVaultManager.getAddress()
      );
      expect(await bonusEngine.stakingVault()).to.equal(
        await mockStakingVault.getAddress()
      );
    });

    it("should grant admin all roles", async function () {
      const DEFAULT_ADMIN = await bonusEngine.DEFAULT_ADMIN_ROLE();
      const OPERATOR = await bonusEngine.OPERATOR_ROLE();
      const EMERGENCY = await bonusEngine.EMERGENCY_ROLE();
      expect(await bonusEngine.hasRole(DEFAULT_ADMIN, admin.address)).to.be
        .true;
      expect(await bonusEngine.hasRole(OPERATOR, admin.address)).to.be.true;
      expect(await bonusEngine.hasRole(EMERGENCY, admin.address)).to.be.true;
    });

    it("should initialize matching BPS correctly", async function () {
      expect(await bonusEngine.matchingBps(1)).to.equal(1000n); // 10%
      expect(await bonusEngine.matchingBps(2)).to.equal(500n); // 5%
      expect(await bonusEngine.matchingBps(3)).to.equal(300n); // 3%
      for (let i = 4; i <= 10; i++) {
        expect(await bonusEngine.matchingBps(i)).to.equal(100n); // 1%
      }
    });

    it("should initialize tier depth limits correctly", async function () {
      expect(await bonusEngine.tierMaxDepth(1)).to.equal(3);
      expect(await bonusEngine.tierMaxDepth(2)).to.equal(5);
      expect(await bonusEngine.tierMaxDepth(3)).to.equal(10);
    });

    it("should not allow re-initialization", async function () {
      await expect(
        bonusEngine.initialize(ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, admin.address)
      ).to.be.reverted;
    });

    it("should revert if admin is zero address", async function () {
      const BonusEngine = await ethers.getContractFactory("BonusEngine");
      await expect(
        upgrades.deployProxy(
          BonusEngine,
          [ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(BonusEngine, "ZeroAddress");
    });

    it("should allow dependencies to be zero address on init (set later)", async function () {
      const BonusEngine = await ethers.getContractFactory("BonusEngine");
      const be = await upgrades.deployProxy(
        BonusEngine,
        [ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, admin.address],
        { kind: "uups" }
      );
      await be.waitForDeployment();
      expect(await be.rewardEngine()).to.equal(ZERO_ADDRESS);
    });
  });

  // ─── Register Referrer ─────────────────────────────────────

  describe("registerReferrer", function () {
    it("should register referrer and emit event", async function () {
      await expect(bonusEngine.connect(user1).registerReferrer(user2.address))
        .to.emit(bonusEngine, "ReferrerRegistered")
        .withArgs(user1.address, user2.address);

      expect(await bonusEngine.getReferrer(user1.address)).to.equal(
        user2.address
      );
    });

    it("should add user to referrer's downline", async function () {
      await bonusEngine.connect(user1).registerReferrer(user2.address);
      const downline = await bonusEngine.getDownline(user2.address);
      expect(downline).to.deep.equal([user1.address]);
    });

    it("should allow multiple users to register same referrer", async function () {
      await bonusEngine.connect(user1).registerReferrer(user3.address);
      await bonusEngine.connect(user2).registerReferrer(user3.address);
      expect(await bonusEngine.getDownlineCount(user3.address)).to.equal(2n);
    });

    it("should revert on self-referral", async function () {
      await expect(
        bonusEngine.connect(user1).registerReferrer(user1.address)
      ).to.be.revertedWithCustomError(bonusEngine, "SelfReferral");
    });

    it("should revert on zero address referrer", async function () {
      await expect(
        bonusEngine.connect(user1).registerReferrer(ZERO_ADDRESS)
      ).to.be.revertedWithCustomError(bonusEngine, "ZeroAddress");
    });

    it("should revert if referrer already set", async function () {
      await bonusEngine.connect(user1).registerReferrer(user2.address);
      await expect(
        bonusEngine.connect(user1).registerReferrer(user3.address)
      ).to.be.revertedWithCustomError(bonusEngine, "ReferrerAlreadySet");
    });

    it("should revert on circular referral (A→B→A)", async function () {
      // user1's referrer is user2
      await bonusEngine.connect(user1).registerReferrer(user2.address);
      // user2 tries to set referrer as user1 (circular)
      await expect(
        bonusEngine.connect(user2).registerReferrer(user1.address)
      ).to.be.revertedWithCustomError(bonusEngine, "CircularReferral");
    });

    it("should revert on deep circular referral (A→B→C→A)", async function () {
      await bonusEngine.connect(user1).registerReferrer(user2.address);
      await bonusEngine.connect(user2).registerReferrer(user3.address);
      await expect(
        bonusEngine.connect(user3).registerReferrer(user1.address)
      ).to.be.revertedWithCustomError(bonusEngine, "CircularReferral");
    });

    it("should allow valid chain (A→B→C, no circle)", async function () {
      await bonusEngine.connect(user1).registerReferrer(user2.address);
      await bonusEngine.connect(user2).registerReferrer(user3.address);
      expect(await bonusEngine.getReferrer(user1.address)).to.equal(user2.address);
      expect(await bonusEngine.getReferrer(user2.address)).to.equal(user3.address);
    });
  });

  // ─── Direct Bonus ──────────────────────────────────────────

  describe("processDirectBonus", function () {
    beforeEach(async function () {
      // user1's referrer is user2
      await bonusEngine.connect(user1).registerReferrer(user2.address);
    });

    it("should add 5% of stake as pending reward to referrer", async function () {
      const stakeAmount = BTN(1000);
      const expectedBonus = (stakeAmount * DIRECT_BONUS_BPS) / 10_000n; // 50 BTN

      await expect(
        bonusEngine.connect(operator).processDirectBonus(user1.address, stakeAmount)
      )
        .to.emit(bonusEngine, "DirectBonusProcessed")
        .withArgs(user2.address, user1.address, stakeAmount, expectedBonus);

      // Check mock reward engine received the call
      expect(await mockRewardEngine.pendingRewards(user2.address)).to.equal(
        expectedBonus
      );
    });

    it("should do nothing if staker has no referrer", async function () {
      // user3 has no referrer
      await bonusEngine
        .connect(operator)
        .processDirectBonus(user3.address, BTN(1000));
      // No revert, no reward added
      expect(await mockRewardEngine.pendingRewards(user3.address)).to.equal(0n);
    });

    it("should handle small stake (bonus rounds to 0)", async function () {
      // 1 unit → 5% = 0.05 → rounds to 0
      await bonusEngine.connect(operator).processDirectBonus(user1.address, 1n);
      expect(await mockRewardEngine.pendingRewards(user2.address)).to.equal(0n);
    });

    it("should handle precise 5% calculation", async function () {
      // 333 BTN → 5% = 16.65 BTN = 16_650_000 units
      const stakeAmount = BTN(333);
      const expectedBonus = (stakeAmount * 500n) / 10_000n;
      await bonusEngine
        .connect(operator)
        .processDirectBonus(user1.address, stakeAmount);
      expect(await mockRewardEngine.pendingRewards(user2.address)).to.equal(
        expectedBonus
      );
    });

    it("should revert if called by non-operator", async function () {
      await expect(
        bonusEngine.connect(user1).processDirectBonus(user1.address, BTN(100))
      ).to.be.reverted;
    });

    it("should revert if rewardEngine not set", async function () {
      await bonusEngine.connect(admin).setRewardEngine(ZERO_ADDRESS);
      await expect(
        bonusEngine.connect(operator).processDirectBonus(user1.address, BTN(100))
      ).to.be.revertedWithCustomError(bonusEngine, "RewardEngineNotSet");
    });

    it("should accumulate across multiple stakes", async function () {
      await bonusEngine.connect(operator).processDirectBonus(user1.address, BTN(1000));
      await bonusEngine.connect(operator).processDirectBonus(user1.address, BTN(2000));
      const expected = (BTN(1000) * 500n) / 10_000n + (BTN(2000) * 500n) / 10_000n;
      expect(await mockRewardEngine.pendingRewards(user2.address)).to.equal(expected);
    });
  });

  // ─── Matching Bonus ────────────────────────────────────────

  describe("processMatchingBonus", function () {
    // Chain: user1 → user2 → user3 → user4 → user5
    beforeEach(async function () {
      await bonusEngine.connect(user1).registerReferrer(user2.address);
      await bonusEngine.connect(user2).registerReferrer(user3.address);
      await bonusEngine.connect(user3).registerReferrer(user4.address);
      await bonusEngine.connect(user4).registerReferrer(user5.address);
    });

    it("should distribute matching bonus to L1 ancestor (T1)", async function () {
      await qualifyUser(user2, 1); // T1, 3 levels
      const rewardAmount = BTN(1000);
      const expectedL1 = (rewardAmount * 1000n) / 10_000n; // 10% = 100 BTN

      await expect(
        bonusEngine.connect(operator).processMatchingBonus(user1.address, rewardAmount)
      )
        .to.emit(bonusEngine, "MatchingBonusProcessed")
        .withArgs(user2.address, user1.address, expectedL1, 1);

      expect(await mockRewardEngine.pendingRewards(user2.address)).to.equal(expectedL1);
    });

    it("should distribute to L1-L3 for T1 qualified chain", async function () {
      await qualifyUser(user2, 1);
      await qualifyUser(user3, 1);
      await qualifyUser(user4, 1);

      const rewardAmount = BTN(1000);
      await bonusEngine.connect(operator).processMatchingBonus(user1.address, rewardAmount);

      // L1=10%, L2=5%, L3=3%
      expect(await mockRewardEngine.pendingRewards(user2.address)).to.equal(
        (rewardAmount * 1000n) / 10_000n
      );
      expect(await mockRewardEngine.pendingRewards(user3.address)).to.equal(
        (rewardAmount * 500n) / 10_000n
      );
      expect(await mockRewardEngine.pendingRewards(user4.address)).to.equal(
        (rewardAmount * 300n) / 10_000n
      );
    });

    it("should stop at T1 depth limit (3 levels)", async function () {
      await qualifyUser(user2, 1);
      await qualifyUser(user3, 1);
      await qualifyUser(user4, 1);
      await qualifyUser(user5, 1); // L4 — should NOT receive

      const rewardAmount = BTN(1000);
      await bonusEngine.connect(operator).processMatchingBonus(user1.address, rewardAmount);

      // user5 is L4, T1 only allows 3 levels
      expect(await mockRewardEngine.pendingRewards(user5.address)).to.equal(0n);
    });

    it("should distribute to L1-L5 for T2 qualified chain", async function () {
      // Need deeper chain. Extend beyond user5.
      const signers = await ethers.getSigners();
      const user6 = signers[7];
      const user7 = signers[8];

      await bonusEngine.connect(user5).registerReferrer(user6.address);
      await bonusEngine.connect(user6).registerReferrer(user7.address);

      // Qualify all as T2
      await qualifyUser(user2, 2);
      await qualifyUser(user3, 2);
      await qualifyUser(user4, 2);
      await qualifyUser(user5, 2);
      await qualifyUser(user6, 2);
      await qualifyUser(user7, 2);

      const rewardAmount = BTN(1000);
      await bonusEngine.connect(operator).processMatchingBonus(user1.address, rewardAmount);

      // L1=10%, L2=5%, L3=3%, L4=1%, L5=1%
      // user2=L1, user3=L2, user4=L3, user5=L4, user6=L5
      expect(await mockRewardEngine.pendingRewards(user2.address)).to.equal(
        (rewardAmount * 1000n) / 10_000n
      );
      expect(await mockRewardEngine.pendingRewards(user5.address)).to.equal(
        (rewardAmount * 100n) / 10_000n
      );
      expect(await mockRewardEngine.pendingRewards(user6.address)).to.equal(
        (rewardAmount * 100n) / 10_000n
      );
      // L6 for T2 should not receive
      expect(await mockRewardEngine.pendingRewards(user7.address)).to.equal(0n);
    });

    it("should skip unqualified ancestors (no vault)", async function () {
      // user2 not qualified (no vault), user3 qualified
      await qualifyUser(user3, 1);
      // user2 has no active vault

      const rewardAmount = BTN(1000);
      await bonusEngine.connect(operator).processMatchingBonus(user1.address, rewardAmount);

      // user2 skipped (unqualified), user3 gets L2 bonus
      expect(await mockRewardEngine.pendingRewards(user2.address)).to.equal(0n);
      expect(await mockRewardEngine.pendingRewards(user3.address)).to.equal(
        (rewardAmount * 500n) / 10_000n
      );
    });

    it("should skip ancestors with insufficient personal stake", async function () {
      // user2 has vault active but only 100 BTN staked (< 500 BTN minimum)
      await mockVaultManager.setVaultActive(user2.address, true);
      await mockVaultManager.setUserTier(user2.address, 3);
      await mockStakingVault.setUserTotalStaked(user2.address, BTN(100));

      // user3 qualified
      await qualifyUser(user3, 3);

      const rewardAmount = BTN(1000);
      await bonusEngine.connect(operator).processMatchingBonus(user1.address, rewardAmount);

      expect(await mockRewardEngine.pendingRewards(user2.address)).to.equal(0n);
      expect(await mockRewardEngine.pendingRewards(user3.address)).to.equal(
        (rewardAmount * 500n) / 10_000n
      );
    });

    it("should do nothing if user has no referrer", async function () {
      // user5 has no referrer above (end of chain)
      const signers = await ethers.getSigners();
      const noRefUser = signers[8];
      await bonusEngine.connect(operator).processMatchingBonus(noRefUser.address, BTN(1000));
      // No revert, no bonuses
    });

    it("should revert if called by non-operator", async function () {
      await expect(
        bonusEngine.connect(user1).processMatchingBonus(user1.address, BTN(100))
      ).to.be.reverted;
    });

    it("should revert if rewardEngine not set", async function () {
      await bonusEngine.connect(admin).setRewardEngine(ZERO_ADDRESS);
      await expect(
        bonusEngine.connect(operator).processMatchingBonus(user1.address, BTN(100))
      ).to.be.revertedWithCustomError(bonusEngine, "RewardEngineNotSet");
    });

    it("should handle zero reward amount (no bonus distributed)", async function () {
      await qualifyUser(user2, 3);
      await bonusEngine.connect(operator).processMatchingBonus(user1.address, 0n);
      expect(await mockRewardEngine.pendingRewards(user2.address)).to.equal(0n);
    });

    it("should handle mixed tiers in the chain", async function () {
      // user2=T3 (10 levels), user3=T1 (3 levels), user4=T2 (5 levels)
      await qualifyUser(user2, 3);
      await qualifyUser(user3, 1);
      await qualifyUser(user4, 2);

      const rewardAmount = BTN(1000);
      await bonusEngine.connect(operator).processMatchingBonus(user1.address, rewardAmount);

      // user2 is L1 — T3 allows up to L10, gets L1 bonus (10%)
      expect(await mockRewardEngine.pendingRewards(user2.address)).to.equal(
        (rewardAmount * 1000n) / 10_000n
      );
      // user3 is L2 — T1 allows up to L3, L2 within limit, gets L2 bonus (5%)
      expect(await mockRewardEngine.pendingRewards(user3.address)).to.equal(
        (rewardAmount * 500n) / 10_000n
      );
      // user4 is L3 — T2 allows up to L5, L3 within limit, gets L3 bonus (3%)
      expect(await mockRewardEngine.pendingRewards(user4.address)).to.equal(
        (rewardAmount * 300n) / 10_000n
      );
    });
  });

  // ─── isQualified view ──────────────────────────────────────

  describe("isQualified", function () {
    it("should return true for qualified user at valid level", async function () {
      await qualifyUser(user1, 3);
      expect(await bonusEngine.isQualified(user1.address, 10)).to.be.true;
    });

    it("should return false for user without active vault", async function () {
      await mockStakingVault.setUserTotalStaked(user1.address, MIN_PERSONAL_STAKE);
      // vault not active
      expect(await bonusEngine.isQualified(user1.address, 1)).to.be.false;
    });

    it("should return false if level exceeds tier depth", async function () {
      await qualifyUser(user1, 1); // T1 = 3 levels max
      expect(await bonusEngine.isQualified(user1.address, 4)).to.be.false;
    });

    it("should return false if personal stake below 500 BTN", async function () {
      await mockVaultManager.setVaultActive(user1.address, true);
      await mockVaultManager.setUserTier(user1.address, 3);
      await mockStakingVault.setUserTotalStaked(user1.address, BTN(499));
      expect(await bonusEngine.isQualified(user1.address, 1)).to.be.false;
    });

    it("should return true if personal stake exactly 500 BTN", async function () {
      await qualifyUser(user1, 1, BTN(500));
      expect(await bonusEngine.isQualified(user1.address, 1)).to.be.true;
    });

    it("should return true when vaultManager is zero (permissive)", async function () {
      await bonusEngine.connect(admin).setVaultManager(ZERO_ADDRESS);
      await mockStakingVault.setUserTotalStaked(user1.address, MIN_PERSONAL_STAKE);
      expect(await bonusEngine.isQualified(user1.address, 10)).to.be.true;
    });

    it("should return true when stakingVault is zero (permissive)", async function () {
      await bonusEngine.connect(admin).setStakingVault(ZERO_ADDRESS);
      await mockVaultManager.setVaultActive(user1.address, true);
      await mockVaultManager.setUserTier(user1.address, 3);
      expect(await bonusEngine.isQualified(user1.address, 5)).to.be.true;
    });
  });

  // ─── Views ─────────────────────────────────────────────────

  describe("View functions", function () {
    it("getReferrer returns zero for unregistered user", async function () {
      expect(await bonusEngine.getReferrer(user1.address)).to.equal(ZERO_ADDRESS);
    });

    it("getDownline returns empty for user with no referrals", async function () {
      const downline = await bonusEngine.getDownline(user1.address);
      expect(downline.length).to.equal(0);
    });

    it("getDownlineCount returns 0 for new user", async function () {
      expect(await bonusEngine.getDownlineCount(user1.address)).to.equal(0n);
    });

    it("getDownline returns correct array after registrations", async function () {
      await bonusEngine.connect(user1).registerReferrer(user3.address);
      await bonusEngine.connect(user2).registerReferrer(user3.address);
      const downline = await bonusEngine.getDownline(user3.address);
      expect(downline).to.deep.equal([user1.address, user2.address]);
      expect(await bonusEngine.getDownlineCount(user3.address)).to.equal(2n);
    });
  });

  // ─── Admin Setters ─────────────────────────────────────────

  describe("Admin setters", function () {
    it("should allow admin to set rewardEngine", async function () {
      await bonusEngine.connect(admin).setRewardEngine(user1.address);
      expect(await bonusEngine.rewardEngine()).to.equal(user1.address);
    });

    it("should allow admin to set vaultManager", async function () {
      await bonusEngine.connect(admin).setVaultManager(user1.address);
      expect(await bonusEngine.vaultManager()).to.equal(user1.address);
    });

    it("should allow admin to set stakingVault", async function () {
      await bonusEngine.connect(admin).setStakingVault(user1.address);
      expect(await bonusEngine.stakingVault()).to.equal(user1.address);
    });

    it("should revert if non-admin calls setters", async function () {
      await expect(
        bonusEngine.connect(user1).setRewardEngine(user1.address)
      ).to.be.reverted;
      await expect(
        bonusEngine.connect(user1).setVaultManager(user1.address)
      ).to.be.reverted;
      await expect(
        bonusEngine.connect(user1).setStakingVault(user1.address)
      ).to.be.reverted;
    });
  });

  // ─── Pausable ──────────────────────────────────────────────

  describe("Pausable", function () {
    it("should block registerReferrer when paused", async function () {
      await bonusEngine.connect(admin).pause();
      await expect(
        bonusEngine.connect(user1).registerReferrer(user2.address)
      ).to.be.reverted;
    });

    it("should block processDirectBonus when paused", async function () {
      await bonusEngine.connect(user1).registerReferrer(user2.address);
      await bonusEngine.connect(admin).pause();
      await expect(
        bonusEngine.connect(operator).processDirectBonus(user1.address, BTN(100))
      ).to.be.reverted;
    });

    it("should block processMatchingBonus when paused", async function () {
      await bonusEngine.connect(admin).pause();
      await expect(
        bonusEngine.connect(operator).processMatchingBonus(user1.address, BTN(100))
      ).to.be.reverted;
    });

    it("should resume after unpause", async function () {
      await bonusEngine.connect(admin).pause();
      await bonusEngine.connect(admin).unpause();
      await bonusEngine.connect(user1).registerReferrer(user2.address);
      expect(await bonusEngine.getReferrer(user1.address)).to.equal(user2.address);
    });

    it("should revert if non-emergency pauses", async function () {
      await expect(bonusEngine.connect(user1).pause()).to.be.reverted;
    });

    it("should revert if non-admin unpauses", async function () {
      await bonusEngine.connect(admin).pause();
      await expect(bonusEngine.connect(user1).unpause()).to.be.reverted;
    });
  });

  // ─── UUPS Upgrade ─────────────────────────────────────────

  describe("UUPS upgrade", function () {
    it("should allow admin to upgrade", async function () {
      const BonusEngineV2 = await ethers.getContractFactory("BonusEngine");
      await upgrades.upgradeProxy(await bonusEngine.getAddress(), BonusEngineV2);
    });

    it("should reject upgrade from non-admin", async function () {
      const BonusEngineV2 = await ethers.getContractFactory(
        "BonusEngine",
        user1
      );
      await expect(
        upgrades.upgradeProxy(await bonusEngine.getAddress(), BonusEngineV2)
      ).to.be.reverted;
    });
  });

  // ─── Edge cases ────────────────────────────────────────────

  describe("Edge cases", function () {
    it("should handle very large stake for direct bonus", async function () {
      await bonusEngine.connect(user1).registerReferrer(user2.address);
      const largeStake = BTN(1_000_000);
      const expectedBonus = (largeStake * 500n) / 10_000n;
      await bonusEngine.connect(operator).processDirectBonus(user1.address, largeStake);
      expect(await mockRewardEngine.pendingRewards(user2.address)).to.equal(expectedBonus);
    });

    it("should handle very small reward for matching bonus", async function () {
      await bonusEngine.connect(user1).registerReferrer(user2.address);
      await qualifyUser(user2, 3);
      // 1 unit reward → L1 = 10% = 0.1 → rounds to 0
      await bonusEngine.connect(operator).processMatchingBonus(user1.address, 1n);
      expect(await mockRewardEngine.pendingRewards(user2.address)).to.equal(0n);
    });

    it("should handle direct bonus + matching bonus accumulation", async function () {
      await bonusEngine.connect(user1).registerReferrer(user2.address);
      await qualifyUser(user2, 3);

      // Direct bonus from user1 staking 1000 BTN
      await bonusEngine.connect(operator).processDirectBonus(user1.address, BTN(1000));
      const directBonus = (BTN(1000) * 500n) / 10_000n; // 50 BTN

      // Matching bonus from user1's 500 BTN reward
      await bonusEngine.connect(operator).processMatchingBonus(user1.address, BTN(500));
      const matchingBonus = (BTN(500) * 1000n) / 10_000n; // 50 BTN (L1=10%)

      expect(await mockRewardEngine.pendingRewards(user2.address)).to.equal(
        directBonus + matchingBonus
      );
    });

    it("should handle 10-level deep T3 matching chain", async function () {
      // Build a 10-level chain: user1 → s0 → s1 → ... → s9
      const signers = await ethers.getSigners();
      const chainUsers = [];
      for (let i = 0; i < 10; i++) {
        chainUsers.push(signers[i + 7]); // offset to avoid admin/operator/user1-5
      }

      // Register: user1 → chainUsers[0] → chainUsers[1] → ... → chainUsers[9]
      await bonusEngine.connect(user1).registerReferrer(chainUsers[0].address);
      for (let i = 0; i < 9; i++) {
        await bonusEngine
          .connect(chainUsers[i])
          .registerReferrer(chainUsers[i + 1].address);
      }

      // Qualify all as T3
      for (let i = 0; i < 10; i++) {
        await qualifyUser(chainUsers[i], 3);
      }

      const rewardAmount = BTN(10000);
      await bonusEngine.connect(operator).processMatchingBonus(user1.address, rewardAmount);

      // Verify each level
      for (let i = 0; i < 10; i++) {
        const level = i + 1;
        const bps = BigInt(matchingBps[level]);
        const expected = (rewardAmount * bps) / 10_000n;
        expect(await mockRewardEngine.pendingRewards(chainUsers[i].address)).to.equal(
          expected,
          `Level ${level} mismatch`
        );
      }
    });
  });
});
