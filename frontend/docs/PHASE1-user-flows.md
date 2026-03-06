# Phase 1 - User Flow Capture

## Core User Actions

| Flow | Page | Action | Input/Button |
|------|------|--------|-------------|
| Register | /register | Enter email + password + sponsor code | email, password, sponsorCode, "Register" btn |
| Verify Email | /verify | Click email verification link | token param |
| Login (Email) | /login | Enter email + password | email, password, "Login" btn |
| Login (Wallet) | /login | Click "Connect Wallet" | MetaMask/Coinbase popup |
| Link Wallet | /profile | Connect wallet to email account | address, signature |
| Link Email | /profile | Add email to wallet account | email, password |
| Vault Activation | /vault | Select tier + pay USDT or BTN | tier select, payment toggle, "Activate" btn |
| Create Stake | /staking | Enter amount, choose Short/Long | amount input, program toggle, "Stake" btn |
| Unstake | /staking | Click unstake on stake row | stakeIndex, "Unstake" btn, confirm modal |
| Settle Rewards | /rewards | Click settle | "Settle Weekly Rewards" btn |
| Release Vesting | /vesting | Click release | "Release Vested Tokens" btn |
| Withdraw | /withdraw | Enter amount, click withdraw | amount input, "Withdraw" btn |
| Register Referrer | /referrals | Enter referrer address or use ?ref= param | referrer input, "Register" btn |
| Copy Referral Link | /referrals | Click copy | "Copy Link" btn |
| View History | /history | Browse transaction history | filter, pagination |
| Logout | header | Disconnect wallet / clear session | "Disconnect" btn |

## Page Inventory

1. **Login** - Email/password + wallet connect
2. **Register** - Email + password + sponsor code
3. **Dashboard** - Overview cards (balance, staked, vesting, withdrawable) + vault status + active stakes
4. **Vault Activation** - 3 tier cards + payment method toggle
5. **Staking** - Stake form + active stakes table with actions
6. **Rewards** - Pending rewards + settle button + settlement history
7. **Vesting** - Locked balance + pending release + release button
8. **Withdrawal** - Withdrawable balance + withdraw form
9. **Referrals** - Referral link + register referrer + downline table + bonus history
10. **History** - All transaction events in one table
11. **Profile** - Link wallet/email, account settings
12. **Admin** - System overview, fund rewards, batch settle, user lookup
