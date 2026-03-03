// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract StakingRewards is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public btnToken;
    
    struct StakePosition {
        address token;
        uint256 amount;
        uint256 startTime;
        uint256 lastClaimTime;
        uint256 lockPeriod;
        uint256 rewardRate;
        bool active;
    }

    mapping(address => StakePosition[]) public userStakes;
    mapping(address => bool) public whitelistedTokens;
    
    uint256 public defaultLockPeriod = 135 days;
    uint256 public defaultRewardRate = 200; // 2% daily (basis points)
    uint256 public claimDayOfWeek = 1; // Monday
    
    event Staked(address indexed user, address token, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount, uint256 stakeIndex);
    event Unstaked(address indexed user, uint256 amount, uint256 reward);
    event TokenWhitelisted(address indexed token, bool status);

    constructor(address _btnToken) Ownable(msg.sender) {
        btnToken = IERC20(_btnToken);
        whitelistedTokens[_btnToken] = true;
    }

    function setWhitelistedToken(address token, bool status) external onlyOwner {
        whitelistedTokens[token] = status;
        emit TokenWhitelisted(token, status);
    }

    function setDefaultRewardRate(uint256 rate) external onlyOwner {
        require(rate <= 10000, "Rate too high");
        defaultRewardRate = rate;
    }

    function setDefaultLockPeriod(uint256 period) external onlyOwner {
        require(period >= 7 days, "Too short");
        defaultLockPeriod = period;
    }

    function setClaimDayOfWeek(uint256 day) external onlyOwner {
        require(day <= 6, "Invalid day");
        claimDayOfWeek = day;
    }

    // Stake function (token parameter for compatibility)
    function stake(address token, uint256 amount) external nonReentrant {
        require(whitelistedTokens[token], "Token not whitelisted");
        require(amount > 0, "Cannot stake 0");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        userStakes[msg.sender].push(StakePosition({
            token: token,
            amount: amount,
            startTime: block.timestamp,
            lastClaimTime: block.timestamp,
            lockPeriod: defaultLockPeriod,
            rewardRate: defaultRewardRate,
            active: true
        }));

        emit Staked(msg.sender, token, amount);
    }

    // Get pending rewards (per-second calculation)
    function getPendingRewards(address user, uint256 stakeIndex) public view returns (uint256) {
        if (stakeIndex >= userStakes[user].length) return 0;
        
        StakePosition memory position = userStakes[user][stakeIndex];
        if (!position.active) return 0;

        uint256 timeElapsed = block.timestamp - position.lastClaimTime;
        uint256 dailyReward = (position.amount * position.rewardRate) / 10000;
        uint256 rewardPerSecond = dailyReward / 1 days;
        
        return rewardPerSecond * timeElapsed;
    }

    // Claim rewards (only on designated day)
    function claimRewards(uint256 stakeIndex) external nonReentrant {
        require(stakeIndex < userStakes[msg.sender].length, "Invalid stake");
        
        uint256 currentDay = (block.timestamp / 1 days + 4) % 7;
        require(currentDay == claimDayOfWeek, "Can only claim on the designated day");

        StakePosition storage position = userStakes[msg.sender][stakeIndex];
        require(position.active, "Stake not active");

        uint256 reward = getPendingRewards(msg.sender, stakeIndex);
        require(reward > 0, "No rewards to claim");

        position.lastClaimTime = block.timestamp;
        IERC20(position.token).safeTransfer(msg.sender, reward);

        emit RewardClaimed(msg.sender, reward, stakeIndex);
    }

    // Unstake after lock period
    function unstake(uint256 stakeIndex) external nonReentrant {
        require(stakeIndex < userStakes[msg.sender].length, "Invalid stake");
        
        StakePosition storage position = userStakes[msg.sender][stakeIndex];
        require(position.active, "Already unstaked");
        require(block.timestamp >= position.startTime + position.lockPeriod, "Lock period not ended");

        uint256 reward = getPendingRewards(msg.sender, stakeIndex);
        uint256 amount = position.amount;
        address token = position.token;
        
        position.active = false;

        // Transfer principal + rewards
        IERC20(token).safeTransfer(msg.sender, amount + reward);
        
        emit Unstaked(msg.sender, amount, reward);
    }

    // Get user's all stakes
    function getUserStakes(address user) external view returns (StakePosition[] memory) {
        return userStakes[user];
    }
}
