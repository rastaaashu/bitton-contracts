const { ethers } = require("hardhat");
async function main() {
  const btn = await ethers.getContractAt("BTNToken", "0x5b964baafEDf002e5364F37848DCa1908D3e4e9f");
  const deployer = "0x1DaE2C7aeC8850f1742fE96045c23d1AaE3FCf2A";
  console.log("=== Genesis BTN State on Base Sepolia ===");
  console.log("totalSupply:", ethers.formatUnits(await btn.totalSupply(), 6));
  console.log("issuedSupply:", ethers.formatUnits(await btn.issuedSupply(), 6));
  console.log("burnedSupply:", ethers.formatUnits(await btn.burnedSupply(), 6));
  console.log("mintingActive:", await btn.mintingActive());
  console.log("owner:", await btn.owner());
  console.log("deployer isMinter:", await btn.isMinter(deployer));
  console.log("deployer balance:", ethers.formatUnits(await btn.balanceOf(deployer), 6));
  console.log("MAX_SUPPLY:", ethers.formatUnits(await btn.MAX_SUPPLY(), 6));
  // Check custodial balance
  const custodialAddr = "0x71dB030B792E9D4CfdCC7e452e0Ff55CdB5A4D99";
  console.log("custodial balance:", ethers.formatUnits(await btn.balanceOf(custodialAddr), 6));
  // Check RewardEngine balance
  const reAddr = "0xa86F6abB543b3fa6a2E2cC001870cF60a04c7f31";
  console.log("rewardEngine balance:", ethers.formatUnits(await btn.balanceOf(reAddr), 6));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
