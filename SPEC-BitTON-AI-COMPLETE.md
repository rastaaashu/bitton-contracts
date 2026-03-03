# BitTON.AI — Complete Technical Specification v1.0

**Last Updated:** February 27, 2026  
**Target Chain:** Base (Mainnet & Sepolia Testnet)  
**Repo:** bitton-contracts  

---

## 1. Project Overview

BitTON.AI is a DeFi platform deployed on Base blockchain, featuring:
- **Existing BTN ERC20 Token** (deployed, verified, operational)
- **Two staking programs** (Short Staking, Long Staking)
- **Vault activation system** (tier-based access: T1/T2/T3)
- **Reward settlement engine** (weekly 10/90 split)
- **Vesting mechanism** (0.5% daily release)
- **Withdrawal wallet ledger**
- **Direct bonus engine** (5% referral)
- **Matching bonus engine** (level-based team rewards)
- **Web3 user cabinet** + **Admin interface**

**All reward flows follow unified settlement pipeline unless explicitly overridden.**

---

## 2. BTN Token 

**Contract:** `contracts/BTNToken.sol`  
**Deployed on Base Sepolia:** `0x5b964baafEDf002e5364F37848DCa1908D3e4e9f`

### 2.1 Token Specifications
- **Name:** BTN
- **Symbol:** BTN
- **Decimals:** 6
- **Max Supply:** 21,000,000 BTN (21,000,000 * 10^6 units)

### 2.2 Read Methods
| Function | Returns | Description |
|----------|---------|-------------|
| `DOMAIN_SEPARATOR()` | bytes32 | EIP-712 domain separator for permit |
| `MAX_SUPPLY()` | uint256 | Maximum token supply (21M with 6 decimals) |
| `allowance(address,address)` | uint256 | Approved spending amount |
| `balanceOf(address)` | uint256 | Token balance of address |
| `burnedSupply()` | uint256 | Total burned since deployment |
| `decimals()` | uint8 | Always returns 6 |
| `isMinter(address)` | bool | Whether address has mint permission |
| `issuedSupply()` | uint256 | Total minted since deployment |
| `mintingActive()` | bool | Whether minting is currently allowed |
| `name()` | string | Token name "BTN" |
| `nonces(address)` | uint256 | Permit nonce for EIP-2612 |
| `owner()` | address | Current contract owner |
| `symbol()` | string | Token symbol "BTN" |
| `totalSupply()` | uint256 | Current circulating supply |

### 2.3 Write Methods
| Function | Access | Description |
|----------|--------|-------------|
| `addMinter(address)` | onlyOwner | Add minter role |
| `approve(address,uint256)` | public | Standard ERC20 approve |
| `burn(uint256)` | public | Burn from caller balance |
| `mint(address,uint256)` | onlyMinter | Mint new tokens (respects MAX_SUPPLY) |
| `permit(...)` | public | EIP-2612 gasless approval |
| `removeMinter(address)` | onlyOwner | Remove minter role |
| `renounceMinting()` | public | Caller renounces minter role |
| `renounceOwnership()` | onlyOwner | Renounce ownership |
| `transfer(address,uint256)` | public | Standard ERC20 transfer |
| `transferFrom(address,address,uint256)` | public | Standard ERC20 transferFrom |
| `transferOwnership(address)` | onlyOwner | Transfer ownership |

### 2.4 Integration Rules
- **BitTON.AI contracts use BTN via IERC20 interface**
- **No modifications to BTNToken.sol allowed**
- **Rewards paid from funded contract balance** (no new minting unless explicitly funded by owner)

---

## 3. System Architecture Overview

### 3.1 Logical Balance Zones (per user)

Each user has **four conceptual balance zones** tracked across contracts:

| Zone | Description | Location |
|------|-------------|----------|
| **Holding Tank** | Temporary non-reward storage (optional, may be UI-only or on-chain buffer) | TBD: UI or on-chain mapping |
| **Vault (Staked Principal)** | Active staking principal (separated Short/Long) | `StakingVault.sol` |
| **Vesting Pool** | Locked reward portion (90% of weekly earnings) | `VestingPool.sol` |
| **Withdrawal Wallet** | Immediately withdrawable (10% weekly + daily vest releases) | `WithdrawalWallet.sol` |

---

## 4. Parameter Tables

### 4.1 Vault Tier Configuration

| Tier | Activation Fee (USD) | Max Staking Multiplier | Matching Levels | Notes |
|------|----------------------|------------------------|-----------------|-------|
| T1   | $25                  | 1.0x                   | 3 levels        | Basic |
| T2   | $50                  | 1.1x                   | 5 levels        | Intermediate |
| T3   | $100                 | 1.2x                   | 10 levels       | Full |

