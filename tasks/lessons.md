# BitTON.AI — Lessons

1. **Hardhat time boundary tests:** `time.latest()` returns the LAST mined block timestamp. Any subsequent tx mines a NEW block at `latest+1` (or more if other txs intervene). Use `time.setNextBlockTimestamp()` for precise timestamp control in boundary tests. Never assume `time.latest()` matches the block your tx will execute in.

2. **time.increase() vs setNextBlockTimestamp() for settlement tests:** When testing reward accrual + settlement in the same flow, `time.increase(N)` advances time but the settlement transaction mines 1+ seconds later, adding extra seconds of reward. Always use `setNextBlockTimestamp(stakeStartTime + exactElapsed)` for tests that assert exact reward values. Read the stake's `startTime` from the contract, compute the target timestamp, and set it explicitly.

3. **Safe subtraction when admin can lower limits:** When a cap/limit can be lowered by admin below an already-accumulated counter (e.g., weekly withdrawal cap lowered below `weeklyWithdrawn`), always use a ternary guard before subtraction: `remaining = (used >= cap) ? 0 : cap - used`. Solidity 0.8 will revert on underflow otherwise.

4. **Cross-contract OPERATOR_ROLE grants are bidirectional:** When contract A calls contract B's OPERATOR-restricted function, A needs OPERATOR_ROLE on B. E.g., RewardEngine calls BonusEngine.processMatchingBonus → RewardEngine needs OPERATOR on BonusEngine. AND BonusEngine calls RewardEngine.addPendingReward → BonusEngine needs OPERATOR on RewardEngine. Map ALL call paths before wiring.

5. **Day-of-week timestamp calculations in tests:** When a contract uses `(block.timestamp / 86400 + 4) % 7` for day-of-week checks, compute target timestamps by scanning forward from the current day number: `for (d = dayNum+1; d <= dayNum+8; d++) if ((d+4)%7 === targetDay) return d*86400+43200`. Do NOT compute offsets from `time.latest()` directly — integer rounding and BigInt/Number type mismatches cause subtle off-by-one errors.

6. **Post-finalization unpause gap:** When Custodial uses `unpause()` restricted to DEFAULT_ADMIN_ROLE and admin is renounced during `finalize()`, an emergency pause AFTER finalization becomes permanent — no one can unpause. This is a known trade-off: the alternative (letting EMERGENCY_ROLE unpause) weakens the security model. Document this clearly to stakeholders and ensure emergency pause is a true last resort.

7. **ReentrancyGuard `else` branches are untestable:** Solidity-coverage reports uncovered `else` branches for every `nonReentrant` modifier. These correspond to the reentrancy revert path, which requires a malicious callback contract to trigger. Accept ~93% branch coverage on contracts using ReentrancyGuard; the modifier branches are not practically testable without attack contracts.

8. **Public testnet RPC nonce propagation:** On Base Sepolia (and other public testnets), sending transactions in rapid succession causes "replacement transaction underpriced" errors. The RPC node hasn't propagated the previous tx's nonce yet. Fix: add 3–5 second delays between transactions (`await sleep(5000)`) in testnet scripts. Local Hardhat doesn't have this issue.
