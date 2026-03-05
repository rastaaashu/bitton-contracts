# BitTON.AI - Frontend Functional Specification
## For Frontend Developers - Quick Reference

---

## 1. User Journey

```
Visit App → Connect Wallet → Activate Vault → Stake BTN → Earn Rewards → Settle → Release Vesting → Withdraw
                ↓                                  ↓
         Register Email (optional)          Share Referral Link → Earn Bonuses
```

### New User Flow
1. Visit app → /login
2. Connect wallet (MetaMask/Coinbase) OR register with email
3. Dashboard loads with zero balances
4. Yellow banner: "Activate your vault to start earning"
5. Navigate to /vault → Select tier → Pay USDT or BTN
6. Navigate to /staking → Enter amount → Select Short/Long → Stake
7. Wait for rewards to accrue → /rewards → Settle
8. /vesting → Release vested tokens
9. /withdraw → Withdraw BTN to wallet

### Returning User Flow
1. Visit app → wallet auto-reconnects
2. Dashboard shows all balances
3. Check pending rewards → Settle if ready
4. Release vesting → Withdraw

---

## 2. Pages

### Login (/login)
- Email + password form → POST /auth/login-email
- "Connect Wallet" button → wagmi/RainbowKit
- Link to /register

### Register (/register)
- Email, password, confirm password, sponsor code (optional)
- POST /auth/register-email → redirect to /login

### Dashboard (/dashboard)
**Displays:**
- Wallet BTN balance
- Total staked amount
- Vesting pool locked amount
- Withdrawable balance
- Vault tier status
- Active stakes table (type, amount, dates, pending rewards, actions)

**Data sources:**
- btnToken.balanceOf(user)
- stakingVault.getUserTotalStaked(user)
- vestingPool.getVestedBalance(user)
- withdrawalWallet.getWithdrawableBalance(user)
- vaultManager.getUserTier(user)
- stakingVault.getStakes(user)
- rewardEngine.calculateReward(user, index) per stake

### Vault Activation (/vault)
**Displays:**
- 3 tier cards: T1 ($25), T2 ($50), T3 ($100)
- Payment method toggle: USDT / BTN
- BTN equivalent price from oracle
- Current tier badge

**Data sources:**
- vaultManager.getUserTier(user)
- vaultManager.getBTNAmountForUSD(feeUSD)
- btnToken.balanceOf(user) / usdtToken.balanceOf(user)

**Actions:**
- Approve token → vaultManager.activateVault(tier)

### Staking (/staking)
**Displays:**
- Stake form: amount input + Short/Long toggle
- Estimated daily reward: amount * 0.005 * multiplier
- Estimated weekly reward: daily * 7
- Active stakes table with countdown timers

**Data sources:**
- stakingVault.getStakes(user)
- stakingVault.getPendingRewards(user, index)
- vaultManager.getUserTier(user) for multiplier

**Actions:**
- Approve BTN → stakingVault.stake(amount, programType)
- stakingVault.unstake(stakeIndex)

### Rewards (/rewards)
**Displays:**
- Total pending rewards
- Last settlement date
- Per-stake reward breakdown

**Data sources:**
- rewardEngine.getTotalPending(user)
- rewardEngine.lastSettlementTime(user)
- rewardEngine.calculateReward(user, index) per stake

**Actions:**
- rewardEngine.settleWeekly(user)

### Vesting (/vesting)
**Displays:**
- Locked vesting balance
- Pending release amount
- Daily release rate (calculated: balance * 0.005)
- Live accumulation counter (updates every second)

**Data sources:**
- vestingPool.getVestedBalance(user)
- vestingPool.getPendingRelease(user)

**Actions:**
- vestingPool.release(user)

### Withdrawal (/withdraw)
**Displays:**
- Withdrawable balance
- Withdraw amount input with Max button

**Data sources:**
- withdrawalWallet.getWithdrawableBalance(user)

**Actions:**
- withdrawalWallet.withdraw(amount)

### Referrals (/referrals)
**Displays:**
- Referral link: https://app.bitton.ai/?ref={userAddress}
- Copy button
- Register referrer input (or auto-detect from ?ref= URL)
- My referrer address
- Downline count and list
- Matching qualification status
- Bonus history

**Data sources:**
- bonusEngine.getReferrer(user)
- bonusEngine.getDownline(user)
- bonusEngine.getDownlineCount(user)
- bonusEngine.isQualified(user, level)

**Actions:**
- bonusEngine.registerReferrer(referrerAddress)

### History (/history)
**Displays:**
- All transaction events in table: date, type, amount, tx hash

**Data sources:**
- GET /api/history/:address (backend aggregates events)

### Admin (/admin)
**Access:** Only addresses with DEFAULT_ADMIN_ROLE or OPERATOR_ROLE

