// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title MockBonusEngine
 * @dev Mock BonusEngine for RewardEngine testing.
 *      Tracks processMatchingBonus calls for verification.
 */
contract MockBonusEngine {
    struct BonusCall {
        address user;
        uint256 rewardAmount;
    }

    BonusCall[] public bonusCalls;

    event MatchingBonusProcessed(address indexed user, uint256 rewardAmount);

    function processMatchingBonus(address user, uint256 rewardAmount) external {
        bonusCalls.push(BonusCall(user, rewardAmount));
        emit MatchingBonusProcessed(user, rewardAmount);
    }

    function getBonusCallCount() external view returns (uint256) {
        return bonusCalls.length;
    }
}
