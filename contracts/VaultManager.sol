// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IAggregatorV3.sol";

/**
 * @title VaultManager
 * @dev Manages vault tier activation (T1/T2/T3) with USDT or BTN payment.
 *      Payment auto-detection: USDT-first, BTN-fallback via allowance check.
 *      Uses Chainlink oracle for BTN/USD price conversion.
 *      UUPS upgradeable.
 */
contract VaultManager is
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
    mapping(address => uint8) public userTier;       // 0=none, 1=T1, 2=T2, 3=T3
    mapping(address => bool) public activeVault;

    address public oracleAddress;    // Chainlink BTN/USD price feed
    address public treasuryAddress;
    address public usdtToken;
    address public btnToken;

    // Tier fees in USD with 6 decimals (matches USDT decimals)
    // Index 0 unused; tiers are 1-indexed
    uint256[4] public tierFeeUSD; // [0, 25e6, 50e6, 100e6]

    uint256 public constant ORACLE_STALENESS = 1 hours;

    // ─── Events ──────────────────────────────────────────────
    event VaultActivated(
        address indexed user,
        uint8 tier,
        uint256 feeUSD,
        uint256 feePaid,
        address token
    );
    event OracleAddressUpdated(address indexed oldOracle, address indexed newOracle);
    event TreasuryAddressUpdated(address indexed oldTreasury, address indexed newTreasury);

    // ─── Errors ──────────────────────────────────────────────
    error InvalidTier(uint8 tier);
    error CannotDowngrade(uint8 currentTier, uint8 requestedTier);
    error TreasuryNotSet();
    error OracleNotSet();
    error OracleStale(uint256 updatedAt, uint256 currentTime);
    error OraclePriceInvalid(int256 price);
    error InsufficientAllowance();
    error ZeroAddress();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializer (replaces constructor for UUPS proxy)
     * @param _btnToken Address of BTN ERC20 token
     * @param _usdtToken Address of USDT ERC20 token
     * @param _oracle Chainlink BTN/USD price feed address
     * @param _treasury Treasury wallet address
     * @param _admin Admin address (receives DEFAULT_ADMIN_ROLE)
     */
    function initialize(
        address _btnToken,
        address _usdtToken,
        address _oracle,
        address _treasury,
        address _admin
    ) external initializer {
        if (_btnToken == address(0)) revert ZeroAddress();
        if (_usdtToken == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();

        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _admin);
        _grantRole(EMERGENCY_ROLE, _admin);

        btnToken = _btnToken;
        usdtToken = _usdtToken;
        oracleAddress = _oracle;
        treasuryAddress = _treasury;

        // Tier fees: $25, $50, $100 (6 decimals)
        tierFeeUSD[1] = 25 * 10 ** 6;
        tierFeeUSD[2] = 50 * 10 ** 6;
        tierFeeUSD[3] = 100 * 10 ** 6;
    }

    // ─── Core ────────────────────────────────────────────────

    /**
     * @notice Activate or upgrade vault tier. Payment auto-detected:
     *         USDT if allowance sufficient, else BTN via oracle conversion.
     * @param tier Tier level (1, 2, or 3)
     */
    function activateVault(uint8 tier) external nonReentrant whenNotPaused {
        if (tier < 1 || tier > 3) revert InvalidTier(tier);
        if (tier < userTier[msg.sender]) revert CannotDowngrade(userTier[msg.sender], tier);
        if (treasuryAddress == address(0)) revert TreasuryNotSet();

        uint256 feeUSD = tierFeeUSD[tier];

        // Auto-detect payment method: USDT-first, BTN-fallback
        IERC20 usdt = IERC20(usdtToken);
        IERC20 btn = IERC20(btnToken);

        if (
            usdt.allowance(msg.sender, address(this)) >= feeUSD &&
            usdt.balanceOf(msg.sender) >= feeUSD
        ) {
            // Pay with USDT
            usdt.safeTransferFrom(msg.sender, treasuryAddress, feeUSD);

            userTier[msg.sender] = tier;
            activeVault[msg.sender] = true;

            emit VaultActivated(msg.sender, tier, feeUSD, feeUSD, usdtToken);
        } else {
            // Pay with BTN (oracle conversion)
            uint256 btnAmount = _getBTNAmountForUSD(feeUSD);

            if (
                btn.allowance(msg.sender, address(this)) < btnAmount ||
                btn.balanceOf(msg.sender) < btnAmount
            ) {
                revert InsufficientAllowance();
            }

            btn.safeTransferFrom(msg.sender, treasuryAddress, btnAmount);

            userTier[msg.sender] = tier;
            activeVault[msg.sender] = true;

            emit VaultActivated(msg.sender, tier, feeUSD, btnAmount, btnToken);
        }
    }

    // ─── Views ───────────────────────────────────────────────

    /**
     * @notice Check if user has an active vault
     */
    function isVaultActive(address user) external view returns (bool) {
        return activeVault[user];
    }

    /**
     * @notice Get user's tier (0 if no vault)
     */
    function getUserTier(address user) external view returns (uint8) {
        return userTier[user];
    }

    /**
     * @notice Calculate BTN amount required for a given USD fee
     * @param feeUSD Fee in USD (6 decimals)
     * @return btnAmount BTN amount (6 decimals), rounded up
     */
    function getBTNAmountForUSD(uint256 feeUSD) external view returns (uint256) {
        return _getBTNAmountForUSD(feeUSD);
    }

    // ─── Admin ───────────────────────────────────────────────

    function setOracleAddress(address _oracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_oracle == address(0)) revert ZeroAddress();
        address old = oracleAddress;
        oracleAddress = _oracle;
        emit OracleAddressUpdated(old, _oracle);
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
     * @dev Fetch BTN/USD price from Chainlink oracle, validate staleness,
     *      and compute BTN amount for a given USD fee (rounded up).
     *
     *      Math: btnAmount = ceil(feeUSD * 10^oracleDecimals / price)
     *      - feeUSD has 6 decimals (USDT-scale)
     *      - oracle price has `oracleDecimals` decimals (typically 8)
     *      - BTN has 6 decimals
     *      - Result: (feeUSD * 10^8) / price  → BTN amount in 6 decimals
     */
    function _getBTNAmountForUSD(uint256 feeUSD) internal view returns (uint256) {
        if (oracleAddress == address(0)) revert OracleNotSet();

        IAggregatorV3 oracle = IAggregatorV3(oracleAddress);
        uint8 oracleDecimals = oracle.decimals();

        (
            ,
            int256 price,
            ,
            uint256 updatedAt,
        ) = oracle.latestRoundData();

        // Staleness check: revert if >1 hour old
        if (block.timestamp - updatedAt > ORACLE_STALENESS) {
            revert OracleStale(updatedAt, block.timestamp);
        }

        // Price must be positive
        if (price <= 0) revert OraclePriceInvalid(price);

        uint256 uPrice = uint256(price);

        // Round up: ceil(feeUSD * 10^oracleDecimals / price)
        uint256 numerator = feeUSD * (10 ** oracleDecimals);
        uint256 btnAmount = (numerator + uPrice - 1) / uPrice;

        return btnAmount;
    }

    /**
     * @dev UUPS authorization — only admin can upgrade
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