**Payment:**
- Activation fee payable in **USDT (Base)** or **BTN** (converted via Chainlink oracle)
- Oracle: [Specify USDT/USD feed address on Base]
- Conversion: `BTN_required = fee_USD / BTN_USD_price` (use oracle price at payment time)
- Precision: Round up to nearest BTN unit (6 decimals)

### 4.2 Staking Program Parameters

#### Short Staking

| Parameter | Value |
|-----------|-------|
| Lock Period | 30 days |
| Base Daily Reward | 0.5% (R = 0.005) |
| Tier Multiplier | M = 1.0 (T1), 1.1 (T2), 1.2 (T3) |
| Early Exit | Allowed |
| Early Exit Penalty | 15% of principal → sent to treasury address |
| Compounding | Manual only (user claims then restakes) |

#### Long Staking

| Parameter | Value |
|-----------|-------|
| Lock Period | 180 days |
| Base Daily Reward | 0.5% (R = 0.005) |
| Reward Multiplier | +20% → M = 1.2 (all tiers) |
| Early Exit | NOT allowed (function reverts) |
| Compounding | Manual only |

### 4.3 Reward Settlement Rules

**Weekly Settlement Split:**
- 10% → `WithdrawalWallet` (immediately withdrawable)
- 90% → `VestingPool` (locked, releases daily)

**Daily Vesting Release:**
- 0.5% of current vested balance per day (r_v = 0.005)
- User may call `release()` anytime; contract calculates time elapsed

**Settlement Trigger:**
- **Who:** Owner/Operator role calls `settleWeekly(address user)` OR user triggers own settlement
- **When:** On-demand (web app calls weekly via keeper or user action)
- **Accumulation:** If not called for N weeks, rewards accumulate in pendingReward until next settlement

### 4.4 Direct Bonus

| Parameter | Value |
|-----------|-------|
| Bonus % | 5% of referred user's stake amount |
| Trigger | When referred user stakes (one-time per stake position) |
| Settlement | Goes through weekly 10/90 split |
| Cap | No cap (tier does not limit direct bonus amount) |

### 4.5 Matching Bonus

| Level | % of Downline Reward |
|-------|----------------------|
| Level 1 | 10% |
| Level 2 | 5% |
| Level 3 | 3% |
| Level 4–10 | 1% each (Tier 3 only) |

**Qualification:**
- Active vault required (user tier >= T1)
- Minimum personal stake: **500 BTN** (total across all active stake positions)
- Matching applies to downline's **rewards** (not their stake principal)

---

## 5. Mathematical Formulas

### 5.1 Base Reward Calculation

**Variables:**
- P = staked principal (BTN amount, 6 decimals)
- R = daily reward rate = 0.005 (0.5%)
- M = multiplier:
  - Short Staking: M = tier_multiplier (1.0, 1.1, 1.2)
  - Long Staking: M = 1.2 (fixed +20%)

**Daily Reward:**
```
Reward_daily = P × R × M
```

**Solidity Implementation:**
```solidity
// Integer arithmetic, 6 decimals
uint256 rewardDaily = (principal * 5 * multiplier) / (1000 * 10);
// multiplier as integer: 10 = 1.0x, 11 = 1.1x, 12 = 1.2x
```

### 5.2 Weekly Settlement

**Weekly Reward:**
```
Reward_week = Σ Reward_daily over 7 days
```

**Split:**
```
Withdrawable_add = Reward_week × 0.10
Vesting_add = Reward_week × 0.90
```

**Solidity Implementation:**
```solidity
uint256 withdrawable = (rewardWeek * 10) / 100;
uint256 vesting = rewardWeek - withdrawable;
```

### 5.3 Vesting Release

**Variables:**
- V = current vested balance
- r_v = 0.005 (0.5% per day)
- t = time elapsed since lastReleaseTime (in seconds)

**Daily Vest Release:**
```
Release_daily = V × r_v
```

**Time-based release (per second):**
```
Release = V × (t / 1 days) × r_v
```

**Solidity Implementation:**
```solidity
uint256 timeElapsed = block.timestamp - lastReleaseTime[user];
uint256 dailyRelease = (vestedBalance[user] * 5) / 1000;
uint256 releasePerSecond = dailyRelease / 1 days;
uint256 totalRelease = releasePerSecond * timeElapsed;
```

### 5.4 Direct Bonus Formula

**If user A refers user B:**
```
DirectBonus_A = Stake_B × 0.05
```

Processed through weekly settlement split (10% withdrawable, 90% vesting).

