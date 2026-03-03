// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title IBonusEngine
 * @dev Interface for BonusEngine — referral + matching bonus logic
 */
interface IBonusEngine {
    function registerReferrer(address referrer) external;
    function processDirectBonus(address staker, uint256 stakeAmount) external;
    function processMatchingBonus(address user, uint256 rewardAmount) external;
    function getReferrer(address user) external view returns (address);
    function getDownline(address user) external view returns (address[] memory);
    function getDownlineCount(address user) external view returns (uint256);
}
