# Phase 3 - Functional Decisions

## Final Rules

1. **Authentication**: Dual auth - email/password (backend JWT) + wallet connection (wagmi). Both required for full functionality.
2. **Referral binding**: Sponsor code at registration (backend) → auto-trigger on-chain `registerReferrer()` when user connects wallet.
3. **Staking behavior**: Direct contract interaction via wagmi. Approve → Stake flow.
4. **Bonus calculation**: Fully on-chain. Direct bonus triggered by StakingVault on stake. Matching bonus triggered by RewardEngine on settlement.
5. **Bonus claiming**: No manual claim. Bonuses added to pending rewards → settled via settleWeekly().
6. **Dashboard data sources**:
   - Balance cards: On-chain reads (btnToken, stakingVault, vestingPool, withdrawalWallet)
   - Vault status: On-chain read (vaultManager)
   - Active stakes: On-chain read (stakingVault.getStakes)
   - History/events: Backend API or direct RPC event queries
7. **Settlement**: User-triggered (click button) or operator batch (admin). No auto-settlement.
8. **Vesting release**: User-triggered. Shows live accumulation counter.
9. **Withdrawal**: Direct from WithdrawalWallet contract. Shows weekly allowance if cap is set.
10. **Admin access**: Check on-chain roles (DEFAULT_ADMIN_ROLE, OPERATOR_ROLE). Hide admin nav if no role.
