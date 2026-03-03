# BitTON.AI — Master Todo

## Phase 0 — Setup & Spec Review
- [x] CLAUDE.md added to repo root
- [x] SPEC-BitTON-AI-COMPLETE.md added to repo root
- [x] tasks/todo.md created
- [x] tasks/lessons.md created
- [x] Confirm Solidity 0.8.27 in hardhat.config.js
- [x] Confirm baseline tests pass (14/14 passing)
- [x] Install @openzeppelin/contracts-upgradeable
- [x] Install @openzeppelin/hardhat-upgrades
- [x] Update hardhat.config.js to require hardhat-upgrades plugin
- [x] Resolve open questions with owner (oracle addresses, treasury, USDT address)
- [x] Spec summary written (Phase 0 output)
- [x] Design decisions recorded in tasks/decisions.md

## Phase 1 — VaultManager.sol
- [x] VaultManager.sol contract (UUPS upgradeable)
- [x] test/VaultManager.test.js (comprehensive — 47 tests)
- [x] scripts/deploy-VaultManager.js
- [x] npx hardhat compile — 47 files, no errors
- [x] npx hardhat test — 61/61 passing (14 baseline + 47 new)
- [x] Security checklist verified
- [ ] STOP — wait for owner approval

## Phase 2 — StakingVault.sol
- [x] StakingVault.sol contract (UUPS upgradeable)
- [x] IVaultManager.sol interface
- [x] test/StakingVault.test.js (65 tests)
- [x] scripts/deploy-StakingVault.js
- [x] npx hardhat compile — no errors
- [x] npx hardhat test — 126/126 passing (14 baseline + 47 VaultMgr + 65 StakingVault)
- [x] Security checklist verified
- [ ] STOP — wait for owner approval

## Phase 3 — RewardEngine.sol
- [x] IStakingVault, IVestingPool, IWithdrawalWallet, IBonusEngine interfaces
- [x] MockVestingPool, MockWithdrawalWallet, MockBonusEngine (for testing)
- [x] RewardEngine.sol contract (UUPS upgradeable)
- [x] test/RewardEngine.test.js (64 tests)
- [x] scripts/deploy-RewardEngine.js
- [x] npx hardhat compile — no errors
- [x] npx hardhat test — 190/190 passing (14 baseline + 47 VaultMgr + 65 StakingVault + 64 RewardEngine)
- [x] Security checklist verified
- [ ] STOP — wait for owner approval

## Phase 4 — VestingPool.sol
- [x] VestingPool.sol contract (UUPS upgradeable)
- [x] test/VestingPool.test.js (47 tests)
- [x] scripts/deploy-VestingPool.js
- [x] npx hardhat compile — no errors
- [x] npx hardhat test — 237/237 passing (14 baseline + 47 VaultMgr + 65 StakingVault + 64 RewardEngine + 47 VestingPool)
- [x] Security checklist verified
- [ ] STOP — wait for owner approval

## Phase 5 — WithdrawalWallet.sol
- [x] WithdrawalWallet.sol contract (UUPS upgradeable)
- [x] test/WithdrawalWallet.test.js (56 tests)
- [x] scripts/deploy-WithdrawalWallet.js
- [x] npx hardhat compile — no errors
- [x] npx hardhat test — 293/293 passing (14 baseline + 47 VaultMgr + 65 StakingVault + 64 RewardEngine + 47 VestingPool + 56 WithdrawalWallet)
- [x] Security checklist verified
- [ ] STOP — wait for owner approval

## Phase 6 — BonusEngine.sol
- [x] BonusEngine.sol contract (UUPS upgradeable)
- [x] IBonusEngine.sol updated (full interface)
- [x] IRewardEngine.sol created (for addPendingReward)
- [x] 3 mock contracts for isolated testing
- [x] test/BonusEngine.test.js (61 tests)
- [x] scripts/deploy-BonusEngine.js
- [x] npx hardhat compile — no errors (7 new files)
- [x] npx hardhat test — 354/354 passing (14 baseline + 47 VaultMgr + 65 StakingVault + 64 RewardEngine + 47 VestingPool + 56 WithdrawalWallet + 61 BonusEngine)
- [x] Security checklist verified
- [ ] STOP — wait for owner approval

