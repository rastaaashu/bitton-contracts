# BitTON.AI — Frontend Specification v1.0

**Date:** March 2, 2026
**Target Chain:** Base (Mainnet & Sepolia Testnet)
**Token:** BTN (ERC20, 6 decimals, deployed on Base)
**Purpose:** This document describes every screen, component, user flow, and data source the frontend team needs to build the BitTON.AI Web App (Phase 2).

---

## Table of Contents

1. [Tech Stack & Prerequisites](#1-tech-stack--prerequisites)
2. [Wallet Connection & Auth](#2-wallet-connection--auth)
3. [Global Layout & Navigation](#3-global-layout--navigation)
4. [Dashboard (Home)](#4-dashboard-home)
5. [Vault Activation Page](#5-vault-activation-page)
6. [Staking Page](#6-staking-page)
7. [Rewards & Settlement Page](#7-rewards--settlement-page)
8. [Vesting Page](#8-vesting-page)
9. [Withdrawal Wallet Page](#9-withdrawal-wallet-page)
10. [Referral / Bonus Page](#10-referral--bonus-page)
11. [Admin Dashboard](#11-admin-dashboard)
12. [Contract Addresses & ABIs](#12-contract-addresses--abis)
13. [Smart Contract Read Calls (View Functions)](#13-smart-contract-read-calls)
14. [Smart Contract Write Calls (Transactions)](#14-smart-contract-write-calls)
15. [Events to Index](#15-events-to-index)
16. [Token & Number Formatting Rules](#16-token--number-formatting-rules)
17. [Error Handling & Edge Cases](#17-error-handling--edge-cases)
18. [User Flows (Step-by-Step)](#18-user-flows)
19. [Responsive & UX Requirements](#19-responsive--ux-requirements)

---

## 1. Tech Stack & Prerequisites

| Layer | Recommendation | Notes |
|-------|---------------|-------|
| Framework | Next.js 14+ or React + Vite | SSR optional, SPA is fine |
| Wallet SDK | wagmi v2 + viem | Industry standard for Base/EVM |
| Wallet Modal | RainbowKit or ConnectKit | Supports MetaMask, Coinbase Wallet, WalletConnect |
| Chain | Base Mainnet (chain ID 8453) / Base Sepolia (84532) | Must support both for testing |
| Styling | Tailwind CSS or your design system | |
| State | React Query (TanStack) | For contract read caching & polling |
| Indexing | The Graph subgraph OR direct RPC event queries | For historical data (transactions, bonuses) |

**Required contract artifacts:**
- ABI JSON files for each contract (generated from `npx hardhat compile` → `artifacts/`)
- Deployed proxy addresses (provided in `deployment-addresses.json`)

---

## 2. Wallet Connection & Auth

### 2.1 Connect Wallet Button
- **Location:** Top-right of header (persistent across all pages)
- **States:**
  - Not connected → "Connect Wallet" button
  - Connected → Show truncated address (`0x1234...abcd`) + network badge (Base logo)
  - Wrong network → Show warning banner: "Please switch to Base network" with a "Switch Network" button
- **Supported wallets:** MetaMask, Coinbase Wallet, WalletConnect (minimum)

### 2.2 On Connect
- Read the user's BTN balance: `btnToken.balanceOf(userAddress)`
- Read vault status: `vaultManager.isVaultActive(userAddress)` and `vaultManager.getUserTier(userAddress)`
- Read all stake positions: `stakingVault.getStakes(userAddress)`
- Read withdrawable balance: `withdrawalWallet.getWithdrawableBalance(userAddress)`
- Read vested balance: `vestingPool.getVestedBalance(userAddress)`
- These values populate the Dashboard and sidebar

### 2.3 Session Handling
- No backend auth needed — wallet signature IS the auth
- Persist wallet connection across page refreshes (wagmi handles this)

---

## 3. Global Layout & Navigation

### 3.1 Header
| Element | Description |
|---------|-------------|
| Logo | BitTON.AI logo (left) |
| Nav Links | Dashboard, Staking, Rewards, Vesting, Withdraw, Referrals |
| Connect Wallet | Right side (see section 2) |
| Network Badge | "Base" or "Base Sepolia" indicator |

### 3.2 Sidebar (Optional)
Quick-glance summary panel:
- **BTN Wallet Balance:** `X BTN`
- **Vault Tier:** `T1 / T2 / T3 / Not Activated`
- **Total Staked:** `X BTN`
- **Withdrawable:** `X BTN`
- **Vesting Locked:** `X BTN`

### 3.3 Footer
- Links: Docs, Discord/Telegram, Twitter/X, Smart Contract (Basescan link)
- Copyright notice

---

## 4. Dashboard (Home)

The main overview page after wallet connect.

### 4.1 Balance Overview Cards

Display **4 cards** representing the user's balance zones:

| Card | Label | Data Source | Description |
|------|-------|-------------|-------------|
| 1 | **Wallet Balance** | `btnToken.balanceOf(user)` | BTN in user's wallet (not staked) |
| 2 | **Staked Principal** | `stakingVault.getUserTotalStaked(user)` | Total BTN locked in staking |
| 3 | **Vesting Pool** | `vestingPool.getVestedBalance(user)` | Locked rewards (90% of settlements) |
| 4 | **Withdrawable** | `withdrawalWallet.getWithdrawableBalance(user)` | Ready to withdraw |

### 4.2 Vault Status Banner

| Condition | Display |
|-----------|---------|
| No vault activated | Yellow banner: "Activate your vault to start earning rewards" + CTA button → Vault Activation page |
| Vault active | Green badge: "Tier X Active" (T1/T2/T3) + option to upgrade |

### 4.3 Active Stakes Summary Table

| Column | Data |
|--------|------|
| # | Stake index |
| Type | "Short (30d)" or "Long (180d)" |
| Amount | Staked BTN amount |
| Start Date | Formatted from `stakeInfo.startTime` |
| Lock Ends | startTime + 30d or 180d |
| Status | "Locked" / "Unlocked" / "Early Exit Available" |
| Pending Rewards | `rewardEngine.calculateReward(user, index)` |
| Actions | "Unstake" button (if applicable) |

### 4.4 Recent Activity Feed
- Show last 10 events for the user (from indexed events):
  - Staked, Unstaked, RewardSplit, VestedReleased, Withdrawn, DirectBonus, MatchingBonus
- Each row: Date | Event Type | Amount | Tx Hash (link to Basescan)

---

## 5. Vault Activation Page

### 5.1 Tier Selection Cards

Display 3 tier cards side by side:

| | Tier 1 (Basic) | Tier 2 (Intermediate) | Tier 3 (Full) |
|---|---|---|---|
| **Price** | $25 USD | $50 USD | $100 USD |
| **Staking Multiplier** | 1.0x | 1.1x | 1.2x |
| **Matching Bonus Levels** | 3 levels | 5 levels | 10 levels |
| **Button** | "Activate T1" | "Activate T2" | "Activate T3" |

**If user already has a tier:** Gray out lower tiers, show "Current" badge on active tier, only allow upgrading to higher tier.

### 5.2 Payment Method Toggle

Two payment options (tabs or radio buttons):

| Option | Details |
|--------|---------|
| **Pay with USDT** | Shows exact USDT amount (e.g., "25.000000 USDT"). User must have USDT on Base. |
| **Pay with BTN** | Shows BTN equivalent calculated from oracle. Display: "~X.XXXXXX BTN (at current price $Y.YY)" |

**BTN price display:** Call `vaultManager.getBTNAmountForUSD(feeUSD)` to show the BTN equivalent before the user confirms.

### 5.3 Activation Flow (UX Steps)

1. User selects tier
2. User selects payment token (USDT or BTN)
3. App shows amount to pay
4. **Step A — Approve:** If first time, prompt token approval tx (`token.approve(vaultManagerAddress, amount)`)
5. **Step B — Activate:** Call `vaultManager.activateVault(tier)`
6. Show loading spinner during tx
7. On success: Show confetti/success modal, update vault status everywhere
8. On failure: Show error message (see Section 17)

### 5.4 Important UI Notes
- If oracle is stale or price is 0, the contract will revert. Show a user-friendly message: "Price feed temporarily unavailable. Please try again shortly."
- Tier downgrades are blocked by the contract. If a T2 user clicks T1, the contract will revert. Disable lower tier buttons in the UI.

---

## 6. Staking Page

### 6.1 Stake Form

| Field | Type | Validation |
|-------|------|------------|
| Amount | Number input | Min: 1 BTN. Max: user's wallet BTN balance. Must be > 0. |
| Program | Radio/Toggle | "Short Staking (30 days)" or "Long Staking (180 days)" |
| Estimated Daily Reward | Read-only display | Calculate: `amount × 0.005 × multiplier` and show it |
| Estimated Weekly Reward | Read-only display | Daily × 7 |

**Multiplier logic for display:**
- Short Staking: Use user's tier multiplier (T1=1.0x, T2=1.1x, T3=1.2x)
- Long Staking: Always 1.2x

**Stake button states:**
- Vault not activated → Disabled, tooltip: "Activate your vault first"
- Insufficient balance → Disabled, tooltip: "Insufficient BTN balance"
- Ready → "Stake BTN"

### 6.2 Staking Flow

1. User enters amount and selects program type
2. **Step A — Approve:** `btnToken.approve(stakingVaultAddress, amount)` (if needed)
3. **Step B — Stake:** `stakingVault.stake(amount, programType)` (0=Short, 1=Long)
4. On success: Refresh stakes table, show success toast
5. On failure: Show error (see Section 17)

### 6.3 Active Stakes Table

| Column | Source |
|--------|--------|
| Index | Array index |
| Program | `stakeInfo.programType` → "Short" or "Long" |
| Amount | `stakeInfo.amount` (format as BTN) |
| Start Date | `stakeInfo.startTime` → human-readable date |
| Lock End | startTime + (30 days or 180 days) |
| Time Remaining | Countdown timer or "Unlocked" |
| Pending Reward | `rewardEngine.calculateReward(user, index)` |
| Status | Active / Completed |
| Actions | See below |

**Actions column:**
- **Short Staking + Lock expired:** "Unstake" button (no penalty)
- **Short Staking + Still locked:** "Early Exit" button with warning: "15% penalty will apply. You will receive X BTN (after Y BTN penalty)."
- **Long Staking + Lock expired:** "Unstake" button
- **Long Staking + Still locked:** Button disabled, tooltip: "Cannot exit Long Staking before 180 days"

### 6.4 Unstake Confirmation Modal

| Field | Value |
|-------|-------|
| Stake Amount | X BTN |
| Penalty (if early) | Y BTN (15%) |
| You Receive | X - Y BTN |
| Penalty goes to | Treasury |
| [Confirm Unstake] | Calls `stakingVault.unstake(stakeIndex)` |

---

## 7. Rewards & Settlement Page

### 7.1 Reward Summary Cards

| Card | Data Source | Description |
|------|------------|-------------|
| Pending Rewards | `rewardEngine.getTotalPending(user)` | Total unsettled rewards across all stakes |
| Last Settlement | `rewardEngine.lastSettlementTime(user)` | Timestamp of last weekly settlement |
| Total Settled (lifetime) | Sum from indexed `RewardSplit` events | Historical total |

### 7.2 Per-Stake Reward Breakdown Table

| Column | Source |
|--------|--------|
| Stake # | Index |
| Program | Short/Long |
| Principal | Stake amount |
| Accrued Reward | `rewardEngine.calculateReward(user, index)` |
| Days Since Last Settlement | Calculate from lastRewardTime |

### 7.3 Settle Rewards Button

- **Label:** "Settle Weekly Rewards"
- **Action:** Calls `rewardEngine.settleWeekly(userAddress)`
- **Post-settlement display:** Show split breakdown:
  - "10% → Withdrawal Wallet: X BTN"
  - "90% → Vesting Pool: Y BTN"
- **Note:** Settlement is on-demand. Users can wait and accumulate, or settle anytime.

### 7.4 Settlement History Table (from events)

| Column | Source (from `RewardSplit` events) |
|--------|------|
| Date | Block timestamp |
| Total Reward | withdrawable + vested |
| To Withdrawal Wallet (10%) | `withdrawable` field |
| To Vesting Pool (90%) | `vested` field |
| Tx Hash | Link to Basescan |

---

## 8. Vesting Page

### 8.1 Vesting Summary

| Field | Data Source |
|-------|------------|
| Locked Vesting Balance | `vestingPool.getVestedBalance(user)` |
| Pending Release | `vestingPool.getPendingRelease(user)` |
| Daily Release Rate | 0.5% of locked balance (calculated client-side) |
| Last Release Date | `vestingPool.lastReleaseTime(user)` |

### 8.2 Release Button

- **Label:** "Release Vested Tokens"
- **Action:** Calls `vestingPool.release(userAddress)`
- **Result:** Released amount moves to WithdrawalWallet
- **After tx:** Show "X BTN released to your Withdrawal Wallet"
- **Disabled state:** If pending release is 0

### 8.3 Live Release Counter (Nice-to-have)

A real-time counter showing tokens accumulating since last release. Update every second:
```
Tokens vesting right now: 0.XXXXXX BTN
(accumulating at ~Y BTN per second)
```

Formula (client-side):
```
releasePerSecond = (vestedBalance * 0.005) / 86400
accumulatedSinceLastRelease = releasePerSecond * (now - lastReleaseTime)
```

### 8.4 Vesting History Table (from events)

| Column | Source (from `VestingAdded` and `VestedReleased` events) |
|--------|------|
| Date | Block timestamp |
| Type | "Added" or "Released" |
| Amount | BTN amount |
| Tx Hash | Basescan link |

---

## 9. Withdrawal Wallet Page

### 9.1 Withdrawal Summary

| Field | Data Source |
|-------|------------|
| Available to Withdraw | `withdrawalWallet.getWithdrawableBalance(user)` |
| Weekly Remaining Allowance | `withdrawalWallet.getRemainingWeeklyAllowance(user)` |

**Note:** If weekly allowance returns `max(uint256)`, display "Unlimited" (means no cap is set).

### 9.2 Withdraw Form

| Field | Details |
|-------|---------|
| Amount | Number input. Max = min(withdrawableBalance, remainingWeeklyAllowance) |
| Max Button | Auto-fills maximum withdrawable |
| Withdraw Button | Calls `withdrawalWallet.withdraw(amount)` |

### 9.3 Withdraw Flow

1. User enters amount
2. Call `withdrawalWallet.withdraw(amount)`
3. On success: BTN appears in user's wallet. Show success toast: "X BTN withdrawn to your wallet."
4. Refresh balances (wallet balance + withdrawable balance)

### 9.4 Withdrawal History Table (from events)

| Column | Source (from `Withdrawn` and `WithdrawableAdded` events) |
|--------|------|
| Date | Block timestamp |
| Type | "Deposit" (from rewards/vesting) or "Withdrawal" |
| Amount | BTN amount |
| Source | "Weekly Settlement 10%" / "Vesting Release" / "User Withdrawal" |
| Tx Hash | Basescan link |

---

## 10. Referral / Bonus Page

### 10.1 Referral Link

- Generate a shareable referral link: `https://app.bitton.ai/?ref=0xUSER_ADDRESS`
- **Copy button** to clipboard
- Display: "Share this link. When someone signs up and stakes, you earn 5% of their stake as a direct bonus."

### 10.2 Register Referrer (for new users)

- If user arrived via `?ref=0xREFERRER`, prompt them to register their referrer:
  - "You were referred by 0xABC...XYZ. Register this referral?"
  - Button: "Register Referrer" → Calls `bonusEngine.registerReferrer(referrerAddress)`
  - One-time only. If already registered, show "Your referrer: 0xABC...XYZ"

### 10.3 My Referral Stats

| Field | Data Source |
|-------|------------|
| My Referrer | `bonusEngine.getReferrer(user)` → address or "None" |
| My Downline Count | `bonusEngine.getDownlineCount(user)` |
| My Vault Tier | `vaultManager.getUserTier(user)` |
| My Matching Depth | T1→3, T2→5, T3→10 (client-side logic from tier) |
| Qualified for Matching? | `bonusEngine.isQualified(user, 1)` (check level 1 as proxy) |

**Qualification requirements displayed:**
- Active vault (any tier)
- Minimum 500 BTN total personal stake

### 10.4 Downline Table

| Column | Source |
|--------|--------|
| Address | `bonusEngine.getDownline(user)` array |
| Tier | `vaultManager.getUserTier(downlineAddress)` for each |
| Total Staked | `stakingVault.getUserTotalStaked(downlineAddress)` |
| Status | Active vault? / Qualified? |

**Note:** For large downlines, paginate or lazy-load. The contract returns the full array; paginate on the frontend.

### 10.5 Bonus History Table (from events)

| Column | Source |
|--------|--------|
| Date | Block timestamp |
| Type | "Direct Bonus" or "Matching Bonus (Level X)" |
| From User | Address of the downline |
| Amount | BTN amount |
| Tx Hash | Basescan link |

Events to query: `DirectBonusProcessed`, `MatchingBonusProcessed`

---

## 11. Admin Dashboard

**Access:** Only for addresses with `DEFAULT_ADMIN_ROLE` or `OPERATOR_ROLE`. Check on connect:
```
hasRole(DEFAULT_ADMIN_ROLE, userAddress)
hasRole(OPERATOR_ROLE, userAddress)
```

If neither role, hide the Admin nav link entirely.

### 11.1 System Overview Panel

| Metric | Source |
|--------|--------|
| Total BTN Staked (global) | `stakingVault.totalStaked()` |
| Reward Pool Balance | `rewardEngine.rewardPoolBalance()` |
| Total Users with Active Vaults | Index `VaultActivated` events (count unique addresses) |
| Treasury Address | `vaultManager.treasuryAddress()` |

### 11.2 Fund Rewards

- **Input:** BTN amount to fund
- **Action:** `rewardEngine.fundRewards(amount)` (requires prior `btnToken.approve`)
- **Display:** Current reward pool balance before and after

### 11.3 Batch Settlement (Operator)

- **Input:** List of user addresses (paste or upload CSV)
- **Action:** Loop `rewardEngine.settleWeekly(address)` for each user
- **Note:** This could be a simple text area or a "Settle All" button that iterates through active stakers
- **Future:** Integrate with keeper bot (Chainlink Automation / Gelato)

### 11.4 Contract Configuration (Admin Only)

| Setting | Contract | Function |
|---------|----------|----------|
| Oracle Address | VaultManager | `setOracleAddress(address)` |
| Treasury Address | VaultManager | `setTreasuryAddress(address)` |
| Weekly Withdrawal Cap | WithdrawalWallet | `setWeeklyWithdrawalCap(uint256)` |
| Pause/Unpause | All contracts | `pause()` / `unpause()` |

### 11.5 User Lookup (Admin)

- Input: User address
- Display all data for that user:
  - Vault tier, active status
  - All stake positions
  - Pending rewards
  - Vesting balance + pending release
  - Withdrawable balance
  - Referrer + downline
  - Recent activity

---

## 12. Contract Addresses & ABIs

### 12.1 Deployed Contract Addresses

Will be provided in `deployment-addresses.json` after each deployment:

```json
{
  "network": "base-sepolia",
  "chainId": 84532,
  "contracts": {
    "BTNToken": "0x5b964baafEDf002e5364F37848DCa1908D3e4e9f",
    "VaultManager": "0x...",
    "StakingVault": "0x...",
    "RewardEngine": "0x...",
    "VestingPool": "0x...",
    "WithdrawalWallet": "0x...",
    "BonusEngine": "0x..."
  }
}
```

**Important:** These are **proxy addresses** (UUPS pattern). Always interact with the proxy address, never the implementation address.

### 12.2 ABI Files

ABIs are generated by Hardhat compilation. Located at:
```
artifacts/contracts/VaultManager.sol/VaultManager.json
artifacts/contracts/StakingVault.sol/StakingVault.json
artifacts/contracts/RewardEngine.sol/RewardEngine.json
artifacts/contracts/VestingPool.sol/VestingPool.json
artifacts/contracts/WithdrawalWallet.sol/WithdrawalWallet.json
artifacts/contracts/BonusEngine.sol/BonusEngine.json
```

Extract the `"abi"` field from each JSON for frontend use.

### 12.3 External Token Addresses (Base)

| Token | Address | Decimals |
|-------|---------|----------|
| BTN | `0x5b964baafEDf002e5364F37848DCa1908D3e4e9f` | 6 |
| USDT (Base) | TBD — will be provided | 6 |

---

## 13. Smart Contract Read Calls (View Functions)

Complete list of read calls the frontend needs, organized by page:

### Dashboard
```
btnToken.balanceOf(user)                              → uint256 (wallet balance)
vaultManager.isVaultActive(user)                      → bool
vaultManager.getUserTier(user)                        → uint8 (0=none, 1/2/3)
stakingVault.getStakes(user)                          → StakeInfo[] (all positions)
stakingVault.getUserTotalStaked(user)                  → uint256
withdrawalWallet.getWithdrawableBalance(user)          → uint256
vestingPool.getVestedBalance(user)                     → uint256
```

### Vault Activation
```
vaultManager.getUserTier(user)                        → uint8
vaultManager.isVaultActive(user)                      → bool
vaultManager.getBTNAmountForUSD(feeUSD)               → uint256 (BTN equivalent)
btnToken.balanceOf(user)                              → uint256 (for BTN payment)
usdtToken.balanceOf(user)                             → uint256 (for USDT payment)
btnToken.allowance(user, vaultManagerAddress)          → uint256
usdtToken.allowance(user, vaultManagerAddress)         → uint256
```

### Staking
```
stakingVault.getStakes(user)                          → StakeInfo[]
stakingVault.getStake(user, index)                    → StakeInfo
stakingVault.getPendingRewards(user, index)            → uint256
stakingVault.getStakeCount(user)                      → uint256
btnToken.balanceOf(user)                              → uint256
btnToken.allowance(user, stakingVaultAddress)          → uint256
vaultManager.isVaultActive(user)                      → bool (gate check)
vaultManager.getUserTier(user)                        → uint8 (for multiplier display)
```

### Rewards
```
rewardEngine.calculateReward(user, stakeIndex)         → uint256 (per stake)
rewardEngine.getTotalPending(user)                     → uint256 (all stakes)
rewardEngine.lastSettlementTime(user)                  → uint256 (timestamp)
rewardEngine.rewardPoolBalance()                       → uint256 (admin view)
```

### Vesting
```
vestingPool.getVestedBalance(user)                     → uint256
vestingPool.getPendingRelease(user)                    → uint256
vestingPool.lastReleaseTime(user)                      → uint256
```

### Withdrawal
```
withdrawalWallet.getWithdrawableBalance(user)          → uint256
withdrawalWallet.getRemainingWeeklyAllowance(user)     → uint256
```

### Referrals
```
bonusEngine.getReferrer(user)                          → address
bonusEngine.getDownline(user)                          → address[]
bonusEngine.getDownlineCount(user)                     → uint256
bonusEngine.isQualified(user, level)                   → bool
```

---

## 14. Smart Contract Write Calls (Transactions)

Every transaction the frontend needs to send:

### Token Approvals (prerequisite for many actions)
```
btnToken.approve(vaultManagerAddress, amount)          → Approve BTN for vault activation
usdtToken.approve(vaultManagerAddress, amount)         → Approve USDT for vault activation
btnToken.approve(stakingVaultAddress, amount)          → Approve BTN for staking
btnToken.approve(rewardEngineAddress, amount)          → Approve BTN for funding rewards (admin)
```

### Vault Activation
```
vaultManager.activateVault(tier)                       → tier: 1, 2, or 3
```

### Staking
```
stakingVault.stake(amount, programType)                → programType: 0=Short, 1=Long
stakingVault.unstake(stakeIndex)                       → Unstake a position
```

### Rewards
```
rewardEngine.settleWeekly(userAddress)                 → Settle rewards (user or operator)
rewardEngine.fundRewards(amount)                       → Fund reward pool (admin)
```

### Vesting
```
vestingPool.release(userAddress)                       → Release vested tokens
```

### Withdrawal
```
withdrawalWallet.withdraw(amount)                      → Withdraw BTN to wallet
```

### Referrals
```
bonusEngine.registerReferrer(referrerAddress)           → One-time referral registration
```

### Admin Only
```
vaultManager.setOracleAddress(address)                 → Update oracle
vaultManager.setTreasuryAddress(address)               → Update treasury
withdrawalWallet.setWeeklyWithdrawalCap(amount)        → Set/update withdrawal cap
[anyContract].pause()                                  → Emergency pause
[anyContract].unpause()                                → Resume operations
```

---

## 15. Events to Index

These events should be indexed (via The Graph subgraph or direct RPC logs) for historical data display:

| Event | Contract | Used For |
|-------|----------|----------|
| `VaultActivated(user, tier, feeUSD, feePaid, token)` | VaultManager | Vault activation history |
| `Staked(user, amount, programType, stakeIndex)` | StakingVault | Stake history |
| `Unstaked(user, amount, reward, penalty)` | StakingVault | Unstake history |
| `RewardAccrued(user, amount)` | RewardEngine | Reward tracking |
| `RewardSplit(user, withdrawable, vested)` | RewardEngine | Settlement history |
| `RewardsFunded(funder, amount)` | RewardEngine | Admin: fund tracking |
| `VestingAdded(user, amount)` | VestingPool | Vesting deposits |
| `VestedReleased(user, amount)` | VestingPool | Vesting releases |
| `WithdrawableAdded(user, amount)` | WithdrawalWallet | Withdrawal wallet credits |
| `Withdrawn(user, amount)` | WithdrawalWallet | Withdrawal history |
| `ReferrerRegistered(user, referrer)` | BonusEngine | Referral registrations |
| `DirectBonusProcessed(staker, referrer, stakeAmount, bonusAmount)` | BonusEngine | Direct bonus history |
| `MatchingBonusProcessed(ancestor, user, amount, level)` | BonusEngine | Matching bonus history |

---

## 16. Token & Number Formatting Rules

### 16.1 BTN Token
- **Decimals:** 6
- **Display:** Always show up to 6 decimal places for precision, or 2 for casual display
- **Conversion:** Raw value from contract ÷ 1,000,000 = human-readable BTN
- **Examples:**
  - `1000000` (raw) → `1.000000 BTN` or `1.00 BTN`
  - `500000000` (raw) → `500.000000 BTN` or `500.00 BTN`
  - `21000000000000` (raw) → `21,000,000.00 BTN` (max supply)

### 16.2 USDT
- **Decimals:** 6
- **Display:** Same as BTN

### 16.3 USD Display
- Always show 2 decimal places: `$25.00`, `$50.00`, `$100.00`

### 16.4 Timestamps
- Convert `block.timestamp` (Unix seconds) to human-readable local time
- Format: `MMM DD, YYYY HH:mm` (e.g., "Mar 02, 2026 14:30")
- For countdowns: Show "X days, Y hours remaining"

### 16.5 Addresses
- Truncate: `0x1234...abcd` (first 6 + last 4 chars)
- Full address on hover/click
- Link to Basescan: `https://sepolia.basescan.org/address/0x...` (testnet) or `https://basescan.org/address/0x...` (mainnet)

### 16.6 Transaction Hashes
- Truncate similarly
- Link to Basescan: `https://basescan.org/tx/0x...`

---

## 17. Error Handling & Edge Cases

### 17.1 Contract Revert Messages

| Revert / Error | User-Friendly Message |
|---|---|
| `InvalidTier(tier)` | "Invalid tier selected." |
| `CannotDowngrade(current, requested)` | "You cannot downgrade your vault tier. You are currently Tier X." |
| `TreasuryNotSet()` | "System configuration error. Please contact support." |
| `OracleNotSet()` | "Price feed not configured. Please contact support." |
| `OracleStale(...)` | "Price feed is temporarily unavailable. Please try again in a few minutes." |
| `OraclePriceInvalid(...)` | "Price data error. Please try again shortly." |
| `InsufficientAllowance()` | "Please approve the token transfer first." |
| `"Vault not active"` | "You need to activate your vault before staking." |
| `"Insufficient balance"` | "You don't have enough BTN for this action." |
| `"Lock period not met"` | "Your Long Staking position is still locked. Cannot exit before 180 days." |
| `"Stake not active"` | "This stake position has already been unstaked." |
| `"Insufficient reward pool"` | "Reward pool needs to be refunded. Please try again later." |
| `"Nothing to release"` | "No vested tokens available for release yet." |
| `"Exceeds withdrawable"` | "Amount exceeds your available balance." |
| `"Weekly cap exceeded"` | "You've reached this week's withdrawal limit. Try again next week." |
| `"Already registered"` | "You already have a referrer registered." |
| `"Cannot refer self"` | "You cannot use your own referral link." |
| User rejected tx in wallet | "Transaction cancelled." |
| Network error | "Network error. Please check your connection and try again." |

### 17.2 Edge Cases

| Scenario | Handling |
|----------|----------|
| User has no vault activated | Disable staking, show activation CTA |
| Reward pool is empty | Settlement will fail. Show warning: "Rewards temporarily unavailable" |
| User has 0 stakes | Show empty state: "You have no active stakes. Start staking to earn rewards." |
| Vesting balance is 0 | Disable release button |
| Withdrawable is 0 | Disable withdraw button, show "Nothing to withdraw yet" |
| Weekly withdrawal cap reached | Show remaining allowance and when it resets (7 days from currentWeekStart) |
| Large downline array | Paginate, show first 50 with "Load more" |
| Oracle down | Vault activation will fail; show friendly error |
| Contract paused | All write calls will fail. Show banner: "System is temporarily paused for maintenance." |

---

## 18. User Flows (Step-by-Step)

### Flow 1: New User Onboarding

```
1. User visits app
2. Clicks "Connect Wallet" → MetaMask/Coinbase Wallet prompt
3. Dashboard loads with all balances at 0
4. Yellow banner: "Activate your vault to start earning"
5. User clicks "Activate Vault" → Vault Activation page
6. Selects Tier 1 ($25) → Pays with USDT or BTN
7. Approve tx → Activate tx → Success!
8. Dashboard now shows "Tier 1 Active"
9. User navigates to Staking page
10. Enters amount, selects Short Staking
11. Approve BTN → Stake tx → Success!
12. Stake appears in Active Stakes table
13. After some time, user can settle rewards or wait
```

### Flow 2: Claiming Rewards

```
1. User has active stake(s) with accrued rewards
2. Navigates to Rewards page
3. Sees pending rewards for each stake
4. Clicks "Settle Weekly Rewards"
5. Tx executes → RewardSplit event emitted
6. 10% added to Withdrawal Wallet
7. 90% added to Vesting Pool
8. Balances update across all pages
```

### Flow 3: Releasing Vested Tokens

```
1. User has vesting balance from previous settlements
2. Navigates to Vesting page
3. Sees locked balance and pending release amount
4. Clicks "Release Vested Tokens"
5. Released BTN moves to Withdrawal Wallet
6. User navigates to Withdrawal page
7. Enters amount, clicks "Withdraw"
8. BTN arrives in user's wallet
```

### Flow 4: Referral Bonus

```
1. User A copies their referral link from Referrals page
2. Shares with User B
3. User B visits app with ?ref=0xUserA
4. User B connects wallet, sees "Register referrer" prompt
5. User B registers referrer → one-time tx
6. User B activates vault and stakes
7. On stake, User A receives 5% direct bonus (added to pending rewards)
8. On weekly settlement of User B, User A receives matching bonus (if qualified)
```

### Flow 5: Early Exit (Short Staking)

```
1. User has a Short Staking position still within 30-day lock
2. Clicks "Early Exit" on the stake
3. Confirmation modal shows:
   - Original stake: 1,000 BTN
   - Penalty (15%): 150 BTN
   - You receive: 850 BTN
4. User confirms → unstake tx
5. 850 BTN returned to wallet, 150 BTN sent to treasury
```

### Flow 6: Upgrade Vault Tier

```
1. User is currently Tier 1
2. Navigates to Vault Activation page
3. T1 shows "Current", T2 and T3 are available
4. Selects T2 ($50)
5. Pays fee → Vault upgraded
6. Staking multiplier now 1.1x for Short Staking
7. Matching bonus depth now 5 levels
```

---

## 19. Responsive & UX Requirements

### 19.1 Responsive Breakpoints
- **Desktop:** 1280px+ (full layout with sidebar)
- **Tablet:** 768px–1279px (collapsed sidebar, stacked cards)
- **Mobile:** <768px (single column, bottom nav)

### 19.2 Loading States
- Show skeleton loaders while fetching contract data
- Show spinner during transaction confirmation
- Show pending state while waiting for tx to mine

### 19.3 Transaction Feedback
Every write transaction should show a 3-step progress:
1. "Waiting for wallet confirmation..." (user approves in wallet)
2. "Transaction submitted. Waiting for confirmation..." (show tx hash link)
3. "Transaction confirmed!" (green toast/banner, refresh data)

### 19.4 Polling & Refresh
- Poll balances every 15–30 seconds (or use wagmi's `watch` mode)
- Refresh data immediately after any successful transaction
- Show "Last updated: X seconds ago" indicator

### 19.5 Dark Mode (Optional)
- Support dark/light theme toggle if design requires it

---

## Appendix A: StakeInfo Struct (for TypeScript typing)

```typescript
interface StakeInfo {
  amount: bigint;        // BTN amount (6 decimals)
  startTime: bigint;     // Unix timestamp (seconds)
  programType: number;   // 0 = Short, 1 = Long
  lastRewardTime: bigint; // Unix timestamp
  active: boolean;
}
```

## Appendix B: Tier Constants (for client-side logic)

```typescript
const TIERS = {
  0: { name: "None", fee: 0, multiplier: 0, matchingLevels: 0 },
  1: { name: "Tier 1 (Basic)", fee: 25, multiplier: 1.0, matchingLevels: 3 },
  2: { name: "Tier 2 (Intermediate)", fee: 50, multiplier: 1.1, matchingLevels: 5 },
  3: { name: "Tier 3 (Full)", fee: 100, multiplier: 1.2, matchingLevels: 10 },
};

const MATCHING_BONUS_PCT: Record<number, number> = {
  1: 10,  // Level 1: 10%
  2: 5,   // Level 2: 5%
  3: 3,   // Level 3: 3%
  4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1,  // Levels 4-10: 1% each
};

const PROGRAMS = {
  SHORT: { type: 0, lockDays: 30, label: "Short Staking (30 days)" },
  LONG:  { type: 1, lockDays: 180, label: "Long Staking (180 days)" },
};

const BTN_DECIMALS = 6;
const DAILY_REWARD_RATE = 0.005; // 0.5%
const EARLY_EXIT_PENALTY = 0.15; // 15%
const SETTLEMENT_SPLIT = { withdrawable: 0.10, vesting: 0.90 };
const VESTING_DAILY_RELEASE = 0.005; // 0.5%
const MIN_STAKE_FOR_MATCHING = 500_000_000; // 500 BTN in raw units
```

## Appendix C: Basescan URLs

```typescript
const EXPLORER = {
  mainnet: "https://basescan.org",
  sepolia: "https://sepolia.basescan.org",
};

function txUrl(hash: string, network: "mainnet" | "sepolia") {
  return `${EXPLORER[network]}/tx/${hash}`;
}

function addressUrl(addr: string, network: "mainnet" | "sepolia") {
  return `${EXPLORER[network]}/address/${addr}`;
}
```

---

**End of Frontend Specification v1.0**

*Generated from smart contract source code and SPEC-BitTON-AI-COMPLETE.md*
