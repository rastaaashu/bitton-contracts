// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title MockVaultManagerForBonus
 * @dev Mock VaultManager for BonusEngine testing.
 *      Allows setting vault active status and tier per user.
 */
contract MockVaultManagerForBonus {
    mapping(address => bool) public vaultActive;
    mapping(address => uint8) public userTier;

    function setVaultActive(address user, bool active) external {
        vaultActive[user] = active;
    }

    function setUserTier(address user, uint8 tier) external {
        userTier[user] = tier;
    }

    function isVaultActive(address user) external view returns (bool) {
        return vaultActive[user];
    }

    function getUserTier(address user) external view returns (uint8) {
        return userTier[user];
    }
}
