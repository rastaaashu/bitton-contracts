const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AirdropBonus (Legacy Hardening)", function () {
  let btnToken, airdropBonus;
  let owner, user1, user2, user3;
  let signers;

  const ONE_BTN = 1_000_000n;
  const PURCHASE = 10_000n * ONE_BTN;

  // Expected bonus basis points for each rank (index 0 = Level 1, index 9 = Level 10)
  const RANK_BPS = {
    1: [300, 0, 0, 0, 0, 0, 0, 0, 0, 0],             // Bronze
    2: [100, 200, 300, 0, 0, 0, 0, 0, 0, 0],           // Silver
    3: [100, 200, 300, 0, 0, 0, 0, 0, 0, 0],           // Gold
    4: [100, 100, 100, 200, 200, 200, 300, 0, 0, 0],   // Platinum
    5: [100, 100, 100, 100, 100, 100, 200, 300, 400, 0],// Sapphire
    6: [100, 100, 100, 200, 200, 200, 300, 300, 300, 400],// Ruby
    7: [100, 100, 100, 200, 200, 200, 200, 300, 400, 500],// Emerald
    8: [100, 100, 200, 200, 200, 200, 200, 400, 600, 700],// Diamond
    9: [100, 200, 200, 200, 200, 300, 400, 500, 600, 700],// Blue Diamond
  };

  beforeEach(async function () {
    signers = await ethers.getSigners();
    [owner, user1, user2, user3] = signers;

    const BTNToken = await ethers.getContractFactory("BTNToken");
    btnToken = await BTNToken.deploy();

    const AirdropBonus = await ethers.getContractFactory("AirdropBonus");
    airdropBonus = await AirdropBonus.deploy(btnToken.target);

    // Fund airdrop contract
    await btnToken.transfer(airdropBonus.target, 5_000_000n * ONE_BTN);
  });

  // ── Deployment ──

  describe("Deployment", function () {
    it("Should set btnToken correctly", async function () {
      expect(await airdropBonus.btnToken()).to.equal(btnToken.target);
    });

    it("Should set LEVELS to 10", async function () {
      expect(await airdropBonus.LEVELS()).to.equal(10);
    });

    it("Should set deployer as owner", async function () {
      expect(await airdropBonus.owner()).to.equal(owner.address);
    });

    it("Should set correct bonus percentages for all ranks", async function () {
      for (let rank = 1; rank <= 9; rank++) {
        for (let level = 0; level < 10; level++) {
          const bps = await airdropBonus.bonusPercentages(rank, level);
          expect(bps).to.equal(RANK_BPS[rank][level],
            `Rank ${rank}, Level ${level + 1} mismatch`);
        }
      }
    });
  });

  // ── Referrer Management ──

  describe("Referrer Management", function () {
    it("Should set referrer correctly", async function () {
      await airdropBonus.setReferrer(user1.address, user2.address);
      expect(await airdropBonus.referrers(user1.address)).to.equal(user2.address);
    });

    it("Should revert setting referrer twice", async function () {
      await airdropBonus.setReferrer(user1.address, user2.address);
      await expect(airdropBonus.setReferrer(user1.address, user3.address))
        .to.be.revertedWith("Referrer already set");
    });

    it("Should revert setReferrer from non-owner", async function () {
      await expect(airdropBonus.connect(user1).setReferrer(user1.address, user2.address))
        .to.be.revertedWithCustomError(airdropBonus, "OwnableUnauthorizedAccount");
    });

    it("Should return zero address for unset referrer", async function () {
      expect(await airdropBonus.referrers(user1.address)).to.equal(ethers.ZeroAddress);
    });
  });

  // ── Rank Management ──

  describe("Rank Management", function () {
    it("Should set user rank correctly", async function () {
      await airdropBonus.setUserRank(user1.address, 5);
      const info = await airdropBonus.referrals(user1.address);
      expect(info.rank).to.equal(5);
    });

    it("Should revert rank = 0", async function () {
      await expect(airdropBonus.setUserRank(user1.address, 0))
        .to.be.revertedWith("Invalid rank");
    });

    it("Should revert rank > 9", async function () {
      await expect(airdropBonus.setUserRank(user1.address, 10))
        .to.be.revertedWith("Invalid rank");
    });

    it("Should allow rank = 1 (min)", async function () {
      await airdropBonus.setUserRank(user1.address, 1);
      const info = await airdropBonus.referrals(user1.address);
      expect(info.rank).to.equal(1);
    });

    it("Should allow rank = 9 (max)", async function () {
      await airdropBonus.setUserRank(user1.address, 9);
      const info = await airdropBonus.referrals(user1.address);
      expect(info.rank).to.equal(9);
    });

    it("Should allow updating rank", async function () {
      await airdropBonus.setUserRank(user1.address, 3);
      await airdropBonus.setUserRank(user1.address, 7);
      const info = await airdropBonus.referrals(user1.address);
      expect(info.rank).to.equal(7);
    });

    it("Should revert setUserRank from non-owner", async function () {
      await expect(airdropBonus.connect(user1).setUserRank(user1.address, 3))
        .to.be.revertedWithCustomError(airdropBonus, "OwnableUnauthorizedAccount");
    });
  });

  // ── Distribute Airdrop ──

  describe("distributeAirdrop", function () {
    // Helper: build a chain of `length` uplines starting from buyer
    async function buildChain(buyer, length, rank) {
      const uplines = signers.slice(4, 4 + length); // use signers starting from index 4
      await airdropBonus.setReferrer(buyer.address, uplines[0].address);
      await airdropBonus.setUserRank(uplines[0].address, rank);
      for (let i = 0; i < length - 1; i++) {
        await airdropBonus.setReferrer(uplines[i].address, uplines[i + 1].address);
        await airdropBonus.setUserRank(uplines[i + 1].address, rank);
      }
      return uplines;
    }

    it("Should emit AirdropDistributed events", async function () {
      await airdropBonus.setReferrer(user1.address, user2.address);
      await airdropBonus.setUserRank(user2.address, 1); // Bronze
      await expect(airdropBonus.distributeAirdrop(user1.address, PURCHASE))
        .to.emit(airdropBonus, "AirdropDistributed");
    });

    it("Should distribute nothing when no referrer chain", async function () {
      // user1 has no referrer
      await airdropBonus.distributeAirdrop(user1.address, PURCHASE);
      // No revert, just no-op
    });

    it("Should skip uplines with rank = 0", async function () {
      await airdropBonus.setReferrer(user1.address, user2.address);
      // user2 rank defaults to 0
      const balBefore = await btnToken.balanceOf(user2.address);
      await airdropBonus.distributeAirdrop(user1.address, PURCHASE);
      const balAfter = await btnToken.balanceOf(user2.address);
      expect(balAfter).to.equal(balBefore);
    });

    it("Should handle zero purchase amount (no bonuses)", async function () {
      await airdropBonus.setReferrer(user1.address, user2.address);
      await airdropBonus.setUserRank(user2.address, 6);
      await airdropBonus.distributeAirdrop(user1.address, 0);
      expect(await btnToken.balanceOf(user2.address)).to.equal(0);
    });

    it("Should revert distributeAirdrop from non-owner", async function () {
      await expect(airdropBonus.connect(user1).distributeAirdrop(user1.address, PURCHASE))
        .to.be.revertedWithCustomError(airdropBonus, "OwnableUnauthorizedAccount");
    });

    // ── Per-rank distribution tests ──

    it("Bronze (rank 1): L1=3%, L2-10=0%", async function () {
      const uplines = await buildChain(user1, 3, 1);
      await airdropBonus.distributeAirdrop(user1.address, PURCHASE);

      expect(await btnToken.balanceOf(uplines[0].address)).to.equal(PURCHASE * 300n / 10000n); // 3%
      expect(await btnToken.balanceOf(uplines[1].address)).to.equal(0); // 0%
      expect(await btnToken.balanceOf(uplines[2].address)).to.equal(0);
    });

    it("Silver (rank 2): L1=1%, L2=2%, L3=3%, L4+=0%", async function () {
      const uplines = await buildChain(user1, 4, 2);
      await airdropBonus.distributeAirdrop(user1.address, PURCHASE);

      expect(await btnToken.balanceOf(uplines[0].address)).to.equal(PURCHASE * 100n / 10000n);
      expect(await btnToken.balanceOf(uplines[1].address)).to.equal(PURCHASE * 200n / 10000n);
      expect(await btnToken.balanceOf(uplines[2].address)).to.equal(PURCHASE * 300n / 10000n);
      expect(await btnToken.balanceOf(uplines[3].address)).to.equal(0);
    });

    it("Gold (rank 3): L1=1%, L2=2%, L3=3%", async function () {
      const uplines = await buildChain(user1, 3, 3);
      await airdropBonus.distributeAirdrop(user1.address, PURCHASE);

      expect(await btnToken.balanceOf(uplines[0].address)).to.equal(PURCHASE * 100n / 10000n);
      expect(await btnToken.balanceOf(uplines[1].address)).to.equal(PURCHASE * 200n / 10000n);
      expect(await btnToken.balanceOf(uplines[2].address)).to.equal(PURCHASE * 300n / 10000n);
    });

    it("Platinum (rank 4): 7 active levels", async function () {
      const uplines = await buildChain(user1, 8, 4);
      await airdropBonus.distributeAirdrop(user1.address, PURCHASE);

      const expected = [100, 100, 100, 200, 200, 200, 300, 0];
      for (let i = 0; i < 8; i++) {
        expect(await btnToken.balanceOf(uplines[i].address))
          .to.equal(PURCHASE * BigInt(expected[i]) / 10000n, `Level ${i + 1}`);
      }
    });

    it("Sapphire (rank 5): 9 active levels", async function () {
      const uplines = await buildChain(user1, 10, 5);
      await airdropBonus.distributeAirdrop(user1.address, PURCHASE);

      const expected = [100, 100, 100, 100, 100, 100, 200, 300, 400, 0];
      for (let i = 0; i < 10; i++) {
        expect(await btnToken.balanceOf(uplines[i].address))
          .to.equal(PURCHASE * BigInt(expected[i]) / 10000n, `Level ${i + 1}`);
      }
    });

    it("Ruby (rank 6): all 10 levels active", async function () {
      const uplines = await buildChain(user1, 10, 6);
      await airdropBonus.distributeAirdrop(user1.address, PURCHASE);

      for (let i = 0; i < 10; i++) {
        expect(await btnToken.balanceOf(uplines[i].address))
          .to.equal(PURCHASE * BigInt(RANK_BPS[6][i]) / 10000n, `Level ${i + 1}`);
      }
    });

    it("Emerald (rank 7): all 10 levels active", async function () {
      const uplines = await buildChain(user1, 10, 7);
      await airdropBonus.distributeAirdrop(user1.address, PURCHASE);

      for (let i = 0; i < 10; i++) {
        expect(await btnToken.balanceOf(uplines[i].address))
          .to.equal(PURCHASE * BigInt(RANK_BPS[7][i]) / 10000n, `Level ${i + 1}`);
      }
    });

    it("Diamond (rank 8): all 10 levels active", async function () {
      const uplines = await buildChain(user1, 10, 8);
      await airdropBonus.distributeAirdrop(user1.address, PURCHASE);

      for (let i = 0; i < 10; i++) {
        expect(await btnToken.balanceOf(uplines[i].address))
          .to.equal(PURCHASE * BigInt(RANK_BPS[8][i]) / 10000n, `Level ${i + 1}`);
      }
    });

    it("Blue Diamond (rank 9): all 10 levels active", async function () {
      const uplines = await buildChain(user1, 10, 9);
      await airdropBonus.distributeAirdrop(user1.address, PURCHASE);

      for (let i = 0; i < 10; i++) {
        expect(await btnToken.balanceOf(uplines[i].address))
          .to.equal(PURCHASE * BigInt(RANK_BPS[9][i]) / 10000n, `Level ${i + 1}`);
      }
    });

    it("Mixed ranks in chain: Bronze at L1, Diamond at L2", async function () {
      // buyer → user2 (Bronze) → user3 (Diamond)
      await airdropBonus.setReferrer(user1.address, user2.address);
      await airdropBonus.setUserRank(user2.address, 1); // Bronze
      await airdropBonus.setReferrer(user2.address, user3.address);
      await airdropBonus.setUserRank(user3.address, 8); // Diamond

      const amount = 1000n * ONE_BTN;
      await airdropBonus.distributeAirdrop(user1.address, amount);

      // Bronze L1 = 3%
      expect(await btnToken.balanceOf(user2.address)).to.equal(amount * 300n / 10000n);
      // Diamond L2 = 1% (Diamond's own L2 bonus = 100 bps)
      expect(await btnToken.balanceOf(user3.address)).to.equal(amount * 100n / 10000n);
    });

    it("Chain shorter than 10 levels stops at end", async function () {
      // Only 2 uplines, Ruby rank (supports 10 levels)
      const uplines = await buildChain(user1, 2, 6);
      await airdropBonus.distributeAirdrop(user1.address, PURCHASE);

      expect(await btnToken.balanceOf(uplines[0].address))
        .to.equal(PURCHASE * BigInt(RANK_BPS[6][0]) / 10000n);
      expect(await btnToken.balanceOf(uplines[1].address))
        .to.equal(PURCHASE * BigInt(RANK_BPS[6][1]) / 10000n);
    });
  });

  // ── referrals struct ──

  describe("referrals struct", function () {
    it("Should store referrer and rank together", async function () {
      await airdropBonus.setReferrer(user1.address, user2.address);
      await airdropBonus.setUserRank(user1.address, 5);

      const info = await airdropBonus.referrals(user1.address);
      expect(info.referrer).to.equal(user2.address);
      expect(info.rank).to.equal(5);
    });
  });
});
