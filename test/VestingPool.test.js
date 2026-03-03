const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("VestingPool", function () {
  let vestingPool, withdrawalWallet;
  let btnToken;
  let admin, user1, user2, operator;

  const ONE_BTN = 1_000_000n;    // 6 decimals
  const VEST_AMT = 100n * ONE_BTN; // 100 BTN
  const DAY = 86400;

  beforeEach(async function () {
    [admin, user1, user2, operator] = await ethers.getSigners();

    // Deploy BTN
    const BTN = await ethers.getContractFactory("BTNToken");
    btnToken = await BTN.deploy();

    // Deploy MockWithdrawalWallet
    const MWW = await ethers.getContractFactory("MockWithdrawalWallet");
    withdrawalWallet = await MWW.deploy();

    // Deploy VestingPool via UUPS proxy
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

    // Grant operator role
    const OPERATOR_ROLE = await vestingPool.OPERATOR_ROLE();
    await vestingPool.connect(admin).grantRole(OPERATOR_ROLE, operator.address);
  });

  // ─── Helpers ───────────────────────────────────────────────

  /**
   * Simulate RewardEngine: transfer BTN to VestingPool, then call addVesting.
   */
  async function addVestingAs(caller, user, amount) {
    await btnToken.transfer(await vestingPool.getAddress(), amount);
    await vestingPool.connect(caller).addVesting(user, amount);
  }

  /**
   * Calculate expected release using same formula as contract:
   *   release = (balance * 5 * timeElapsed) / (1000 * 86400)
   * Capped at balance.
   */
  function calcRelease(balance, elapsedSec) {
    let release = (balance * 5n * BigInt(elapsedSec)) / (1000n * BigInt(DAY));
    if (release > balance) release = balance;
    return release;
  }

  // ─── Initialization ────────────────────────────────────────

  describe("Initialization", function () {
    it("should set correct initial state", async function () {
      expect(await vestingPool.btnToken()).to.equal(await btnToken.getAddress());
      expect(await vestingPool.withdrawalWallet()).to.equal(await withdrawalWallet.getAddress());
    });

    it("should grant admin all roles", async function () {
      const DEFAULT_ADMIN = await vestingPool.DEFAULT_ADMIN_ROLE();
      const OPERATOR = await vestingPool.OPERATOR_ROLE();
      const EMERGENCY = await vestingPool.EMERGENCY_ROLE();
      expect(await vestingPool.hasRole(DEFAULT_ADMIN, admin.address)).to.be.true;
      expect(await vestingPool.hasRole(OPERATOR, admin.address)).to.be.true;
      expect(await vestingPool.hasRole(EMERGENCY, admin.address)).to.be.true;
    });

    it("should not allow re-initialization", async function () {
      await expect(
        vestingPool.initialize(
          await btnToken.getAddress(),
          await withdrawalWallet.getAddress(),
          admin.address
        )
      ).to.be.reverted;
    });

    it("should revert if btnToken is zero address", async function () {
      const VP = await ethers.getContractFactory("VestingPool");
      await expect(
        upgrades.deployProxy(
          VP,
          [ethers.ZeroAddress, await withdrawalWallet.getAddress(), admin.address],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(VP, "ZeroAddress");
    });

    it("should revert if admin is zero address", async function () {
      const VP = await ethers.getContractFactory("VestingPool");
      await expect(
        upgrades.deployProxy(
          VP,
          [await btnToken.getAddress(), await withdrawalWallet.getAddress(), ethers.ZeroAddress],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(VP, "ZeroAddress");
    });
  });

  // ─── addVesting ────────────────────────────────────────────

  describe("addVesting", function () {
    it("should add vesting and emit event", async function () {
      await btnToken.transfer(await vestingPool.getAddress(), VEST_AMT);

      await expect(vestingPool.connect(admin).addVesting(user1.address, VEST_AMT))
        .to.emit(vestingPool, "VestingAdded")
        .withArgs(user1.address, VEST_AMT);

      expect(await vestingPool.vestedBalance(user1.address)).to.equal(VEST_AMT);
    });

    it("should initialize lastReleaseTime on first deposit", async function () {
      expect(await vestingPool.lastReleaseTime(user1.address)).to.equal(0);

      await addVestingAs(admin, user1.address, VEST_AMT);

      expect(await vestingPool.lastReleaseTime(user1.address)).to.be.gt(0);
    });

    it("should NOT reset lastReleaseTime on subsequent deposits", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      const firstTime = await vestingPool.lastReleaseTime(user1.address);

      // Advance time and add more
      await time.increase(DAY);
      await addVestingAs(admin, user1.address, 50n * ONE_BTN);

      // lastReleaseTime should still be the original time
      expect(await vestingPool.lastReleaseTime(user1.address)).to.equal(firstTime);
      expect(await vestingPool.vestedBalance(user1.address)).to.equal(VEST_AMT + 50n * ONE_BTN);
    });

    it("should accumulate balances across multiple deposits", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      await addVestingAs(admin, user1.address, VEST_AMT);
      expect(await vestingPool.vestedBalance(user1.address)).to.equal(2n * VEST_AMT);
    });

    it("should revert if called by non-operator", async function () {
      await expect(vestingPool.connect(user1).addVesting(user1.address, VEST_AMT))
        .to.be.reverted;
    });

    it("should revert on zero address", async function () {
      await expect(vestingPool.connect(admin).addVesting(ethers.ZeroAddress, VEST_AMT))
        .to.be.revertedWithCustomError(vestingPool, "ZeroAddress");
    });

    it("should revert on zero amount", async function () {
      await expect(vestingPool.connect(admin).addVesting(user1.address, 0))
        .to.be.revertedWithCustomError(vestingPool, "ZeroAmount");
    });

    it("should allow operator to add vesting", async function () {
      await btnToken.transfer(await vestingPool.getAddress(), VEST_AMT);
      await expect(vestingPool.connect(operator).addVesting(user1.address, VEST_AMT))
        .to.emit(vestingPool, "VestingAdded");
    });
  });

  // ─── release — happy path ──────────────────────────────────

  describe("release — happy path", function () {
    it("should release correct amount after 1 day (0.5%)", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      const addTime = Number(await vestingPool.lastReleaseTime(user1.address));

      const releaseTime = addTime + DAY;
      await time.setNextBlockTimestamp(releaseTime);

      // 100 BTN * 0.5% * 1 day = 0.5 BTN = 500_000 units
      const expectedRelease = calcRelease(VEST_AMT, DAY);
      expect(expectedRelease).to.equal(500_000n);

      await expect(vestingPool.connect(user1).release(user1.address))
        .to.emit(vestingPool, "VestedReleased")
        .withArgs(user1.address, expectedRelease);

      // Verify balances
      expect(await vestingPool.vestedBalance(user1.address)).to.equal(VEST_AMT - expectedRelease);
      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(expectedRelease);
    });

    it("should release correct amount after 7 days (3.5%)", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      const addTime = Number(await vestingPool.lastReleaseTime(user1.address));

      await time.setNextBlockTimestamp(addTime + 7 * DAY);

      // 100 BTN * 0.5% * 7 = 3.5 BTN
      const expectedRelease = calcRelease(VEST_AMT, 7 * DAY);
      expect(expectedRelease).to.equal(3_500_000n);

      await vestingPool.connect(user1).release(user1.address);

      expect(await vestingPool.vestedBalance(user1.address)).to.equal(VEST_AMT - expectedRelease);
      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(expectedRelease);
    });

    it("should release correct amount after 30 days (15%)", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      const addTime = Number(await vestingPool.lastReleaseTime(user1.address));

      await time.setNextBlockTimestamp(addTime + 30 * DAY);

      // 100 BTN * 0.5% * 30 = 15 BTN
      const expectedRelease = calcRelease(VEST_AMT, 30 * DAY);
      expect(expectedRelease).to.equal(15n * ONE_BTN);

      await vestingPool.connect(user1).release(user1.address);

      expect(await vestingPool.vestedBalance(user1.address)).to.equal(VEST_AMT - expectedRelease);
    });

    it("should cap release at vestedBalance after 200+ days", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      const addTime = Number(await vestingPool.lastReleaseTime(user1.address));

      // 200 days → 100% theoretically (0.5% * 200 = 100%), capped at balance
      await time.setNextBlockTimestamp(addTime + 200 * DAY);

      const expectedRelease = calcRelease(VEST_AMT, 200 * DAY);
      expect(expectedRelease).to.equal(VEST_AMT); // capped

      await vestingPool.connect(user1).release(user1.address);

      expect(await vestingPool.vestedBalance(user1.address)).to.equal(0);
      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(VEST_AMT);
    });

    it("should transfer BTN to WithdrawalWallet", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      const addTime = Number(await vestingPool.lastReleaseTime(user1.address));

      await time.setNextBlockTimestamp(addTime + DAY);

      const wwBefore = await btnToken.balanceOf(await withdrawalWallet.getAddress());
      const vpBefore = await btnToken.balanceOf(await vestingPool.getAddress());

      await vestingPool.connect(user1).release(user1.address);

      const expectedRelease = calcRelease(VEST_AMT, DAY);
      expect(await btnToken.balanceOf(await withdrawalWallet.getAddress()) - wwBefore).to.equal(expectedRelease);
      expect(vpBefore - await btnToken.balanceOf(await vestingPool.getAddress())).to.equal(expectedRelease);
    });

    it("should allow operator to release for a user", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      await time.increase(DAY);

      await expect(vestingPool.connect(operator).release(user1.address))
        .to.emit(vestingPool, "VestedReleased");
    });

    it("should allow admin (has OPERATOR_ROLE) to release for a user", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      await time.increase(DAY);

      await expect(vestingPool.connect(admin).release(user1.address))
        .to.emit(vestingPool, "VestedReleased");
    });

    it("should update lastReleaseTime after release", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      const firstTime = Number(await vestingPool.lastReleaseTime(user1.address));

      const releaseTime = firstTime + DAY;
      await time.setNextBlockTimestamp(releaseTime);

      await vestingPool.connect(user1).release(user1.address);

      expect(await vestingPool.lastReleaseTime(user1.address)).to.equal(releaseTime);
    });
  });

  // ─── release — consecutive ─────────────────────────────────

  describe("release — consecutive releases", function () {
    it("should compound correctly across two releases", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      const addTime = Number(await vestingPool.lastReleaseTime(user1.address));

      // First release after 1 day
      const t1 = addTime + DAY;
      await time.setNextBlockTimestamp(t1);
      await vestingPool.connect(user1).release(user1.address);

      const firstRelease = calcRelease(VEST_AMT, DAY);
      const balAfterFirst = VEST_AMT - firstRelease;
      expect(await vestingPool.vestedBalance(user1.address)).to.equal(balAfterFirst);

      // Second release after another day (balance is now less)
      const t2 = t1 + DAY;
      await time.setNextBlockTimestamp(t2);
      await vestingPool.connect(user1).release(user1.address);

      const secondRelease = calcRelease(balAfterFirst, DAY);
      const balAfterSecond = balAfterFirst - secondRelease;
      expect(await vestingPool.vestedBalance(user1.address)).to.equal(balAfterSecond);

      // Total sent to WithdrawalWallet
      const totalReleased = firstRelease + secondRelease;
      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(totalReleased);
    });

    it("should eventually drain balance to zero over many releases", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      const addTime = Number(await vestingPool.lastReleaseTime(user1.address));

      let currentTime = addTime;

      // Release every 10 days — exponential decay, takes many iterations
      for (let i = 0; i < 40; i++) {
        currentTime += 10 * DAY;
        await time.setNextBlockTimestamp(currentTime);

        const balance = await vestingPool.vestedBalance(user1.address);
        if (balance === 0n) break;

        await vestingPool.connect(user1).release(user1.address);
      }

      // Final drain: advance far enough to cap any remaining dust
      const remaining = await vestingPool.vestedBalance(user1.address);
      if (remaining > 0n) {
        currentTime += 200 * DAY; // guaranteed full drain (cap at balance)
        await time.setNextBlockTimestamp(currentTime);
        await vestingPool.connect(user1).release(user1.address);
      }

      expect(await vestingPool.vestedBalance(user1.address)).to.equal(0n);
      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(VEST_AMT);
    });
  });

  // ─── release — error cases ─────────────────────────────────

  describe("release — error cases", function () {
    it("should revert if called by non-user and non-operator", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      await time.increase(DAY);

      await expect(vestingPool.connect(user2).release(user1.address))
        .to.be.revertedWithCustomError(vestingPool, "NotUserOrOperator");
    });

    it("should revert if nothing to release (no vesting)", async function () {
      await expect(vestingPool.connect(user1).release(user1.address))
        .to.be.revertedWithCustomError(vestingPool, "NothingToRelease");
    });

    it("should revert if nothing to release (amount rounds to zero)", async function () {
      // With a tiny balance (1 unit) and only 1 second elapsed:
      // release = (1 * 5 * 1) / (1000 * 86400) = 0  → NothingToRelease
      const VP = await ethers.getContractFactory("VestingPool");
      const vp2 = await upgrades.deployProxy(
        VP,
        [await btnToken.getAddress(), await withdrawalWallet.getAddress(), admin.address],
        { kind: "uups" }
      );
      await btnToken.transfer(await vp2.getAddress(), 1n);
      await vp2.connect(admin).addVesting(user1.address, 1n);
      const t = Number(await vp2.lastReleaseTime(user1.address));

      // 1 second later — release rounds to 0
      await time.setNextBlockTimestamp(t + 1);

      await expect(vp2.connect(user1).release(user1.address))
        .to.be.revertedWithCustomError(vp2, "NothingToRelease");
    });

    it("should revert if withdrawalWallet not set", async function () {
      const VP = await ethers.getContractFactory("VestingPool");
      const vp2 = await upgrades.deployProxy(
        VP,
        [await btnToken.getAddress(), ethers.ZeroAddress, admin.address],
        { kind: "uups" }
      );
      await btnToken.transfer(await vp2.getAddress(), VEST_AMT);
      await vp2.connect(admin).addVesting(user1.address, VEST_AMT);
      await time.increase(DAY);

      await expect(vp2.connect(user1).release(user1.address))
        .to.be.revertedWithCustomError(vp2, "WithdrawalWalletNotSet");
    });
  });

  // ─── getPendingRelease ─────────────────────────────────────

  describe("getPendingRelease", function () {
    it("should return 0 for user with no vesting", async function () {
      expect(await vestingPool.getPendingRelease(user1.address)).to.equal(0);
    });

    it("should return 0 immediately after addVesting (same block logic)", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      // View call in same block — timeElapsed could be 0 or 1 sec depending on block
      // We use setNextBlockTimestamp to verify exact value
      const addTime = Number(await vestingPool.lastReleaseTime(user1.address));
      // Mine a block at addTime (same time) to check
      // Can't go backwards, so just check that the value is very small
      const pending = await vestingPool.getPendingRelease(user1.address);
      // Should be 0 or dust (at most 1 second of release)
      expect(pending).to.be.lte(calcRelease(VEST_AMT, 1));
    });

    it("should return correct amount after 1 day", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      const addTime = Number(await vestingPool.lastReleaseTime(user1.address));

      await time.setNextBlockTimestamp(addTime + DAY);
      await ethers.provider.send("evm_mine", []);

      const pending = await vestingPool.getPendingRelease(user1.address);
      expect(pending).to.equal(calcRelease(VEST_AMT, DAY));
    });

    it("should cap at vestedBalance for large time elapsed", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      const addTime = Number(await vestingPool.lastReleaseTime(user1.address));

      // 300 days → 150% theoretically, capped at 100%
      await time.setNextBlockTimestamp(addTime + 300 * DAY);
      await ethers.provider.send("evm_mine", []);

      const pending = await vestingPool.getPendingRelease(user1.address);
      expect(pending).to.equal(VEST_AMT);
    });
  });

  // ─── Per-second precision ──────────────────────────────────

  describe("Per-second precision", function () {
    it("should calculate correct release for 1 hour", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      const addTime = Number(await vestingPool.lastReleaseTime(user1.address));

      await time.setNextBlockTimestamp(addTime + 3600);

      // release = (100e6 * 5 * 3600) / (1000 * 86400)
      //         = 1_800_000_000_000 / 86_400_000
      //         = 20_833
      const expectedRelease = calcRelease(VEST_AMT, 3600);
      expect(expectedRelease).to.equal(20_833n);

      await vestingPool.connect(user1).release(user1.address);

      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(expectedRelease);
    });

    it("should calculate correct release for 12 hours", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      const addTime = Number(await vestingPool.lastReleaseTime(user1.address));

      await time.setNextBlockTimestamp(addTime + 12 * 3600);

      const expectedRelease = calcRelease(VEST_AMT, 12 * 3600);
      // 100e6 * 5 * 43200 / (1000 * 86400) = 250_000
      expect(expectedRelease).to.equal(250_000n);

      await vestingPool.connect(user1).release(user1.address);

      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(expectedRelease);
    });
  });

  // ─── Multi-user ────────────────────────────────────────────

  describe("Multi-user scenarios", function () {
    it("should track vesting independently for two users", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      await addVestingAs(admin, user2.address, 200n * ONE_BTN);

      const t1 = Number(await vestingPool.lastReleaseTime(user1.address));
      const t2 = Number(await vestingPool.lastReleaseTime(user2.address));

      // Release both after 1 day (relative to their add times)
      const releaseTime = Math.max(t1, t2) + DAY;
      await time.setNextBlockTimestamp(releaseTime);
      await vestingPool.connect(user1).release(user1.address);

      await time.setNextBlockTimestamp(releaseTime + 1);
      await vestingPool.connect(user2).release(user2.address);

      const u1Release = calcRelease(VEST_AMT, releaseTime - t1);
      const u2Release = calcRelease(200n * ONE_BTN, releaseTime + 1 - t2);

      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(u1Release);
      expect(await withdrawalWallet.withdrawableBalance(user2.address)).to.equal(u2Release);
    });
  });

  // ─── Admin setters ─────────────────────────────────────────

  describe("Admin setters", function () {
    it("should allow admin to update withdrawalWallet", async function () {
      await expect(vestingPool.connect(admin).setWithdrawalWallet(user2.address))
        .to.emit(vestingPool, "WithdrawalWalletUpdated");
      expect(await vestingPool.withdrawalWallet()).to.equal(user2.address);
    });

    it("should revert if non-admin calls setter", async function () {
      await expect(vestingPool.connect(user1).setWithdrawalWallet(user2.address))
        .to.be.reverted;
    });
  });

  // ─── Pausable ──────────────────────────────────────────────

  describe("Pausable", function () {
    it("should block release when paused", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      await time.increase(DAY);

      await vestingPool.connect(admin).pause();
      await expect(vestingPool.connect(user1).release(user1.address))
        .to.be.reverted;
    });

    it("should resume after unpause", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      await time.increase(DAY);

      await vestingPool.connect(admin).pause();
      await vestingPool.connect(admin).unpause();

      await expect(vestingPool.connect(user1).release(user1.address))
        .to.emit(vestingPool, "VestedReleased");
    });

    it("should revert if non-emergency pauses", async function () {
      await expect(vestingPool.connect(user1).pause()).to.be.reverted;
    });

    it("should revert if non-admin unpauses", async function () {
      await vestingPool.connect(admin).pause();
      await expect(vestingPool.connect(user1).unpause()).to.be.reverted;
    });
  });

  // ─── UUPS upgrade ─────────────────────────────────────────

  describe("UUPS upgrade", function () {
    it("should allow admin to upgrade", async function () {
      const VPv2 = await ethers.getContractFactory("VestingPool");
      const upgraded = await upgrades.upgradeProxy(await vestingPool.getAddress(), VPv2);
      expect(await upgraded.getAddress()).to.equal(await vestingPool.getAddress());
    });

    it("should reject upgrade from non-admin", async function () {
      const VPv2 = await ethers.getContractFactory("VestingPool", user1);
      await expect(upgrades.upgradeProxy(await vestingPool.getAddress(), VPv2))
        .to.be.reverted;
    });
  });

  // ─── Edge cases ────────────────────────────────────────────

  describe("Edge cases", function () {
    it("should handle very large vesting balance (1M BTN)", async function () {
      const largeAmt = 1_000_000n * ONE_BTN;
      await addVestingAs(admin, user1.address, largeAmt);
      const addTime = Number(await vestingPool.lastReleaseTime(user1.address));

      await time.setNextBlockTimestamp(addTime + DAY);

      // 1M * 0.5% = 5000 BTN
      const expectedRelease = calcRelease(largeAmt, DAY);
      expect(expectedRelease).to.equal(5_000n * ONE_BTN);

      await vestingPool.connect(user1).release(user1.address);

      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(expectedRelease);
    });

    it("should handle small vesting balance (1 BTN)", async function () {
      const smallAmt = ONE_BTN;
      await addVestingAs(admin, user1.address, smallAmt);
      const addTime = Number(await vestingPool.lastReleaseTime(user1.address));

      await time.setNextBlockTimestamp(addTime + DAY);

      // 1 BTN * 0.5% = 0.005 BTN = 5000 units
      const expectedRelease = calcRelease(smallAmt, DAY);
      expect(expectedRelease).to.equal(5000n);

      await vestingPool.connect(user1).release(user1.address);

      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(expectedRelease);
    });

    it("should handle release exactly at 200 days (full drain)", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      const addTime = Number(await vestingPool.lastReleaseTime(user1.address));

      // 200 days: 0.5% * 200 = 100% → full balance released
      await time.setNextBlockTimestamp(addTime + 200 * DAY);

      await vestingPool.connect(user1).release(user1.address);

      expect(await vestingPool.vestedBalance(user1.address)).to.equal(0);
      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(VEST_AMT);
    });

    it("should handle addVesting after full drain (restarts)", async function () {
      await addVestingAs(admin, user1.address, VEST_AMT);
      const addTime = Number(await vestingPool.lastReleaseTime(user1.address));

      // Fully drain
      await time.setNextBlockTimestamp(addTime + 200 * DAY);
      await vestingPool.connect(user1).release(user1.address);
      expect(await vestingPool.vestedBalance(user1.address)).to.equal(0);

      // Add new vesting — lastReleaseTime stays at old value (non-zero)
      // But balance is now 50 BTN
      await addVestingAs(admin, user1.address, 50n * ONE_BTN);
      expect(await vestingPool.vestedBalance(user1.address)).to.equal(50n * ONE_BTN);

      // The lastReleaseTime was set to the release time (addTime + 200 days)
      // So new accrual starts from that point
      const lastRelease = Number(await vestingPool.lastReleaseTime(user1.address));
      await time.setNextBlockTimestamp(lastRelease + DAY);

      await vestingPool.connect(user1).release(user1.address);

      const expectedRelease = calcRelease(50n * ONE_BTN, DAY);
      // Total in WW: VEST_AMT (first drain) + expectedRelease (second)
      expect(await withdrawalWallet.withdrawableBalance(user1.address))
        .to.equal(VEST_AMT + expectedRelease);
    });

    it("should handle rounding correctly for small time intervals", async function () {
      // 100 BTN vested, 10 seconds elapsed
      // release = (100e6 * 5 * 10) / (1000 * 86400)
      //         = 5_000_000_000 / 86_400_000
      //         = 57 (truncated)
      await addVestingAs(admin, user1.address, VEST_AMT);
      const addTime = Number(await vestingPool.lastReleaseTime(user1.address));

      await time.setNextBlockTimestamp(addTime + 10);

      const expectedRelease = calcRelease(VEST_AMT, 10);
      expect(expectedRelease).to.equal(57n);

      await vestingPool.connect(user1).release(user1.address);

      expect(await withdrawalWallet.withdrawableBalance(user1.address)).to.equal(57n);
    });
  });
});
