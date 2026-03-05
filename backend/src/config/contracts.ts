import { ethers } from "ethers";
import { env } from "./env";

// Minimal ABIs — only the functions the backend needs to call or read
// Full ABIs should be generated from artifacts in production

export const BTN_TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

export const CUSTODIAL_ABI = [
  "function distribute(address to, uint256 amount)",
  "function fundContract(address target, uint256 amount)",
  "function returnTokens(uint256 amount)",
  "function batchMigrate(address[] recipients, uint256[] amounts)",
  "function disableMigration()",
  "function setDistributionCap(uint256 cap)",
  "function finalize()",
  "function pause()",
  "function unpause()",
  "function getBalance() view returns (uint256)",
  "function totalDistributed() view returns (uint256)",
  "function totalReturned() view returns (uint256)",
  "function totalMigrated() view returns (uint256)",
  "function isMigrationEnabled() view returns (bool)",
  "function isFinalized() view returns (bool)",
  "function hasMigrated(address user) view returns (bool)",
  "function distributionCap() view returns (uint256)",
  "function OPERATOR_ROLE() view returns (bytes32)",
  "function EMERGENCY_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "event TokensDistributed(address indexed to, uint256 amount, address indexed operator)",
  "event ContractFunded(address indexed target, uint256 amount, address indexed operator)",
  "event TokensReturned(address indexed from, uint256 amount)",
  "event MigrationClaimed(address indexed recipient, uint256 amount)",
  "event MigrationDisabled()",
  "event ContractFinalized(address indexed admin)",
];

export const REWARD_ENGINE_ABI = [
  "function settleWeekly(address user)",
  "function calculateReward(address user, uint256 stakeIndex) view returns (uint256)",
  "function rewardPoolBalance() view returns (uint256)",
  "event WeeklySettlement(address indexed user, uint256 totalReward, uint256 withdrawable, uint256 vested)",
];

export const VAULT_MANAGER_ABI = [
  "function isVaultActive(address user) view returns (bool)",
  "function getUserTier(address user) view returns (uint8)",
  "event VaultActivated(address indexed user, uint8 tier, address paymentToken, uint256 amount)",
];

export const STAKING_VAULT_ABI = [
  "function getStakes(address user) view returns (tuple(uint256 amount, uint256 startTime, uint8 programType, uint256 lastRewardTime, bool active)[])",
  "function getPendingRewards(address user, uint256 stakeIndex) view returns (uint256)",
  "function totalStaked() view returns (uint256)",
  "event Staked(address indexed user, uint256 amount, uint8 programType, uint256 stakeIndex)",
  "event Unstaked(address indexed user, uint256 stakeIndex, uint256 amount, uint256 penalty)",
];

export const VESTING_POOL_ABI = [
  "function getVestedBalance(address user) view returns (uint256)",
  "function getPendingRelease(address user) view returns (uint256)",
  "event VestingAdded(address indexed user, uint256 amount)",
  "event VestingReleased(address indexed user, uint256 amount)",
];

export const WITHDRAWAL_WALLET_ABI = [
  "function getWithdrawableBalance(address user) view returns (uint256)",
  "event Withdrawn(address indexed user, uint256 amount)",
  "event WithdrawableAdded(address indexed user, uint256 amount)",
];

export const BONUS_ENGINE_ABI = [
  "function getReferrer(address user) view returns (address)",
  "function getDownline(address user) view returns (address[])",
  "event ReferrerRegistered(address indexed user, address indexed referrer)",
  "event DirectBonusPaid(address indexed referrer, address indexed staker, uint256 amount)",
  "event MatchingBonusPaid(address indexed recipient, address indexed source, uint256 amount, uint8 level)",
];

// Provider + Signer
let _provider: ethers.JsonRpcProvider | null = null;
let _signer: ethers.Wallet | null = null;

export function getProvider(): ethers.JsonRpcProvider {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(env.rpcUrl, env.chainId);
  }
  return _provider;
}

export function getRelayerSigner(): ethers.Wallet {
  if (!_signer) {
    _signer = new ethers.Wallet(env.relayerPrivateKey, getProvider());
  }
  return _signer;
}

// Contract instances
export function getCustodialContract(signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
  return new ethers.Contract(
    env.contracts.custodial,
    CUSTODIAL_ABI,
    signerOrProvider || getRelayerSigner()
  );
}

export function getBtnTokenContract(signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
  return new ethers.Contract(
    env.contracts.btnToken,
    BTN_TOKEN_ABI,
    signerOrProvider || getProvider()
  );
}

export function getRewardEngineContract(signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
  return new ethers.Contract(
    env.contracts.rewardEngine,
    REWARD_ENGINE_ABI,
    signerOrProvider || getRelayerSigner()
  );
}

export function getVaultManagerContract(signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
  return new ethers.Contract(
    env.contracts.vaultManager,
    VAULT_MANAGER_ABI,
    signerOrProvider || getProvider()
  );
}

export function getStakingVaultContract(signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
  return new ethers.Contract(
    env.contracts.stakingVault,
    STAKING_VAULT_ABI,
    signerOrProvider || getProvider()
  );
}

export function getVestingPoolContract(signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
  return new ethers.Contract(
    env.contracts.vestingPool,
    VESTING_POOL_ABI,
    signerOrProvider || getProvider()
  );
}

export function getWithdrawalWalletContract(signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
  return new ethers.Contract(
    env.contracts.withdrawalWallet,
    WITHDRAWAL_WALLET_ABI,
    signerOrProvider || getProvider()
  );
}

export function getBonusEngineContract(signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
  return new ethers.Contract(
    env.contracts.bonusEngine,
    BONUS_ENGINE_ABI,
    signerOrProvider || getProvider()
  );
}