## Phase 7 — Integration & Wiring
- [x] test/SystemIntegration.test.js (16 tests, 10 scenarios)
- [x] Full lifecycle: activate vault → stake → settle → vest release → withdraw (T1 Short + T3 Long)
- [x] Consecutive settlements with interleaved vesting releases
- [x] Referral chain: direct bonus → matching bonus → settlement → vest → withdraw
- [x] Multi-user, multi-tier (T1 vs T3 reward comparison)
- [x] Vault gating enforcement (stake + settlement blocked without active vault)
- [x] Weekly withdrawal cap enforcement with week boundary reset
- [x] Early unstake penalty + reward pool accounting
- [x] Matching bonus qualification checks (no stake = skip, tier depth limits)
- [x] Reward pool exhaustion (InsufficientRewardPool revert)
- [x] Cross-contract OPERATOR_ROLE grants verified (all 6 grants)
- [x] Cross-contract address wiring verified (all 10 addresses)
- [x] npx hardhat test — 370/370 passing
- [x] npx hardhat coverage — new contracts all ≥95% line coverage:
  - BonusEngine: 100% / 100% / 100% / 100%
  - RewardEngine: 100% / 93.75% / 100% / 100%
  - StakingVault: 100% / 93.24% / 100% / 98.84%
  - VaultManager: 100% / 95.65% / 100% / 100%
  - VestingPool: 97.22% / 95% / 90.91% / 97.67%
  - WithdrawalWallet: 100% / 97.62% / 100% / 100%
- [x] Security checklist verified
- [ ] STOP — wait for owner approval

## Phase 9 — Post-Meeting: Custodial + Docs + Scale Tests

### Deliverable 1: docs/FUNCTIONALITY_AND_SCOPE_MATRIX.md
- [x] Per-module breakdown: what it does, on-chain vs backend vs frontend
- [x] Map spec expectations vs actual implementation
- [x] Call out unknowns/assumptions

### Deliverable 2: docs/CUSTODIAL_DISTRIBUTION_SPEC.md
- [x] Full spec: purpose, trust model, threat model
- [x] Roles/permissions, finalization/lockdown procedure
- [x] APIs: receive 21M, controlled outflows/inflows, migration hooks
- [x] Invariants + acceptance criteria

### Deliverable 3: docs/BACKEND_ARCHITECTURE_AND_TON_MIGRATION.md
- [x] Backend scope: what moves off-chain and why
- [x] TON migration plan: data extraction, wallet linking, balance migration
- [x] Anti-fraud: merkle roots, snapshots, one-time claims
- [x] Backend API spec: endpoints, relayer model, key management

### Deliverable 4: docs/UI_REQUIREMENTS_FOR_DESIGNER.md
- [x] Screen map + user flows (designer-ready, no code)
- [x] Per-screen: data fields, CTAs, validation/error/loading states
- [x] Per-action: which contract call or backend endpoint

### Deliverable 5: docs/TEST_PLAN_AND_SCALE_SIMULATION.md
- [x] Scale test plan: 60k / 600k / 6M user scenarios
- [x] On-chain vs off-chain simulation approach
- [x] Metrics: latency, throughput, gas, cost estimates
- [x] Pass/fail thresholds + optimization recommendations

### Deliverable 6: CustodialDistribution.sol
- [x] Contract implementation (non-upgradeable, AccessControl)
- [x] ICustodialDistribution.sol interface
- [x] Controlled outflows (distribute, fundContract, migration)
- [x] Controlled inflows (acceptTokens / receive back)
- [x] One-time migration batch function
- [x] Emergency pause + strict access checks
- [x] Finalization function (renounce all admin roles permanently)

### Deliverable 7: Tests + Scale Harness
- [x] test/CustodialDistribution.test.js — 71 tests passing
- [x] Property/fuzz-like edge case tests (full drain + return, migration skip counting, role recovery impossibility)
- [x] scripts/scale-simulation.js — gas profiling for all operations + cost projections at 60k/600k/6M
- [x] scripts/genesis-to-custodial-runbook.js — full 3-phase lockdown script, tested locally
- [x] All tests pass: 564 passing, 0 failures (legacy permit tests fixed)
- [x] Compile clean: npx hardhat compile — no errors

---

## Legacy Hardening & Airdrop Review (Pre-Deployment)
- [x] Inventory & classification of all legacy contracts (BTNToken, StakingRewards, AirdropBonus)
- [x] StakingRewards.sol — added SafeERC20 (replaced 3 raw transfer/transferFrom calls)
- [x] AirdropBonus.sol — added SafeERC20 + ReentrancyGuard (distributeAirdrop loop now safe)
- [x] BTNToken.sol — no changes needed (already well-designed)
- [x] test/BTNToken.legacy.test.js — 38 tests (deployment, minting, burning, minter mgmt, permit, allowance helpers, ownership)
- [x] test/StakingRewards.legacy.test.js — 47 tests (deployment, admin setters, staking, rewards, claiming with day-of-week, unstaking, getUserStakes)
- [x] test/AirdropBonus.legacy.test.js — 32 tests (deployment, referrer mgmt, rank mgmt, all 9 ranks distribution, edge cases)
- [x] npx hardhat compile — no errors
- [x] npx hardhat test — 493/493 passing (370 existing + 123 new legacy tests)
- [x] npx hardhat coverage — legacy contract results:
  - BTNToken: 100% / 96.67% / 100% / 100% (Stmts / Branch / Funcs / Lines)
  - StakingRewards: 100% / 92.86% / 100% / 100% (branch limited by ReentrancyGuard else paths)
  - AirdropBonus: 100% / 95% / 100% / 100%
