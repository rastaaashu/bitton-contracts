// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ICustodialDistribution.sol";

/// @title CustodialDistribution
/// @notice Central token treasury for BitTON.AI. Receives 21M BTN from Genesis,
///         manages controlled outflows (distributions, contract funding, migration),
///         accepts inflows (secondary market returns), and can be permanently locked down.
/// @dev Non-upgradeable by design — after finalization, logic is permanently fixed.
contract CustodialDistribution is
    ICustodialDistribution,
    AccessControl,
    Pausable,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;

    // --- Roles ---
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    // --- Constants ---
    uint256 public constant MAX_BATCH_SIZE = 200;

    // --- Immutables ---
    IERC20 public immutable btnToken;

    // --- State ---
    bool public finalized;
    bool public migrationEnabled;
    uint256 public distributionCap; // 0 = unlimited
    uint256 public totalDistributed;
    uint256 public totalReturned;
    uint256 public totalMigrated;
    mapping(address => bool) public migrationClaimed;

    // --- Modifiers ---
    modifier notFinalized() {
        if (finalized) revert AlreadyFinalized();
        _;
    }

    // --- Constructor ---
    /// @param _btnToken Address of the BTN ERC20 token
    /// @param _admin Initial admin address (receives all three roles)
    constructor(address _btnToken, address _admin) {
        if (_btnToken == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();

        btnToken = IERC20(_btnToken);
        migrationEnabled = true;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _admin);
        _grantRole(EMERGENCY_ROLE, _admin);
    }

    // =========================================================================
    //                          CONTROLLED OUTFLOWS
    // =========================================================================

    /// @inheritdoc ICustodialDistribution
    function distribute(
        address to,
        uint256 amount
    ) external onlyRole(OPERATOR_ROLE) nonReentrant whenNotPaused {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        _enforceDistributionCap(amount);

        uint256 balance = btnToken.balanceOf(address(this));
        if (amount > balance) revert InsufficientBalance(amount, balance);

        totalDistributed += amount;
        btnToken.safeTransfer(to, amount);

        emit TokensDistributed(to, amount, msg.sender);
    }

    /// @inheritdoc ICustodialDistribution
    function fundContract(
        address target,
        uint256 amount
    ) external onlyRole(OPERATOR_ROLE) nonReentrant whenNotPaused {
        if (target == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        _enforceDistributionCap(amount);

        uint256 balance = btnToken.balanceOf(address(this));
        if (amount > balance) revert InsufficientBalance(amount, balance);

        totalDistributed += amount;
        btnToken.safeTransfer(target, amount);

        emit ContractFunded(target, amount, msg.sender);
    }

    // =========================================================================
    //                          CONTROLLED INFLOWS
    // =========================================================================

    /// @inheritdoc ICustodialDistribution
    function returnTokens(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        totalReturned += amount;
        btnToken.safeTransferFrom(msg.sender, address(this), amount);

        emit TokensReturned(msg.sender, amount);
    }

    // =========================================================================
    //                          MIGRATION
    // =========================================================================

    /// @inheritdoc ICustodialDistribution
    function batchMigrate(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyRole(OPERATOR_ROLE) nonReentrant whenNotPaused {
        if (!migrationEnabled) revert MigrationNotEnabled();
        if (recipients.length != amounts.length)
            revert ArrayLengthMismatch(recipients.length, amounts.length);
        if (recipients.length > MAX_BATCH_SIZE)
            revert BatchTooLarge(recipients.length, MAX_BATCH_SIZE);

        uint256 totalAmount = 0;
        // Pre-calculate total to check balance once
        for (uint256 i = 0; i < amounts.length; i++) {
            if (recipients[i] == address(0)) revert ZeroAddress();
            if (amounts[i] == 0) revert ZeroAmount();
            totalAmount += amounts[i];
        }

        uint256 balance = btnToken.balanceOf(address(this));
        if (totalAmount > balance)
            revert InsufficientBalance(totalAmount, balance);

        for (uint256 i = 0; i < recipients.length; i++) {
            if (migrationClaimed[recipients[i]]) {
                // Skip already-claimed addresses (don't revert the whole batch)
                continue;
            }

            migrationClaimed[recipients[i]] = true;
            totalMigrated += amounts[i];
            totalDistributed += amounts[i];
            btnToken.safeTransfer(recipients[i], amounts[i]);

            emit MigrationClaimed(recipients[i], amounts[i]);
        }
    }

    /// @inheritdoc ICustodialDistribution
    function disableMigration()
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        migrationEnabled = false;
        emit MigrationDisabled();
    }

    /// @inheritdoc ICustodialDistribution
    function hasMigrated(address user) external view returns (bool) {
        return migrationClaimed[user];
    }

    // =========================================================================
    //                          VIEWS
    // =========================================================================

    /// @inheritdoc ICustodialDistribution
    function getBalance() external view returns (uint256) {
        return btnToken.balanceOf(address(this));
    }

    /// @inheritdoc ICustodialDistribution
    function isMigrationEnabled() external view returns (bool) {
        return migrationEnabled;
    }

    /// @inheritdoc ICustodialDistribution
    function isFinalized() external view returns (bool) {
        return finalized;
    }

    // =========================================================================
    //                          EMERGENCY
    // =========================================================================

    /// @notice Pause all distributions and migrations
    function pause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
    }

    /// @notice Unpause the contract
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // =========================================================================
    //                     ADMIN — PRE-FINALIZATION ONLY
    // =========================================================================

    /// @inheritdoc ICustodialDistribution
    function setDistributionCap(
        uint256 cap
    ) external onlyRole(DEFAULT_ADMIN_ROLE) notFinalized {
        uint256 oldCap = distributionCap;
        distributionCap = cap;
        emit DistributionCapUpdated(oldCap, cap);
    }

    /// @inheritdoc ICustodialDistribution
    function finalize() external onlyRole(DEFAULT_ADMIN_ROLE) notFinalized {
        finalized = true;
        emit ContractFinalized(msg.sender);

        // Renounce DEFAULT_ADMIN_ROLE — no one can ever grant/revoke roles again
        _revokeRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // =========================================================================
    //                          INTERNAL
    // =========================================================================

    /// @dev Enforce distribution cap if set
    function _enforceDistributionCap(uint256 amount) internal view {
        if (distributionCap > 0 && amount > distributionCap) {
            revert DistributionCapExceeded(amount, distributionCap);
        }
    }
}
