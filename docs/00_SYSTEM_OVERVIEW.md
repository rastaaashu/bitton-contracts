# BitTON.AI — System Overview

## What is BitTON.AI?

BitTON.AI is a staking and rewards platform on Base L2. Users stake BTN tokens (ERC-20, 6 decimals, 21M max supply) and earn rewards through two staking programs, referral bonuses, and a tiered vault system.

## Core Components

### Smart Contracts (Base L2)

| Contract | Purpose | Proxy |
|----------|---------|-------|
| BTNToken | ERC-20 token (21M supply, 6 decimals) | No |
| CustodialDistribution | Treasury — holds and distributes BTN | No |
| VaultManager | Tier activation (T1/T2/T3) — USDT or BTN payment | UUPS |
| StakingVault | Stake BTN (Short: 30d, Long: 180d) | UUPS |
| RewardEngine | Weekly settlement — 10% withdraw / 90% vest | UUPS |
| VestingPool | Locked rewards — 0.5%/day release | UUPS |
| WithdrawalWallet | User-withdrawable BTN balance | UUPS |
| BonusEngine | Direct (5%) + matching (level-based) referral bonuses | UUPS |

### Backend (Node.js + TypeScript)

- **Auth**: Email registration with sponsor confirmation OR wallet-based SIWE
- **Migration**: TON → Base user balance migration pipeline
- **Operator**: Background job runner for on-chain transactions
- **Admin**: Snapshot import, job dispatch, system monitoring

### User Entry Points

1. **Email + Sponsor** — Register with email, verify, get sponsor confirmation, then connect wallet
2. **Wallet-only** — Connect EVM wallet, account created immediately as CONFIRMED

## Architecture Diagram

```
┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Backend    │
│  (React/Next)│     │  (Express)   │
└──────────────┘     └──────┬───────┘
                            │
                    ┌───────▼───────┐
                    │  PostgreSQL   │
                    └───────────────┘
                            │
                    ┌───────▼───────┐
                    │  Base L2 RPC  │
                    └───────┬───────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
     ┌──────▼──────┐ ┌─────▼─────┐ ┌──────▼──────┐
     │ VaultManager│ │StakingVault│ │RewardEngine │
     └─────────────┘ └───────────┘ └─────────────┘
                                          │
                          ┌───────────────┼──────────┐
                    ┌─────▼─────┐   ┌─────▼────┐ ┌──▼───────┐
                    │VestingPool│   │Withdrawal│ │BonusEngine│
                    └───────────┘   │  Wallet  │ └──────────┘
                                    └──────────┘
```

## Key Numbers

- **BTN supply**: 21,000,000 (6 decimals)
- **Staking Short**: 30-day lock, 0.5%/day × tier multiplier
- **Staking Long**: 180-day lock, 0.5%/day × 1.2x
- **Settlement split**: 10% withdrawable / 90% vesting
- **Vesting release**: 0.5% per day
- **Early exit penalty**: 15% (Short only, goes to treasury)
- **Referral direct bonus**: 5% of stake
- **Tier multipliers**: T1=1.0x, T2=1.1x, T3=1.2x
- **Matching levels**: T1=3, T2=5, T3=10

## Network

- **Testnet**: Base Sepolia (chainId 84532)
- **Mainnet**: Base (chainId 8453)

See `DEPLOYMENT_SUMMARY_TESTNET.md` for deployed contract addresses.
