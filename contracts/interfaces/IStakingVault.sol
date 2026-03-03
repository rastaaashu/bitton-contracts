// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title IStakingVault
 * @dev Interface for StakingVault — used by RewardEngine for reward settlement
 */
interface IStakingVault {
    struct StakeInfo {
        uint256 amount;
        uint256 startTime;
        uint8 programType;
        uint256 lastRewardTime;
        bool active;
    }

    function getStakeCount(address user) external view returns (uint256);
    function getStake(address user, uint256 stakeIndex) external view returns (StakeInfo memory);
    function getPendingRewards(address user, uint256 stakeIndex) external view returns (uint256);
    function resetLastRewardTime(address user, uint256 stakeIndex) external;
    function getUserTotalStaked(address user) external view returns (uint256);
}
