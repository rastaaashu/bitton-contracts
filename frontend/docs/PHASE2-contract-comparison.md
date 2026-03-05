# Phase 2 - Contract vs WebApp Comparison

## Works Already (contract supports)
- Vault activation (3 tiers, USDT/BTN payment, oracle price)
- Short staking (30d lock, 0.5% daily, tier multiplier)
- Long staking (180d lock, 0.5% daily, 1.2x multiplier)
- Early exit with 15% penalty (Short only)
- Weekly reward settlement (10/90 split)
- Vesting pool with 0.5% daily release
- Withdrawal wallet with withdraw function
- Referrer registration (one-time)
- Direct bonus (5% of referred stake)
- Matching bonus (level-based, tier-limited depth)
- Reward pool funding (admin)
- Pause/unpause (admin)

## Missing (needs backend/frontend bridge)
- Email registration + JWT auth (backend has this)
- Sponsor code system (backend has this)
- Dashboard aggregation endpoint (needs new API route)
- Transaction history from events (needs event indexer)
- Bonus history aggregation (needs event query)
- Batch settlement for admin (frontend loop over settleWeekly)
- User lookup for admin (frontend aggregates contract reads)
- Weekly withdrawal cap display (contract has getRemainingWeeklyAllowance)

## Needs Adjustment
- Referral binding: Old system uses sponsor code at registration (backend), new system uses on-chain registerReferrer. Decision: Keep BOTH - backend stores sponsor relationship, frontend triggers on-chain registerReferrer when user first stakes.
- Bonus claim: No separate "claim" - bonuses auto-add to pending rewards during staking/settlement.
- Dashboard stats: Mix of on-chain reads + backend API for historical data.
