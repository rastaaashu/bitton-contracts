// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title MockVestingPool
 * @dev Mock VestingPool for RewardEngine testing.
 *      Tracks per-user vested balances added via addVesting().
 *      BTN tokens are transferred to this contract by RewardEngine before calling addVesting.
 */
contract MockVestingPool {
    mapping(address => uint256) public vestedBalance;
    uint256 public totalVested;

    event VestingAdded(address indexed user, uint256 amount);

    function addVesting(address user, uint256 amount) external {
        vestedBalance[user] += amount;
        totalVested += amount;
        emit VestingAdded(user, amount);
    }
}