- [x] No regressions on any existing tests
- [ ] STOP — wait for owner approval

## Phase 8 — Testnet Deployment
- [x] `.env.example` — documented all required environment variables
- [x] `scripts/deploy-all.js` — unified deployment script (6 UUPS proxies + 7 OPERATOR_ROLE grants + address wiring)
- [x] `scripts/verify-all.js` — Basescan verification script (reads deployment-addresses.json)
- [x] `scripts/smoke-test.js` — end-to-end smoke test (8-step user flow: balance → vault → stake → settle → vest → withdraw → referrer → state summary)
- [x] Local dry-run: `deploy-all.js` — all 6 proxies deployed + wired + deployment-addresses.json written
- [x] Local dry-run: `smoke-test.js` — all 8 steps PASSED
- [x] `npx hardhat compile` — 64 Solidity files, no errors
- [x] `npx hardhat test` — 493/493 passing, no regressions
- [x] `scripts/deploy-mocks.js` — deployed MockUSDT + MockAggregator to Base Sepolia
- [x] Deploy to Base Sepolia — all 6 UUPS proxies deployed + 7 OPERATOR_ROLE grants + RewardEngine funded with 10,000 BTN
- [x] Verify on Basescan — 6/6 implementations verified
- [x] Live smoke test — ALL 8 STEPS PASSED (vault activation, staking, settlement, vesting, withdrawal, referrer, state summary)
- [x] Fixed deploy-all.js and smoke-test.js for public RPC nonce handling (await tx.wait() on all txs)

### Deployed Addresses (Base Sepolia)
| Contract         | Proxy Address                              |
|------------------|--------------------------------------------|
| VaultManager     | 0xA2b5ffe829441768E8BB8Be49f8ADee0041Fa1b0 |
| StakingVault     | 0x50d1516D6d5A4930623BCb7e1Ed28e9fAeA1e82F |
| WithdrawalWallet | 0xA06238c206C2757AD3f1572464bf720161519eC5 |
| VestingPool      | 0xa3DC3351670E253d22B783109935fe0B9a11b830 |
| RewardEngine     | 0xa86F6abB543b3fa6a2E2cC001870cF60a04c7f31 |
| BonusEngine      | 0xFD57598058EC849980F87F0f44bb019A73a0EfC7 |
| MockUSDT         | 0x69Bc9E30366888385f68cBB566EEb655CD5A34CC |
| MockAggregator   | 0xf1DC093E1B3fD72A1C7f1B58bd3cE8A4832BEe52 |
| BTN Token        | 0x5b964baafEDf002e5364F37848DCa1908D3e4e9f |
| Admin/Deployer   | 0x1DaE2C7aeC8850f1742fE96045c23d1AaE3FCf2A |

## Phase 10 — End-to-End Completion

### A: Fix All Failing Tests
- [x] Fixed BTNToken.legacy.test.js: `"BitTON"` → `"BTN"` (name + 4 EIP-712 domain names)
- [x] Full test suite: 564 passing, 0 failing

### B: Genesis Reality Check
- [x] scripts/check-genesis-state.js — confirmed 21M minted, deployer holds ~20.989M
- [x] Updated runbook to handle "already minted" branch (totalSupply > 0)
- [x] Added pre-deployed Custodial address support to runbook

### C: Testnet E2E Runbook Execution
- [x] scripts/testnet-e2e-runbook.js — 5 transactions on Base Sepolia
  - transfer_to_custodial: 100,000 BTN
  - batch_migrate: 3 addresses, 350 BTN
  - distribute: 25 BTN
  - approve + return_tokens: 10 BTN
- [x] docs/DEPLOYMENT_SUMMARY_TESTNET.md — addresses, tx hashes, Basescan links

### D: Backend Service
- [x] backend/ created with Node.js + TypeScript + Express + Prisma + ethers.js
- [x] Prisma schema: users, wallet_links, ton_snapshot_rows, migration_claims, operator_jobs, audit_log
- [x] API endpoints: health, auth/challenge, auth/verify, admin/status, admin/ton/import-snapshot, admin/migration/build, admin/jobs/dispatch, admin/jobs/distribute, admin/jobs, admin/audit, migration/status, migration/link-wallet
- [x] Operator job runner with retry, idempotency, status tracking
- [x] Chain service: distribute, batchMigrate, getCustodialState, getBtnBalance
- [x] TypeScript compiles clean (npx tsc --noEmit passes)
- [x] Build produces dist/ output

