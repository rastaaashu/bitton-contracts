# AUTH FAILURE AUDIT — BitTON.AI

**Date:** 2026-03-09
**Auditor:** Claude Opus 4.6
**Scope:** Full auth system (backend + frontend + deployment + database)

---

## WHAT CURRENTLY EXISTS

- **Backend:** Express + TypeScript on Render (Node.js)
- **Frontend:** Next.js 14 (static export) on Vercel
- **Database:** Neon PostgreSQL via Prisma ORM
- **Auth methods:** EVM Wallet, Email (OTP via Resend), Telegram (widget)
- **Token system:** JWT access (15m) + refresh (7d) with rotation
- **Referral system:** Sponsor codes + wallet address referrals
- **All auth state in database** (no in-memory storage) ✓

---

## CRITICAL ISSUES (MUST FIX)

### 1. render.yaml has WRONG contract addresses
- **BTN_TOKEN_ADDRESS** in render.yaml: `0xa874ae78...` (OLD/WRONG)
- **Correct address** in .env and frontend: `0x5b964baaf...`
- **USDT_TOKEN_ADDRESS** in render.yaml: `0x1f15Cdaa...` (OLD/WRONG)
- **Correct address** in .env and frontend: `0x69Bc9E30...`
- **Impact:** If Render uses render.yaml values, all contract interactions fail

### 2. render.yaml missing Telegram environment variables
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` not listed
- **Impact:** Telegram auth returns "not configured" in production

### 3. render.yaml build command missing `prisma db push`
- Build: `npm install && npx prisma generate && npm run build`
- Missing: `npx prisma db push` to sync schema with DB
- **Impact:** Schema changes don't reach production database

### 4. Backend missing unhandled rejection/exception handlers
- Only SIGINT/SIGTERM registered in index.ts
- Missing: `process.on("unhandledRejection")` and `process.on("uncaughtException")`
- **Impact:** Async errors crash silently on Render; no logs

### 5. Information disclosure in wallet challenge endpoint
- Line ~707 in auth.ts: `res.status(500).json({ error: err.message })`
- Leaks internal DB/system error messages to clients
- **Impact:** Security vulnerability

### 6. APP_URL not set on Render
- `APP_URL: sync: false` with no default in render.yaml
- If not manually set on Render dashboard, defaults to `http://localhost:3000`
- **Impact:** CORS blocks all frontend requests

---

## HIGH SEVERITY ISSUES

### 7. Sponsor code race condition on maxUses
- `validateSponsorCode()` reads usedCount, then `incrementSponsorCode()` increments separately
- Two concurrent registrations can both pass the limit check
- **Impact:** Sponsor codes with limits can be over-redeemed

### 8. Frontend referral validation silently succeeds on network error
- `page.tsx` line ~89: `.catch(() => { setRefValid(true) })`
- If validation API is down, UI shows "Valid" and user proceeds
- Backend then rejects at registration time after user has wasted effort
- **Impact:** Bad UX, wasted auth effort

### 9. CORS hardcodes localhost in production
- `index.ts` line 23-29: includes `http://localhost:3000`, `3001`, `3002`, `3003`
- Should only include localhost in development
- **Impact:** Minor security concern (unlikely attack vector)

### 10. Frontend loses all state on page refresh during multi-step auth
- Email auth: step, sessionId, email, OTP stored in React state only
- If user refreshes during OTP or wallet step, everything lost
- **Impact:** Users must restart auth flow from scratch

---

## MEDIUM SEVERITY ISSUES

### 11. No audit logging for failed auth attempts
- Failed OTP verification, signature failures, expired challenges not logged
- **Impact:** Cannot detect brute force attacks

### 12. `/resend-otp` endpoint lacks Zod schema validation
- Reads `req.body.sessionId` directly without schema parsing
- **Impact:** Inconsistent validation, potential injection

### 13. Missing database indexes
- `LoginSession`: no index on `userId`
- `PendingSession`: no index on `email`
- `OtpCode`: no index on `expiresAt`
- **Impact:** Performance degrades at scale

### 14. No cascade deletes on User relations
- If a user is ever deleted, orphaned LoginSessions, SponsorCodes, etc. remain
- **Impact:** Data integrity issue (not critical since user deletion isn't implemented)

### 15. Missing wallet mismatch guidance in frontend
- When email login user connects wrong wallet, backend returns generic error
- Frontend doesn't tell user which wallet to use
- **Impact:** Confusing error for returning users

---

## DEPLOYMENT CONFIGURATION ISSUES

### 16. Frontend .env.local points to production backend
- Local development accidentally talks to production database
- **Fix:** Point to `http://localhost:3001`

### 17. Frontend vercel.json outputDirectory may conflict with static export
- `output: "export"` generates `out/` dir, but vercel.json says `.next`
- Vercel auto-detects Next.js and handles this, but it's confusing
- **Impact:** Likely works but should be cleaned up

---

## WHAT IS RELIABLE

- ✓ All auth state stored in PostgreSQL (no in-memory)
- ✓ JWT token rotation with proper revocation
- ✓ Wallet signature verification using ethers.js
- ✓ OTP generation, storage, expiry, and attempt limiting
- ✓ Telegram HMAC-SHA256 verification
- ✓ Unique constraints on email, evmAddress, telegramId at DB level
- ✓ Rate limiting on auth endpoints
- ✓ Graceful shutdown for SIGINT/SIGTERM
- ✓ Health check with DB + RPC + relayer validation
- ✓ Periodic cleanup of expired sessions/OTPs/challenges
- ✓ Data survives backend restarts (all in DB)

---

## ROOT CAUSES OF REPORTED FAILURES

| Symptom | Root Cause |
|---------|-----------|
| "Telegram bot token not available" | `TELEGRAM_BOT_TOKEN` not set in Render env vars |
| Email not sending | `EMAIL_API_KEY` not set or Resend free plan restrictions |
| Auth sometimes fails | Render free tier cold starts (backend sleeps after inactivity) |
| Users can't return and login | Working correctly IF backend is running and env vars set |
