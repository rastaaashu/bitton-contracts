// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title IVaultManager
 * @dev Interface for VaultManager — used by StakingVault for tier lookups
 */
interface IVaultManager {
    function isVaultActive(address user) external view returns (bool);
    function getUserTier(address user) external view returns (uint8);
}