### E: Scale Simulation
- [x] scripts/scale-simulation.js runs successfully with gas profiling + cost projections

### F: Documentation
- [x] docs/ASSUMPTIONS.md — 15 documented assumptions/decisions
- [x] docs/RUNBOOK_ALL.md — complete "how to run everything" guide
- [x] docs/DEPLOYMENT_SUMMARY_TESTNET.md — addresses + tx hashes + Basescan links
- [x] tasks/todo.md updated with full Phase 10 checklist

## Phase 11 — Production Prep

### A: Cleanup & Consolidation
- [x] Removed test/Integration.test.js (superseded by SystemIntegration.test.js)
- [x] Removed scripts/deploy-sepolia.js (superseded by deploy-all.js)
- [x] Removed stale artifacts: coverage.json, test-results.txt, testnet-e2e-results.json, coverage/
- [x] Updated .gitignore (added backend/dist/, backend/node_modules/, *.log, generated files)
- [x] Verified: 562 tests still passing after cleanup

### B: Security & Attack Tests
- [x] contracts/mocks/ReentrancyAttacker.sol — attack contract for testing
- [x] test/security/attacks.test.js — 56 security tests:
  - 15 access control bypass attempts (all rejected)
  - 12 economic exploits (double-claim, over-withdraw, cap bypass — all rejected)
  - 13 edge cases (zero amounts, invalid inputs, paused state — all handled)
  - 2 gas griefing tests (max batch, oversized batch — all handled)
  - 5 post-finalization security (permanent lockdown confirmed)
  - 4 staking exploit attempts (all rejected)
  - 5 BTN token security (all rejected)
- [x] docs/SECURITY_TEST_REPORT.md — full report with pass/fail for each test

### C: Full Test Suite
- [x] npx hardhat compile — no errors
- [x] npx hardhat test — 618 passing, 0 failing
  - 562 functional tests + 56 security tests

### D: Documentation
- [x] docs/SYSTEM_OVERVIEW_AND_STATUS.md — master client-facing document (11 sections)
- [x] docs/MAINNET_READINESS_CHECKLIST.md — honest status per category
- [x] docs/SECURITY_TEST_REPORT.md — 56 attack tests documented
- [x] docs/END_TO_END_TEST_LOG.md — testnet tx hashes + test results
- [x] docs/ASSUMPTIONS.md — updated to 18 assumptions (added A16-A18)
- [x] tasks/todo.md — updated with Phase 11 checklist

## Phase 12 — Backend Auth Alignment + Doc Rewrite

### Part 1: Backend Auth Implementation
- [x] Update Prisma schema (User: email, passwordHash, status; EmailVerificationToken; SponsorCode; LoginSession)
- [x] Add dependencies (bcrypt, jsonwebtoken, zod, express-rate-limit, nodemailer)
- [x] Implement JWT auth middleware
- [x] Implement Zod validation schemas (9 schemas in validation.ts)
- [x] POST /auth/register-email (email + password + optional sponsorCode)
- [x] POST /auth/verify-email (token → PENDING_EMAIL → PENDING_SPONSOR)
- [x] POST /auth/sponsor/confirm (sponsor confirms referral → CONFIRMED)
- [x] POST /auth/login-email (JWT issuance, email verification check)
- [x] Updated POST /auth/challenge + /auth/verify (wallet auth + JWT)
- [x] POST /auth/link-email (attach email to wallet user)
- [x] POST /auth/link-wallet (attach wallet to email user)
- [x] POST /sponsor/code/create
- [x] GET /sponsor/code/:code
- [x] Rate limiting on auth endpoints (20/15min auth, 10/15min login)
- [x] docker-compose.yml for Postgres
- [x] Auth tests — 29 unit tests passing
- [x] Update backend/README.md
- [x] npx tsc --noEmit passes (0 errors)
- [x] npm run build passes (dist/ generated)

### Part 2: Doc Reset & Rewrite
- [x] Delete old docs (11 files removed, kept DEPLOYMENT_SUMMARY_TESTNET.md)
- [x] docs/00_SYSTEM_OVERVIEW.md
- [x] docs/01_AUTH_AND_REGISTRATION.md
- [x] docs/02_MIGRATION_TON_TO_BASE.md
- [x] docs/03_BACKEND_API.md
- [x] docs/04_CONTRACTS_OVERVIEW.md
- [x] docs/05_OPERATIONS_RUNBOOK.md
- [x] docs/06_MAINNET_READINESS.md
- [x] docs/DIAGRAMS.md (6 Mermaid diagrams)
- [x] scripts/export-diagrams.sh

### Part 3: Validation
- [x] npm test passes (29/29 backend)
- [x] npm run build passes
- [x] npx hardhat test passes (618/618 contracts)
- [x] docs/CHANGELOG_TODAY.md
- [x] tasks/todo.md updated