### 5.5 Matching Bonus Formula

**If downline user earns reward R_d:**
```
MatchingBonus = R_d × level_percentage
```

**Example Level 1:**
```
MB1 = R_d × 0.10
```

**Tier limits matching depth:**
- T1: levels 1–3 only
- T2: levels 1–5 only
- T3: levels 1–10 (full tree)

---

## 6. Smart Contract Architecture (Base)

### 6.1 Contracts Overview

| Contract | Purpose | Upgradeability |
|----------|---------|----------------|
| `VaultManager.sol` | Tier activation, fee collection | UUPS Proxy |
| `StakingVault.sol` | Stake/unstake Short & Long | UUPS Proxy |
| `RewardEngine.sol` | Daily accrual, weekly settlement | UUPS Proxy |
| `VestingPool.sol` | 90% vesting lock & release | UUPS Proxy |
| `WithdrawalWallet.sol` | 10% withdrawable ledger | UUPS Proxy |
| `BonusEngine.sol` | Direct & matching bonus logic | UUPS Proxy |

**All contracts use OpenZeppelin UUPS upgradeable pattern.**

### 6.2 Funding Model

**Reward Source:**
- Rewards are **paid from contract balance** (owner pre-funds RewardEngine with BTN)
- **No minting** of new BTN beyond initial MAX_SUPPLY
- If reward pool exhausted, settlements fail until refunded

**Treasury:**
- Early exit penalties (15% of principal) sent to treasury address (configurable by owner)

---

## 7. Contract Interfaces (Detailed)

### 7.1 IVaultManager

**Functions:**
```solidity
function activateVault(uint8 tier) external payable;
function isVaultActive(address user) external view returns (bool);
function getUserTier(address user) external view returns (uint8);
function setOracleAddress(address oracle) external; // onlyOwner
function setTreasuryAddress(address treasury) external; // onlyOwner
```

**Events:**
```solidity
event VaultActivated(address indexed user, uint8 tier, uint256 feeUSD, uint256 feePaid, address token);
```

**Storage:**
```solidity
mapping(address => uint8) public userTier;
mapping(address => bool) public activeVault;
address public oracleAddress; // Chainlink price feed
address public treasuryAddress;
```

**Logic:**
- User pays in USDT or BTN
- If BTN: fetch USDT/USD and BTN/USD prices from oracle, calculate BTN equivalent
- Transfer fee to treasury
- Set `userTier[msg.sender] = tier` and `activeVault[msg.sender] = true`

### 7.2 IStakingVault

**Functions:**
```solidity
function stake(uint256 amount, uint8 programType) external;
// programType: 0 = Short, 1 = Long

function unstake(uint256 stakeIndex) external;
// Short: allows early exit with penalty
// Long: reverts if lock period not met

function getStakes(address user) external view returns (StakeInfo[] memory);
function getPendingRewards(address user, uint256 stakeIndex) external view returns (uint256);
```

**Events:**
```solidity
event Staked(address indexed user, uint256 amount, uint8 programType, uint256 stakeIndex);
event Unstaked(address indexed user, uint256 amount, uint256 reward, uint256 penalty);
```

**Storage:**
```solidity
struct StakeInfo {
    uint256 amount;
    uint256 startTime;
    uint8 programType; // 0 = Short, 1 = Long
    uint256 lastRewardTime;
    bool active;
}
mapping(address => StakeInfo[]) public stakes;
```

### 7.3 IRewardEngine

**Functions:**
```solidity
function calculateReward(address user, uint256 stakeIndex) external view returns (uint256);
function settleWeekly(address user) external; // callable by operator or user
function fundRewards(uint256 amount) external; // owner funds BTN
```

**Events:**
```solidity
event RewardAccrued(address indexed user, uint256 amount);
event RewardSplit(address indexed user, uint256 withdrawable, uint256 vested);
event RewardsFunded(uint256 amount);
```

**Storage:**
```solidity
mapping(address => uint256) public pendingReward;
address public rewardToken; // BTN address
uint256 public rewardPoolBalance;
```

### 7.4 IVestingPool

**Functions:**
```solidity
function addVesting(address user, uint256 amount) external; // called by RewardEngine
function release(address user) external; // user or operator triggers
function getVestedBalance(address user) external view returns (uint256);
function getPendingRelease(address user) external view returns (uint256);
```

**Events:**
```solidity
event VestingAdded(address indexed user, uint256 amount);
event VestedReleased(address indexed user, uint256 amount);
```

**Storage:**
```solidity
mapping(address => uint256) public vestedBalance;
mapping(address => uint256) public lastReleaseTime;
```

