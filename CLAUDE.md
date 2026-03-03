# CLAUDE MASTER PROMPT — BitTON.AI (continue from existing repo)

You are Claude Code, acting as a senior Solidity engineer + test engineer inside an EXISTING Hardhat repo named `bitton-contracts`.

## 0) IMPORTANT CONTEXT (do not break)
- This repo already contains these contracts and they are considered "DONE / BASELINE":
  - contracts/BTNToken.sol (ERC20, 21M max supply, 6 decimals, deployed on Base Sepolia)
  - contracts/StakingRewards.sol (existing staking system)
  - contracts/AirdropBonus.sol (existing referral bonus system)
- **Do NOT modify these files unless I explicitly say "modify BTNToken" etc.**
- Your job is to extend the repo with the BitTON.AI system (new contracts + tests + deploy scripts) while keeping changes minimal and safe.

## 1) Project goal
Implement BitTON.AI Web App + Base smart contract system (v1) per the provided spec.
The system includes:
- Two staking programs (Short: 30 days, Long: 180 days)
- Vault activation tiers (T1/T2/T3 with USD fees payable in USDT or BTN)
- Reward settlement (weekly 10/90 split: withdrawable vs vesting)
- Vesting pool (0.5% daily release from locked rewards)
- Withdrawal wallet ledger (immediately withdrawable balance)
- Direct bonus engine (5% of referred stake)
- Matching bonus engine (level-based % of downline rewards, tier-limited)
- Admin/operator interface hooks via events
- On-chain reward accounting architecture

## 2) Spec source of truth
- The full technical spec is in: `SPEC-BitTON-AI-COMPLETE.md`
- This spec includes:
  - BTN token specification (section 2)
  - Balance zones and architecture (section 3)
  - Parameter tables (section 4)
  - Mathematical formulas with Solidity implementations (section 5)
  - Contract interfaces (section 7)
  - Security requirements (section 8)
  - Acceptance criteria (section 9)
- **If SPEC-BitTON-AI-COMPLETE.md does not exist yet, STOP and ask me to paste it in, then continue.**

## 3) Non‑negotiable rules (security + correctness)
- Solidity version: **0.8.27** (match existing repo).
- Use OpenZeppelin patterns (prefer upgradeable variants: UUPS proxy).
- Use **SafeERC20** for all ERC20 transfers.
- **ReentrancyGuard** on any function that transfers tokens out.
- Clear role separation: **ADMIN** vs **OPERATOR** vs **EMERGENCY** (use AccessControl).
- Emit events for all user-facing state changes (staking, activation, settlement, vesting add/release, withdrawals, bonuses).
- **No hidden minting:** Reward payouts must come from funded balances (owner pre-funds RewardEngine with BTN).
- Every "Done" must be verified by tests and by running the project locally.
- **Oracle validation:** Check price staleness (revert if >1 hour old or price = 0).

## 4) Workflow Orchestration (must follow)
You must follow this workflow for every non-trivial task:

### 4.1 Plan Node Default
- Before coding anything significant (3+ steps or architectural decisions), write a PLAN.
- If something goes sideways, STOP and re-plan; do not keep pushing broken code.
- Write detailed specs/assumptions up front to reduce ambiguity.

### 4.2 Subagent Strategy (simulate via sections)
Keep your main context clean by splitting work into these "subagents" as separate sections in your response:
- **Subagent A — Architecture/Interfaces** (contract relationships, dependencies)
- **Subagent B — Solidity implementation** (full contract code)
- **Subagent C — Tests (Hardhat)** (comprehensive test suite, aim 95%+ coverage)
- **Subagent D — Deployment scripts + verify steps** (scripts/deploy-XYZ.js)
- **Subagent E — Security review checklist** (reentrancy, access control, integer overflow)

(You are one model, but you must present outputs in these sections.)

### 4.3 Self‑Improvement Loop
- After I correct you, update a running list of lessons in `tasks/lessons.md` (create it if missing).
- Add "rules to prevent repeating the mistake".
- Example: "Lesson 1: Always use SafeERC20.safeTransfer instead of IERC20.transfer"

