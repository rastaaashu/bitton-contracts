// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title IVestingPool
 * @dev Interface for VestingPool — used by RewardEngine to deposit vested rewards
 */
interface IVestingPool {
    function addVesting(address user, uint256 amount) external;
}
