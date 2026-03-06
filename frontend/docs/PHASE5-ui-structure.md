# Phase 5 - UI Structure

## Layout

```
┌─────────────────────────────────────────────────┐
│  Header: [BitTON.AI Logo]  [Network Badge]  [Connect Wallet] │
├──────────┬──────────────────────────────────────┤
│          │                                      │
│ Sidebar  │  Main Content Area                   │
│          │                                      │
│ Dashboard│  (Changes per page)                  │
│ Vault    │                                      │
│ Staking  │                                      │
│ Rewards  │                                      │
│ Vesting  │                                      │
│ Withdraw │                                      │
│ Referrals│                                      │
│ History  │                                      │
│          │                                      │
│ ──────── │                                      │
│ Quick    │                                      │
│ Stats:   │                                      │
│ Balance  │                                      │
│ Tier     │                                      │
│ Staked   │                                      │
│          │                                      │
│ [Admin]  │                                      │
├──────────┴──────────────────────────────────────┤
│  Footer: [Docs] [Discord] [Twitter] [Basescan]  │
└─────────────────────────────────────────────────┘
```

## Page Components

### Login Page
```
┌──────────────────────┐
│    BitTON.AI Logo    │
│                      │
│  ┌────────────────┐  │
│  │ Email          │  │
│  └────────────────┘  │
│  ┌────────────────┐  │
│  │ Password       │  │
│  └────────────────┘  │
│  [Login with Email]  │
│                      │
│  ─── OR ───          │
│                      │
│  [Connect Wallet]    │
│                      │
│  New? [Register]     │
└──────────────────────┘
```

### Register Page
```
┌──────────────────────┐
│    BitTON.AI Logo    │
│                      │
│  ┌────────────────┐  │
│  │ Email          │  │
│  └────────────────┘  │
│  ┌────────────────┐  │
│  │ Password       │  │
│  └────────────────┘  │
│  ┌────────────────┐  │
│  │ Confirm Pass   │  │
│  └────────────────┘  │
│  ┌────────────────┐  │
│  │ Sponsor Code   │  │
│  └────────────────┘  │
│  [Register]          │
│                      │
│  Have account? [Login]│
└──────────────────────┘
```

### Dashboard
```
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│ Wallet  │ │ Staked  │ │ Vesting │ │Withdraw │
│ Balance │ │ Total   │ │ Locked  │ │ Ready   │
│ X BTN   │ │ X BTN   │ │ X BTN   │ │ X BTN   │
└─────────┘ └─────────┘ └─────────┘ └─────────┘

┌─────────────────────────────────────────────┐
│ ⚠ Activate your vault to start earning      │
│                          [Activate Vault]   │
└─────────────────────────────────────────────┘
  (OR)
┌─────────────────────────────────────────────┐
│ ✓ Tier 2 Active          [Upgrade Tier]     │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Active Stakes                               │
├─────┬──────┬────────┬──────────┬───────────┤
│ #   │ Type │ Amount │ Remaining│ Actions   │
├─────┼──────┼────────┼──────────┼───────────┤
│ 0   │Short │ 1000   │ 15 days  │ [Unstake] │
│ 1   │Long  │ 5000   │ 120 days │ Locked    │
└─────┴──────┴────────┴──────────┴───────────┘
```

### Vault Activation
```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   Tier 1    │ │   Tier 2    │ │   Tier 3    │
│   Basic     │ │ Intermediate│ │    Full     │
│             │ │             │ │             │
│   $25       │ │   $50       │ │   $100      │
│   1.0x mult │ │   1.1x mult │ │   1.2x mult │
│   3 levels  │ │   5 levels  │ │   10 levels │
│             │ │             │ │             │
│ [USDT] [BTN]│ │ [USDT] [BTN]│ │ [USDT] [BTN]│
│ [Activate]  │ │ [Activate]  │ │ [Activate]  │
└─────────────┘ └─────────────┘ └─────────────┘
```

### Staking
```
┌──────────────────────┐ ┌──────────────────────┐
│   Short (30 days)    │ │   Long (180 days)    │
│                      │ │                      │
│ Amount: [________]   │ │ Amount: [________]   │
│ Daily: ~X BTN        │ │ Daily: ~X BTN        │
│ Weekly: ~X BTN       │ │ Weekly: ~X BTN       │
│ [Stake]              │ │ [Stake]              │
└──────────────────────┘ └──────────────────────┘

┌─────────────────────────────────────────────┐
│ Active Stakes                               │
├─────┬──────┬────────┬────────┬──────┬──────┤
│ #   │ Type │ Amount │ Start  │ Pend │ Act  │
├─────┼──────┼────────┼────────┼──────┼──────┤
│ 0   │Short │ 1000   │ Mar 1  │ 35   │[Exit]│
└─────┴──────┴────────┴────────┴──────┴──────┘
```

### Rewards
```
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Pending  │ │ Last     │ │ Pool     │
│ Rewards  │ │ Settled  │ │ Balance  │
│ X BTN    │ │ Mar 1    │ │ X BTN    │
└──────────┘ └──────────┘ └──────────┘

[Settle Weekly Rewards]
→ 10% to Withdrawal Wallet
→ 90% to Vesting Pool
```

### Vesting
```
┌──────────────┐ ┌──────────────┐
│ Locked       │ │ Available    │
│ X BTN        │ │ to Release   │
│              │ │ X BTN        │
└──────────────┘ └──────────────┘

Accumulating: 0.XXXXXX BTN (live counter)

[Release Vested Tokens]
```

### Withdrawal
```
┌──────────────────────┐
│ Withdrawable: X BTN  │
│                      │
│ Amount: [________]   │
│              [Max]   │
│ [Withdraw BTN]       │
└──────────────────────┘
```

### Referrals
```
┌───────────────────────────────────────┐
│ Your Referral Link:                   │
│ https://app.bitton.ai/?ref=0x1234... │
│                              [Copy]   │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ Register Referrer:                    │
│ [0x referrer address          ] [Set] │
└───────────────────────────────────────┘

┌──────────┐ ┌──────────┐ ┌──────────┐
│ Direct   │ │ Matching │ │ Downline │
│ Earned   │ │ Earned   │ │ Count    │
│ X BTN    │ │ X BTN    │ │ X users  │
└──────────┘ └──────────┘ └──────────┘

┌───────────────────────────────────────┐
│ Downline Table                        │
├──────────┬──────┬────────┬───────────┤
│ Address  │ Tier │ Staked │ Status    │
└──────────┴──────┴────────┴───────────┘
```

## Responsive Breakpoints
- Desktop: 1280px+ (full sidebar + main)
- Tablet: 768-1279px (collapsible sidebar)
- Mobile: <768px (bottom nav, single column)

## Component Library
- StatCard: Label + Value + optional loading skeleton
- TxButton: Idle → Pending Wallet → Pending Tx → Success/Error
- Modal: Confirmation dialogs (unstake, etc.)
- DataTable: Sortable, paginated tables
- CountdownTimer: Days/hours/minutes remaining
- LiveCounter: Real-time vesting accumulation
- Toast: Success/error notifications
