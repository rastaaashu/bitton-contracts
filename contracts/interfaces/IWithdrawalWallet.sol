// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title IWithdrawalWallet
 * @dev Interface for WithdrawalWallet — used by RewardEngine to deposit withdrawable rewards
 */
interface IWithdrawalWallet {
    function addWithdrawable(address user, uint256 amount) external;
}