**Displays:**
- Total BTN staked globally
- Reward pool balance
- Fund rewards form
- User lookup

**Data sources:**
- stakingVault.totalStaked()
- rewardEngine.rewardPoolBalance()

**Actions:**
- rewardEngine.fundRewards(amount)
- rewardEngine.settleWeekly(address) (batch)

---

## 3. API Endpoints (Backend)

### Authentication
| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | /auth/register-email | {email, password, sponsorCode?} | {success, message} |
| POST | /auth/verify-email | {token} | {success} |
| POST | /auth/login-email | {email, password} | {token, user} |
| POST | /auth/challenge | {address} | {message} |
| POST | /auth/verify | {address, signature, message} | {token, user} |

### Data (new endpoints)
| Method | Endpoint | Response |
|--------|----------|----------|
| GET | /api/dashboard/:address | {btnBalance, totalStaked, vestedBalance, withdrawable, vaultTier, vaultActive} |
| GET | /api/stakes/:address | {stakes: [{amount, startTime, programType, active, pendingReward}]} |
| GET | /api/bonuses/:address | {directBonuses: [], matchingBonuses: []} |
| GET | /api/referrals/:address | {referrer, downline: [], downlineCount} |
| GET | /api/history/:address | {events: [{type, amount, timestamp, txHash}]} |

---

## 4. Smart Contract Interactions

### Read Calls (view, no gas)
```
btnToken.balanceOf(address)
usdtToken.balanceOf(address)
vaultManager.isVaultActive(address)
vaultManager.getUserTier(address)
vaultManager.getBTNAmountForUSD(uint256)
stakingVault.getStakes(address)
stakingVault.getUserTotalStaked(address)
stakingVault.getPendingRewards(address, uint256)
rewardEngine.getTotalPending(address)
rewardEngine.lastSettlementTime(address)
rewardEngine.rewardPoolBalance()
vestingPool.getVestedBalance(address)
vestingPool.getPendingRelease(address)
withdrawalWallet.getWithdrawableBalance(address)
bonusEngine.getReferrer(address)
bonusEngine.getDownline(address)
bonusEngine.getDownlineCount(address)
bonusEngine.isQualified(address, uint8)
```

### Write Calls (require gas + wallet signature)
```
btnToken.approve(spender, amount)
usdtToken.approve(spender, amount)
vaultManager.activateVault(uint8 tier)
stakingVault.stake(uint256 amount, uint8 programType)
stakingVault.unstake(uint256 stakeIndex)
rewardEngine.settleWeekly(address user)
rewardEngine.fundRewards(uint256 amount)
vestingPool.release(address user)
withdrawalWallet.withdraw(uint256 amount)
bonusEngine.registerReferrer(address referrer)
```

---

## 5. Data Fields Required Per Page

### Dashboard
- btnBalance: uint256 (6 decimals)
- totalStaked: uint256
- vestedBalance: uint256
- withdrawableBalance: uint256
- vaultActive: bool
- vaultTier: uint8 (0-3)
- stakes[]: {amount, startTime, programType, lastRewardTime, active}
- pendingRewards[]: uint256 per stake

### Vault
- currentTier: uint8
- btnBalance: uint256
- usdtBalance: uint256
- btnPriceForTier: uint256 (from getBTNAmountForUSD)
- btnAllowance: uint256
- usdtAllowance: uint256

### Staking
- stakes[]: StakeInfo
- pendingRewards[]: uint256
- btnBalance: uint256
- btnAllowance: uint256
- vaultActive: bool
- vaultTier: uint8 (for multiplier display)

### Rewards
- totalPending: uint256
- lastSettlementTime: uint256
- perStakeRewards[]: uint256

### Vesting
- vestedBalance: uint256
- pendingRelease: uint256
- lastReleaseTime: uint256

### Withdrawal
- withdrawableBalance: uint256

### Referrals
- referrer: address
- downline[]: address
- downlineCount: uint256
- isQualified: bool
- vaultTier: uint8

---

## Key Constants

```
BTN_DECIMALS = 6
USDT_DECIMALS = 6
DAILY_REWARD_RATE = 0.5%
EARLY_EXIT_PENALTY = 15%
SETTLEMENT_SPLIT = 10% withdrawable / 90% vesting
VESTING_DAILY_RELEASE = 0.5%
MIN_STAKE_FOR_MATCHING = 500 BTN (500_000_000 raw)
DIRECT_BONUS = 5% of referred stake

Tier 1: $25, 1.0x multiplier, 3 matching levels
Tier 2: $50, 1.1x multiplier, 5 matching levels
Tier 3: $100, 1.2x multiplier, 10 matching levels

Short Staking: 30 days lock, tier multiplier
Long Staking: 180 days lock, 1.2x multiplier (all tiers)
```
