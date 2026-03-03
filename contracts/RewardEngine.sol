// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IStakingVault.sol";
import "./interfaces/IVaultManager.sol";
import "./interfaces/IVestingPool.sol";
import "./interfaces/IWithdrawalWallet.sol";
import "./interfaces/IBonusEngine.sol";

/**
 * @title RewardEngine
 * @dev Calculates accrued staking rewards, performs weekly 10/90 settlement,
 *      and routes funds to WithdrawalWallet (10%) and VestingPool (90%).
 *
 *      - Rewards are paid from a pre-funded BTN balance (rewardPoolBalance)
 *      - Settlement is triggered per-user by the user themselves or an OPERATOR
 *      - Matching bonus processing delegated to BonusEngine (optional)
 *      - UUPS upgradeable
 */
contract RewardEngine is
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
    address public stakingVault;
    address public vestingPool;
    address public withdrawalWallet;
    address public bonusEngine;
    address public vaultManager;

    mapping(address => uint256) public pendingReward;
    uint256 public rewardPoolBalance;
    mapping(address => uint256) public lastSettlementTime;

    // ─── Events ──────────────────────────────────────────────
    event RewardAccrued(address indexed user, uint256 amount);
    event RewardSplit(address indexed user, uint256 withdrawable, uint256 vested);
    event RewardsFunded(address indexed funder, uint256 amount);
    event StakingVaultUpdated(address indexed oldAddr, address indexed newAddr);
    event VestingPoolUpdated(address indexed oldAddr, address indexed newAddr);
    event WithdrawalWalletUpdated(address indexed oldAddr, address indexed newAddr);
    event BonusEngineUpdated(address indexed oldAddr, address indexed newAddr);
    event VaultManagerUpdated(address indexed oldAddr, address indexed newAddr);

    // ─── Errors ──────────────────────────────────────────────
    error ZeroAddress();
    error ZeroAmount();
    error StakingVaultNotSet();
    error VestingPoolNotSet();
    error WithdrawalWalletNotSet();
    error VaultNotActive();
    error InsufficientRewardPool(uint256 requested, uint256 available);
    error NoRewardsToClaim();
    error NotUserOrOperator();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @param _btnToken           BTN ERC20 token address
     * @param _stakingVault       StakingVault proxy address
     * @param _vestingPool        VestingPool address (receives 90% of settled rewards)
     * @param _withdrawalWallet   WithdrawalWallet address (receives 10% of settled rewards)
     * @param _vaultManager       VaultManager address (for vault-active gating; address(0) to skip)
     * @param _admin              Admin address (receives all roles)
     */
    function initialize(
        address _btnToken,
        address _stakingVault,
        address _vestingPool,
        address _withdrawalWallet,
        address _vaultManager,
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
        stakingVault = _stakingVault;
        vestingPool = _vestingPool;
        withdrawalWallet = _withdrawalWallet;
        vaultManager = _vaultManager;
    }

    // ─── Core: Calculate Reward ───────────────────────────────

    /**
     * @notice View: calculate accrued reward for a specific stake position.
     *         Delegates to StakingVault.getPendingRewards().
     */
    function calculateReward(address user, uint256 stakeIndex) external view returns (uint256) {
        if (stakingVault == address(0)) revert StakingVaultNotSet();
        return IStakingVault(stakingVault).getPendingRewards(user, stakeIndex);
    }

    // ─── Core: Weekly Settlement ──────────────────────────────

    /**
     * @notice Settle accrued rewards for a user across all active stakes.
     *         Callable by the user themselves or by an OPERATOR.
     *
     *         Flow:
     *         1. Iterate active stakes → aggregate accrued rewards → reset lastRewardTime
     *         2. Add any previously accumulated pendingReward
     *         3. Split total: 10% → WithdrawalWallet, 90% → VestingPool
     *         4. Transfer BTN and update downstream accounting
     *         5. Trigger matching bonus on BonusEngine (if wired)
     */
    function settleWeekly(address user) external nonReentrant whenNotPaused {
        // Access control: user or operator
        if (msg.sender != user && !hasRole(OPERATOR_ROLE, msg.sender)) {
            revert NotUserOrOperator();
        }

        // Dependency checks
        if (stakingVault == address(0)) revert StakingVaultNotSet();
        if (vestingPool == address(0)) revert VestingPoolNotSet();
        if (withdrawalWallet == address(0)) revert WithdrawalWalletNotSet();

        // Vault activation gating
        if (vaultManager != address(0)) {
            if (!IVaultManager(vaultManager).isVaultActive(user)) {
                revert VaultNotActive();
            }
        }

        IStakingVault sv = IStakingVault(stakingVault);
        uint256 stakeCount = sv.getStakeCount(user);

        uint256 totalNewReward = 0;

        // 1. Iterate all active stakes, collect accrued rewards, reset timestamps
        for (uint256 i = 0; i < stakeCount; i++) {
            IStakingVault.StakeInfo memory s = sv.getStake(user, i);
            if (!s.active) continue;

            uint256 reward = sv.getPendingRewards(user, i);
            if (reward > 0) {
                totalNewReward += reward;
                sv.resetLastRewardTime(user, i);
            }
        }

        // 2. Add any previously accumulated pending reward
        totalNewReward += pendingReward[user];

        if (totalNewReward == 0) revert NoRewardsToClaim();

        // 3. Check reward pool sufficiency
        if (totalNewReward > rewardPoolBalance) {
            revert InsufficientRewardPool(totalNewReward, rewardPoolBalance);
        }

        // 4. Effects: deduct from pool, clear pending
        rewardPoolBalance -= totalNewReward;
        pendingReward[user] = 0;
        lastSettlementTime[user] = block.timestamp;

        // 5. 10/90 split
        uint256 withdrawableAmt = (totalNewReward * 10) / 100;
        uint256 vestedAmt = totalNewReward - withdrawableAmt;

        // 6. Interactions: transfer BTN and update downstream contracts
        btnToken.safeTransfer(withdrawalWallet, withdrawableAmt);
        IWithdrawalWallet(withdrawalWallet).addWithdrawable(user, withdrawableAmt);

        btnToken.safeTransfer(vestingPool, vestedAmt);
        IVestingPool(vestingPool).addVesting(user, vestedAmt);

        // 7. Matching bonus (optional — skip if bonusEngine not wired)
        if (bonusEngine != address(0)) {
            IBonusEngine(bonusEngine).processMatchingBonus(user, totalNewReward);
        }

        emit RewardAccrued(user, totalNewReward);
        emit RewardSplit(user, withdrawableAmt, vestedAmt);
    }

    // ─── Core: Fund Rewards ───────────────────────────────────

    /**
     * @notice Fund the reward pool with BTN tokens.
     *         Anyone can call (owner pre-funds, but no restriction).
     * @param amount BTN amount to deposit (6 decimals)
     */
    function fundRewards(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        btnToken.safeTransferFrom(msg.sender, address(this), amount);
        rewardPoolBalance += amount;
        emit RewardsFunded(msg.sender, amount);
    }

    // ─── Operator: Add Pending Reward ─────────────────────────

    /**
     * @notice Operator can add pending reward directly (e.g., from direct bonus).
     *         The amount is added to the user's pendingReward to be settled via
     *         the normal 10/90 split on next settleWeekly call.
     * @param user   User address
     * @param amount BTN amount (6 decimals)
     */
    function addPendingReward(address user, uint256 amount) external onlyRole(OPERATOR_ROLE) {
        if (user == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        pendingReward[user] += amount;
        emit RewardAccrued(user, amount);
    }

    // ─── Views ────────────────────────────────────────────────

    /**
     * @notice Get total pending reward for a user (accumulated + currently accruing).
     */
    function getTotalPending(address user) external view returns (uint256) {
        uint256 total = pendingReward[user];

        if (stakingVault != address(0)) {
            IStakingVault sv = IStakingVault(stakingVault);
            uint256 stakeCount = sv.getStakeCount(user);
            for (uint256 i = 0; i < stakeCount; i++) {
                IStakingVault.StakeInfo memory s = sv.getStake(user, i);
                if (s.active) {
                    total += sv.getPendingRewards(user, i);
                }
            }
        }

        return total;
    }

    // ─── Admin Setters ────────────────────────────────────────

    function setStakingVault(address _stakingVault) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address old = stakingVault;
        stakingVault = _stakingVault;
        emit StakingVaultUpdated(old, _stakingVault);
    }

    function setVestingPool(address _vestingPool) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address old = vestingPool;
        vestingPool = _vestingPool;
        emit VestingPoolUpdated(old, _vestingPool);
    }

    function setWithdrawalWallet(address _withdrawalWallet) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address old = withdrawalWallet;
        withdrawalWallet = _withdrawalWallet;
        emit WithdrawalWalletUpdated(old, _withdrawalWallet);
    }

    function setBonusEngine(address _bonusEngine) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address old = bonusEngine;
        bonusEngine = _bonusEngine;
        emit BonusEngineUpdated(old, _bonusEngine);
    }

    function setVaultManager(address _vaultManager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address old = vaultManager;
        vaultManager = _vaultManager;
        emit VaultManagerUpdated(old, _vaultManager);
    }

    function pause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ─── Internal ─────────────────────────────────────────────

    /**
     * @dev UUPS authorization — only admin can upgrade
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
