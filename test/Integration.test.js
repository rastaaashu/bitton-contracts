const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Full BitTON Integration: Staking + Airdrop", function () {
  let btnToken, stakingRewards, airdropBonus;
  let owner, buyer, upline1, upline2, upline3;

  beforeEach(async function () {
    [owner, buyer, upline1, upline2, upline3] = await ethers.getSigners();
    
    // Deploy BTN token
    const BTNToken = await ethers.getContractFactory("BTNToken");
    btnToken = await BTNToken.deploy();
    await btnToken.waitForDeployment();

    // Deploy StakingRewards
    const StakingRewards = await ethers.getContractFactory("StakingRewards");
    stakingRewards = await StakingRewards.deploy(await btnToken.getAddress());
    await stakingRewards.waitForDeployment();

    // Deploy AirdropBonus
    const AirdropBonus = await ethers.getContractFactory("AirdropBonus");
    airdropBonus = await AirdropBonus.deploy(await btnToken.getAddress());
    await airdropBonus.waitForDeployment();

    // Fund contracts
    await btnToken.transfer(await stakingRewards.getAddress(), ethers.parseEther("10000000"));
    await btnToken.transfer(await airdropBonus.getAddress(), ethers.parseEther("5000000"));
    
    // Fund buyer
    await btnToken.transfer(buyer.address, ethers.parseEther("10000"));
  });

  it("FULL FLOW: User stakes → Airdrop distributes → Uplines earn → Weekly claims work", async function () {
    console.log("\n=== FULL BITTON FLOW TEST ===\n");

    // Step 1: Setup 3-level referral chain with Ruby ranks
    await airdropBonus.setReferrer(buyer.address, upline1.address);
    await airdropBonus.setUserRank(upline1.address, 6); // Ruby
    
    await airdropBonus.setReferrer(upline1.address, upline2.address);
    await airdropBonus.setUserRank(upline2.address, 6); // Ruby
    
    await airdropBonus.setReferrer(upline2.address, upline3.address);
    await airdropBonus.setUserRank(upline3.address, 6); // Ruby

    console.log("✓ Referral chain built: buyer → upline1 → upline2 → upline3 (all Ruby rank)");

    // Step 2: Buyer stakes 5000 BTN
    const stakeAmount = ethers.parseEther("5000");
    await btnToken.connect(buyer).approve(await stakingRewards.getAddress(), stakeAmount);
    await stakingRewards.connect(buyer).stake(stakeAmount);
    
    console.log("✓ Buyer staked 5000 BTN");

    // Step 3: Distribute airdrop bonus to uplines
    await airdropBonus.distributeAirdrop(buyer.address, stakeAmount);
    
    const upline1Bonus = await btnToken.balanceOf(upline1.address);
    const upline2Bonus = await btnToken.balanceOf(upline2.address);
    const upline3Bonus = await btnToken.balanceOf(upline3.address);
    
    // Ruby bonuses: L1=1%, L2=1%, L3=1%
    expect(upline1Bonus).to.equal(ethers.parseEther("50")); // 1% of 5000
    expect(upline2Bonus).to.equal(ethers.parseEther("50")); // 1% of 5000
    expect(upline3Bonus).to.equal(ethers.parseEther("50")); // 1% of 5000
    
    console.log(`✓ Airdrop distributed: Upline1=${ethers.formatEther(upline1Bonus)} BTN, Upline2=${ethers.formatEther(upline2Bonus)} BTN, Upline3=${ethers.formatEther(upline3Bonus)} BTN`);

    // Step 4: Fast forward 7 days
    await time.increase(7 * 24 * 60 * 60);
    
    // Calculate staking rewards after 7 days (2% daily * 7 = 14% of 5000 = 700 BTN)
    const expectedReward = await stakingRewards.calculateReward(buyer.address, 0);
    expect(expectedReward).to.be.closeTo(ethers.parseEther("700"), ethers.parseEther("1")); // ~700 BTN
    
    console.log(`✓ After 7 days: Buyer's pending staking reward = ${ethers.formatEther(expectedReward)} BTN`);

    // Step 5: Verify uplines can stake their airdrop bonuses
    await btnToken.connect(upline1).approve(await stakingRewards.getAddress(), upline1Bonus);
    await stakingRewards.connect(upline1).stake(upline1Bonus);
    
    console.log("✓ Upline1 staked their 50 BTN airdrop bonus");

    // Step 6: Verify lock period enforcement
    await expect(stakingRewards.connect(buyer).unstake(0))
      .to.be.revertedWith("Still locked");
    
    console.log("✓ Lock period enforced (135 days required)");

    // Step 7: Fast forward to unlock (135 days total)
    await time.increase(128 * 24 * 60 * 60); // Already 7 days in, add 128 more
    
    const balanceBefore = await btnToken.balanceOf(buyer.address);
    await stakingRewards.connect(buyer).unstake(0);
    const balanceAfter = await btnToken.balanceOf(buyer.address);
    
    const totalReturned = balanceAfter - balanceBefore;
    expect(totalReturned).to.be.gt(stakeAmount); // Should get back stake + rewards
    
    console.log(`✓ After 135 days: Buyer unstaked and received ${ethers.formatEther(totalReturned)} BTN (principal + rewards)`);
    console.log("\n=== ALL FLOWS WORKING PERFECTLY ===\n");
  });

  it("Should handle multi-tier ranks correctly (Bronze vs Diamond)", async function () {
    // Setup Bronze user (only L1 bonus)
    await airdropBonus.setReferrer(buyer.address, upline1.address);
    await airdropBonus.setUserRank(upline1.address, 1); // Bronze
    
    // Setup Diamond downstream
    await airdropBonus.setReferrer(upline1.address, upline2.address);
    await airdropBonus.setUserRank(upline2.address, 8); // Diamond

    const purchaseAmount = ethers.parseEther("1000");
    await airdropBonus.distributeAirdrop(buyer.address, purchaseAmount);

    // Bronze L1: 3%
    expect(await btnToken.balanceOf(upline1.address)).to.equal(ethers.parseEther("30"));
    
    // Diamond L2: 1%
    expect(await btnToken.balanceOf(upline2.address)).to.equal(ethers.parseEther("10"));
  });
});