### 7.5 IWithdrawalWallet

**Functions:**
```solidity
function addWithdrawable(address user, uint256 amount) external; // called by RewardEngine or VestingPool
function withdraw(uint256 amount) external; // user withdraws BTN
function getWithdrawableBalance(address user) external view returns (uint256);
```

**Events:**
```solidity
event WithdrawableAdded(address indexed user, uint256 amount);
event Withdrawn(address indexed user, uint256 amount);
```

**Storage:**
```solidity
mapping(address => uint256) public withdrawableBalance;
```

### 7.6 IBonusEngine

**Functions:**
```solidity
function registerReferrer(address referrer) external; // one-time per user
function processDirectBonus(address referrer, uint256 stakeAmount) external; // called by StakingVault
function processMatchingBonus(address user, uint256 rewardAmount) external; // called by RewardEngine
function getReferrer(address user) external view returns (address);
function getDownline(address user) external view returns (address[] memory);
```

**Events:**
```solidity
event ReferrerRegistered(address indexed user, address indexed referrer);
event DirectBonus(address indexed referrer, uint256 amount);
event MatchingBonus(address indexed referrer, uint256 amount, uint8 level);
```

**Storage:**
```solidity
mapping(address => address) public referrer;
mapping(address => address[]) public downline;
```

---

## 8. Security Requirements

- **ReentrancyGuard** on all functions transferring tokens out (withdraw, unstake, release)
- **AccessControl roles:**
  - `DEFAULT_ADMIN_ROLE` (owner)
  - `OPERATOR_ROLE` (weekly settlement, parameter updates)
  - `EMERGENCY_ROLE` (pause contracts)
- **SafeERC20** for all ERC20 operations
- **Pausable** functionality (owner can pause staking/unstaking in emergency)
- **Full event emission** for indexing and audit trail
- **No arbitrary minting** (rewards only from funded balance)
- **Oracle validation** (check staleness, revert if oracle price is 0 or too old)

---

## 9. Acceptance Criteria

System considered **complete** when:

1. ✅ Vault activation required before earning staking rewards
2. ✅ Short and Long staking programs operate independently with correct lock periods
3. ✅ Weekly 10/90 split enforced on all rewards
4. ✅ Vesting releases 0.5% daily (time-based calculation)
5. ✅ Direct bonuses (5%) and matching bonuses (level-based %) computed correctly
6. ✅ Withdrawals only possible from WithdrawalWallet balance
7. ✅ All logic test-covered (>= 95% coverage via `npx hardhat coverage`)
8. ✅ Deployed on Base Sepolia testnet with verified contracts
9. ✅ Web app can index all events and display balances correctly
10.✅ Security review completed (Phase 4)

---

## 10. Development Phases

| Phase | Deliverables | Timeline |
|-------|--------------|----------|
| **Phase 1 — Smart Contracts** | All 6 contracts + tests + deploy scripts | 4 weeks |
| **Phase 2 — Web App UI** | User cabinet + admin dashboard | 3 weeks |
| **Phase 3 — Integration & Indexer** | Event indexing + API | 2 weeks |
| **Phase 4 — Security Audit** | External audit + fixes | 2 weeks |
| **Phase 5 — Mainnet Deployment** | Base mainnet deployment + monitoring | 1 week |

**Total:** ~12 weeks

---

## 11. Definitions & Clarifications

### 11.1 Holding Tank
- **Not implemented on-chain** in Phase 1 (UI concept only)
- Future: could be on-chain buffer for unstaked tokens before restaking

### 11.2 Reward Accrual
- Rewards accrue **per stake position** (tracked in StakeInfo.lastRewardTime)
- Settlement calculates `Σ rewards` across all active stakes for a user

### 11.3 Compounding
- **Manual only:** User must claim rewards to WithdrawalWallet, then call `stake()` again
- No automatic compounding in v1

### 11.4 Oracle Failure Handling
- If oracle price is 0 or stale (>1 hour old), vault activation reverts
- Owner can update oracle address via `setOracleAddress()`

### 11.5 Rounding
- All Solidity calculations use **integer division** (truncate/floor)
- Favor user when rounding (round up penalties, round down rewards if needed)

---

## 12. Open Questions / TODOs

- [ ] Specify exact Chainlink oracle addresses on Base (USDT/USD, BTN/USD if available)
- [ ] Define treasury wallet address (multisig recommended)
- [ ] Decide whether Holding Tank is on-chain or UI-only in Phase 1
- [ ] Confirm whether weekly settlement is triggered by keeper bot or user action
- [ ] Define admin dashboard requirements (Phase 2)

---

**End of Specification v1.0**
