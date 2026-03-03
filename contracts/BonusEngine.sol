// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./interfaces/IVaultManager.sol";
import "./interfaces/IStakingVault.sol";
import "./interfaces/IRewardEngine.sol";

/**
 * @title BonusEngine
 * @dev Manages referral relationships and bonus calculations:
 *
 *      1. **Direct Bonus** — 5% of referred user's stake amount, added to
 *         referrer's pending reward in RewardEngine (settled via 10/90 split).
 *
 *      2. **Matching Bonus** — Level-based % of downline's settled rewards:
 *         L1=10%, L2=5%, L3=3%, L4–L10=1%.
 *         Tier limits depth: T1=3, T2=5, T3=10.
 *         Qualification: active vault + 500 BTN min personal stake.
 *
 *      Called by:
 *        - StakingVault → processDirectBonus (on stake)
 *        - RewardEngine → processMatchingBonus (on settlement)
 *
 *      UUPS upgradeable.
 */
contract BonusEngine is
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    // ─── Roles ───────────────────────────────────────────────
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    // ─── Constants ───────────────────────────────────────────
    uint256 public constant DIRECT_BONUS_BPS = 500; // 5% in basis points
    uint256 public constant MIN_PERSONAL_STAKE = 500 * 1e6; // 500 BTN (6 decimals)
    uint256 public constant MAX_MATCHING_LEVELS = 10;

    // ─── State ───────────────────────────────────────────────
    address public rewardEngine;
    address public vaultManager;
    address public stakingVault;

    /// @notice referrer[user] = the address that referred this user
    mapping(address => address) public referrer;

    /// @notice downline[user] = array of addresses referred by this user
    mapping(address => address[]) private _downline;

    /// @notice Matching bonus percentages per level (1-indexed: index 0 unused)
    ///         L1=1000 (10%), L2=500 (5%), L3=300 (3%), L4-L10=100 (1%) — in basis points
    uint256[11] public matchingBps;

    /// @notice Max matching depth per tier: tier 1→3, tier 2→5, tier 3→10
    mapping(uint8 => uint8) public tierMaxDepth;

    // ─── Events ──────────────────────────────────────────────
    event ReferrerRegistered(address indexed user, address indexed referrer);
    event DirectBonusProcessed(address indexed referrer, address indexed staker, uint256 stakeAmount, uint256 bonusAmount);
    event MatchingBonusProcessed(address indexed ancestor, address indexed downlineUser, uint256 bonusAmount, uint8 level);

    // ─── Errors ──────────────────────────────────────────────
    error ZeroAddress();
    error SelfReferral();
    error ReferrerAlreadySet();
    error CircularReferral();
    error NoReferrer();
    error RewardEngineNotSet();
    error NotQualified(address user);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @param _rewardEngine  RewardEngine address (for addPendingReward)
     * @param _vaultManager  VaultManager address (for vault active + tier checks)
     * @param _stakingVault  StakingVault address (for personal stake checks)
     * @param _admin         Admin address (receives all roles)
     */
    function initialize(
        address _rewardEngine,
        address _vaultManager,
        address _stakingVault,
        address _admin
    ) external initializer {
        if (_admin == address(0)) revert ZeroAddress();

        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _admin);
        _grantRole(EMERGENCY_ROLE, _admin);

        rewardEngine = _rewardEngine;
        vaultManager = _vaultManager;
        stakingVault = _stakingVault;

        // Initialize matching bonus percentages (basis points)
        // L1=10%, L2=5%, L3=3%, L4-L10=1%
        matchingBps[1] = 1000;
        matchingBps[2] = 500;
        matchingBps[3] = 300;
        for (uint256 i = 4; i <= 10; i++) {
            matchingBps[i] = 100;
        }

        // Initialize tier depth limits
        tierMaxDepth[1] = 3;
        tierMaxDepth[2] = 5;
        tierMaxDepth[3] = 10;
    }

    // ─── Core: Register Referrer ─────────────────────────────

    /**
     * @notice Register a referrer (one-time per user).
     *         No self-referral. No circular referral (A→B→A).
     * @param _referrer The address that referred msg.sender
     */
    function registerReferrer(address _referrer) external whenNotPaused {
        if (_referrer == address(0)) revert ZeroAddress();
        if (_referrer == msg.sender) revert SelfReferral();
        if (referrer[msg.sender] != address(0)) revert ReferrerAlreadySet();

        // Prevent circular referral: walk up the chain from _referrer
        // If we ever find msg.sender, it's circular
        address current = _referrer;
        while (current != address(0)) {
            if (current == msg.sender) revert CircularReferral();
            current = referrer[current];
        }

        referrer[msg.sender] = _referrer;
        _downline[_referrer].push(msg.sender);

        emit ReferrerRegistered(msg.sender, _referrer);
    }

    // ─── Core: Direct Bonus ──────────────────────────────────

    /**
     * @notice Process direct bonus when a referred user stakes.
     *         Called by StakingVault (OPERATOR_ROLE) after stake creation.
     *         Adds 5% of stakeAmount to referrer's pending reward in RewardEngine.
     * @param staker      The user who staked
     * @param stakeAmount The BTN amount staked (6 decimals)
     */
    function processDirectBonus(
        address staker,
        uint256 stakeAmount
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        address ref = referrer[staker];
        if (ref == address(0)) return; // no referrer, nothing to do

        if (rewardEngine == address(0)) revert RewardEngineNotSet();

        uint256 bonus = (stakeAmount * DIRECT_BONUS_BPS) / 10_000;
        if (bonus == 0) return;

        IRewardEngine(rewardEngine).addPendingReward(ref, bonus);

        emit DirectBonusProcessed(ref, staker, stakeAmount, bonus);
    }

    // ─── Core: Matching Bonus ────────────────────────────────

    /**
     * @notice Process matching bonus after a user's rewards are settled.
     *         Called by RewardEngine (OPERATOR_ROLE) after settleWeekly.
     *         Walks up the referral chain, applying level-based percentages.
     *
     *         For each ancestor at level L:
     *           1. Check qualification: active vault + 500 BTN min personal stake
     *           2. Check tier allows this depth
     *           3. Calculate bonus = rewardAmount × matchingBps[L] / 10_000
     *           4. Add to ancestor's pending reward in RewardEngine
     *
     * @param user         The user whose rewards were just settled
     * @param rewardAmount The total reward amount that was settled (before 10/90 split)
     */
    function processMatchingBonus(
        address user,
        uint256 rewardAmount
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        if (rewardEngine == address(0)) revert RewardEngineNotSet();

        address ancestor = referrer[user];
        uint8 level = 1;

        while (ancestor != address(0) && level <= MAX_MATCHING_LEVELS) {
            // Check qualification
            if (_isQualified(ancestor, level)) {
                uint256 bonus = (rewardAmount * matchingBps[level]) / 10_000;
                if (bonus > 0) {
                    IRewardEngine(rewardEngine).addPendingReward(ancestor, bonus);
                    emit MatchingBonusProcessed(ancestor, user, bonus, level);
                }
            }

            ancestor = referrer[ancestor];
            level++;
        }
    }

    // ─── Views ───────────────────────────────────────────────

    /**
     * @notice Get the referrer for a user (address(0) if none)
     */
    function getReferrer(address user) external view returns (address) {
        return referrer[user];
    }

    /**
     * @notice Get all direct referrals (downline) of a user
     */
    function getDownline(address user) external view returns (address[] memory) {
        return _downline[user];
    }

    /**
     * @notice Get number of direct referrals for a user
     */
    function getDownlineCount(address user) external view returns (uint256) {
        return _downline[user].length;
    }

    /**
     * @notice Check if a user is qualified for matching bonus at a given level.
     *         Qualification: active vault + 500 BTN min personal stake + tier allows depth.
     */
    function isQualified(address user, uint8 level) external view returns (bool) {
        return _isQualified(user, level);
    }

    // ─── Admin ───────────────────────────────────────────────

    function setRewardEngine(address _rewardEngine) external onlyRole(DEFAULT_ADMIN_ROLE) {
        rewardEngine = _rewardEngine;
    }

    function setVaultManager(address _vaultManager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        vaultManager = _vaultManager;
    }

    function setStakingVault(address _stakingVault) external onlyRole(DEFAULT_ADMIN_ROLE) {
        stakingVault = _stakingVault;
    }

    function pause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ─── Internal ────────────────────────────────────────────

    /**
     * @dev Check if a user is qualified for matching bonus at a given level.
     *
     *      Requirements:
     *        1. VaultManager wired and user has active vault
     *        2. User's tier allows matching at this level depth
     *        3. StakingVault wired and user has >= 500 BTN personal stake
     *
     *      If vaultManager or stakingVault is address(0), that check is skipped
     *      (permissive for testing / gradual wiring).
     */
    function _isQualified(address user, uint8 level) internal view returns (bool) {
        // Check vault active and tier depth
        if (vaultManager != address(0)) {
            if (!IVaultManager(vaultManager).isVaultActive(user)) return false;

            uint8 tier = IVaultManager(vaultManager).getUserTier(user);
            uint8 maxDepth = tierMaxDepth[tier];
            if (level > maxDepth) return false;
        }

        // Check minimum personal stake
        if (stakingVault != address(0)) {
            uint256 personalStake = IStakingVault(stakingVault).getUserTotalStaked(user);
            if (personalStake < MIN_PERSONAL_STAKE) return false;
        }

        return true;
    }

    /**
     * @dev UUPS authorization — only admin can upgrade
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
