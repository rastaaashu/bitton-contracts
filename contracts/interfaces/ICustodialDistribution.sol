// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title ICustodialDistribution
/// @notice Interface for the BitTON.AI Custodial/Distribution contract
interface ICustodialDistribution {
    // --- Events ---
    event TokensDistributed(address indexed to, uint256 amount, address indexed operator);
    event ContractFunded(address indexed target, uint256 amount, address indexed operator);
    event TokensReturned(address indexed from, uint256 amount);
    event MigrationClaimed(address indexed recipient, uint256 amount);
    event MigrationDisabled();
    event DistributionCapUpdated(uint256 oldCap, uint256 newCap);
    event ContractFinalized(address indexed admin);

    // --- Errors ---
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientBalance(uint256 requested, uint256 available);
    error DistributionCapExceeded(uint256 amount, uint256 cap);
    error MigrationNotEnabled();
    error AlreadyMigrated(address recipient);
    error AlreadyFinalized();
    error ArrayLengthMismatch(uint256 recipientsLen, uint256 amountsLen);
    error BatchTooLarge(uint256 size, uint256 maxSize);
    error NotFinalized();

    // --- Outflows ---
    function distribute(address to, uint256 amount) external;
    function fundContract(address target, uint256 amount) external;

    // --- Inflows ---
    function returnTokens(uint256 amount) external;

    // --- Migration ---
    function batchMigrate(address[] calldata recipients, uint256[] calldata amounts) external;
    function disableMigration() external;
    function hasMigrated(address user) external view returns (bool);

    // --- Views ---
    function getBalance() external view returns (uint256);
    function totalDistributed() external view returns (uint256);
    function totalReturned() external view returns (uint256);
    function totalMigrated() external view returns (uint256);
    function isMigrationEnabled() external view returns (bool);
    function isFinalized() external view returns (bool);
    function distributionCap() external view returns (uint256);

    // --- Admin ---
    function setDistributionCap(uint256 cap) external;
    function finalize() external;
}