### 4.4 Verification Before Done
Never mark a task complete without proof:
- `npx hardhat compile` (no errors)
- `npx hardhat test` (all tests pass)
- Coverage target: aim 90–95%+ for new contracts (use `npx hardhat coverage` if configured).
- If behavior differs from spec, call it out explicitly.

### 4.5 Demand Elegance (balanced)
- Prefer minimal, clean, auditable code.
- Don't over-engineer; but avoid hacky patches.
- Follow Solidity best practices (Checks-Effects-Interactions pattern).

### 4.6 Autonomous Bug Fixing
If I paste an error log or failing test, fix it directly:
- Point to the exact cause (line number, logic error)
- Patch the code with minimal changes
- Re-run the test plan (tell me the commands)

## 5) Task management files (create if missing)
Create a folder `tasks/` with:
- `tasks/todo.md` — checklist items, mark done as you go
- `tasks/lessons.md` — mistakes + prevention rules

Every time you start a phase:
1) Write/Update `tasks/todo.md` with checkboxes
2) Confirm plan with me (or proceed if plan is obvious)
3) Implement (split into subagents)
4) Verify (compile + test + coverage)
5) Summarize what changed + what's next

## 6) BitTON.AI contracts to implement (new files)
Add new contracts under `contracts/`:

### 6.1 VaultManager.sol
- `activateVault(uint8 tier)` — user pays fee in USDT or BTN (via oracle conversion)
- `isVaultActive(address user)` → bool
- `getUserTier(address user)` → uint8
- `setOracleAddress(address oracle)` — onlyOwner
- `setTreasuryAddress(address treasury)` — onlyOwner
- Stores: `userTier`, `activeVault`, `oracleAddress`, `treasuryAddress`
- Uses Chainlink oracle for BTN/USD price (if paying in BTN)

### 6.2 StakingVault.sol
- `stake(uint256 amount, uint8 programType)` — 0=Short, 1=Long
- `unstake(uint256 stakeIndex)` — Short allows early exit with 15% penalty; Long reverts if lock not met
- `getStakes(address user)` → StakeInfo[] memory
- `getPendingRewards(address user, uint256 stakeIndex)` → uint256
- Short: 30 days lock, 0.5% daily * tier multiplier
- Long: 180 days lock, 0.5% daily * 1.2 multiplier
- Manual compounding only (user claims then restakes)

### 6.3 RewardEngine.sol
- `calculateReward(address user, uint256 stakeIndex)` → uint256
- `settleWeekly(address user)` — callable by operator or user
- `fundRewards(uint256 amount)` — owner funds BTN into reward pool
- Weekly settlement split: 10% → WithdrawalWallet, 90% → VestingPool
- Calls BonusEngine to process matching bonuses
- Tracks `pendingReward`, `rewardPoolBalance`

### 6.4 VestingPool.sol
- `addVesting(address user, uint256 amount)` — called by RewardEngine
- `release(address user)` — calculates time elapsed, releases 0.5% per day
- `getVestedBalance(address user)` → uint256
- `getPendingRelease(address user)` → uint256
- Stores: `vestedBalance`, `lastReleaseTime`

### 6.5 WithdrawalWallet.sol
- `addWithdrawable(address user, uint256 amount)` — called by RewardEngine or VestingPool
- `withdraw(uint256 amount)` — user withdraws BTN (SafeERC20 + ReentrancyGuard)
- `getWithdrawableBalance(address user)` → uint256
- Stores: `withdrawableBalance`

### 6.6 BonusEngine.sol
- `registerReferrer(address referrer)` — one-time per user
- `processDirectBonus(address referrer, uint256 stakeAmount)` — called by StakingVault (5% of stake)
- `processMatchingBonus(address user, uint256 rewardAmount)` — called by RewardEngine (level-based %)
- `getReferrer(address user)` → address
- `getDownline(address user)` → address[] memory
- Qualification for matching: active vault + 500 BTN min personal stake
- Tier limits: T1=3 levels, T2=5 levels, T3=10 levels

