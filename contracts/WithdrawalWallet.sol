// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title WithdrawalWallet
 * @dev Holds the immediately-withdrawable portion of user rewards (10% from
 *      RewardEngine settlement + daily releases from VestingPool).
 *
 *      Features:
 *        - Per-user withdrawable balance tracking
 *        - Optional weekly withdrawal cap (0 = unlimited)
 *        - SafeERC20 + ReentrancyGuard on withdrawals
 *        - Pausable for emergency
 *
 *      Flow:
 *        RewardEngine / VestingPool → transfers BTN + calls addWithdrawable(user, amount)
 *        User → calls withdraw(amount) → BTN sent to user
 *
 *      UUPS upgradeable.
 */
contract WithdrawalWallet is
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // ─── Roles ───────────────────────────────────────────────
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    // ─── State ───────────────────────────────────────────────
    IERC20 public btnToken;

    mapping(address => uint256) public withdrawableBalance;

    /// @notice Weekly withdrawal cap per user (0 = unlimited). Set by admin.
    uint256 public weeklyWithdrawalCap;

    /// @notice Amount a user has withdrawn in the current week period.
    mapping(address => uint256) public weeklyWithdrawn;

    /// @notice The week-period start timestamp for each user's current tracking window.
    mapping(address => uint256) public currentWeekStart;

    // ─── Events ──────────────────────────────────────────────
    event WithdrawableAdded(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event WeeklyWithdrawalCapUpdated(uint256 oldCap, uint256 newCap);

    // ─── Errors ──────────────────────────────────────────────
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientBalance(uint256 requested, uint256 available);
    error WeeklyCapExceeded(uint256 requested, uint256 remainingCap);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @param _btnToken  BTN ERC20 token address
     * @param _admin     Admin address (receives all roles)
     */
    function initialize(
        address _btnToken,
        address _admin
    ) external initializer {
        if (_btnToken == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();

        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _admin);
        _grantRole(EMERGENCY_ROLE, _admin);

        btnToken = IERC20(_btnToken);
        // weeklyWithdrawalCap defaults to 0 (unlimited)
    }

    // ─── Core: Add Withdrawable ───────────────────────────────

    /**
     * @notice Credit withdrawable balance for a user.
     *         Called by RewardEngine (10% split) or VestingPool (daily release)
     *         after transferring BTN to this contract.
     * @param user   User address
     * @param amount BTN amount (6 decimals)
     */
    function addWithdrawable(address user, uint256 amount) external onlyRole(OPERATOR_ROLE) {
        if (user == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        withdrawableBalance[user] += amount;

        emit WithdrawableAdded(user, amount);
    }

    // ─── Core: Withdraw ───────────────────────────────────────

    /**
     * @notice Withdraw BTN from the user's withdrawable balance.
     *         Subject to optional weekly withdrawal cap.
     * @param amount BTN amount to withdraw (6 decimals)
     */
    function withdraw(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (amount > withdrawableBalance[msg.sender]) {
            revert InsufficientBalance(amount, withdrawableBalance[msg.sender]);
        }

        // Weekly cap enforcement
        if (weeklyWithdrawalCap > 0) {
            _enforceWeeklyCap(msg.sender, amount);
        }

        // Effects
        withdrawableBalance[msg.sender] -= amount;

        // Interactions
        btnToken.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    // ─── Views ────────────────────────────────────────────────

    /**
     * @notice Get the user's current withdrawable balance
     */
    function getWithdrawableBalance(address user) external view returns (uint256) {
        return withdrawableBalance[user];
    }

    /**
     * @notice Get the remaining weekly withdrawal allowance for a user.
     *         Returns type(uint256).max if cap is disabled (0).
     */
    function getRemainingWeeklyAllowance(address user) external view returns (uint256) {
        if (weeklyWithdrawalCap == 0) return type(uint256).max;

        uint256 weekStart = _currentWeekStart();
        uint256 used = (currentWeekStart[user] == weekStart) ? weeklyWithdrawn[user] : 0;

        if (used >= weeklyWithdrawalCap) return 0;
        return weeklyWithdrawalCap - used;
    }

    // ─── Admin ────────────────────────────────────────────────

    /**
     * @notice Set the weekly withdrawal cap per user. 0 = unlimited.
     * @param cap  New weekly cap in BTN (6 decimals)
     */
    function setWeeklyWithdrawalCap(uint256 cap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 old = weeklyWithdrawalCap;
        weeklyWithdrawalCap = cap;
        emit WeeklyWithdrawalCapUpdated(old, cap);
    }

    function pause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ─── Internal ─────────────────────────────────────────────

    /**
     * @dev Enforce the weekly withdrawal cap for a user.
     *      If the user's tracking window is from a previous week, reset their counter.
     */
    function _enforceWeeklyCap(address user, uint256 amount) internal {
        uint256 weekStart = _currentWeekStart();

        // Reset counter if we're in a new week
        if (currentWeekStart[user] != weekStart) {
            currentWeekStart[user] = weekStart;
            weeklyWithdrawn[user] = 0;
        }

        // If cap was lowered below already-withdrawn amount, remaining is 0
        uint256 remaining = (weeklyWithdrawn[user] >= weeklyWithdrawalCap)
            ? 0
            : weeklyWithdrawalCap - weeklyWithdrawn[user];
        if (amount > remaining) {
            revert WeeklyCapExceeded(amount, remaining);
        }

        weeklyWithdrawn[user] += amount;
    }

    /**
     * @dev Get the start of the current week period (7-day aligned from epoch).
     *      week_start = (block.timestamp / 1 weeks) * 1 weeks
     */
    function _currentWeekStart() internal view returns (uint256) {
        return (block.timestamp / 1 weeks) * 1 weeks;
    }

    /**
     * @dev UUPS authorization — only admin can upgrade
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
