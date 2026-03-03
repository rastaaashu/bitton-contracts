# BitTON.AI — Smart Contracts Overview

## Contracts

### BTNToken (Legacy, non-upgradeable)
- ERC-20 with 21M max supply, 6 decimals
- Minter management, burning, EIP-2612 permit
- Deployed and immutable

### CustodialDistribution (Non-upgradeable)
- Holds BTN treasury
- `distribute(to, amount)` — send BTN to user
- `batchMigrate(recipients[], amounts[])` — bulk migration
- `fundContract(target, amount)` — fund other contracts (e.g., RewardEngine)
- `finalize()` — permanently renounce all admin roles
- AccessControl: OPERATOR_ROLE, EMERGENCY_ROLE, DEFAULT_ADMIN_ROLE

### VaultManager (UUPS Proxy)
- Users activate a vault tier (T1/T2/T3) by paying USDT or BTN
- `activateVault(tier)` — pays fee, activates vault
- `isVaultActive(user)` / `getUserTier(user)`
- Uses Chainlink oracle for BTN/USD price (1h staleness check)
- Fees: T1=$50, T2=$250, T3=$1000

### StakingVault (UUPS Proxy)
- `stake(amount, programType)` — 0=Short (30d), 1=Long (180d)
- `unstake(stakeIndex)` — early exit with 15% penalty (Short only)
- Requires active vault
- Daily reward rate: 0.5% × tier multiplier (or 1.2x for Long)

### RewardEngine (UUPS Proxy)
- `settleWeekly(user)` — calculates accrued rewards
- Split: 10% → WithdrawalWallet, 90% → VestingPool
- `fundRewards(amount)` — owner funds reward pool
- Calls BonusEngine for matching bonuses

### VestingPool (UUPS Proxy)
- `addVesting(user, amount)` — called by RewardEngine
- `release(user)` — releases 0.5% per day of locked balance
- Released amounts go to WithdrawalWallet

### WithdrawalWallet (UUPS Proxy)
- `addWithdrawable(user, amount)` — called by RewardEngine/VestingPool
- `withdraw(amount)` — user withdraws BTN
- Weekly withdrawal cap enforced, resets every 7 days

### BonusEngine (UUPS Proxy)
- `registerReferrer(referrer)` — one-time per user
- `processDirectBonus(referrer, stakeAmount)` — 5% of stake
- `processMatchingBonus(user, rewardAmount)` — level-based %
- Qualification: active vault + 500 BTN min personal stake
- Matching depth: T1=3 levels, T2=5 levels, T3=10 levels

## Access Control Roles

| Role | Holders | Purpose |
|------|---------|---------|
| DEFAULT_ADMIN_ROLE | Deployer (→ multisig) | Upgrade, role management |
| OPERATOR_ROLE | Backend relayer, other contracts | Settlement, distribution |
| EMERGENCY_ROLE | Admin | Pause/unpause |

## Cross-Contract Wiring

```
StakingVault ──▶ RewardEngine ──▶ VestingPool
                       │              │
                       ▼              ▼
                  BonusEngine    WithdrawalWallet
                       │
                       ▼
                  WithdrawalWallet
```

7 OPERATOR_ROLE grants are required:
1. RewardEngine on StakingVault
2. RewardEngine on VestingPool
3. RewardEngine on WithdrawalWallet
4. VestingPool on WithdrawalWallet
5. BonusEngine on WithdrawalWallet
6. BonusEngine on RewardEngine
7. Backend relayer on RewardEngine

## Test Coverage

- 618 tests total (562 functional + 56 security)
- All new contracts: 95%+ line coverage
- Security tests cover: reentrancy, access control bypass, economic exploits, gas griefing, edge cases

## Deployed Addresses

See `DEPLOYMENT_SUMMARY_TESTNET.md` for Base Sepolia addresses.
