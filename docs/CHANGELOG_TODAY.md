# CHANGELOG — 2026-03-02 (Phase 12)

## Backend Auth System (NEW)

### Schema Changes
- Added `email`, `passwordHash`, `status` (PENDING_EMAIL | PENDING_SPONSOR | CONFIRMED) to User model
- Added `EmailVerificationToken` model (24h expiry, single-use tokens)
- Added `SponsorCode` model (unique codes, optional max uses)
- Added `LoginSession` model (refresh tokens, IP/UA tracking, revocable)
- Renamed `referrerId` → `sponsorId` on User
- Added `UserStatus` enum

### New Endpoints
- `POST /auth/register-email` — email + password + optional sponsor code
- `POST /auth/verify-email` — token verification, status transition
- `POST /auth/sponsor/confirm` — sponsor confirms referral (JWT)
- `POST /auth/login-email` — JWT access + refresh token issuance
- Updated `POST /auth/challenge` + `/auth/verify` — now issue JWTs
- `POST /auth/link-email` — attach email to wallet-only user (JWT)
- `POST /auth/link-wallet` — attach wallet to email-only user (JWT)
- `POST /sponsor/code/create` — create sponsor code (JWT)
- `GET /sponsor/code/:code` — check code validity

### New Dependencies
- `bcrypt` — password hashing (12 salt rounds)
- `jsonwebtoken` — JWT signing/verification
- `zod` — input validation schemas
- `express-rate-limit` — rate limiting (20/15min auth, 10/15min login)
- `nodemailer` — email sending (SMTP or dev console fallback)
- `jest` + `ts-jest` — test framework

### New Files
- `src/middleware/jwtAuth.ts` — JWT middleware + sign functions
- `src/services/email.service.ts` — verification + sponsor notification emails
- `src/routes/sponsor.ts` — sponsor code CRUD
- `src/utils/validation.ts` — 9 Zod schemas
- `src/__tests__/auth.test.ts` — 29 unit tests
- `docker-compose.yml` — Postgres for local dev
- `jest.config.js` — test configuration

### Modified Files
- `prisma/schema.prisma` — 4 new models, updated User
- `src/routes/auth.ts` — complete rewrite with email + wallet flows
- `src/config/env.ts` — added SMTP, JWT, app URL config; test-friendly fallbacks
- `src/index.ts` — mounted sponsor routes
- `package.json` — v2.0.0, added 6 dependencies, 3 dev dependencies, test script

## Documentation Reset

### Deleted (11 files)
- ASSUMPTIONS.md, BACKEND_ARCHITECTURE_AND_TON_MIGRATION.md, CUSTODIAL_DISTRIBUTION_SPEC.md
- END_TO_END_TEST_LOG.md, FUNCTIONALITY_AND_SCOPE_MATRIX.md, MAINNET_READINESS_CHECKLIST.md
- RUNBOOK_ALL.md, SECURITY_TEST_REPORT.md, SYSTEM_OVERVIEW_AND_STATUS.md
- TEST_PLAN_AND_SCALE_SIMULATION.md, UI_REQUIREMENTS_FOR_DESIGNER.md

### Created (8 files)
- `docs/00_SYSTEM_OVERVIEW.md` — architecture, key numbers, components
- `docs/01_AUTH_AND_REGISTRATION.md` — both login paths, status flow, data model
- `docs/02_MIGRATION_TON_TO_BASE.md` — pipeline steps, API examples
- `docs/03_BACKEND_API.md` — full endpoint reference with request/response
- `docs/04_CONTRACTS_OVERVIEW.md` — all contracts, roles, wiring, coverage
- `docs/05_OPERATIONS_RUNBOOK.md` — dev setup, deployment, monitoring, emergency
- `docs/06_MAINNET_READINESS.md` — status matrix, blockers, next steps
- `docs/DIAGRAMS.md` — 6 Mermaid diagrams (registration, wallet auth, staking, migration, architecture, status)

### Kept
- `docs/DEPLOYMENT_SUMMARY_TESTNET.md` — testnet addresses + tx hashes

## Validation

- `npx tsc --noEmit` — clean (0 errors)
- `npm run build` — dist/ generated
- `npm test` — 29 passing, 0 failing
- `npx hardhat test` — 618 passing, 0 failing
- `scripts/export-diagrams.sh` — created for PNG export
