const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AirdropBonus Contract", function () {
  let btnToken, airdropBonus, owner, buyer, upline1, upline2, upline3;

  beforeEach(async function () {
    [owner, buyer, upline1, upline2, upline3] = await ethers.getSigners();
    
    // Deploy BTN token
    const BTNToken = await ethers.getContractFactory("BTNToken");
    btnToken = await BTNToken.deploy();
    await btnToken.waitForDeployment();

    // Deploy AirdropBonus
    const AirdropBonus = await ethers.getContractFactory("AirdropBonus");
    airdropBonus = await AirdropBonus.deploy(await btnToken.getAddress());
    await airdropBonus.waitForDeployment();

    // Fund airdrop contract with BTN
    await btnToken.transfer(await airdropBonus.getAddress(), ethers.parseEther("1000000"));
  });

  it("Should deploy contracts correctly", async function () {
    expect(await btnToken.name()).to.equal("BitTON");
    expect(await btnToken.symbol()).to.equal("BTN");
    expect(await btnToken.totalSupply()).to.equal(ethers.parseEther("21000000"));
  });

  it("Should set referrer correctly", async function () {
    await airdropBonus.setReferrer(buyer.address, upline1.address);
    const refInfo = await airdropBonus.referrals(buyer.address);
    expect(refInfo.referrer).to.equal(upline1.address);
  });

  it("Should distribute airdrop to Gold rank (3 levels)", async function () {
    // Setup chain: buyer -> upline1(Gold) -> upline2(Gold) -> upline3(Gold)
    await airdropBonus.setReferrer(buyer.address, upline1.address);
    await airdropBonus.setUserRank(upline1.address, 3); // Gold
    
    await airdropBonus.setReferrer(upline1.address, upline2.address);
    await airdropBonus.setUserRank(upline2.address, 3); // Gold
    
    await airdropBonus.setReferrer(upline2.address, upline3.address);
    await airdropBonus.setUserRank(upline3.address, 3); // Gold

    const purchaseAmount = ethers.parseEther("1000"); // 1000 BTN purchase
    
    // Distribute airdrop
    await expect(airdropBonus.distributeAirdrop(buyer.address, purchaseAmount))
      .to.emit(airdropBonus, "AirdropDistributed");

    // Gold bonuses: L1=1%, L2=1%, L3=2%
    expect(await btnToken.balanceOf(upline1.address)).to.equal(ethers.parseEther("10")); // 1% of 1000
    expect(await btnToken.balanceOf(upline2.address)).to.equal(ethers.parseEther("10")); // 1% of 1000
    expect(await btnToken.balanceOf(upline3.address)).to.equal(ethers.parseEther("20")); // 2% of 1000
  });

  it("Should distribute airdrop to Ruby rank (10 levels)", async function () {
    // Setup 10-level chain with Ruby rank
    let users = [buyer, upline1, upline2, upline3];
    for (let i = 4; i < 10; i++) {
      users.push(ethers.Wallet.createRandom().connect(ethers.provider));
    }

    // Fund test accounts
    for (let i = 4; i < 10; i++) {
      await owner.sendTransaction({
        to: users[i].address,
        value: ethers.parseEther("1")
      });
    }

    // Build referral chain
    for (let i = 0; i < 9; i++) {
      await airdropBonus.setReferrer(users[i].address, users[i + 1].address);
      await airdropBonus.setUserRank(users[i + 1].address, 6); // Ruby rank
    }

    const purchaseAmount = ethers.parseEther("10000");
    await airdropBonus.distributeAirdrop(buyer.address, purchaseAmount);

    // Ruby: 1%, 1%, 1%, 1%, 1%, 1%, 2%, 3%, 4%, 4%
    expect(await btnToken.balanceOf(upline1.address)).to.equal(ethers.parseEther("100")); // L1: 1%
    expect(await btnToken.balanceOf(upline2.address)).to.equal(ethers.parseEther("100")); // L2: 1%
    expect(await btnToken.balanceOf(upline3.address)).to.equal(ethers.parseEther("100")); // L3: 1%
  });
});
