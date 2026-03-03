const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("CustodialDistribution", function () {
  // --- Fixture ---
  async function deployCustodialFixture() {
    const [admin, operator, emergency, user1, user2, user3, treasury, relayer] =
      await ethers.getSigners();

    // Deploy BTN Token (mints full 21M to admin)
    const BTNToken = await ethers.getContractFactory("BTNToken");
    const btn = await BTNToken.deploy();
    await btn.waitForDeployment();

    // Deploy CustodialDistribution
    const Custodial = await ethers.getContractFactory("CustodialDistribution");
    const custodial = await Custodial.deploy(
      await btn.getAddress(),
      admin.address
    );
    await custodial.waitForDeployment();

    // Transfer full 21M BTN to Custodial
    const TOTAL_SUPPLY = 21_000_000n * 10n ** 6n;
    await btn
      .connect(admin)
      .transfer(await custodial.getAddress(), TOTAL_SUPPLY);

    // Grant roles
    const OPERATOR_ROLE = await custodial.OPERATOR_ROLE();
    const EMERGENCY_ROLE = await custodial.EMERGENCY_ROLE();
    await custodial.connect(admin).grantRole(OPERATOR_ROLE, operator.address);
    await custodial.connect(admin).grantRole(EMERGENCY_ROLE, emergency.address);

    return {
      btn,
      custodial,
      admin,
      operator,
      emergency,
      user1,
      user2,
      user3,
      treasury,
      relayer,
      TOTAL_SUPPLY,
      OPERATOR_ROLE,
      EMERGENCY_ROLE,
    };
  }

  // =========================================================================
  //                          DEPLOYMENT
  // =========================================================================
  describe("Deployment", function () {
    it("should set btnToken correctly", async function () {
      const { custodial, btn } = await loadFixture(deployCustodialFixture);
      expect(await custodial.btnToken()).to.equal(await btn.getAddress());
    });

    it("should grant all roles to admin", async function () {
      const { custodial, admin, OPERATOR_ROLE, EMERGENCY_ROLE } =
        await loadFixture(deployCustodialFixture);
      const DEFAULT_ADMIN = await custodial.DEFAULT_ADMIN_ROLE();
      expect(await custodial.hasRole(DEFAULT_ADMIN, admin.address)).to.be.true;
      expect(await custodial.hasRole(OPERATOR_ROLE, admin.address)).to.be.true;
      expect(await custodial.hasRole(EMERGENCY_ROLE, admin.address)).to.be.true;
    });

    it("should have migration enabled by default", async function () {
      const { custodial } = await loadFixture(deployCustodialFixture);
      expect(await custodial.isMigrationEnabled()).to.be.true;
    });

    it("should not be finalized by default", async function () {
      const { custodial } = await loadFixture(deployCustodialFixture);
      expect(await custodial.isFinalized()).to.be.false;
    });

    it("should have zero distribution cap (unlimited)", async function () {
      const { custodial } = await loadFixture(deployCustodialFixture);
      expect(await custodial.distributionCap()).to.equal(0);
    });

    it("should hold full 21M BTN balance", async function () {
      const { custodial, TOTAL_SUPPLY } = await loadFixture(
        deployCustodialFixture
      );
      expect(await custodial.getBalance()).to.equal(TOTAL_SUPPLY);
    });

    it("should revert on zero btnToken address", async function () {
      const Custodial = await ethers.getContractFactory(
        "CustodialDistribution"
      );
      const [admin] = await ethers.getSigners();
      await expect(
        Custodial.deploy(ethers.ZeroAddress, admin.address)
      ).to.be.revertedWithCustomError(Custodial, "ZeroAddress");
    });

    it("should revert on zero admin address", async function () {
      const { btn } = await loadFixture(deployCustodialFixture);
      const Custodial = await ethers.getContractFactory(
        "CustodialDistribution"
      );
      await expect(
        Custodial.deploy(await btn.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(Custodial, "ZeroAddress");
    });
  });

  // =========================================================================
  //                        DISTRIBUTE
  // =========================================================================
  describe("distribute()", function () {
    it("should distribute BTN to a user", async function () {
      const { custodial, operator, user1 } = await loadFixture(
        deployCustodialFixture
      );
      const amount = 1000n * 10n ** 6n;

      await expect(custodial.connect(operator).distribute(user1.address, amount))
        .to.emit(custodial, "TokensDistributed")
        .withArgs(user1.address, amount, operator.address);

      expect(await custodial.totalDistributed()).to.equal(amount);
    });

    it("should update user balance correctly", async function () {
      const { custodial, btn, operator, user1 } = await loadFixture(
        deployCustodialFixture
      );
      const amount = 5000n * 10n ** 6n;
      await custodial.connect(operator).distribute(user1.address, amount);
      expect(await btn.balanceOf(user1.address)).to.equal(amount);
    });

    it("should reduce custodial balance", async function () {
      const { custodial, operator, user1, TOTAL_SUPPLY } = await loadFixture(
        deployCustodialFixture
      );
      const amount = 1000n * 10n ** 6n;
      await custodial.connect(operator).distribute(user1.address, amount);
      expect(await custodial.getBalance()).to.equal(TOTAL_SUPPLY - amount);
    });

    it("should revert for non-operator", async function () {
      const { custodial, user1 } = await loadFixture(deployCustodialFixture);
      await expect(
        custodial.connect(user1).distribute(user1.address, 1000)
      ).to.be.reverted;
    });

    it("should revert for zero address", async function () {
      const { custodial, operator } = await loadFixture(
        deployCustodialFixture
      );
      await expect(
        custodial.connect(operator).distribute(ethers.ZeroAddress, 1000)
      ).to.be.revertedWithCustomError(custodial, "ZeroAddress");
    });

    it("should revert for zero amount", async function () {
      const { custodial, operator, user1 } = await loadFixture(
        deployCustodialFixture
      );
      await expect(
        custodial.connect(operator).distribute(user1.address, 0)
      ).to.be.revertedWithCustomError(custodial, "ZeroAmount");
    });

    it("should revert if insufficient balance", async function () {
      const { custodial, operator, user1, TOTAL_SUPPLY } = await loadFixture(
        deployCustodialFixture
      );
      const tooMuch = TOTAL_SUPPLY + 1n;
      await expect(
        custodial.connect(operator).distribute(user1.address, tooMuch)
      ).to.be.revertedWithCustomError(custodial, "InsufficientBalance");
    });

    it("should enforce distribution cap", async function () {
      const { custodial, admin, operator, user1 } = await loadFixture(
        deployCustodialFixture
      );
      const cap = 500n * 10n ** 6n;
      await custodial.connect(admin).setDistributionCap(cap);

      // Under cap — should work
      await custodial.connect(operator).distribute(user1.address, cap);

      // Over cap — should revert
      await expect(
        custodial.connect(operator).distribute(user1.address, cap + 1n)
      ).to.be.revertedWithCustomError(custodial, "DistributionCapExceeded");
    });

    it("should revert when paused", async function () {
      const { custodial, emergency, operator, user1 } = await loadFixture(
        deployCustodialFixture
      );
      await custodial.connect(emergency).pause();
      await expect(
        custodial
          .connect(operator)
          .distribute(user1.address, 1000n * 10n ** 6n)
      ).to.be.reverted;
    });

    it("should allow multiple distributions", async function () {
      const { custodial, operator, user1, user2 } = await loadFixture(
        deployCustodialFixture
      );
      const amount1 = 1000n * 10n ** 6n;
      const amount2 = 2000n * 10n ** 6n;

      await custodial.connect(operator).distribute(user1.address, amount1);
      await custodial.connect(operator).distribute(user2.address, amount2);

      expect(await custodial.totalDistributed()).to.equal(amount1 + amount2);
    });
  });

  // =========================================================================
  //                        FUND CONTRACT
  // =========================================================================
  describe("fundContract()", function () {
    it("should fund a target contract", async function () {
      const { custodial, btn, operator, treasury } = await loadFixture(
        deployCustodialFixture
      );
      const amount = 10000n * 10n ** 6n;

      await expect(
        custodial.connect(operator).fundContract(treasury.address, amount)
      )
        .to.emit(custodial, "ContractFunded")
        .withArgs(treasury.address, amount, operator.address);

      expect(await btn.balanceOf(treasury.address)).to.equal(amount);
      expect(await custodial.totalDistributed()).to.equal(amount);
    });

    it("should revert for non-operator", async function () {
      const { custodial, user1, treasury } = await loadFixture(
        deployCustodialFixture
      );
      await expect(
        custodial.connect(user1).fundContract(treasury.address, 1000)
      ).to.be.reverted;
    });

    it("should revert for zero address", async function () {
      const { custodial, operator } = await loadFixture(
        deployCustodialFixture
      );
      await expect(
        custodial.connect(operator).fundContract(ethers.ZeroAddress, 1000)
      ).to.be.revertedWithCustomError(custodial, "ZeroAddress");
    });

    it("should revert for zero amount", async function () {
      const { custodial, operator, treasury } = await loadFixture(
        deployCustodialFixture
      );
      await expect(
        custodial.connect(operator).fundContract(treasury.address, 0)
      ).to.be.revertedWithCustomError(custodial, "ZeroAmount");
    });

    it("should enforce distribution cap", async function () {
      const { custodial, admin, operator, treasury } = await loadFixture(
        deployCustodialFixture
      );
      const cap = 1000n * 10n ** 6n;
      await custodial.connect(admin).setDistributionCap(cap);

      await expect(
        custodial.connect(operator).fundContract(treasury.address, cap + 1n)
      ).to.be.revertedWithCustomError(custodial, "DistributionCapExceeded");
    });
  });

  // =========================================================================
  //                        RETURN TOKENS
  // =========================================================================
  describe("returnTokens()", function () {
    it("should accept tokens back from anyone", async function () {
      const { custodial, btn, operator, user1 } = await loadFixture(
        deployCustodialFixture
      );
      const distAmount = 5000n * 10n ** 6n;
      const returnAmount = 2000n * 10n ** 6n;

      // Distribute some to user1 first
      await custodial.connect(operator).distribute(user1.address, distAmount);

      // User1 returns some
      await btn
        .connect(user1)
        .approve(await custodial.getAddress(), returnAmount);

      await expect(custodial.connect(user1).returnTokens(returnAmount))
        .to.emit(custodial, "TokensReturned")
        .withArgs(user1.address, returnAmount);

      expect(await custodial.totalReturned()).to.equal(returnAmount);
    });

    it("should revert for zero amount", async function () {
      const { custodial, user1 } = await loadFixture(deployCustodialFixture);
      await expect(
        custodial.connect(user1).returnTokens(0)
      ).to.be.revertedWithCustomError(custodial, "ZeroAmount");
    });

    it("should work even when paused (no pause restriction)", async function () {
      const { custodial, btn, emergency, operator, user1 } = await loadFixture(
        deployCustodialFixture
      );
      const amount = 1000n * 10n ** 6n;

      // Distribute to user1
      await custodial.connect(operator).distribute(user1.address, amount);

      // Pause
      await custodial.connect(emergency).pause();

      // Return should still work (no whenNotPaused on returnTokens)
      await btn
        .connect(user1)
        .approve(await custodial.getAddress(), amount);
      await custodial.connect(user1).returnTokens(amount);
      expect(await custodial.totalReturned()).to.equal(amount);
    });
  });

  // =========================================================================
  //                        BATCH MIGRATE
  // =========================================================================
  describe("batchMigrate()", function () {
    it("should migrate tokens to multiple recipients", async function () {
      const { custodial, btn, operator, user1, user2, user3 } =
        await loadFixture(deployCustodialFixture);
      const amounts = [100n * 10n ** 6n, 200n * 10n ** 6n, 300n * 10n ** 6n];

      const tx = await custodial
        .connect(operator)
        .batchMigrate(
          [user1.address, user2.address, user3.address],
          amounts
        );

      // Check balances
      expect(await btn.balanceOf(user1.address)).to.equal(amounts[0]);
      expect(await btn.balanceOf(user2.address)).to.equal(amounts[1]);
      expect(await btn.balanceOf(user3.address)).to.equal(amounts[2]);

      // Check migration claims
      expect(await custodial.hasMigrated(user1.address)).to.be.true;
      expect(await custodial.hasMigrated(user2.address)).to.be.true;
      expect(await custodial.hasMigrated(user3.address)).to.be.true;

      // Check totals
      const totalMig = amounts[0] + amounts[1] + amounts[2];
      expect(await custodial.totalMigrated()).to.equal(totalMig);
    });

    it("should emit MigrationClaimed for each recipient", async function () {
      const { custodial, operator, user1, user2 } = await loadFixture(
        deployCustodialFixture
      );
      const amounts = [100n * 10n ** 6n, 200n * 10n ** 6n];

      await expect(
        custodial
          .connect(operator)
          .batchMigrate([user1.address, user2.address], amounts)
      )
        .to.emit(custodial, "MigrationClaimed")
        .withArgs(user1.address, amounts[0])
        .to.emit(custodial, "MigrationClaimed")
        .withArgs(user2.address, amounts[1]);
    });

    it("should skip already-claimed addresses without reverting", async function () {
      const { custodial, btn, operator, user1, user2 } = await loadFixture(
        deployCustodialFixture
      );
      const amount = 100n * 10n ** 6n;

      // First batch — user1 claims
      await custodial
        .connect(operator)
        .batchMigrate([user1.address], [amount]);
      expect(await btn.balanceOf(user1.address)).to.equal(amount);

      // Second batch — user1 is skipped, user2 claims
      await custodial
        .connect(operator)
        .batchMigrate([user1.address, user2.address], [amount, amount]);

      // user1 should NOT get double
      expect(await btn.balanceOf(user1.address)).to.equal(amount);
      // user2 should get their share
      expect(await btn.balanceOf(user2.address)).to.equal(amount);
    });

    it("should revert if migration is disabled", async function () {
      const { custodial, admin, operator, user1 } = await loadFixture(
        deployCustodialFixture
      );
      await custodial.connect(admin).disableMigration();
      await expect(
        custodial
          .connect(operator)
          .batchMigrate([user1.address], [100n * 10n ** 6n])
      ).to.be.revertedWithCustomError(custodial, "MigrationNotEnabled");
    });

    it("should revert if array lengths mismatch", async function () {
      const { custodial, operator, user1, user2 } = await loadFixture(
        deployCustodialFixture
      );
      await expect(
        custodial
          .connect(operator)
          .batchMigrate(
            [user1.address, user2.address],
            [100n * 10n ** 6n]
          )
      ).to.be.revertedWithCustomError(custodial, "ArrayLengthMismatch");
    });

    it("should revert if batch exceeds MAX_BATCH_SIZE", async function () {
      const { custodial, operator } = await loadFixture(
        deployCustodialFixture
      );
      // Create 201 addresses
      const addresses = [];
      const amounts = [];
      for (let i = 0; i < 201; i++) {
        addresses.push(ethers.Wallet.createRandom().address);
        amounts.push(1n * 10n ** 6n);
      }
      await expect(
        custodial.connect(operator).batchMigrate(addresses, amounts)
      ).to.be.revertedWithCustomError(custodial, "BatchTooLarge");
    });

    it("should revert if insufficient balance for batch total", async function () {
      const { custodial, operator, user1, TOTAL_SUPPLY } = await loadFixture(
        deployCustodialFixture
      );
      // Try to migrate more than total supply
      await expect(
        custodial
          .connect(operator)
          .batchMigrate([user1.address], [TOTAL_SUPPLY + 1n])
      ).to.be.revertedWithCustomError(custodial, "InsufficientBalance");
    });

    it("should revert for zero address in batch", async function () {
      const { custodial, operator } = await loadFixture(
        deployCustodialFixture
      );
      await expect(
        custodial
          .connect(operator)
          .batchMigrate([ethers.ZeroAddress], [100n * 10n ** 6n])
      ).to.be.revertedWithCustomError(custodial, "ZeroAddress");
    });

    it("should revert for zero amount in batch", async function () {
      const { custodial, operator, user1 } = await loadFixture(
        deployCustodialFixture
      );
      await expect(
        custodial.connect(operator).batchMigrate([user1.address], [0])
      ).to.be.revertedWithCustomError(custodial, "ZeroAmount");
    });

    it("should revert for non-operator", async function () {
      const { custodial, user1 } = await loadFixture(deployCustodialFixture);
      await expect(
        custodial
          .connect(user1)
          .batchMigrate([user1.address], [100n * 10n ** 6n])
      ).to.be.reverted;
    });

    it("should handle maximum batch size (200)", async function () {
      const { custodial, operator } = await loadFixture(
        deployCustodialFixture
      );
      const addresses = [];
      const amounts = [];
      for (let i = 0; i < 200; i++) {
        addresses.push(ethers.Wallet.createRandom().address);
        amounts.push(1n * 10n ** 6n); // 1 BTN each
      }
      // Should not revert
      await custodial.connect(operator).batchMigrate(addresses, amounts);
      expect(await custodial.totalMigrated()).to.equal(200n * 10n ** 6n);
    });
  });

  // =========================================================================
  //                       DISABLE MIGRATION
  // =========================================================================
  describe("disableMigration()", function () {
    it("should disable migration", async function () {
      const { custodial, admin } = await loadFixture(deployCustodialFixture);
      await expect(custodial.connect(admin).disableMigration())
        .to.emit(custodial, "MigrationDisabled");
      expect(await custodial.isMigrationEnabled()).to.be.false;
    });

    it("should revert for non-admin", async function () {
      const { custodial, operator } = await loadFixture(
        deployCustodialFixture
      );
      await expect(
        custodial.connect(operator).disableMigration()
      ).to.be.reverted;
    });

    it("should be callable multiple times without error", async function () {
      const { custodial, admin } = await loadFixture(deployCustodialFixture);
      await custodial.connect(admin).disableMigration();
      // Second call should still work (idempotent)
      await custodial.connect(admin).disableMigration();
      expect(await custodial.isMigrationEnabled()).to.be.false;
    });
  });

  // =========================================================================
  //                       DISTRIBUTION CAP
  // =========================================================================
  describe("setDistributionCap()", function () {
    it("should set the distribution cap", async function () {
      const { custodial, admin } = await loadFixture(deployCustodialFixture);
      const cap = 10000n * 10n ** 6n;

      await expect(custodial.connect(admin).setDistributionCap(cap))
        .to.emit(custodial, "DistributionCapUpdated")
        .withArgs(0, cap);

      expect(await custodial.distributionCap()).to.equal(cap);
    });

    it("should allow setting cap to zero (unlimited)", async function () {
      const { custodial, admin } = await loadFixture(deployCustodialFixture);
      const cap = 10000n * 10n ** 6n;
      await custodial.connect(admin).setDistributionCap(cap);
      await custodial.connect(admin).setDistributionCap(0);
      expect(await custodial.distributionCap()).to.equal(0);
    });

    it("should revert after finalization", async function () {
      const { custodial, admin } = await loadFixture(deployCustodialFixture);
      await custodial.connect(admin).finalize();
      // Admin role is renounced, so this reverts due to access control
      await expect(
        custodial.connect(admin).setDistributionCap(1000)
      ).to.be.reverted;
    });

    it("should revert for non-admin", async function () {
      const { custodial, operator } = await loadFixture(
        deployCustodialFixture
      );
      await expect(
        custodial.connect(operator).setDistributionCap(1000)
      ).to.be.reverted;
    });
  });

  // =========================================================================
  //                       PAUSE / UNPAUSE
  // =========================================================================
  describe("Pause/Unpause", function () {
    it("should allow EMERGENCY_ROLE to pause", async function () {
      const { custodial, emergency } = await loadFixture(
        deployCustodialFixture
      );
      await custodial.connect(emergency).pause();
      expect(await custodial.paused()).to.be.true;
    });

    it("should allow admin to unpause", async function () {
      const { custodial, admin, emergency } = await loadFixture(
        deployCustodialFixture
      );
      await custodial.connect(emergency).pause();
      await custodial.connect(admin).unpause();
      expect(await custodial.paused()).to.be.false;
    });

    it("should block distributions when paused", async function () {
      const { custodial, emergency, operator, user1 } = await loadFixture(
        deployCustodialFixture
      );
      await custodial.connect(emergency).pause();
      await expect(
        custodial
          .connect(operator)
          .distribute(user1.address, 1000n * 10n ** 6n)
      ).to.be.reverted;
    });

    it("should block fundContract when paused", async function () {
      const { custodial, emergency, operator, treasury } = await loadFixture(
        deployCustodialFixture
      );
      await custodial.connect(emergency).pause();
      await expect(
        custodial
          .connect(operator)
          .fundContract(treasury.address, 1000n * 10n ** 6n)
      ).to.be.reverted;
    });

    it("should block batchMigrate when paused", async function () {
      const { custodial, emergency, operator, user1 } = await loadFixture(
        deployCustodialFixture
      );
      await custodial.connect(emergency).pause();
      await expect(
        custodial
          .connect(operator)
          .batchMigrate([user1.address], [100n * 10n ** 6n])
      ).to.be.reverted;
    });

    it("should revert pause for non-emergency role", async function () {
      const { custodial, user1 } = await loadFixture(deployCustodialFixture);
      await expect(custodial.connect(user1).pause()).to.be.reverted;
    });

    it("should revert unpause for non-admin", async function () {
      const { custodial, emergency, operator } = await loadFixture(
        deployCustodialFixture
      );
      await custodial.connect(emergency).pause();
      await expect(custodial.connect(operator).unpause()).to.be.reverted;
    });
  });

  // =========================================================================
  //                       FINALIZATION
  // =========================================================================
  describe("finalize()", function () {
    it("should set finalized to true", async function () {
      const { custodial, admin } = await loadFixture(deployCustodialFixture);
      await expect(custodial.connect(admin).finalize())
        .to.emit(custodial, "ContractFinalized")
        .withArgs(admin.address);
      expect(await custodial.isFinalized()).to.be.true;
    });

    it("should renounce DEFAULT_ADMIN_ROLE from caller", async function () {
      const { custodial, admin } = await loadFixture(deployCustodialFixture);
      const DEFAULT_ADMIN = await custodial.DEFAULT_ADMIN_ROLE();
      await custodial.connect(admin).finalize();
      expect(await custodial.hasRole(DEFAULT_ADMIN, admin.address)).to.be
        .false;
    });

    it("should prevent granting new roles after finalization", async function () {
      const { custodial, admin, user1, OPERATOR_ROLE } = await loadFixture(
        deployCustodialFixture
      );
      await custodial.connect(admin).finalize();
      // Admin role renounced — cannot grant anymore
      await expect(
        custodial.connect(admin).grantRole(OPERATOR_ROLE, user1.address)
      ).to.be.reverted;
    });

    it("should prevent revoking roles after finalization", async function () {
      const { custodial, admin, operator, OPERATOR_ROLE } = await loadFixture(
        deployCustodialFixture
      );
      await custodial.connect(admin).finalize();
      await expect(
        custodial.connect(admin).revokeRole(OPERATOR_ROLE, operator.address)
      ).to.be.reverted;
    });

    it("should still allow operator to distribute after finalization", async function () {
      const { custodial, admin, operator, user1 } = await loadFixture(
        deployCustodialFixture
      );
      await custodial.connect(admin).finalize();

      // Operator should still work
      const amount = 1000n * 10n ** 6n;
      await custodial.connect(operator).distribute(user1.address, amount);
      expect(await custodial.totalDistributed()).to.equal(amount);
    });

    it("should still allow return tokens after finalization", async function () {
      const { custodial, btn, admin, operator, user1 } = await loadFixture(
        deployCustodialFixture
      );
      const amount = 1000n * 10n ** 6n;
      await custodial.connect(operator).distribute(user1.address, amount);
      await custodial.connect(admin).finalize();

      // Return should still work
      await btn
        .connect(user1)
        .approve(await custodial.getAddress(), amount);
      await custodial.connect(user1).returnTokens(amount);
    });

    it("should revert finalize for non-admin", async function () {
      const { custodial, operator } = await loadFixture(
        deployCustodialFixture
      );
      await expect(custodial.connect(operator).finalize()).to.be.reverted;
    });

    it("should revert double finalization", async function () {
      const { custodial, admin } = await loadFixture(deployCustodialFixture);
      await custodial.connect(admin).finalize();
      // Admin role is gone, so second call reverts on access check
      await expect(custodial.connect(admin).finalize()).to.be.reverted;
    });

    it("should prevent setDistributionCap after finalization", async function () {
      const { custodial, admin } = await loadFixture(deployCustodialFixture);
      await custodial.connect(admin).finalize();
      await expect(
        custodial.connect(admin).setDistributionCap(1000)
      ).to.be.reverted;
    });
  });

  // =========================================================================
  //                       VIEWS / ACCOUNTING
  // =========================================================================
  describe("Accounting", function () {
    it("should track totalDistributed across distribute and fundContract", async function () {
      const { custodial, operator, user1, treasury } = await loadFixture(
        deployCustodialFixture
      );
      const a1 = 1000n * 10n ** 6n;
      const a2 = 2000n * 10n ** 6n;
      await custodial.connect(operator).distribute(user1.address, a1);
      await custodial.connect(operator).fundContract(treasury.address, a2);
      expect(await custodial.totalDistributed()).to.equal(a1 + a2);
    });

    it("should track totalReturned correctly", async function () {
      const { custodial, btn, operator, user1 } = await loadFixture(
        deployCustodialFixture
      );
      const dist = 5000n * 10n ** 6n;
      const ret1 = 1000n * 10n ** 6n;
      const ret2 = 2000n * 10n ** 6n;

      await custodial.connect(operator).distribute(user1.address, dist);
      await btn
        .connect(user1)
        .approve(await custodial.getAddress(), ret1 + ret2);
      await custodial.connect(user1).returnTokens(ret1);
      await custodial.connect(user1).returnTokens(ret2);

      expect(await custodial.totalReturned()).to.equal(ret1 + ret2);
    });

    it("should track totalMigrated separately", async function () {
      const { custodial, operator, user1, user2 } = await loadFixture(
        deployCustodialFixture
      );
      const m1 = 100n * 10n ** 6n;
      const m2 = 200n * 10n ** 6n;
      const d1 = 500n * 10n ** 6n;

      // Migrate
      await custodial
        .connect(operator)
        .batchMigrate([user1.address, user2.address], [m1, m2]);

      // Distribute (non-migration)
      await custodial.connect(operator).distribute(user1.address, d1);

      expect(await custodial.totalMigrated()).to.equal(m1 + m2);
      // totalDistributed includes migration + distribution
      expect(await custodial.totalDistributed()).to.equal(m1 + m2 + d1);
    });

    it("getBalance should reflect actual token balance", async function () {
      const { custodial, btn, operator, user1, TOTAL_SUPPLY } =
        await loadFixture(deployCustodialFixture);
      const amount = 1000n * 10n ** 6n;

      expect(await custodial.getBalance()).to.equal(TOTAL_SUPPLY);
      await custodial.connect(operator).distribute(user1.address, amount);
      expect(await custodial.getBalance()).to.equal(TOTAL_SUPPLY - amount);

      // Direct transfer (not via returnTokens)
      await btn
        .connect(user1)
        .transfer(await custodial.getAddress(), amount);
      expect(await custodial.getBalance()).to.equal(TOTAL_SUPPLY);
    });
  });

  // =========================================================================
  //                   INTEGRATION: FULL LIFECYCLE
  // =========================================================================
  describe("Full Lifecycle", function () {
    it("should handle: deploy → fund → migrate → distribute → return → finalize", async function () {
      const { custodial, btn, admin, operator, user1, user2, treasury, TOTAL_SUPPLY } =
        await loadFixture(deployCustodialFixture);

      // 1. Fund a target contract (simulated as treasury)
      const fundAmount = 100_000n * 10n ** 6n;
      await custodial.connect(operator).fundContract(treasury.address, fundAmount);

      // 2. Batch migrate some users
      const migAmount1 = 500n * 10n ** 6n;
      const migAmount2 = 750n * 10n ** 6n;
      await custodial
        .connect(operator)
        .batchMigrate(
          [user1.address, user2.address],
          [migAmount1, migAmount2]
        );

      // 3. Distribute to user1 (non-migration)
      const distAmount = 200n * 10n ** 6n;
      await custodial.connect(operator).distribute(user1.address, distAmount);

      // 4. User1 returns some tokens (secondary market)
      const returnAmount = 100n * 10n ** 6n;
      await btn
        .connect(user1)
        .approve(await custodial.getAddress(), returnAmount);
      await custodial.connect(user1).returnTokens(returnAmount);

      // 5. Verify accounting
      const totalOut = fundAmount + migAmount1 + migAmount2 + distAmount;
      expect(await custodial.totalDistributed()).to.equal(totalOut);
      expect(await custodial.totalMigrated()).to.equal(
        migAmount1 + migAmount2
      );
      expect(await custodial.totalReturned()).to.equal(returnAmount);
      expect(await custodial.getBalance()).to.equal(
        TOTAL_SUPPLY - totalOut + returnAmount
      );

      // 6. Disable migration
      await custodial.connect(admin).disableMigration();
      expect(await custodial.isMigrationEnabled()).to.be.false;

      // 7. Set distribution cap
      const cap = 50_000n * 10n ** 6n;
      await custodial.connect(admin).setDistributionCap(cap);

      // 8. Finalize
      await custodial.connect(admin).finalize();
      expect(await custodial.isFinalized()).to.be.true;

      // 9. Post-finalization: operator can still distribute (within cap)
      await custodial
        .connect(operator)
        .distribute(user2.address, 1000n * 10n ** 6n);

      // 10. Post-finalization: cannot change cap
      await expect(
        custodial.connect(admin).setDistributionCap(0)
      ).to.be.reverted;

      // 11. Post-finalization: cannot grant roles
      const OPERATOR_ROLE = await custodial.OPERATOR_ROLE();
      await expect(
        custodial.connect(admin).grantRole(OPERATOR_ROLE, user1.address)
      ).to.be.reverted;
    });
  });

  // =========================================================================
  //                   EDGE CASES / PROPERTY TESTS
  // =========================================================================
  describe("Edge Cases & Property Tests", function () {
    it("should handle distribute of 1 unit (minimum)", async function () {
      const { custodial, btn, operator, user1 } = await loadFixture(
        deployCustodialFixture
      );
      await custodial.connect(operator).distribute(user1.address, 1);
      expect(await btn.balanceOf(user1.address)).to.equal(1);
    });

    it("should handle distributing entire balance", async function () {
      const { custodial, operator, user1, TOTAL_SUPPLY } = await loadFixture(
        deployCustodialFixture
      );
      await custodial.connect(operator).distribute(user1.address, TOTAL_SUPPLY);
      expect(await custodial.getBalance()).to.equal(0);
    });

    it("should handle return after full drain", async function () {
      const { custodial, btn, operator, user1, TOTAL_SUPPLY } =
        await loadFixture(deployCustodialFixture);

      // Drain everything
      await custodial.connect(operator).distribute(user1.address, TOTAL_SUPPLY);
      expect(await custodial.getBalance()).to.equal(0);

      // Return some
      const returnAmount = 5000n * 10n ** 6n;
      await btn
        .connect(user1)
        .approve(await custodial.getAddress(), returnAmount);
      await custodial.connect(user1).returnTokens(returnAmount);
      expect(await custodial.getBalance()).to.equal(returnAmount);

      // Should be able to distribute again from returned tokens
      await custodial.connect(operator).distribute(user1.address, returnAmount);
      expect(await custodial.getBalance()).to.equal(0);
    });

    it("should handle migration with skips counting correctly", async function () {
      const { custodial, btn, operator, user1, user2 } = await loadFixture(
        deployCustodialFixture
      );
      const amount = 100n * 10n ** 6n;

      // First migration
      await custodial
        .connect(operator)
        .batchMigrate([user1.address], [amount]);

      // Second batch with user1 (already claimed) and user2 (new)
      const balanceBefore = await custodial.getBalance();
      await custodial
        .connect(operator)
        .batchMigrate([user1.address, user2.address], [amount, amount]);

      // Only user2's amount should be deducted
      expect(await custodial.getBalance()).to.equal(balanceBefore - amount);

      // user1 balance unchanged
      expect(await btn.balanceOf(user1.address)).to.equal(amount);
      // user2 got their tokens
      expect(await btn.balanceOf(user2.address)).to.equal(amount);
    });

    it("admin role renounced means no recovery", async function () {
      const { custodial, admin, user1, OPERATOR_ROLE } = await loadFixture(
        deployCustodialFixture
      );
      await custodial.connect(admin).finalize();

      // Even admin cannot re-grant themselves admin
      const DEFAULT_ADMIN = await custodial.DEFAULT_ADMIN_ROLE();
      await expect(
        custodial.connect(admin).grantRole(DEFAULT_ADMIN, admin.address)
      ).to.be.reverted;

      // No one can grant any role
      await expect(
        custodial.connect(user1).grantRole(OPERATOR_ROLE, user1.address)
      ).to.be.reverted;
    });

    it("emergency pause survives finalization", async function () {
      const { custodial, admin, emergency, operator, user1 } =
        await loadFixture(deployCustodialFixture);

      await custodial.connect(admin).finalize();

      // Emergency role holder can still pause
      await custodial.connect(emergency).pause();
      expect(await custodial.paused()).to.be.true;

      // Distributions blocked
      await expect(
        custodial
          .connect(operator)
          .distribute(user1.address, 1000n * 10n ** 6n)
      ).to.be.reverted;

      // But no one can unpause (admin role renounced)
      await expect(custodial.connect(admin).unpause()).to.be.reverted;
      await expect(custodial.connect(emergency).unpause()).to.be.reverted;
    });
  });
});
