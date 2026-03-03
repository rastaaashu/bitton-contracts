const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("StakingRewards (Legacy Hardening)", function () {
  let btnToken, stakingRewards;
  let owner, user1, user2;

  const ONE_BTN = 1_000_000n;
  const STAKE_AMT = 1000n * ONE_BTN;
  const DAY = 86400;
  const LOCK_135 = 135 * DAY;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const BTNToken = await ethers.getContractFactory("BTNToken");
    btnToken = await BTNToken.deploy();

    const StakingRewards = await ethers.getContractFactory("StakingRewards");
    stakingRewards = await StakingRewards.deploy(btnToken.target);

    // Fund staking contract with 10M BTN
    await btnToken.transfer(stakingRewards.target, 10_000_000n * ONE_BTN);

    // Transfer tokens to users
    await btnToken.transfer(user1.address, 100_000n * ONE_BTN);
    await btnToken.transfer(user2.address, 100_000n * ONE_BTN);
  });

  // ── Deployment ──

  describe("Deployment", function () {
    it("Should set btnToken correctly", async function () {
      expect(await stakingRewards.btnToken()).to.equal(btnToken.target);
    });

    it("Should auto-whitelist btnToken", async function () {
      expect(await stakingRewards.whitelistedTokens(btnToken.target)).to.be.true;
    });

    it("Should have defaultLockPeriod = 135 days", async function () {
      expect(await stakingRewards.defaultLockPeriod()).to.equal(LOCK_135);
    });

    it("Should have defaultRewardRate = 200 (2% daily)", async function () {
      expect(await stakingRewards.defaultRewardRate()).to.equal(200);
    });

    it("Should have claimDayOfWeek = 1 (Monday)", async function () {
      expect(await stakingRewards.claimDayOfWeek()).to.equal(1);
    });

    it("Should set deployer as owner", async function () {
      expect(await stakingRewards.owner()).to.equal(owner.address);
    });
  });

  // ── Admin Setters ──

  describe("Admin Setters", function () {
    describe("setDefaultRewardRate", function () {
      it("Should allow owner to update reward rate", async function () {
        await stakingRewards.setDefaultRewardRate(300);
        expect(await stakingRewards.defaultRewardRate()).to.equal(300);
      });

      it("Should revert if rate > 10000", async function () {
        await expect(stakingRewards.setDefaultRewardRate(10001))
          .to.be.revertedWith("Rate too high");
      });

      it("Should allow rate = 10000", async function () {
        await stakingRewards.setDefaultRewardRate(10000);
        expect(await stakingRewards.defaultRewardRate()).to.equal(10000);
      });

      it("Should revert from non-owner", async function () {
        await expect(stakingRewards.connect(user1).setDefaultRewardRate(300))
          .to.be.revertedWithCustomError(stakingRewards, "OwnableUnauthorizedAccount");
      });
    });

    describe("setDefaultLockPeriod", function () {
      it("Should allow owner to update lock period", async function () {
        await stakingRewards.setDefaultLockPeriod(30 * DAY);
        expect(await stakingRewards.defaultLockPeriod()).to.equal(30 * DAY);
      });

      it("Should revert if period < 7 days", async function () {
        await expect(stakingRewards.setDefaultLockPeriod(6 * DAY))
          .to.be.revertedWith("Too short");
      });

      it("Should allow exactly 7 days", async function () {
        await stakingRewards.setDefaultLockPeriod(7 * DAY);
        expect(await stakingRewards.defaultLockPeriod()).to.equal(7 * DAY);
      });

      it("Should revert from non-owner", async function () {
        await expect(stakingRewards.connect(user1).setDefaultLockPeriod(30 * DAY))
          .to.be.revertedWithCustomError(stakingRewards, "OwnableUnauthorizedAccount");
      });
    });

    describe("setClaimDayOfWeek", function () {
      it("Should allow owner to set claim day", async function () {
        await stakingRewards.setClaimDayOfWeek(5); // Friday
        expect(await stakingRewards.claimDayOfWeek()).to.equal(5);
      });

      it("Should revert if day > 6", async function () {
        await expect(stakingRewards.setClaimDayOfWeek(7))
          .to.be.revertedWith("Invalid day");
      });

      it("Should allow day = 0 (Sunday)", async function () {
        await stakingRewards.setClaimDayOfWeek(0);
        expect(await stakingRewards.claimDayOfWeek()).to.equal(0);
      });

      it("Should revert from non-owner", async function () {
        await expect(stakingRewards.connect(user1).setClaimDayOfWeek(3))
          .to.be.revertedWithCustomError(stakingRewards, "OwnableUnauthorizedAccount");
      });
    });

    describe("setWhitelistedToken", function () {
      it("Should allow owner to whitelist a token", async function () {
        await expect(stakingRewards.setWhitelistedToken(user2.address, true))
          .to.emit(stakingRewards, "TokenWhitelisted")
          .withArgs(user2.address, true);
        expect(await stakingRewards.whitelistedTokens(user2.address)).to.be.true;
      });

      it("Should allow owner to de-whitelist a token", async function () {
        await stakingRewards.setWhitelistedToken(btnToken.target, false);
        expect(await stakingRewards.whitelistedTokens(btnToken.target)).to.be.false;
      });

      it("Should revert from non-owner", async function () {
        await expect(stakingRewards.connect(user1).setWhitelistedToken(btnToken.target, false))
          .to.be.revertedWithCustomError(stakingRewards, "OwnableUnauthorizedAccount");
      });
    });
  });

  // ── Staking ──

  describe("Staking", function () {
    it("Should allow user to stake and emit event", async function () {
      await btnToken.connect(user1).approve(stakingRewards.target, STAKE_AMT);
      await expect(stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT))
        .to.emit(stakingRewards, "Staked")
        .withArgs(user1.address, btnToken.target, STAKE_AMT);
    });

    it("Should create correct StakePosition", async function () {
      await btnToken.connect(user1).approve(stakingRewards.target, STAKE_AMT);
      await stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT);

      const stakes = await stakingRewards.getUserStakes(user1.address);
      expect(stakes.length).to.equal(1);
      expect(stakes[0].token).to.equal(btnToken.target);
      expect(stakes[0].amount).to.equal(STAKE_AMT);
      expect(stakes[0].lockPeriod).to.equal(LOCK_135);
      expect(stakes[0].rewardRate).to.equal(200);
      expect(stakes[0].active).to.be.true;
    });

    it("Should transfer tokens from user to contract", async function () {
      await btnToken.connect(user1).approve(stakingRewards.target, STAKE_AMT);
      const before = await btnToken.balanceOf(user1.address);
      await stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT);
      const after = await btnToken.balanceOf(user1.address);
      expect(before - after).to.equal(STAKE_AMT);
    });

    it("Should revert staking 0 amount", async function () {
      await expect(stakingRewards.connect(user1).stake(btnToken.target, 0))
        .to.be.revertedWith("Cannot stake 0");
    });

    it("Should revert staking non-whitelisted token", async function () {
      await stakingRewards.setWhitelistedToken(btnToken.target, false);
      await btnToken.connect(user1).approve(stakingRewards.target, STAKE_AMT);
      await expect(stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT))
        .to.be.revertedWith("Token not whitelisted");
    });

    it("Should allow multiple stakes from same user", async function () {
      await btnToken.connect(user1).approve(stakingRewards.target, STAKE_AMT * 2n);
      await stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT);
      await stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT);

      const stakes = await stakingRewards.getUserStakes(user1.address);
      expect(stakes.length).to.equal(2);
    });
  });

  // ── Rewards Calculation ──

  describe("Rewards Calculation", function () {
    it("Should calculate rewards correctly after 7 days", async function () {
      await btnToken.connect(user1).approve(stakingRewards.target, 5000n * ONE_BTN);
      await stakingRewards.connect(user1).stake(btnToken.target, 5000n * ONE_BTN);

      await time.increase(7 * DAY);

      const pending = await stakingRewards.getPendingRewards(user1.address, 0);
      const expected = 700n * ONE_BTN; // 5000 * 2% * 7 days
      expect(pending).to.be.closeTo(expected, expected / 1000n);
    });

    it("Should return 0 for invalid stake index", async function () {
      expect(await stakingRewards.getPendingRewards(user1.address, 0)).to.equal(0);
      expect(await stakingRewards.getPendingRewards(user1.address, 999)).to.equal(0);
    });

    it("Should return 0 for inactive stake", async function () {
      await btnToken.connect(user1).approve(stakingRewards.target, STAKE_AMT);
      await stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT);

      // Fast forward past lock period and unstake
      await time.increase(LOCK_135 + DAY);
      await stakingRewards.connect(user1).unstake(0);

      expect(await stakingRewards.getPendingRewards(user1.address, 0)).to.equal(0);
    });

    it("Should accrue rewards per second", async function () {
      await btnToken.connect(user1).approve(stakingRewards.target, STAKE_AMT);
      await stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT);

      // Advance 1 day
      await time.increase(DAY);
      const pending1Day = await stakingRewards.getPendingRewards(user1.address, 0);

      // Advance another day
      await time.increase(DAY);
      const pending2Days = await stakingRewards.getPendingRewards(user1.address, 0);

      // Roughly double
      expect(pending2Days).to.be.closeTo(pending1Day * 2n, pending1Day / 100n);
    });
  });

  // ── Claiming ──

  describe("Claiming", function () {
    // Helper: find next Monday timestamp (contract: (ts / 86400 + 4) % 7 == 1)
    async function getNextMonday() {
      const latest = await time.latest();
      const dayNum = Math.floor(latest / DAY);
      for (let d = dayNum + 1; d <= dayNum + 8; d++) {
        if ((d + 4) % 7 === 1) {
          return d * DAY + 43200; // midday on that Monday
        }
      }
    }

    it("Should allow claim on Monday (designated day)", async function () {
      await btnToken.connect(user1).approve(stakingRewards.target, STAKE_AMT);
      await stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT);

      const monday = await getNextMonday();
      await time.setNextBlockTimestamp(monday);

      const balBefore = await btnToken.balanceOf(user1.address);
      await stakingRewards.connect(user1).claimRewards(0);
      const balAfter = await btnToken.balanceOf(user1.address);
      expect(balAfter).to.be.gt(balBefore);
    });

    it("Should emit RewardClaimed on claim", async function () {
      await btnToken.connect(user1).approve(stakingRewards.target, STAKE_AMT);
      await stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT);

      const monday = await getNextMonday();
      await time.setNextBlockTimestamp(monday);

      await expect(stakingRewards.connect(user1).claimRewards(0))
        .to.emit(stakingRewards, "RewardClaimed");
    });

    it("Should reset lastClaimTime on claim", async function () {
      await btnToken.connect(user1).approve(stakingRewards.target, STAKE_AMT);
      await stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT);

      const monday = await getNextMonday();
      await time.setNextBlockTimestamp(monday);
      await stakingRewards.connect(user1).claimRewards(0);

      // Pending should be 0 (or near-0) right after claim
      const pending = await stakingRewards.getPendingRewards(user1.address, 0);
      expect(pending).to.be.lte(ONE_BTN); // at most tiny rounding
    });

    it("Should revert claim on non-Monday", async function () {
      await btnToken.connect(user1).approve(stakingRewards.target, STAKE_AMT);
      await stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT);

      // Set to a Wednesday (day = 3 in the contract formula)
      const latest = await time.latest();
      const dayNum = Math.floor(latest / DAY);
      let wednesday;
      for (let d = dayNum + 1; d <= dayNum + 8; d++) {
        if ((d + 4) % 7 === 3) { // Wednesday
          wednesday = d * DAY + 43200;
          break;
        }
      }
      await time.setNextBlockTimestamp(wednesday);

      await expect(stakingRewards.connect(user1).claimRewards(0))
        .to.be.revertedWith("Can only claim on the designated day");
    });

    it("Should revert claim for invalid stake index", async function () {
      await expect(stakingRewards.connect(user1).claimRewards(0))
        .to.be.revertedWith("Invalid stake");
    });

    it("Should revert claim when no rewards accrued", async function () {
      // Change claim day to match current day so we can try immediately
      const latest = await time.latest();
      const currentDOW = Math.floor(latest / DAY + 4) % 7;
      await stakingRewards.setClaimDayOfWeek(currentDOW);

      await btnToken.connect(user1).approve(stakingRewards.target, STAKE_AMT);
      await stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT);

      // Find a timestamp on the correct day (same day, a few seconds later)
      const latestAfterStake = await time.latest();
      const dayNum = Math.floor(latestAfterStake / DAY);
      const targetDOW = (dayNum + 4) % 7;
      // Set claim day to match this day
      await stakingRewards.setClaimDayOfWeek(targetDOW);

      // Reward per-second is small; for tiny elapsed time, integer division → 0
      // Force 0 reward by using a very small stake
      // Actually easier: set reward rate to 0
      await stakingRewards.setDefaultRewardRate(0);

      // Unstake and re-stake with 0 rate
      await time.increase(LOCK_135 + DAY);
      await stakingRewards.connect(user1).unstake(0);

      await btnToken.connect(user1).approve(stakingRewards.target, STAKE_AMT);
      await stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT);

      // Now advance to claim day
      const lat2 = await time.latest();
      const dn2 = Math.floor(lat2 / DAY);
      const dow2 = (dn2 + 4) % 7;
      await stakingRewards.setClaimDayOfWeek(dow2);

      // Try to claim — reward = 0 because rate = 0
      // Need to be on the right day
      for (let d = dn2 + 1; d <= dn2 + 8; d++) {
        if ((d + 4) % 7 === dow2) {
          await time.setNextBlockTimestamp(d * DAY + 43200);
          break;
        }
      }
      await expect(stakingRewards.connect(user1).claimRewards(1))
        .to.be.revertedWith("No rewards to claim");
    });

    it("Should revert claim on inactive stake", async function () {
      await btnToken.connect(user1).approve(stakingRewards.target, STAKE_AMT);
      await stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT);

      // Unstake first
      await time.increase(LOCK_135 + DAY);
      await stakingRewards.connect(user1).unstake(0);

      // Try to claim on Monday
      const monday = await getNextMonday();
      await time.setNextBlockTimestamp(monday);

      await expect(stakingRewards.connect(user1).claimRewards(0))
        .to.be.revertedWith("Stake not active");
    });
  });

  // ── Unstaking ──

  describe("Unstaking", function () {
    it("Should allow unstake after lock period", async function () {
      await btnToken.connect(user1).approve(stakingRewards.target, STAKE_AMT);
      await stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT);

      await time.increase(LOCK_135 + DAY);

      const balBefore = await btnToken.balanceOf(user1.address);
      await stakingRewards.connect(user1).unstake(0);
      const balAfter = await btnToken.balanceOf(user1.address);

      // Should get back principal + rewards
      expect(balAfter - balBefore).to.be.gt(STAKE_AMT);
    });

    it("Should emit Unstaked event", async function () {
      await btnToken.connect(user1).approve(stakingRewards.target, STAKE_AMT);
      await stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT);

      await time.increase(LOCK_135 + DAY);

      await expect(stakingRewards.connect(user1).unstake(0))
        .to.emit(stakingRewards, "Unstaked");
    });

    it("Should set stake as inactive after unstake", async function () {
      await btnToken.connect(user1).approve(stakingRewards.target, STAKE_AMT);
      await stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT);

      await time.increase(LOCK_135 + DAY);
      await stakingRewards.connect(user1).unstake(0);

      const stakes = await stakingRewards.getUserStakes(user1.address);
      expect(stakes[0].active).to.be.false;
    });

    it("Should revert unstake before lock period", async function () {
      await btnToken.connect(user1).approve(stakingRewards.target, STAKE_AMT);
      await stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT);

      await expect(stakingRewards.connect(user1).unstake(0))
        .to.be.revertedWith("Lock period not ended");
    });

    it("Should revert unstake on already-unstaked position", async function () {
      await btnToken.connect(user1).approve(stakingRewards.target, STAKE_AMT);
      await stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT);

      await time.increase(LOCK_135 + DAY);
      await stakingRewards.connect(user1).unstake(0);

      await expect(stakingRewards.connect(user1).unstake(0))
        .to.be.revertedWith("Already unstaked");
    });

    it("Should revert unstake for invalid index", async function () {
      await expect(stakingRewards.connect(user1).unstake(0))
        .to.be.revertedWith("Invalid stake");
    });

    it("Should return principal + accumulated rewards", async function () {
      const amt = 5000n * ONE_BTN;
      await btnToken.connect(user1).approve(stakingRewards.target, amt);
      await stakingRewards.connect(user1).stake(btnToken.target, amt);

      // Use setNextBlockTimestamp for precise calculation
      const stakeTime = await time.latest();
      const unstakeTime = stakeTime + LOCK_135 + DAY;
      await time.setNextBlockTimestamp(unstakeTime);

      const balBefore = await btnToken.balanceOf(user1.address);
      await stakingRewards.connect(user1).unstake(0);
      const balAfter = await btnToken.balanceOf(user1.address);

      const returned = balAfter - balBefore;
      // Expected: 5000 + (5000 * 2% * 136 days) = 5000 + 13600 = 18600
      const elapsed = BigInt(unstakeTime - stakeTime);
      const dailyReward = (amt * 200n) / 10000n; // 2% = 100 BTN/day
      const rewardPerSec = dailyReward / BigInt(DAY);
      const expectedReward = rewardPerSec * elapsed;
      const expectedTotal = amt + expectedReward;

      expect(returned).to.be.closeTo(expectedTotal, expectedTotal / 1000n);
    });
  });

  // ── getUserStakes ──

  describe("getUserStakes", function () {
    it("Should return empty array for new user", async function () {
      const stakes = await stakingRewards.getUserStakes(user1.address);
      expect(stakes.length).to.equal(0);
    });

    it("Should return all positions for user", async function () {
      await btnToken.connect(user1).approve(stakingRewards.target, STAKE_AMT * 3n);
      await stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT);
      await stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT);
      await stakingRewards.connect(user1).stake(btnToken.target, STAKE_AMT);

      const stakes = await stakingRewards.getUserStakes(user1.address);
      expect(stakes.length).to.equal(3);
    });
  });
});
