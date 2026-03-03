# BitTON.AI — Design Decisions Log

## Phase 0 Answers (from owner, 2026-02-27)

### 1. USDT Address
- NO hardcoded real USDT address
- Use MockUSDT (ERC20, 6 decimals) in tests
- Deploy same mock to Base Sepolia for demo later

### 2. Oracle
- Mock oracle in tests
- `oracleAddress` configurable in contract via `setOracleAddress()`
- Assume Chainlink AggregatorV3Interface
- Enforce staleness rule: revert if price >1 hour old or price == 0

### 3. Treasury Wallet
- Configurable via `setTreasuryAddress()`
- Require nonzero treasury before activation (revert if unset)
- In tests: use deployer or dedicated treasury signer

### 4. Tier Upgrades
- Pay FULL fee again to upgrade (no difference calculation)
- User can go T1→T2→T3 by paying full tier fee each time
- Emit event on each activation/upgrade

### 5. activateVault Signature
- Keep `activateVault(uint8 tier)` exactly — no token parameter
- Auto-detect payment method inside:
  1. Check if user has enough USDT allowance → charge USDT
  2. Else check if user has enough BTN allowance (oracle-converted) → charge BTN
  3. Else revert
- Priority: USDT first, BTN fallback

### 6. Direct Bonus Settlement (not yet answered — assume pending)
- Default assumption: add to referrer's `pendingReward` in RewardEngine, settled via normal 10/90 split

### 7. Batch Settlement (not yet answered — assume single-user for v1)
- `settleWeekly(address user)` is sufficient for v1
- Batch can be added later if needed
