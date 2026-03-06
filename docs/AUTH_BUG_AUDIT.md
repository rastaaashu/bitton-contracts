# Auth System Bug Audit — BitTON.AI

**Date:** 2026-03-06
**Scope:** Full audit of backend auth routes, DB schema, frontend auth pages, session management

## Summary

The auth system is architecturally sound (DB-backed sessions, OTPs, challenges, Zod validation, rate limiting, audit logs). However, several bugs and gaps prevent reliable production use.

## Critical Bugs

### 1. Wallet Login — Challenge Message Not Verified (SECURITY)
**File:** `backend/src/routes/auth.ts` lines 658-673
**Impact:** The `/login/wallet/verify` endpoint verifies that the submitted `message` was signed by the wallet owner, but does NOT verify that `message === challenge.message`. An attacker could sign any arbitrary message and submit it. The one-time nonce is bypassed.
**Fix:** Add `if (message !== challenge.message)` check before signature verification.

### 2. No Prisma Migrations — Schema Applied via `db push` Only
**File:** `backend/prisma/` — no `migrations/` directory
**Impact:** No migration history. Cannot safely evolve schema in production. `db push` can drop columns silently.
**Fix:** Run `prisma migrate dev --name init` to create baseline migration.

### 3. CORS Allows All Origins
**File:** `backend/src/index.ts` line 22 — `app.use(cors())`
**Impact:** Any website can make API calls to the backend. Enables CSRF-like attacks on authenticated endpoints.
**Fix:** Restrict to `env.appUrl` and localhost for dev.

### 4. Refresh Token Not Rotated
**File:** `backend/src/routes/auth.ts` lines 937-973
**Impact:** The `/auth/refresh` endpoint issues a new access token but reuses the old refresh token forever (until expiry). If a refresh token is leaked, it can be used until its 7-day expiry.
**Fix:** Issue new refresh token on each refresh, revoke the old one.

## High-Priority Issues

### 5. No Sponsor Code Auto-Created on Registration
**Impact:** New users don't get a sponsor code. They CAN share referral links via wallet address (supported), but explicit named codes require a manual API call to `/sponsor/code/create`.
**Fix:** Auto-generate a sponsor code when a user registers.

### 6. No Seed Script for Bootstrap User
**File:** `backend/prisma/seed.ts` — referenced in package.json but does not exist
**Impact:** First deployment requires manual API calls to create the bootstrap sponsor. New environments have no way to create the first referral.
**Fix:** Create `prisma/seed.ts` that creates a bootstrap admin user + sponsor code.

### 7. Race Condition on Duplicate Registration
**Impact:** Between `findFirst` (duplicate check) and `create`, a concurrent request could create a duplicate. Prisma's unique constraint will throw P2002 but it's caught as a generic 500 error.
**Fix:** Handle Prisma P2002 error and return 409 conflict.

### 8. Email OTP Not Logged in Dev Mode
**Impact:** When `EMAIL_API_KEY` is empty, OTPs are logged to console via the dev fallback, but the log message is generic. Developers testing locally can't easily find the OTP.
**Fix:** Log OTP value explicitly in dev mode fallback.

### 9. Existing Tests Are Outdated
**File:** `backend/src/__tests__/auth.test.ts`
**Impact:** Tests validate legacy password-based schemas (`registerEmailSchema`, `loginEmailSchema`) that are no longer used. The actual OTP-based flows are untested.
**Fix:** Rewrite tests to cover current auth flows with integration tests.

## Medium-Priority Issues

### 10. `authSecret` Defaults to `"dev-secret"` Silently
**File:** `backend/src/config/env.ts` line 42
**Impact:** If `AUTH_SECRET` is missing in production, tokens are signed with a predictable key.
**Fix:** Make `AUTH_SECRET` required (not optional) in production.

### 11. No `lastLoginAt` Tracking
**Impact:** Cannot audit when users last logged in.
**Fix:** Add `lastLoginAt` field to User model, update on login.

### 12. Expired Sessions / OTPs Not Cleaned Up
**Impact:** `pending_sessions`, `otp_codes`, `wallet_challenges` accumulate forever.
**Fix:** Add periodic cleanup or TTL-based deletion.

## What's Working Correctly
- All 3 registration flows implemented (wallet, email+OTP, telegram)
- All 3 login flows implemented
- OTPs stored in DB (not in-memory) ✓
- Wallet challenges stored in DB ✓
- Sponsor validation accepts both codes and wallet addresses ✓
- JWT access + refresh token architecture ✓
- Zod input validation on all endpoints ✓
- Rate limiting on auth endpoints ✓
- Audit logging ✓
- Frontend AuthContext with localStorage persistence ✓
- Token refresh on 401 ✓
- Session revocation on logout ✓
- Telegram HMAC verification ✓

## Root Cause of Reported Failures

| Symptom | Root Cause |
|---------|-----------|
| "Users not saved" | Likely: registration tx reverted silently, or user didn't complete multi-step flow |
| "Sponsor codes invalid" | Fixed in prior session: validator only accepted code strings, not wallet addresses |
| "Referral links broken" | Fixed in prior session: root page lost `?ref=` param on redirect |
| "Backend not always running" | Render free tier sleeps after 15 min inactivity; needs paid plan or keep-alive |
| "Email OTP not arriving" | `EMAIL_API_KEY` is empty; Resend domain not verified for production emails |
