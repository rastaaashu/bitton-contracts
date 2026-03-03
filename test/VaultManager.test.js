const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("VaultManager", function () {
  let vaultManager;
  let btnToken, usdt, oracle;
  let admin, user1, user2, treasury;

  // BTN/USD price: $0.50 = 50_000_000 (8 decimals)
  const BTN_PRICE = 50_000_000n;
  const ORACLE_DECIMALS = 8;

  // Tier fees in USD (6 decimals)
  const T1_FEE = 25_000_000n;  // $25
  const T2_FEE = 50_000_000n;  // $50
  const T3_FEE = 100_000_000n; // $100

  // BTN equivalents at $0.50: $25 = 50 BTN, $50 = 100 BTN, $100 = 200 BTN
  const T1_BTN = 50_000_000n;  // 50 BTN (6 decimals)
  const T2_BTN = 100_000_000n; // 100 BTN
  const T3_BTN = 200_000_000n; // 200 BTN

  beforeEach(async function () {
    [admin, user1, user2, treasury] = await ethers.getSigners();

    // Deploy BTNToken (full MAX_SUPPLY minted to admin)
    const BTN = await ethers.getContractFactory("BTNToken");
    btnToken = await BTN.deploy();

    // Deploy MockUSDT
    const USDT = await ethers.getContractFactory("MockUSDT");
    usdt = await USDT.deploy();

    // Deploy MockAggregator (BTN/USD = $0.50, 8 decimals)
    const Agg = await ethers.getContractFactory("MockAggregator");
    oracle = await Agg.deploy(BTN_PRICE, ORACLE_DECIMALS);

    // Deploy VaultManager via UUPS proxy
    const VM = await ethers.getContractFactory("VaultManager");
    vaultManager = await upgrades.deployProxy(
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

    // Fund user1 and user2 with tokens
    await btnToken.transfer(user1.address, 1_000_000_000n); // 1000 BTN
    await btnToken.transfer(user2.address, 1_000_000_000n);
    await usdt.transfer(user1.address, 1_000_000_000n);     // 1000 USDT
    await usdt.transfer(user2.address, 1_000_000_000n);
  });

  // ─── Deployment & Initialization ──────────────────────────

  describe("Initialization", function () {
    it("should set correct initial state", async function () {
      expect(await vaultManager.btnToken()).to.equal(await btnToken.getAddress());
      expect(await vaultManager.usdtToken()).to.equal(await usdt.getAddress());
      expect(await vaultManager.oracleAddress()).to.equal(await oracle.getAddress());
      expect(await vaultManager.treasuryAddress()).to.equal(treasury.address);
    });

    it("should set correct tier fees", async function () {
      expect(await vaultManager.tierFeeUSD(1)).to.equal(T1_FEE);
      expect(await vaultManager.tierFeeUSD(2)).to.equal(T2_FEE);
      expect(await vaultManager.tierFeeUSD(3)).to.equal(T3_FEE);
    });

    it("should grant admin all roles", async function () {
      const DEFAULT_ADMIN = await vaultManager.DEFAULT_ADMIN_ROLE();
      const OPERATOR = await vaultManager.OPERATOR_ROLE();
      const EMERGENCY = await vaultManager.EMERGENCY_ROLE();
      expect(await vaultManager.hasRole(DEFAULT_ADMIN, admin.address)).to.be.true;
      expect(await vaultManager.hasRole(OPERATOR, admin.address)).to.be.true;
      expect(await vaultManager.hasRole(EMERGENCY, admin.address)).to.be.true;
    });

    it("should not allow re-initialization", async function () {
      await expect(
        vaultManager.initialize(
          await btnToken.getAddress(),
          await usdt.getAddress(),
          await oracle.getAddress(),
          treasury.address,
          admin.address
        )
      ).to.be.reverted;
    });

    it("should revert if btnToken is zero address", async function () {
      const VM = await ethers.getContractFactory("VaultManager");
      await expect(
        upgrades.deployProxy(
          VM,
          [
            ethers.ZeroAddress,
            await usdt.getAddress(),
            await oracle.getAddress(),
            treasury.address,
            admin.address,
          ],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(VM, "ZeroAddress");
    });

    it("should revert if usdtToken is zero address", async function () {
      const VM = await ethers.getContractFactory("VaultManager");
      await expect(
        upgrades.deployProxy(
          VM,
          [
            await btnToken.getAddress(),
            ethers.ZeroAddress,
            await oracle.getAddress(),
            treasury.address,
            admin.address,
          ],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(VM, "ZeroAddress");
    });

    it("should revert if admin is zero address", async function () {
      const VM = await ethers.getContractFactory("VaultManager");
      await expect(
        upgrades.deployProxy(
          VM,
          [
            await btnToken.getAddress(),
            await usdt.getAddress(),
            await oracle.getAddress(),
            treasury.address,
            ethers.ZeroAddress,
          ],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(VM, "ZeroAddress");
    });

    it("should allow oracle to be zero address on init (set later)", async function () {
      const VM = await ethers.getContractFactory("VaultManager");
      const vm2 = await upgrades.deployProxy(
        VM,
        [
          await btnToken.getAddress(),
          await usdt.getAddress(),
          ethers.ZeroAddress,
          treasury.address,
          admin.address,
        ],
        { kind: "uups" }
      );
      expect(await vm2.oracleAddress()).to.equal(ethers.ZeroAddress);
    });
  });

  // ─── USDT Payment ─────────────────────────────────────────

  describe("activateVault — USDT payment", function () {
    it("should activate T1 with USDT", async function () {
      const vmAddr = await vaultManager.getAddress();
      await usdt.connect(user1).approve(vmAddr, T1_FEE);

      await expect(vaultManager.connect(user1).activateVault(1))
        .to.emit(vaultManager, "VaultActivated")
        .withArgs(user1.address, 1, T1_FEE, T1_FEE, await usdt.getAddress());

      expect(await vaultManager.isVaultActive(user1.address)).to.be.true;
      expect(await vaultManager.getUserTier(user1.address)).to.equal(1);
    });

    it("should activate T2 with USDT", async function () {
      const vmAddr = await vaultManager.getAddress();
      await usdt.connect(user1).approve(vmAddr, T2_FEE);

      await vaultManager.connect(user1).activateVault(2);
      expect(await vaultManager.getUserTier(user1.address)).to.equal(2);
    });

    it("should activate T3 with USDT", async function () {
      const vmAddr = await vaultManager.getAddress();
      await usdt.connect(user1).approve(vmAddr, T3_FEE);

      await vaultManager.connect(user1).activateVault(3);
      expect(await vaultManager.getUserTier(user1.address)).to.equal(3);
    });

    it("should transfer USDT fee to treasury", async function () {
      const vmAddr = await vaultManager.getAddress();
      await usdt.connect(user1).approve(vmAddr, T1_FEE);

      const treasuryBefore = await usdt.balanceOf(treasury.address);
      await vaultManager.connect(user1).activateVault(1);
      const treasuryAfter = await usdt.balanceOf(treasury.address);

      expect(treasuryAfter - treasuryBefore).to.equal(T1_FEE);
    });
  });

  // ─── BTN Payment ──────────────────────────────────────────

  describe("activateVault — BTN payment (oracle)", function () {
    it("should activate T1 with BTN when no USDT allowance", async function () {
      const vmAddr = await vaultManager.getAddress();
      // Only approve BTN (no USDT allowance)
      await btnToken.connect(user1).approve(vmAddr, T1_BTN);

      await expect(vaultManager.connect(user1).activateVault(1))
        .to.emit(vaultManager, "VaultActivated")
        .withArgs(user1.address, 1, T1_FEE, T1_BTN, await btnToken.getAddress());

      expect(await vaultManager.isVaultActive(user1.address)).to.be.true;
      expect(await vaultManager.getUserTier(user1.address)).to.equal(1);
    });

    it("should transfer BTN fee to treasury", async function () {
      const vmAddr = await vaultManager.getAddress();
      await btnToken.connect(user1).approve(vmAddr, T2_BTN);

      const treasuryBefore = await btnToken.balanceOf(treasury.address);
      await vaultManager.connect(user1).activateVault(2);
      const treasuryAfter = await btnToken.balanceOf(treasury.address);

      expect(treasuryAfter - treasuryBefore).to.equal(T2_BTN);
    });

    it("should use BTN when USDT balance insufficient", async function () {
      const vmAddr = await vaultManager.getAddress();
      // Approve enough USDT but drain balance
      await usdt.connect(user1).approve(vmAddr, T3_FEE);
      await usdt.connect(user1).transfer(admin.address, await usdt.balanceOf(user1.address));

      // Approve BTN
      await btnToken.connect(user1).approve(vmAddr, T3_BTN);

      await expect(vaultManager.connect(user1).activateVault(3))
        .to.emit(vaultManager, "VaultActivated")
        .withArgs(user1.address, 3, T3_FEE, T3_BTN, await btnToken.getAddress());
    });

    it("should round up BTN amount for non-exact division", async function () {
      // Set BTN price to $0.30 = 30_000_000 (8 dec)
      // T1 $25: BTN = ceil(25e6 * 1e8 / 30e6) = ceil(25e14 / 3e7) = ceil(83333333.33) = 83333334
      await oracle.setPrice(30_000_000n);

      const btnNeeded = await vaultManager.getBTNAmountForUSD(T1_FEE);
      expect(btnNeeded).to.equal(83_333_334n);

      const vmAddr = await vaultManager.getAddress();
      await btnToken.connect(user1).approve(vmAddr, btnNeeded);

      await vaultManager.connect(user1).activateVault(1);
      expect(await vaultManager.getUserTier(user1.address)).to.equal(1);
    });
  });

  // ─── Auto-detect Priority ─────────────────────────────────

  describe("Payment auto-detection (USDT-first)", function () {
    it("should prefer USDT when both tokens approved", async function () {
      const vmAddr = await vaultManager.getAddress();
      await usdt.connect(user1).approve(vmAddr, T1_FEE);
      await btnToken.connect(user1).approve(vmAddr, T1_BTN);

      const usdtBefore = await usdt.balanceOf(user1.address);
      const btnBefore = await btnToken.balanceOf(user1.address);

      await vaultManager.connect(user1).activateVault(1);

      const usdtAfter = await usdt.balanceOf(user1.address);
      const btnAfter = await btnToken.balanceOf(user1.address);

      // USDT should have been deducted, BTN untouched
      expect(usdtBefore - usdtAfter).to.equal(T1_FEE);
      expect(btnAfter).to.equal(btnBefore);
    });
  });

  // ─── Tier Upgrades ────────────────────────────────────────

  describe("Tier upgrades", function () {
    it("should allow upgrade from T1 to T2 (full fee)", async function () {
      const vmAddr = await vaultManager.getAddress();
      await usdt.connect(user1).approve(vmAddr, T1_FEE + T2_FEE);

      await vaultManager.connect(user1).activateVault(1);
      expect(await vaultManager.getUserTier(user1.address)).to.equal(1);

      await vaultManager.connect(user1).activateVault(2);
      expect(await vaultManager.getUserTier(user1.address)).to.equal(2);
    });

    it("should allow upgrade from T1 to T3 directly", async function () {
      const vmAddr = await vaultManager.getAddress();
      await usdt.connect(user1).approve(vmAddr, T1_FEE + T3_FEE);

      await vaultManager.connect(user1).activateVault(1);
      await vaultManager.connect(user1).activateVault(3);
      expect(await vaultManager.getUserTier(user1.address)).to.equal(3);
    });

    it("should allow re-activation at same tier", async function () {
      const vmAddr = await vaultManager.getAddress();
      await usdt.connect(user1).approve(vmAddr, T1_FEE * 2n);

      await vaultManager.connect(user1).activateVault(1);
      await vaultManager.connect(user1).activateVault(1); // pay again, same tier
      expect(await vaultManager.getUserTier(user1.address)).to.equal(1);
    });

    it("should revert on downgrade (T2 to T1)", async function () {
      const vmAddr = await vaultManager.getAddress();
      await usdt.connect(user1).approve(vmAddr, T2_FEE + T1_FEE);

      await vaultManager.connect(user1).activateVault(2);
      await expect(vaultManager.connect(user1).activateVault(1))
        .to.be.revertedWithCustomError(vaultManager, "CannotDowngrade")
        .withArgs(2, 1);
    });

    it("should emit VaultActivated on each upgrade", async function () {
      const vmAddr = await vaultManager.getAddress();
      await usdt.connect(user1).approve(vmAddr, T1_FEE + T3_FEE);

      await expect(vaultManager.connect(user1).activateVault(1))
        .to.emit(vaultManager, "VaultActivated");

      await expect(vaultManager.connect(user1).activateVault(3))
        .to.emit(vaultManager, "VaultActivated");
    });
  });

  // ─── Validation / Reverts ─────────────────────────────────

  describe("Validation and reverts", function () {
    it("should revert for invalid tier 0", async function () {
      await expect(vaultManager.connect(user1).activateVault(0))
        .to.be.revertedWithCustomError(vaultManager, "InvalidTier")
        .withArgs(0);
    });

    it("should revert for invalid tier 4", async function () {
      await expect(vaultManager.connect(user1).activateVault(4))
        .to.be.revertedWithCustomError(vaultManager, "InvalidTier")
        .withArgs(4);
    });

    it("should revert when treasury not set", async function () {
      const VM = await ethers.getContractFactory("VaultManager");
      const vm2 = await upgrades.deployProxy(
        VM,
        [
          await btnToken.getAddress(),
          await usdt.getAddress(),
          await oracle.getAddress(),
          ethers.ZeroAddress, // no treasury — allowed at init, blocked at activate
          admin.address,
        ],
        { kind: "uups" }
      );

      // Need to fund user and approve
      await usdt.connect(user1).approve(await vm2.getAddress(), T1_FEE);

      await expect(vm2.connect(user1).activateVault(1))
        .to.be.revertedWithCustomError(vm2, "TreasuryNotSet");
    });

    it("should revert when neither token has sufficient allowance", async function () {
      // No approvals at all
      await expect(vaultManager.connect(user1).activateVault(1))
        .to.be.revertedWithCustomError(vaultManager, "InsufficientAllowance");
    });

    it("should revert when BTN approved but balance insufficient", async function () {
      const vmAddr = await vaultManager.getAddress();
      // Drain BTN, then approve
      await btnToken.connect(user1).transfer(admin.address, await btnToken.balanceOf(user1.address));
      await btnToken.connect(user1).approve(vmAddr, T1_BTN);

      await expect(vaultManager.connect(user1).activateVault(1))
        .to.be.revertedWithCustomError(vaultManager, "InsufficientAllowance");
    });
  });

  // ─── Oracle Validation ────────────────────────────────────

  describe("Oracle validation", function () {
    it("should revert on stale oracle (>1 hour)", async function () {
      const vmAddr = await vaultManager.getAddress();
      await btnToken.connect(user1).approve(vmAddr, T1_BTN);

      // Advance time by 2 hours without updating oracle
      const now = await time.latest();
      await oracle.setUpdatedAt(now - 7200); // 2 hours ago

      await expect(vaultManager.connect(user1).activateVault(1))
        .to.be.revertedWithCustomError(vaultManager, "OracleStale");
    });

    it("should revert when oracle price is zero", async function () {
      const vmAddr = await vaultManager.getAddress();
      await btnToken.connect(user1).approve(vmAddr, T1_BTN);
      await oracle.setPrice(0);

      await expect(vaultManager.connect(user1).activateVault(1))
        .to.be.revertedWithCustomError(vaultManager, "OraclePriceInvalid");
    });

    it("should revert when oracle price is negative", async function () {
      const vmAddr = await vaultManager.getAddress();
      await btnToken.connect(user1).approve(vmAddr, T1_BTN);
      await oracle.setPrice(-1);

      await expect(vaultManager.connect(user1).activateVault(1))
        .to.be.revertedWithCustomError(vaultManager, "OraclePriceInvalid");
    });

    it("should revert when oracle not set (BTN payment path)", async function () {
      const VM = await ethers.getContractFactory("VaultManager");
      const vm2 = await upgrades.deployProxy(
        VM,
        [
          await btnToken.getAddress(),
          await usdt.getAddress(),
          ethers.ZeroAddress, // no oracle
          treasury.address,
          admin.address,
        ],
        { kind: "uups" }
      );

      const vm2Addr = await vm2.getAddress();
      await btnToken.connect(user1).approve(vm2Addr, T1_BTN);

      await expect(vm2.connect(user1).activateVault(1))
        .to.be.revertedWithCustomError(vm2, "OracleNotSet");
    });

    it("should accept oracle price exactly at 1 hour boundary", async function () {
      const vmAddr = await vaultManager.getAddress();
      await btnToken.connect(user1).approve(vmAddr, T1_BTN);

      // Use setNextBlockTimestamp for precise boundary control
      // Set oracle updatedAt to a known value, then force the next block to be exactly 3600s later
      const oracleTime = (await time.latest()) + 100; // arbitrary future anchor
      await oracle.setPriceWithTimestamp(BTN_PRICE, oracleTime);

      // Force the activateVault tx to mine at exactly oracleTime + 3600
      await time.setNextBlockTimestamp(oracleTime + 3600);

      await vaultManager.connect(user1).activateVault(1);
      expect(await vaultManager.isVaultActive(user1.address)).to.be.true;
    });
  });

  // ─── Admin Functions ──────────────────────────────────────

  describe("Admin functions", function () {
    it("should allow admin to set oracle address", async function () {
      const oldOracle = await vaultManager.oracleAddress();
      await expect(vaultManager.connect(admin).setOracleAddress(user2.address))
        .to.emit(vaultManager, "OracleAddressUpdated")
        .withArgs(oldOracle, user2.address);

      expect(await vaultManager.oracleAddress()).to.equal(user2.address);
    });

    it("should revert if non-admin sets oracle", async function () {
      await expect(vaultManager.connect(user1).setOracleAddress(user2.address))
        .to.be.reverted;
    });

    it("should revert if oracle set to zero address", async function () {
      await expect(vaultManager.connect(admin).setOracleAddress(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(vaultManager, "ZeroAddress");
    });

    it("should allow admin to set treasury address", async function () {
      const oldTreasury = await vaultManager.treasuryAddress();
      await expect(vaultManager.connect(admin).setTreasuryAddress(user2.address))
        .to.emit(vaultManager, "TreasuryAddressUpdated")
        .withArgs(oldTreasury, user2.address);

      expect(await vaultManager.treasuryAddress()).to.equal(user2.address);
    });

    it("should revert if non-admin sets treasury", async function () {
      await expect(vaultManager.connect(user1).setTreasuryAddress(user2.address))
        .to.be.reverted;
    });

    it("should revert if treasury set to zero address", async function () {
      await expect(vaultManager.connect(admin).setTreasuryAddress(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(vaultManager, "ZeroAddress");
    });
  });

  // ─── Pausable ─────────────────────────────────────────────

  describe("Pausable", function () {
    it("should allow EMERGENCY_ROLE to pause", async function () {
      await vaultManager.connect(admin).pause();
      expect(await vaultManager.paused()).to.be.true;
    });

    it("should block activateVault when paused", async function () {
      const vmAddr = await vaultManager.getAddress();
      await usdt.connect(user1).approve(vmAddr, T1_FEE);
      await vaultManager.connect(admin).pause();

      await expect(vaultManager.connect(user1).activateVault(1))
        .to.be.reverted;
    });

    it("should allow admin to unpause", async function () {
      await vaultManager.connect(admin).pause();
      await vaultManager.connect(admin).unpause();
      expect(await vaultManager.paused()).to.be.false;
    });

    it("should revert if non-emergency role pauses", async function () {
      await expect(vaultManager.connect(user1).pause())
        .to.be.reverted;
    });
  });

  // ─── UUPS Upgrade ─────────────────────────────────────────

  describe("UUPS upgrade", function () {
    it("should allow admin to upgrade", async function () {
      const VMv2 = await ethers.getContractFactory("VaultManager");
      const upgraded = await upgrades.upgradeProxy(await vaultManager.getAddress(), VMv2);
      expect(await upgraded.getAddress()).to.equal(await vaultManager.getAddress());
    });

    it("should reject upgrade from non-admin", async function () {
      const VMv2 = await ethers.getContractFactory("VaultManager", user1);
      await expect(upgrades.upgradeProxy(await vaultManager.getAddress(), VMv2))
        .to.be.reverted;
    });
  });

  // ─── View Functions ───────────────────────────────────────

  describe("View functions", function () {
    it("isVaultActive returns false for new user", async function () {
      expect(await vaultManager.isVaultActive(user2.address)).to.be.false;
    });

    it("getUserTier returns 0 for new user", async function () {
      expect(await vaultManager.getUserTier(user2.address)).to.equal(0);
    });

    it("getBTNAmountForUSD returns correct conversion", async function () {
      // BTN at $0.50 → $25 = 50 BTN
      expect(await vaultManager.getBTNAmountForUSD(T1_FEE)).to.equal(T1_BTN);
    });
  });
});
