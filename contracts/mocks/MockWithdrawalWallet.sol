// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title MockWithdrawalWallet
 * @dev Mock WithdrawalWallet for RewardEngine testing.
 *      Tracks per-user withdrawable balances added via addWithdrawable().
 *      BTN tokens are transferred to this contract by RewardEngine before calling addWithdrawable.
 */
contract MockWithdrawalWallet {
    mapping(address => uint256) public withdrawableBalance;
    uint256 public totalWithdrawable;

    event WithdrawableAdded(address indexed user, uint256 amount);

    function addWithdrawable(address user, uint256 amount) external {
        withdrawableBalance[user] += amount;
        totalWithdrawable += amount;
        emit WithdrawableAdded(user, amount);
    }
}
