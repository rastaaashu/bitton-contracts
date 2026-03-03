// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title MockStakingVaultForBonus
 * @dev Mock StakingVault for BonusEngine testing.
 *      Allows setting userTotalStaked per user.
 */
contract MockStakingVaultForBonus {
    mapping(address => uint256) public totalStaked;

    function setUserTotalStaked(address user, uint256 amount) external {
        totalStaked[user] = amount;
    }

    function getUserTotalStaked(address user) external view returns (uint256) {
        return totalStaked[user];
    }
}
