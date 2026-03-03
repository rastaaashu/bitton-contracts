const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BTNToken (Legacy Hardening)", function () {
  let btnToken;
  let owner, minter, user1, user2;

  const MAX_SUPPLY = 21_000_000n * 10n ** 6n;
  const ONE_BTN = 1_000_000n;

  beforeEach(async function () {
    [owner, minter, user1, user2] = await ethers.getSigners();
    const BTNToken = await ethers.getContractFactory("BTNToken");
    btnToken = await BTNToken.deploy();
  });

  // ── Deployment ──

  describe("Deployment", function () {
    it("Should have correct name and symbol", async function () {
      expect(await btnToken.name()).to.equal("BTN");
      expect(await btnToken.symbol()).to.equal("BTN");
    });

    it("Should have 6 decimals", async function () {
      expect(await btnToken.decimals()).to.equal(6);
    });

    it("Should mint MAX_SUPPLY to deployer", async function () {
      expect(await btnToken.totalSupply()).to.equal(MAX_SUPPLY);
      expect(await btnToken.balanceOf(owner.address)).to.equal(MAX_SUPPLY);
    });

    it("Should set issuedSupply to MAX_SUPPLY", async function () {
      expect(await btnToken.issuedSupply()).to.equal(MAX_SUPPLY);
    });

    it("Should have burnedSupply = 0", async function () {
      expect(await btnToken.burnedSupply()).to.equal(0);
    });

    it("Should have minting active by default", async function () {
      expect(await btnToken.mintingActive()).to.be.true;
    });

    it("Should set deployer as minter", async function () {
      expect(await btnToken.isMinter(owner.address)).to.be.true;
    });

    it("Should set deployer as owner", async function () {
      expect(await btnToken.owner()).to.equal(owner.address);
    });
  });

  // ── Minter Management ──

  describe("Minter Management", function () {
    it("Should allow owner to add a minter", async function () {
      await expect(btnToken.addMinter(minter.address))
        .to.emit(btnToken, "MinterAdded")
        .withArgs(minter.address);
      expect(await btnToken.isMinter(minter.address)).to.be.true;
    });

    it("Should revert addMinter with zero address", async function () {
      await expect(btnToken.addMinter(ethers.ZeroAddress))
        .to.be.revertedWith("BTNToken: zero address");
    });

    it("Should revert addMinter for already-a-minter", async function () {
      await btnToken.addMinter(minter.address);
      await expect(btnToken.addMinter(minter.address))
        .to.be.revertedWith("BTNToken: already a minter");
    });

    it("Should revert addMinter from non-owner", async function () {
      await expect(btnToken.connect(user1).addMinter(minter.address))
        .to.be.revertedWithCustomError(btnToken, "OwnableUnauthorizedAccount");
    });

    it("Should allow owner to remove a minter", async function () {
      await btnToken.addMinter(minter.address);
      await expect(btnToken.removeMinter(minter.address))
        .to.emit(btnToken, "MinterRemoved")
        .withArgs(minter.address);
      expect(await btnToken.isMinter(minter.address)).to.be.false;
    });

    it("Should revert removeMinter for non-minter", async function () {
      await expect(btnToken.removeMinter(minter.address))
        .to.be.revertedWith("BTNToken: not a minter");
    });

    it("Should revert removeMinter from non-owner", async function () {
      await btnToken.addMinter(minter.address);
      await expect(btnToken.connect(user1).removeMinter(minter.address))
        .to.be.revertedWithCustomError(btnToken, "OwnableUnauthorizedAccount");
    });

    it("Should allow minter to renounce their minting rights", async function () {
      await btnToken.addMinter(minter.address);
      await expect(btnToken.connect(minter).renounceMinting())
        .to.emit(btnToken, "MinterRemoved")
        .withArgs(minter.address);
      expect(await btnToken.isMinter(minter.address)).to.be.false;
    });

    it("Should revert renounceMinting for non-minter", async function () {
      await expect(btnToken.connect(user1).renounceMinting())
        .to.be.revertedWith("BTNToken: caller is not a minter");
    });
  });

  // ── Minting ──

  describe("Minting", function () {
    it("Should revert mint when totalSupply is at MAX_SUPPLY", async function () {
      // totalSupply already equals MAX_SUPPLY from constructor
      await expect(btnToken.mint(user1.address, 1))
        .to.be.revertedWith("BTNToken: exceeds max supply");
    });

    it("Should allow mint after burning (within MAX_SUPPLY)", async function () {
      const burnAmount = 1000n * ONE_BTN;
      await btnToken.burn(burnAmount);

      await expect(btnToken.mint(user1.address, burnAmount))
        .to.emit(btnToken, "TokensMinted")
        .withArgs(user1.address, burnAmount);

      expect(await btnToken.balanceOf(user1.address)).to.equal(burnAmount);
      expect(await btnToken.totalSupply()).to.equal(MAX_SUPPLY);
    });

    it("Should update issuedSupply on mint", async function () {
      await btnToken.burn(100n * ONE_BTN);
      await btnToken.mint(user1.address, 50n * ONE_BTN);
      expect(await btnToken.issuedSupply()).to.equal(MAX_SUPPLY + 50n * ONE_BTN);
    });

    it("Should revert mint to zero address", async function () {
      await btnToken.burn(100n * ONE_BTN);
      await expect(btnToken.mint(ethers.ZeroAddress, 50n * ONE_BTN))
        .to.be.revertedWith("BTNToken: mint to zero address");
    });

    it("Should revert mint from non-minter", async function () {
      await btnToken.burn(100n * ONE_BTN);
      await expect(btnToken.connect(user1).mint(user1.address, 50n * ONE_BTN))
        .to.be.revertedWith("BTNToken: caller is not a minter");
    });

    it("Should allow added minter to mint", async function () {
      await btnToken.addMinter(minter.address);
      await btnToken.burn(100n * ONE_BTN);
      await btnToken.connect(minter).mint(user1.address, 50n * ONE_BTN);
      expect(await btnToken.balanceOf(user1.address)).to.equal(50n * ONE_BTN);
    });

    it("Should revert mint when minting is deactivated", async function () {
      await btnToken.setMintingActive(false);
      await btnToken.burn(100n * ONE_BTN);
      await expect(btnToken.mint(user1.address, 50n * ONE_BTN))
        .to.be.revertedWith("BTNToken: minting is not active");
    });

    it("Should allow mint after re-activating minting", async function () {
      await btnToken.setMintingActive(false);
      await btnToken.setMintingActive(true);
      await btnToken.burn(100n * ONE_BTN);
      await btnToken.mint(user1.address, 50n * ONE_BTN);
      expect(await btnToken.balanceOf(user1.address)).to.equal(50n * ONE_BTN);
    });
  });

  // ── Minting Active Toggle ──

  describe("Minting Active Toggle", function () {
    it("Should allow owner to deactivate minting", async function () {
      await expect(btnToken.setMintingActive(false))
        .to.emit(btnToken, "MintingStatusChanged")
        .withArgs(false);
      expect(await btnToken.mintingActive()).to.be.false;
    });

    it("Should allow owner to reactivate minting", async function () {
      await btnToken.setMintingActive(false);
      await expect(btnToken.setMintingActive(true))
        .to.emit(btnToken, "MintingStatusChanged")
        .withArgs(true);
      expect(await btnToken.mintingActive()).to.be.true;
    });

    it("Should revert setMintingActive from non-owner", async function () {
      await expect(btnToken.connect(user1).setMintingActive(false))
        .to.be.revertedWithCustomError(btnToken, "OwnableUnauthorizedAccount");
    });
  });

  // ── Burning ──

  describe("Burning", function () {
    it("Should burn tokens from caller's balance", async function () {
      const burnAmount = 500n * ONE_BTN;
      await expect(btnToken.burn(burnAmount))
        .to.emit(btnToken, "TokensBurned")
        .withArgs(owner.address, burnAmount);

      expect(await btnToken.balanceOf(owner.address)).to.equal(MAX_SUPPLY - burnAmount);
      expect(await btnToken.totalSupply()).to.equal(MAX_SUPPLY - burnAmount);
    });

    it("Should update burnedSupply on burn", async function () {
      const burnAmount = 1000n * ONE_BTN;
      await btnToken.burn(burnAmount);
      expect(await btnToken.burnedSupply()).to.equal(burnAmount);
    });

    it("Should revert burn exceeding balance", async function () {
      await expect(btnToken.connect(user1).burn(1))
        .to.be.reverted; // ERC20: burn amount exceeds balance
    });

    it("Should allow any holder to burn their tokens", async function () {
      await btnToken.transfer(user1.address, 100n * ONE_BTN);
      await btnToken.connect(user1).burn(50n * ONE_BTN);
      expect(await btnToken.balanceOf(user1.address)).to.equal(50n * ONE_BTN);
      expect(await btnToken.burnedSupply()).to.equal(50n * ONE_BTN);
    });
  });

  // ── ERC20 Transfers ──

  describe("ERC20 Transfers", function () {
    it("Should transfer tokens between accounts", async function () {
      await btnToken.transfer(user1.address, 100n * ONE_BTN);
      expect(await btnToken.balanceOf(user1.address)).to.equal(100n * ONE_BTN);
    });

    it("Should approve and transferFrom", async function () {
      await btnToken.approve(user1.address, 100n * ONE_BTN);
      await btnToken.connect(user1).transferFrom(owner.address, user2.address, 100n * ONE_BTN);
      expect(await btnToken.balanceOf(user2.address)).to.equal(100n * ONE_BTN);
    });
  });

  // ── Allowance Helpers ──

  describe("Allowance Helpers", function () {
    it("Should increase allowance", async function () {
      await btnToken.approve(user1.address, 100n * ONE_BTN);
      await btnToken.increaseAllowance(user1.address, 50n * ONE_BTN);
      expect(await btnToken.allowance(owner.address, user1.address)).to.equal(150n * ONE_BTN);
    });

    it("Should decrease allowance", async function () {
      await btnToken.approve(user1.address, 100n * ONE_BTN);
      await btnToken.decreaseAllowance(user1.address, 30n * ONE_BTN);
      expect(await btnToken.allowance(owner.address, user1.address)).to.equal(70n * ONE_BTN);
    });

    it("Should revert decreaseAllowance below zero", async function () {
      await btnToken.approve(user1.address, 50n * ONE_BTN);
      await expect(btnToken.decreaseAllowance(user1.address, 60n * ONE_BTN))
        .to.be.revertedWith("BTNToken: decreased allowance below zero");
    });
  });

  // ── EIP-2612 Permit ──

  describe("EIP-2612 Permit", function () {
    it("Should accept valid permit signature", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = await btnToken.nonces(owner.address);
      const domain = {
        name: "BTN",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await btnToken.getAddress(),
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const value = 100n * ONE_BTN;
      const message = {
        owner: owner.address,
        spender: user1.address,
        value: value,
        nonce: nonce,
        deadline: deadline,
      };

      const sig = await owner.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(sig);

      await btnToken.permit(owner.address, user1.address, value, deadline, v, r, s);
      expect(await btnToken.allowance(owner.address, user1.address)).to.equal(value);
    });

    it("Should revert permit with expired deadline", async function () {
      const deadline = 1; // expired
      const nonce = await btnToken.nonces(owner.address);
      const domain = {
        name: "BTN",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await btnToken.getAddress(),
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const value = 100n * ONE_BTN;
      const message = {
        owner: owner.address,
        spender: user1.address,
        value: value,
        nonce: nonce,
        deadline: deadline,
      };

      const sig = await owner.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(sig);

      await expect(btnToken.permit(owner.address, user1.address, value, deadline, v, r, s))
        .to.be.revertedWithCustomError(btnToken, "ERC2612ExpiredSignature");
    });

    it("Should revert permit with wrong signer", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = await btnToken.nonces(owner.address);
      const domain = {
        name: "BTN",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await btnToken.getAddress(),
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const value = 100n * ONE_BTN;
      const message = {
        owner: owner.address,
        spender: user1.address,
        value: value,
        nonce: nonce,
        deadline: deadline,
      };

      // Sign with user1 instead of owner
      const sig = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(sig);

      await expect(btnToken.permit(owner.address, user1.address, value, deadline, v, r, s))
        .to.be.revertedWithCustomError(btnToken, "ERC2612InvalidSigner");
    });

    it("Should increment nonce after permit", async function () {
      const nonceBefore = await btnToken.nonces(owner.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const domain = {
        name: "BTN",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await btnToken.getAddress(),
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const message = {
        owner: owner.address,
        spender: user1.address,
        value: 1n,
        nonce: nonceBefore,
        deadline: deadline,
      };
      const sig = await owner.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(sig);
      await btnToken.permit(owner.address, user1.address, 1n, deadline, v, r, s);

      expect(await btnToken.nonces(owner.address)).to.equal(nonceBefore + 1n);
    });
  });

  // ── Ownership ──

  describe("Ownership", function () {
    it("Should transfer ownership", async function () {
      await btnToken.transferOwnership(user1.address);
      expect(await btnToken.owner()).to.equal(user1.address);
    });

    it("Should allow new owner to add minter", async function () {
      await btnToken.transferOwnership(user1.address);
      await btnToken.connect(user1).addMinter(user2.address);
      expect(await btnToken.isMinter(user2.address)).to.be.true;
    });

    it("Should revert old owner calling onlyOwner", async function () {
      await btnToken.transferOwnership(user1.address);
      await expect(btnToken.addMinter(user2.address))
        .to.be.revertedWithCustomError(btnToken, "OwnableUnauthorizedAccount");
    });
  });
});
