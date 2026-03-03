const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("WithdrawalWallet", function () {
  let withdrawalWallet;
  let btnToken;
  let admin, user1, user2, operator;

  const ONE_BTN = 1_000_000n;      // 6 decimals
  const DEPOSIT_AMT = 100n * ONE_BTN; // 100 BTN
  const DAY = 86400;
  const WEEK = 7 * DAY;

  beforeEach(async function () {
    [admin, user1, user2, operator] = await ethers.getSigners();

    // Deploy BTN
    const BTN = await ethers.getContractFactory("BTNToken");
    btnToken = await BTN.deploy();

    // Deploy WithdrawalWallet via UUPS proxy
    const WW = await ethers.getContractFactory("WithdrawalWallet");
    withdrawalWallet = await upgrades.deployProxy(
      WW,
      [await btnToken.getAddress(), admin.address],
      { kind: "uups" }
    );

    // Grant operator role
    const OPERATOR_ROLE = await withdrawalWallet.OPERATOR_ROLE();
    await withdrawalWallet.connect(admin).grantRole(OPERATOR_ROLE, operator.address);
  });

  // ─── Helpers ───────────────────────────────────────────────

  /**
   * Simulate RewardEngine/VestingPool: transfer BTN to WW, then call addWithdrawable.
   */
  async function addWithdrawableAs(caller, user, amount) {
    await btnToken.transfer(await withdrawalWallet.getAddress(), amount);
    await withdrawalWallet.connect(caller).addWithdrawable(user, amount);
  }

  // ─── Initialization ────────────────────────────────────────

  describe("Initialization", function () {
    it("should set correct initial state", async function () {
      expect(await withdrawalWallet.btnToken()).to.equal(await btnToken.getAddress());
      expect(await withdrawalWallet.weeklyWithdrawalCap()).to.equal(0); // unlimited
    });

    it("should grant admin all roles", async function () {
      const DEFAULT_ADMIN = await withdrawalWallet.DEFAULT_ADMIN_ROLE();
      const OPERATOR = await withdrawalWallet.OPERATOR_ROLE();
      const EMERGENCY = await withdrawalWallet.EMERGENCY_ROLE();
      expect(await withdrawalWallet.hasRole(DEFAULT_ADMIN, admin.address)).to.be.true;
      expect(await withdrawalWallet.hasRole(OPERATOR, admin.address)).to.be.true;
      expect(await withdrawalWallet.hasRole(EMERGENCY, admin.address)).to.be.true;
    });

    it("should not allow re-initialization", async function () {
      await expect(
        withdrawalWallet.initialize(await btnToken.getAddress(), admin.address)
      ).to.be.reverted;
    });

    it("should revert if btnToken is zero address", async function () {
      const WW = await ethers.getContractFactory("WithdrawalWallet");
      await expect(
        upgrades.deployProxy(WW, [ethers.ZeroAddress, admin.address], { kind: "uups" })
      ).to.be.revertedWithCustomError(WW, "ZeroAddress");
    });

    it("should revert if admin is zero address", async function () {
      const WW = await ethers.getContractFactory("WithdrawalWallet");
      await expect(
        upgrades.deployProxy(WW, [await btnToken.getAddress(), ethers.ZeroAddress], { kind: "uups" })
      ).to.be.revertedWithCustomError(WW, "ZeroAddress");
    });
  });

  // ─── addWithdrawable ───────────────────────────────────────

  describe("addWithdrawable", function () {
    it("should credit user balance and emit event", async function () {
      await btnToken.transfer(await withdrawalWallet.getAddress(), DEPOSIT_AMT);

      await expect(withdrawalWallet.connect(admin).addWithdrawable(user1.address, DEPOSIT_AMT))
        .to.emit(withdrawalWallet, "WithdrawableAdded")
        .withArgs(user1.address, DEPOSIT_AMT);

      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(DEPOSIT_AMT);
    });

    it("should accumulate across multiple deposits", async function () {
      await addWithdrawableAs(admin, user1.address, DEPOSIT_AMT);
      await addWithdrawableAs(admin, user1.address, 50n * ONE_BTN);
      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(150n * ONE_BTN);
    });

    it("should allow operator to add withdrawable", async function () {
      await btnToken.transfer(await withdrawalWallet.getAddress(), DEPOSIT_AMT);
      await expect(withdrawalWallet.connect(operator).addWithdrawable(user1.address, DEPOSIT_AMT))
        .to.emit(withdrawalWallet, "WithdrawableAdded");
    });

    it("should revert if called by non-operator", async function () {
      await expect(withdrawalWallet.connect(user1).addWithdrawable(user1.address, DEPOSIT_AMT))
        .to.be.reverted;
    });

    it("should revert on zero address", async function () {
      await expect(withdrawalWallet.connect(admin).addWithdrawable(ethers.ZeroAddress, DEPOSIT_AMT))
        .to.be.revertedWithCustomError(withdrawalWallet, "ZeroAddress");
    });

    it("should revert on zero amount", async function () {
      await expect(withdrawalWallet.connect(admin).addWithdrawable(user1.address, 0))
        .to.be.revertedWithCustomError(withdrawalWallet, "ZeroAmount");
    });
  });

  // ─── withdraw — happy path (no cap) ────────────────────────

  describe("withdraw — no weekly cap", function () {
    beforeEach(async function () {
      await addWithdrawableAs(admin, user1.address, DEPOSIT_AMT);
    });

    it("should transfer BTN to user and emit event", async function () {
      const balBefore = await btnToken.balanceOf(user1.address);

      await expect(withdrawalWallet.connect(user1).withdraw(DEPOSIT_AMT))
        .to.emit(withdrawalWallet, "Withdrawn")
        .withArgs(user1.address, DEPOSIT_AMT);

      const balAfter = await btnToken.balanceOf(user1.address);
      expect(balAfter - balBefore).to.equal(DEPOSIT_AMT);
    });

    it("should decrease withdrawable balance", async function () {
      await withdrawalWallet.connect(user1).withdraw(50n * ONE_BTN);
      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(50n * ONE_BTN);
    });

    it("should allow full withdrawal", async function () {
      await withdrawalWallet.connect(user1).withdraw(DEPOSIT_AMT);
      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(0);
    });

    it("should allow partial withdrawals", async function () {
      await withdrawalWallet.connect(user1).withdraw(30n * ONE_BTN);
      await withdrawalWallet.connect(user1).withdraw(30n * ONE_BTN);
      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(40n * ONE_BTN);
    });

    it("should decrease contract BTN balance", async function () {
      const contractBefore = await btnToken.balanceOf(await withdrawalWallet.getAddress());
      await withdrawalWallet.connect(user1).withdraw(DEPOSIT_AMT);
      const contractAfter = await btnToken.balanceOf(await withdrawalWallet.getAddress());
      expect(contractBefore - contractAfter).to.equal(DEPOSIT_AMT);
    });
  });

  // ─── withdraw — error cases ────────────────────────────────

  describe("withdraw — error cases", function () {
    it("should revert on zero amount", async function () {
      await expect(withdrawalWallet.connect(user1).withdraw(0))
        .to.be.revertedWithCustomError(withdrawalWallet, "ZeroAmount");
    });

    it("should revert if insufficient balance", async function () {
      await addWithdrawableAs(admin, user1.address, 50n * ONE_BTN);
      await expect(withdrawalWallet.connect(user1).withdraw(100n * ONE_BTN))
        .to.be.revertedWithCustomError(withdrawalWallet, "InsufficientBalance")
        .withArgs(100n * ONE_BTN, 50n * ONE_BTN);
    });

    it("should revert if no balance at all", async function () {
      await expect(withdrawalWallet.connect(user1).withdraw(ONE_BTN))
        .to.be.revertedWithCustomError(withdrawalWallet, "InsufficientBalance");
    });

    it("should revert if user tries to withdraw another user's balance", async function () {
      await addWithdrawableAs(admin, user1.address, DEPOSIT_AMT);
      // user2 has no balance
      await expect(withdrawalWallet.connect(user2).withdraw(ONE_BTN))
        .to.be.revertedWithCustomError(withdrawalWallet, "InsufficientBalance");
    });
  });

  // ─── Weekly withdrawal cap ─────────────────────────────────

  describe("Weekly withdrawal cap", function () {
    const CAP = 50n * ONE_BTN; // 50 BTN weekly cap

    beforeEach(async function () {
      await addWithdrawableAs(admin, user1.address, 200n * ONE_BTN);
      await withdrawalWallet.connect(admin).setWeeklyWithdrawalCap(CAP);
    });

    it("should allow withdrawal within cap", async function () {
      await withdrawalWallet.connect(user1).withdraw(30n * ONE_BTN);
      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(170n * ONE_BTN);
    });

    it("should allow withdrawal exactly at cap", async function () {
      await withdrawalWallet.connect(user1).withdraw(CAP);
      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(150n * ONE_BTN);
    });

    it("should revert if withdrawal exceeds remaining cap", async function () {
      await withdrawalWallet.connect(user1).withdraw(30n * ONE_BTN);
      // 20 BTN remaining in cap
      await expect(withdrawalWallet.connect(user1).withdraw(30n * ONE_BTN))
        .to.be.revertedWithCustomError(withdrawalWallet, "WeeklyCapExceeded")
        .withArgs(30n * ONE_BTN, 20n * ONE_BTN);
    });

    it("should revert if single withdrawal exceeds cap", async function () {
      await expect(withdrawalWallet.connect(user1).withdraw(60n * ONE_BTN))
        .to.be.revertedWithCustomError(withdrawalWallet, "WeeklyCapExceeded")
        .withArgs(60n * ONE_BTN, CAP);
    });

    it("should track cumulative withdrawals within a week", async function () {
      await withdrawalWallet.connect(user1).withdraw(20n * ONE_BTN);
      await withdrawalWallet.connect(user1).withdraw(20n * ONE_BTN);
      // 10 BTN remaining in cap
      await withdrawalWallet.connect(user1).withdraw(10n * ONE_BTN);
      // Cap exhausted
      await expect(withdrawalWallet.connect(user1).withdraw(ONE_BTN))
        .to.be.revertedWithCustomError(withdrawalWallet, "WeeklyCapExceeded");
    });

    it("should reset cap in new week", async function () {
      // Exhaust cap
      await withdrawalWallet.connect(user1).withdraw(CAP);

      // Advance to next week
      await time.increase(WEEK);

      // Should be able to withdraw again
      await withdrawalWallet.connect(user1).withdraw(CAP);
      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(100n * ONE_BTN);
    });

    it("should reset cap precisely at week boundary", async function () {
      await withdrawalWallet.connect(user1).withdraw(CAP);

      // Get current week start
      const now = await time.latest();
      const currentWeekStart = Math.floor(now / WEEK) * WEEK;
      const nextWeekStart = currentWeekStart + WEEK;

      // Set to exactly the next week boundary
      await time.setNextBlockTimestamp(nextWeekStart);

      await withdrawalWallet.connect(user1).withdraw(CAP);
      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(100n * ONE_BTN);
    });

    it("should track users independently", async function () {
      await addWithdrawableAs(admin, user2.address, 200n * ONE_BTN);

      await withdrawalWallet.connect(user1).withdraw(CAP); // user1 hits cap
      await withdrawalWallet.connect(user2).withdraw(30n * ONE_BTN); // user2 still has 20 BTN cap

      await expect(withdrawalWallet.connect(user1).withdraw(ONE_BTN))
        .to.be.revertedWithCustomError(withdrawalWallet, "WeeklyCapExceeded");

      // user2 can still withdraw
      await withdrawalWallet.connect(user2).withdraw(20n * ONE_BTN);
    });

    it("should allow unlimited when cap set back to 0", async function () {
      await withdrawalWallet.connect(user1).withdraw(CAP); // hit cap
      await expect(withdrawalWallet.connect(user1).withdraw(ONE_BTN))
        .to.be.revertedWithCustomError(withdrawalWallet, "WeeklyCapExceeded");

      // Admin disables cap
      await withdrawalWallet.connect(admin).setWeeklyWithdrawalCap(0);

      // Now unlimited
      await withdrawalWallet.connect(user1).withdraw(100n * ONE_BTN);
      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(50n * ONE_BTN);
    });

    it("should enforce new cap immediately after change", async function () {
      // Lower cap to 10 BTN
      await withdrawalWallet.connect(admin).setWeeklyWithdrawalCap(10n * ONE_BTN);

      await withdrawalWallet.connect(user1).withdraw(10n * ONE_BTN);
      await expect(withdrawalWallet.connect(user1).withdraw(ONE_BTN))
        .to.be.revertedWithCustomError(withdrawalWallet, "WeeklyCapExceeded");
    });

    it("should handle cap increase mid-week", async function () {
      // Exhaust 50 BTN cap
      await withdrawalWallet.connect(user1).withdraw(CAP);

      // Raise cap to 100 BTN
      await withdrawalWallet.connect(admin).setWeeklyWithdrawalCap(100n * ONE_BTN);

      // Can withdraw 50 more (100 - 50 already used)
      await withdrawalWallet.connect(user1).withdraw(50n * ONE_BTN);
      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(100n * ONE_BTN);
    });
  });

  // ─── getRemainingWeeklyAllowance ───────────────────────────

  describe("getRemainingWeeklyAllowance", function () {
    it("should return max uint256 when cap is 0 (unlimited)", async function () {
      const remaining = await withdrawalWallet.getRemainingWeeklyAllowance(user1.address);
      expect(remaining).to.equal(ethers.MaxUint256);
    });

    it("should return full cap when user hasn't withdrawn", async function () {
      const CAP = 50n * ONE_BTN;
      await withdrawalWallet.connect(admin).setWeeklyWithdrawalCap(CAP);
      expect(await withdrawalWallet.getRemainingWeeklyAllowance(user1.address)).to.equal(CAP);
    });

    it("should return remaining cap after partial withdrawal", async function () {
      const CAP = 50n * ONE_BTN;
      await withdrawalWallet.connect(admin).setWeeklyWithdrawalCap(CAP);
      await addWithdrawableAs(admin, user1.address, DEPOSIT_AMT);

      await withdrawalWallet.connect(user1).withdraw(20n * ONE_BTN);
      expect(await withdrawalWallet.getRemainingWeeklyAllowance(user1.address)).to.equal(30n * ONE_BTN);
    });

    it("should return 0 when cap exhausted", async function () {
      const CAP = 50n * ONE_BTN;
      await withdrawalWallet.connect(admin).setWeeklyWithdrawalCap(CAP);
      await addWithdrawableAs(admin, user1.address, DEPOSIT_AMT);

      await withdrawalWallet.connect(user1).withdraw(CAP);
      expect(await withdrawalWallet.getRemainingWeeklyAllowance(user1.address)).to.equal(0);
    });

    it("should return full cap after week reset", async function () {
      const CAP = 50n * ONE_BTN;
      await withdrawalWallet.connect(admin).setWeeklyWithdrawalCap(CAP);
      await addWithdrawableAs(admin, user1.address, DEPOSIT_AMT);

      await withdrawalWallet.connect(user1).withdraw(CAP);
      await time.increase(WEEK);

      expect(await withdrawalWallet.getRemainingWeeklyAllowance(user1.address)).to.equal(CAP);
    });
  });

  // ─── getWithdrawableBalance ────────────────────────────────

  describe("getWithdrawableBalance", function () {
    it("should return 0 for user with no deposits", async function () {
      expect(await withdrawalWallet.getWithdrawableBalance(user1.address)).to.equal(0);
    });

    it("should return correct balance after deposits and withdrawals", async function () {
      await addWithdrawableAs(admin, user1.address, DEPOSIT_AMT);
      expect(await withdrawalWallet.getWithdrawableBalance(user1.address)).to.equal(DEPOSIT_AMT);

      await withdrawalWallet.connect(user1).withdraw(30n * ONE_BTN);
      expect(await withdrawalWallet.getWithdrawableBalance(user1.address)).to.equal(70n * ONE_BTN);
    });
  });

  // ─── Admin: setWeeklyWithdrawalCap ─────────────────────────

  describe("setWeeklyWithdrawalCap", function () {
    it("should update cap and emit event", async function () {
      await expect(withdrawalWallet.connect(admin).setWeeklyWithdrawalCap(50n * ONE_BTN))
        .to.emit(withdrawalWallet, "WeeklyWithdrawalCapUpdated")
        .withArgs(0, 50n * ONE_BTN);

      expect(await withdrawalWallet.weeklyWithdrawalCap()).to.equal(50n * ONE_BTN);
    });

    it("should allow setting cap to 0 (unlimited)", async function () {
      await withdrawalWallet.connect(admin).setWeeklyWithdrawalCap(50n * ONE_BTN);
      await expect(withdrawalWallet.connect(admin).setWeeklyWithdrawalCap(0))
        .to.emit(withdrawalWallet, "WeeklyWithdrawalCapUpdated")
        .withArgs(50n * ONE_BTN, 0);
    });

    it("should revert if non-admin calls", async function () {
      await expect(withdrawalWallet.connect(user1).setWeeklyWithdrawalCap(50n * ONE_BTN))
        .to.be.reverted;
    });

    it("should revert if operator (not admin) calls", async function () {
      await expect(withdrawalWallet.connect(operator).setWeeklyWithdrawalCap(50n * ONE_BTN))
        .to.be.reverted;
    });
  });

  // ─── Multi-user scenarios ──────────────────────────────────

  describe("Multi-user scenarios", function () {
    it("should track balances independently", async function () {
      await addWithdrawableAs(admin, user1.address, DEPOSIT_AMT);
      await addWithdrawableAs(admin, user2.address, 200n * ONE_BTN);

      await withdrawalWallet.connect(user1).withdraw(30n * ONE_BTN);

      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(70n * ONE_BTN);
      expect(await withdrawalWallet.withdrawableBalance(user2.address)).to.equal(200n * ONE_BTN);
    });

    it("should allow multiple deposits from different operators", async function () {
      // Simulate RewardEngine and VestingPool both depositing
      await addWithdrawableAs(admin, user1.address, 10n * ONE_BTN);    // from RewardEngine
      await addWithdrawableAs(operator, user1.address, 5n * ONE_BTN);  // from VestingPool

      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(15n * ONE_BTN);
    });
  });

  // ─── Pausable ──────────────────────────────────────────────

  describe("Pausable", function () {
    it("should block withdraw when paused", async function () {
      await addWithdrawableAs(admin, user1.address, DEPOSIT_AMT);
      await withdrawalWallet.connect(admin).pause();
      await expect(withdrawalWallet.connect(user1).withdraw(ONE_BTN))
        .to.be.reverted;
    });

    it("should resume after unpause", async function () {
      await addWithdrawableAs(admin, user1.address, DEPOSIT_AMT);
      await withdrawalWallet.connect(admin).pause();
      await withdrawalWallet.connect(admin).unpause();

      await expect(withdrawalWallet.connect(user1).withdraw(ONE_BTN))
        .to.emit(withdrawalWallet, "Withdrawn");
    });

    it("should NOT block addWithdrawable when paused", async function () {
      await withdrawalWallet.connect(admin).pause();
      // Deposits should still work (RewardEngine/VestingPool need to deposit)
      await btnToken.transfer(await withdrawalWallet.getAddress(), DEPOSIT_AMT);
      await expect(withdrawalWallet.connect(admin).addWithdrawable(user1.address, DEPOSIT_AMT))
        .to.emit(withdrawalWallet, "WithdrawableAdded");
    });

    it("should revert if non-emergency pauses", async function () {
      await expect(withdrawalWallet.connect(user1).pause()).to.be.reverted;
    });

    it("should revert if non-admin unpauses", async function () {
      await withdrawalWallet.connect(admin).pause();
      await expect(withdrawalWallet.connect(user1).unpause()).to.be.reverted;
    });
  });

  // ─── UUPS upgrade ─────────────────────────────────────────

  describe("UUPS upgrade", function () {
    it("should allow admin to upgrade", async function () {
      const WWv2 = await ethers.getContractFactory("WithdrawalWallet");
      const upgraded = await upgrades.upgradeProxy(await withdrawalWallet.getAddress(), WWv2);
      expect(await upgraded.getAddress()).to.equal(await withdrawalWallet.getAddress());
    });

    it("should reject upgrade from non-admin", async function () {
      const WWv2 = await ethers.getContractFactory("WithdrawalWallet", user1);
      await expect(upgrades.upgradeProxy(await withdrawalWallet.getAddress(), WWv2))
        .to.be.reverted;
    });
  });

  // ─── Edge cases ────────────────────────────────────────────

  describe("Edge cases", function () {
    it("should handle withdrawal of 1 unit", async function () {
      await addWithdrawableAs(admin, user1.address, ONE_BTN);
      await withdrawalWallet.connect(user1).withdraw(1n);
      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(ONE_BTN - 1n);
    });

    it("should handle very large balance (1M BTN)", async function () {
      const large = 1_000_000n * ONE_BTN;
      await addWithdrawableAs(admin, user1.address, large);
      await withdrawalWallet.connect(user1).withdraw(large);
      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(0);
    });

    it("should handle many small deposits", async function () {
      for (let i = 0; i < 10; i++) {
        await addWithdrawableAs(admin, user1.address, ONE_BTN);
      }
      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(10n * ONE_BTN);
    });

    it("should handle cap lower than existing weekly withdrawn (no underflow)", async function () {
      await addWithdrawableAs(admin, user1.address, 200n * ONE_BTN);
      await withdrawalWallet.connect(admin).setWeeklyWithdrawalCap(100n * ONE_BTN);

      // Withdraw 80 BTN
      await withdrawalWallet.connect(user1).withdraw(80n * ONE_BTN);

      // Lower cap to 50 BTN (below the 80 already withdrawn)
      await withdrawalWallet.connect(admin).setWeeklyWithdrawalCap(50n * ONE_BTN);

      // User should not be able to withdraw more (80 > 50 cap, remaining = 0)
      await expect(withdrawalWallet.connect(user1).withdraw(ONE_BTN))
        .to.be.revertedWithCustomError(withdrawalWallet, "WeeklyCapExceeded");
    });

    it("should handle withdraw after deposit in same tx context", async function () {
      await addWithdrawableAs(admin, user1.address, DEPOSIT_AMT);
      // Deposit more and withdraw in the same test
      await addWithdrawableAs(admin, user1.address, 50n * ONE_BTN);
      await withdrawalWallet.connect(user1).withdraw(150n * ONE_BTN);
      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(0);
    });
  });
});
