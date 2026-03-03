// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IVaultManager.sol";

/**
 * @title StakingVault
 * @dev Manages Short (30-day) and Long (180-day) staking programs for BTN.
 *
 *      - Short: 0.5% daily × tier multiplier, early exit allowed (15% penalty to treasury)
 *      - Long:  0.5% daily × 1.2 (fixed), early exit reverts
 *      - Rewards accrue per-stake via lastRewardTime; settlement handled by RewardEngine (Phase 3)
 *      - UUPS upgradeable
 */
contract StakingVault is
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

    // ─── Constants ───────────────────────────────────────────
    uint256 public constant SHORT_LOCK = 30 days;
    uint256 public constant LONG_LOCK = 180 days;
    uint256 public constant EARLY_EXIT_PENALTY_BPS = 1500; // 15% in basis points
    uint256 public constant LONG_MULTIPLIER = 12;          // 1.2x (÷10)
    uint256 public constant DEFAULT_MULTIPLIER = 10;       // 1.0x (÷10)

    // ─── Structs ─────────────────────────────────────────────
    struct StakeInfo {
        uint256 amount;
        uint256 startTime;
        uint8 programType;      // 0 = Short, 1 = Long
        uint256 lastRewardTime;
        bool active;
    }

    // ─── State ───────────────────────────────────────────────
    mapping(address => StakeInfo[]) private _stakes;

    IERC20 public btnToken;
    address public treasuryAddress;
    address public vaultManager; // for tier / vault-active lookups

    uint256 public totalStaked; // global principal tracking

    // ─── Events ──────────────────────────────────────────────
    event Staked(address indexed user, uint256 amount, uint8 programType, uint256 stakeIndex);
    event Unstaked(address indexed user, uint256 amount, uint256 reward, uint256 penalty);
    event LastRewardTimeReset(address indexed user, uint256 stakeIndex, uint256 newTime);
    event VaultManagerUpdated(address indexed oldAddr, address indexed newAddr);
    event TreasuryAddressUpdated(address indexed oldAddr, address indexed newAddr);

    // ─── Errors ──────────────────────────────────────────────
    error InvalidProgramType(uint8 programType);
    error ZeroAmount();
    error InvalidStakeIndex(uint256 index, uint256 length);
    error StakeNotActive();
    error LockPeriodNotMet(uint256 elapsed, uint256 required);
    error TreasuryNotSet();
    error VaultNotActive();
    error ZeroAddress();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @param _btnToken  BTN ERC20 token address
     * @param _treasury  Treasury wallet (receives early-exit penalties)
     * @param _vaultMgr  VaultManager address (for tier lookups; address(0) to skip gating)
     * @param _admin     Admin address (receives all roles)
     */
    function initialize(
        address _btnToken,
        address _treasury,
        address _vaultMgr,
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
        treasuryAddress = _treasury;
        vaultManager = _vaultMgr;
    }

    // ─── Core: Stake ─────────────────────────────────────────

    /**
     * @notice Stake BTN into Short (0) or Long (1) program.
     *         Requires active vault if VaultManager is wired.
     * @param amount    BTN amount (6 decimals)
     * @param programType  0 = Short, 1 = Long
     */
    function stake(uint256 amount, uint8 programType) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (programType > 1) revert InvalidProgramType(programType);

        // Vault-activation gating (skip if vaultManager not wired yet)
        if (vaultManager != address(0)) {
            if (!IVaultManager(vaultManager).isVaultActive(msg.sender)) {
                revert VaultNotActive();
            }
        }

        btnToken.safeTransferFrom(msg.sender, address(this), amount);

        uint256 stakeIndex = _stakes[msg.sender].length;

        _stakes[msg.sender].push(StakeInfo({
            amount: amount,
            startTime: block.timestamp,
            programType: programType,
            lastRewardTime: block.timestamp,
            active: true
        }));

        totalStaked += amount;

        emit Staked(msg.sender, amount, programType, stakeIndex);
    }

    // ─── Core: Unstake ───────────────────────────────────────

    /**
     * @notice Unstake a position.
     *         - Short: allowed anytime; 15% penalty if before lock period
     *         - Long: reverts if lock period not met
     *         Pending rewards are NOT distributed here (RewardEngine handles settlement).
     *         The pending reward amount is emitted in the event for bookkeeping.
     */
    function unstake(uint256 stakeIndex) external nonReentrant whenNotPaused {
        if (stakeIndex >= _stakes[msg.sender].length) {
            revert InvalidStakeIndex(stakeIndex, _stakes[msg.sender].length);
        }

        StakeInfo storage s = _stakes[msg.sender][stakeIndex];
        if (!s.active) revert StakeNotActive();

        uint256 elapsed = block.timestamp - s.startTime;
        uint256 principal = s.amount;
        uint256 penalty = 0;

        if (s.programType == 1) {
            // Long: must complete full lock
            if (elapsed < LONG_LOCK) {
                revert LockPeriodNotMet(elapsed, LONG_LOCK);
            }
        } else {
            // Short: early exit incurs 15% penalty on principal
            if (elapsed < SHORT_LOCK) {
                penalty = (principal * EARLY_EXIT_PENALTY_BPS) / 10_000;
            }
        }

        // Snapshot pending rewards before deactivating (for event only)
        uint256 pendingReward = _calculateReward(msg.sender, stakeIndex);

        // Effects
        s.active = false;
        totalStaked -= principal;

        // Interactions (Checks-Effects-Interactions pattern)
        uint256 returnAmount = principal - penalty;
        btnToken.safeTransfer(msg.sender, returnAmount);

        if (penalty > 0) {
            if (treasuryAddress == address(0)) revert TreasuryNotSet();
            btnToken.safeTransfer(treasuryAddress, penalty);
        }

        emit Unstaked(msg.sender, returnAmount, pendingReward, penalty);
    }

    // ─── Views ───────────────────────────────────────────────

    /**
     * @notice Get all stakes for a user (including inactive)
     */
    function getStakes(address user) external view returns (StakeInfo[] memory) {
        return _stakes[user];
    }

    /**
     * @notice Get a single stake by index
     */
    function getStake(address user, uint256 stakeIndex) external view returns (StakeInfo memory) {
        if (stakeIndex >= _stakes[user].length) {
            revert InvalidStakeIndex(stakeIndex, _stakes[user].length);
        }
        return _stakes[user][stakeIndex];
    }

    /**
     * @notice Calculate accrued reward for a specific stake position since lastRewardTime
     */
    function getPendingRewards(address user, uint256 stakeIndex) external view returns (uint256) {
        if (stakeIndex >= _stakes[user].length) {
            revert InvalidStakeIndex(stakeIndex, _stakes[user].length);
        }
        return _calculateReward(user, stakeIndex);
    }

    /**
     * @notice Total active staked amount for a user across all positions
     */
    function getUserTotalStaked(address user) external view returns (uint256) {
        uint256 total = 0;
        StakeInfo[] storage userStakes = _stakes[user];
        for (uint256 i = 0; i < userStakes.length; i++) {
            if (userStakes[i].active) {
                total += userStakes[i].amount;
            }
        }
        return total;
    }

    /**
     * @notice Number of stake positions for a user
     */
    function getStakeCount(address user) external view returns (uint256) {
        return _stakes[user].length;
    }

    // ─── Operator Functions (for RewardEngine integration) ───

    /**
     * @notice Reset lastRewardTime after rewards are settled by RewardEngine.
     *         Only callable by OPERATOR_ROLE.
     * @param user       Staker address
     * @param stakeIndex Index of the stake position
     */
    function resetLastRewardTime(address user, uint256 stakeIndex) external onlyRole(OPERATOR_ROLE) {
        if (stakeIndex >= _stakes[user].length) {
            revert InvalidStakeIndex(stakeIndex, _stakes[user].length);
        }
        StakeInfo storage s = _stakes[user][stakeIndex];
        if (!s.active) revert StakeNotActive();

        s.lastRewardTime = block.timestamp;

        emit LastRewardTimeReset(user, stakeIndex, block.timestamp);
    }

    // ─── Admin ───────────────────────────────────────────────

    function setVaultManager(address _vaultMgr) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address old = vaultManager;
        vaultManager = _vaultMgr;
        emit VaultManagerUpdated(old, _vaultMgr);
    }

    function setTreasuryAddress(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_treasury == address(0)) revert ZeroAddress();
        address old = treasuryAddress;
        treasuryAddress = _treasury;
        emit TreasuryAddressUpdated(old, _treasury);
    }

    function pause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ─── Internal ────────────────────────────────────────────

    /**
     * @dev Calculate accrued reward for a stake position.
     *
     *      Formula: reward = (principal × 5 × multiplier × elapsed) / (10_000 × 1 days)
     *
     *      Derivation:
     *        dailyReward = P × R × M = P × 0.005 × M
     *        In integer math with M as {10,11,12}:
     *          dailyReward = (P × 5 × M) / (1000 × 10)  =  (P × 5 × M) / 10_000
     *        Per-second:  dailyReward / 86400
     *        Over `elapsed` seconds:  dailyReward × elapsed / 86400
     *          = (P × 5 × M × elapsed) / (10_000 × 86400)
     */
    function _calculateReward(address user, uint256 stakeIndex) internal view returns (uint256) {
        StakeInfo storage s = _stakes[user][stakeIndex];
        if (!s.active || s.amount == 0) return 0;

        uint256 elapsed = block.timestamp - s.lastRewardTime;
        if (elapsed == 0) return 0;

        uint256 multiplier = _getMultiplier(user, s.programType);

        uint256 reward = (s.amount * 5 * multiplier * elapsed) / (10_000 * 1 days);
        return reward;
    }

    /**
     * @dev Get the reward multiplier for a stake.
     *      Long: always 12 (1.2x).
     *      Short: tier-based from VaultManager (10/11/12), default 10.
     */
    function _getMultiplier(address user, uint8 programType) internal view returns (uint256) {
        if (programType == 1) return LONG_MULTIPLIER;

        // Short staking: tier-dependent
        if (vaultManager != address(0)) {
            uint8 tier = IVaultManager(vaultManager).getUserTier(user);
            if (tier >= 3) return 12;
            if (tier == 2) return 11;
        }
        return DEFAULT_MULTIPLIER;
    }

    /**
     * @dev UUPS authorization — only admin can upgrade
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
