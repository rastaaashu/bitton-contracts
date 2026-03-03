require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");

const {
  BASE_SEPOLIA_RPC_URL,
  BASE_SEPOLIA_PRIVATE_KEY,
  BASESCAN_API_KEY,
} = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.27",
  networks: {
    hardhat: {},
    base_sepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      accounts: [BASE_SEPOLIA_PRIVATE_KEY],
      chainId: 84532,
    },
  },
  etherscan: {
    apiKey: BASESCAN_API_KEY,
  },
  sourcify: {
    enabled: false
  }
};