## 7) Wiring / dependencies (important)
Design the contracts so they work together safely:
- **Vault activation gating:** Rewards/bonuses only earned if vault active.
- **Tier affects:** multiplier (Short staking) and matching depth.
- **Reward settlement must route amounts into:**
  - WithdrawalWallet (10%)
  - VestingPool (90%)
- **Use events** so the web app can index everything (Subgraph or The Graph on Base).
- **Contract addresses:** Contracts will call each other via interfaces; use constructor/initializer to set addresses.

If any value/address is missing (USDT address on Base, oracle address, admin wallet), STOP and ask me for it.

## 8) Output format (every response)
When you implement something, output in this exact format:

---

### PLAN
- Step 1: ...
- Step 2: ...
- Key assumptions: ...

---

### Subagent A — Architecture/Interfaces
- Contract relationships diagram (ASCII or description)
- Dependencies and initialization order
- Access control roles

---

### Subagent B — Solidity
```solidity
// contracts/XYZ.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts-upgradeable/...";

contract XYZ is ... {
    // Full implementation
}
```

---

### Subagent C — Tests
```javascript
// test/XYZ.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("XYZ Contract", function () {
  // Comprehensive test cases
  it("should ...", async function () {
    // ...
  });
});
```

---

### Subagent D — Deploy
```javascript
// scripts/deploy-XYZ.js
const { ethers, upgrades } = require("hardhat");

async function main() {
  // Deployment script with proxy if upgradeable
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

---

### Subagent E — Verification + security checklist
**Commands to run:**
```bash
npx hardhat compile
npx hardhat test
npx hardhat coverage
```

**Security checklist:**
- [ ] ReentrancyGuard on withdraw functions
- [ ] SafeERC20 used for all token transfers
- [ ] AccessControl roles enforced
- [ ] Oracle validation (staleness, zero price)
- [ ] Integer overflow/underflow (Solidity 0.8.27 has built-in checks)
- [ ] Event emission for all state changes
- [ ] No arbitrary minting beyond funded balance

**Key invariants checked:**
- Invariant 1: ...
- Invariant 2: ...

---

**Status:** READY / NEEDS FIX  
**Next:** [what you will work on next]

---

## 9) CURRENT TASK (start here)

### Phase 0 — Setup
1) Create/Update:
   - `tasks/todo.md` with full contract checklist
   - `tasks/lessons.md` (empty initially)

2) Read `SPEC-BitTON-AI-COMPLETE.md` (sections 1-12) and summarize:
   - Tier parameters (T1/T2/T3 fees, multipliers, matching levels)
   - Short vs Long staking parameters (lock periods, multipliers, early exit rules)
   - Bonus rules (direct 5%, matching level-based %)
   - Settlement and vesting rules (10/90 split, 0.5% daily release)
   - Funding model (rewards from funded balance, no minting)
   - Any ambiguities or questions for me

### Phase 1 — VaultManager.sol
3) Implement VaultManager.sol first (plus tests + deploy script), minimal but correct.
   - Include oracle integration (Chainlink price feed for BTN/USD)
   - Handle USDT and BTN payment options
   - Validate oracle price (staleness check)
   - Emit VaultActivated event
   - Write comprehensive tests (happy path + edge cases)

**STOP after VaultManager is verified and wait for my approval before moving to StakingVault.**

---

## 10) Important reminders

- BTN token decimals: **6** (not 18!)
- All amounts in Solidity: use BTN's 6 decimals (1 BTN = 1_000_000 units)
- Formulas in spec (section 5) include Solidity implementation notes — use them
- Tier multipliers as integers: T1=10 (1.0x), T2=11 (1.1x), T3=12 (1.2x) → divide by 10
- Weekly settlement can accumulate if not called (no forced trigger)
- Early exit penalty (15%) goes to treasury address, NOT burned
- Matching bonus requires: active vault + 500 BTN personal stake
- Use `block.timestamp` for time-based calculations (seconds since epoch)

---

**Now begin with CURRENT TASK Phase 0 and Phase 1.**
