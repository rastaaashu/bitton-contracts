# Phase 7 - Frontend Implementation Guide

## Tech Stack
- **Framework:** Next.js 14 (App Router)
- **Wallet SDK:** wagmi v2 + viem
- **Wallet Modal:** RainbowKit v2
- **Chain:** Base Sepolia (84532) + Base Mainnet (8453)
- **Styling:** Tailwind CSS (dark theme)
- **State:** TanStack React Query (via wagmi)
- **Language:** TypeScript

## Project Structure
```
frontend/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── layout.tsx          # Root layout (Sidebar + Header)
│   │   ├── providers.tsx       # Wagmi + RainbowKit + QueryClient
│   │   ├── globals.css         # Tailwind imports + base styles
│   │   ├── page.tsx            # Redirect to /dashboard
│   │   ├── login/page.tsx      # Email login + wallet connect
│   │   ├── register/page.tsx   # Email registration + sponsor code
│   │   ├── dashboard/page.tsx  # Overview with balance cards + stakes
│   │   ├── vault/page.tsx      # Tier activation + payment
│   │   ├── staking/page.tsx    # Stake form + active stakes table
│   │   ├── rewards/page.tsx    # Settlement + reward breakdown
│   │   ├── vesting/page.tsx    # Vesting release + live counter
│   │   ├── withdraw/page.tsx   # Withdrawal form
│   │   ├── referrals/page.tsx  # Referral link + downline
│   │   ├── history/page.tsx    # Transaction history
│   │   └── admin/page.tsx      # Admin dashboard
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx     # Navigation + quick stats
│   │   │   └── Header.tsx      # Network badge + wallet connect
│   │   └── ui/
│   │       ├── StatCard.tsx    # Reusable stat display card
│   │       ├── TxButton.tsx    # Transaction button with states
│   │       └── Modal.tsx       # Confirmation modal
│   ├── config/
│   │   ├── contracts.ts        # Deployed addresses + decimals
│   │   ├── constants.ts        # Tiers, programs, matching levels
│   │   └── wagmi.ts            # Wagmi chain config
│   ├── hooks/
│   │   ├── useContracts.ts     # Read hooks (balances, stakes, etc.)
│   │   └── useContractWrite.ts # Write hooks (stake, unstake, etc.)
│   ├── lib/
│   │   └── format.ts           # Number formatting, date formatting
│   ├── types/
│   │   └── index.ts            # TypeScript interfaces
│   └── abi/                    # Contract ABI JSON files
│       ├── BTNToken.json
│       ├── VaultManager.json
│       ├── StakingVault.json
│       ├── RewardEngine.json
│       ├── VestingPool.json
│       ├── WithdrawalWallet.json
│       ├── BonusEngine.json
│       └── CustodialDistribution.json
├── docs/                       # Phase documentation
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
└── .env.local.example

## Getting Started
```bash
cd frontend
npm install
cp .env.local.example .env.local
# Add WalletConnect project ID to .env.local
npm run dev
```

## Contract Addresses (Base Sepolia)
All addresses are in `src/config/contracts.ts`:
- BTN Token: 0xa874ae78f2A9f3EE6551ebdAf32f5B3bcF0a575D
- USDT Token: 0x1f15CdaACC32D6cA77FaaC8B080a3f2C0F597316
- VaultManager: 0xA2b5ffe829441768E8BB8Be49f8ADee0041Fa1b0
- StakingVault: 0x50d1516D6d5A4930623BCb7e1Ed28e9fAeA1e82F
- WithdrawalWallet: 0xA06238c206C2757AD3f1572464bf720161519eC5
- VestingPool: 0xa3DC3351670E253d22B783109935fe0B9a11b830
- RewardEngine: 0xa86F6abB543b3fa6a2E2cC001870cF60a04c7f31
- BonusEngine: 0xFD57598058EC849980F87F0f44bb019A73a0EfC7

## Development Wallet
Owner/Admin: 0x1DaE2C7aeC8850f1742fE96045c23d1AaE3FCf2A

## Key Implementation Notes
1. BTN has 6 decimals (not 18!) - all formatting must account for this
2. Use ABI files from src/abi/ for all contract interactions
3. Every write transaction needs a prior approve() for token transfers
4. Settlement is user-triggered (not automatic)
5. Vesting release accumulates 0.5% per day - show live counter
6. Admin features only visible if wallet has admin/operator role
7. Handle "not connected" gracefully on every page
8. Show loading skeletons while data loads
9. Transaction flow: Idle → Wallet Prompt → Pending → Success/Error
```
