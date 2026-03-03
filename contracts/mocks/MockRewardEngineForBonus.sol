// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title MockRewardEngineForBonus
 * @dev Mock RewardEngine for BonusEngine testing.
 *      Tracks addPendingReward calls and enforces operator check.
 */
contract MockRewardEngineForBonus {
    mapping(address => uint256) public pendingRewards;
    mapping(address => bool) public operators;
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function grantOperator(address op) external {
        operators[op] = true;
    }

    function addPendingReward(address user, uint256 amount) external {
        require(operators[msg.sender], "MockRE: not operator");
        pendingRewards[user] += amount;
    }
}
