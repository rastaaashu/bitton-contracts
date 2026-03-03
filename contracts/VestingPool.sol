// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IWithdrawalWallet.sol";

/**
 * @title VestingPool
 * @dev Holds the 90% vested portion of settled rewards.
 *      Releases 0.5% of the user's vested balance per day, pro-rated per second.
 *      Released tokens are routed to WithdrawalWallet.
 *
 *      Flow:
 *        RewardEngine → transfers BTN + calls addVesting(user, amount)
 *        User/Operator → calls release(user) → BTN sent to WithdrawalWallet
 *
 *      UUPS upgradeable.
 */
contract VestingPool is
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
    address public withdrawalWallet;

    mapping(address => uint256) public vestedBalance;
    mapping(address => uint256) public lastReleaseTime;

    // ─── Events ──────────────────────────────────────────────
    event VestingAdded(address indexed user, uint256 amount);
    event VestedReleased(address indexed user, uint256 amount);
    event WithdrawalWalletUpdated(address indexed oldAddr, address indexed newAddr);

    // ─── Errors ──────────────────────────────────────────────
    error ZeroAddress();
    error ZeroAmount();
    error WithdrawalWalletNotSet();
    error NothingToRelease();
    error NotUserOrOperator();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @param _btnToken           BTN ERC20 token address
     * @param _withdrawalWallet   WithdrawalWallet address (released tokens go here)
     * @param _admin              Admin address (receives all roles)
     */
    function initialize(
        address _btnToken,
        address _withdrawalWallet,
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
        withdrawalWallet = _withdrawalWallet;
    }

    // ─── Core: Add Vesting ────────────────────────────────────

    /**
     * @notice Add vested tokens for a user. Called by RewardEngine after
     *         transferring BTN to this contract.
     * @dev    Only callable by OPERATOR_ROLE. Sets lastReleaseTime on first deposit.
     * @param user   User address
     * @param amount BTN amount (6 decimals)
     */
    function addVesting(address user, uint256 amount) external onlyRole(OPERATOR_ROLE) {
        if (user == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        vestedBalance[user] += amount;

        // Initialize lastReleaseTime on first vesting deposit
        if (lastReleaseTime[user] == 0) {
            lastReleaseTime[user] = block.timestamp;
        }

        emit VestingAdded(user, amount);
    }

    // ─── Core: Release ────────────────────────────────────────

    /**
     * @notice Release accrued vesting for a user. Callable by the user or OPERATOR.
     *         Calculates 0.5% daily release pro-rated per second since lastReleaseTime.
     *         Released BTN is transferred to WithdrawalWallet.
     * @param user User address
     */
    function release(address user) external nonReentrant whenNotPaused {
        if (msg.sender != user && !hasRole(OPERATOR_ROLE, msg.sender)) {
            revert NotUserOrOperator();
        }
        if (withdrawalWallet == address(0)) revert WithdrawalWalletNotSet();

        uint256 releasable = _calculateRelease(user);
        if (releasable == 0) revert NothingToRelease();

        // Effects
        vestedBalance[user] -= releasable;
        lastReleaseTime[user] = block.timestamp;

        // Interactions: send to WithdrawalWallet
        btnToken.safeTransfer(withdrawalWallet, releasable);
        IWithdrawalWallet(withdrawalWallet).addWithdrawable(user, releasable);

        emit VestedReleased(user, releasable);
    }

    // ─── Views ────────────────────────────────────────────────

    /**
     * @notice Get the user's current vested balance (locked)
     */
    function getVestedBalance(address user) external view returns (uint256) {
        return vestedBalance[user];
    }

    /**
     * @notice Get the amount currently releasable for a user
     */
    function getPendingRelease(address user) external view returns (uint256) {
        return _calculateRelease(user);
    }

    // ─── Admin ────────────────────────────────────────────────

    function setWithdrawalWallet(address _withdrawalWallet) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address old = withdrawalWallet;
        withdrawalWallet = _withdrawalWallet;
        emit WithdrawalWalletUpdated(old, _withdrawalWallet);
    }

    function pause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ─── Internal ─────────────────────────────────────────────

    /**
     * @dev Calculate releasable amount based on 0.5% daily rate, pro-rated per second.
     *
     *      Formula (from spec §5.3):
     *        release = (vestedBalance × 5 × timeElapsed) / (1000 × 86400)
     *
     *      Capped at vestedBalance (can't release more than what's locked).
     */
    function _calculateRelease(address user) internal view returns (uint256) {
        uint256 balance = vestedBalance[user];
        if (balance == 0 || lastReleaseTime[user] == 0) return 0;

        uint256 timeElapsed = block.timestamp - lastReleaseTime[user];
        if (timeElapsed == 0) return 0;

        uint256 releasable = (balance * 5 * timeElapsed) / (1000 * 1 days);

        // Cap at balance
        if (releasable > balance) {
            releasable = balance;
        }

        return releasable;
    }

    /**
     * @dev UUPS authorization — only admin can upgrade
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
