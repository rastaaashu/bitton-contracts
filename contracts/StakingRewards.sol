// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract StakingRewards is Ownable, ReentrancyGuard {
    IERC20 public btnToken;
    
    struct StakePosition {
        uint256 amount;
        uint256 startTime;
        uint256 lastClaimTime;
        uint256 lockPeriod; // in seconds
        uint256 rewardRate; // basis points per day (e.g., 200 = 2% daily)
        bool active;
    }

    mapping(address => StakePosition[]) public userStakes;
    mapping(address => bool) public whitelistedTokens;
    
    uint256 public defaultLockPeriod = 135 days;
    uint256 public defaultRewardRate = 200; // 2% daily default
    uint256 public claimDayOfWeek = 1; // Monday (0=Sunday, 1=Monday, etc.)
    
    event Staked(address indexed user, uint256 amount, uint256 lockPeriod, uint256 rewardRate);
    event RewardClaimed(address indexed user, uint256 amount, uint256 stakeIndex);
    event TokenWhitelisted(address indexed token, bool status);
    event RewardRateUpdated(uint256 newRate);
    event LockPeriodUpdated(uint256 newPeriod);

    constructor(address _btnToken) Ownable(msg.sender) {
        btnToken = IERC20(_btnToken);
        whitelistedTokens[_btnToken] = true;
    }

    // Admin: Whitelist tokens
    function setWhitelistedToken(address token, bool status) external onlyOwner {
        whitelistedTokens[token] = status;
        emit TokenWhitelisted(token, status);
    }

    // Admin: Set default reward rate
    function setDefaultRewardRate(uint256 rate) external onlyOwner {
        require(rate <= 10000, "Rate too high"); // Max 100% daily
        defaultRewardRate = rate;
        emit RewardRateUpdated(rate);
    }

    // Admin: Set lock period
    function setDefaultLockPeriod(uint256 period) external onlyOwner {
        require(period >= 7 days, "Too short");
        defaultLockPeriod = period;
        emit LockPeriodUpdated(period);
    }

    // Admin: Set claim day (0=Sunday, 1=Monday, etc.)
    function setClaimDayOfWeek(uint256 day) external onlyOwner {
        require(day <= 6, "Invalid day");
        claimDayOfWeek = day;
    }

    // User stakes tokens
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Cannot stake 0");
        require(btnToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        userStakes[msg.sender].push(StakePosition({
            amount: amount,
            startTime: block.timestamp,
            lastClaimTime: block.timestamp,
            lockPeriod: defaultLockPeriod,
            rewardRate: defaultRewardRate,
            active: true
        }));

        emit Staked(msg.sender, amount, defaultLockPeriod, defaultRewardRate);
    }

    // Calculate rewards per-second precision
    function calculateReward(address user, uint256 stakeIndex) public view returns (uint256) {
        StakePosition memory position = userStakes[user][stakeIndex];
        if (!position.active) return 0;

        uint256 timeElapsed = block.timestamp - position.lastClaimTime;
        uint256 dailyReward = (position.amount * position.rewardRate) / 10000;
        uint256 rewardPerSecond = dailyReward / 1 days;
        
        return rewardPerSecond * timeElapsed;
    }

    // Claim rewards (only on specific day of week)
    function claimReward(uint256 stakeIndex) external nonReentrant {
        require(stakeIndex < userStakes[msg.sender].length, "Invalid stake");
        
        // Check day of week
        uint256 currentDay = (block.timestamp / 1 days + 4) % 7; // Unix epoch = Thursday
        require(currentDay == claimDayOfWeek, "Can only claim on designated day");

        StakePosition storage position = userStakes[msg.sender][stakeIndex];
        require(position.active, "Stake not active");

        uint256 reward = calculateReward(msg.sender, stakeIndex);
        require(reward > 0, "No rewards to claim");

        position.lastClaimTime = block.timestamp;
        require(btnToken.transfer(msg.sender, reward), "Reward transfer failed");

        emit RewardClaimed(msg.sender, reward, stakeIndex);
    }

    // Unstake (after lock period) - FIXED VERSION
    function unstake(uint256 stakeIndex) external nonReentrant {
        require(stakeIndex < userStakes[msg.sender].length, "Invalid stake");
        
        StakePosition storage position = userStakes[msg.sender][stakeIndex];
        require(position.active, "Already unstaked");
        require(block.timestamp >= position.startTime + position.lockPeriod, "Still locked");

        // Calculate rewards BEFORE deactivating
        uint256 reward = calculateReward(msg.sender, stakeIndex);
        uint256 amount = position.amount;
        
        // Now deactivate
        position.active = false;

        // Transfer rewards if any
        if (reward > 0) {
            require(btnToken.transfer(msg.sender, reward), "Reward transfer failed");
        }

        // Transfer principal
        require(btnToken.transfer(msg.sender, amount), "Unstake failed");
    }

    // Get user's stakes count
    function getUserStakesCount(address user) external view returns (uint256) {
        return userStakes[user].length;
    }
}
