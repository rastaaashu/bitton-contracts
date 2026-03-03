// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title IRewardEngine
 * @dev Interface for RewardEngine — used by BonusEngine to add pending rewards
 */
interface IRewardEngine {
    function addPendingReward(address user, uint256 amount) external;
}
