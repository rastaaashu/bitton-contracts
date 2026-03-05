# CHANGELOG -- 2026-03-05 (Auth Overhaul)

## Auth System Overhaul

### Key Decision
Wallet signature is now **mandatory** for both registration and login. Users cannot access the system based solely on wallet address -- they must sign to prove ownership. Registration requires a sponsor code (from referral link URL).

### New Endpoints
- `POST /auth/register-wallet` -- email + password + wallet signature + sponsor code (all required)
- `POST /auth/refresh` -- issue new access token from refresh token
- `POST /auth/logout` -- revoke refresh token

### Modified Endpoints
- `POST /auth/verify` -- **no longer auto-creates users**. Returns 404 if wallet has no registered account, 403 if account is not CONFIRMED.

### New Validation Schema
- `registerWalletSchema` -- validates email, password, sponsorCode (required), address, signature, message

### Email Service Fix
- Verification URL now points to frontend route (`/verify-email?token=`) instead of backend route (`/auth/verify-email?token=`)

### Frontend Auth Infrastructure (NEW)
- `src/contexts/AuthContext.tsx` -- `AuthProvider` + `useAuth()` hook, manages JWT tokens in localStorage, auto-refresh on mount
- `src/components/auth/ProtectedRoute.tsx` -- route guard, redirects to `/login` if not authenticated or wallet not connected
- `src/components/layout/LayoutShell.tsx` -- conditional layout: public pages (login/register/verify-email) get minimal wrapper, protected pages get Sidebar+Header+ProtectedRoute

### Frontend Pages Rewritten
- `src/app/login/page.tsx` -- wallet-only login with challenge-sign flow (no email form)
- `src/app/register/page.tsx` -- email + password + wallet connect + sign + sponsor from `?ref=` param (required)
- `src/app/verify-email/page.tsx` -- NEW, reads `?token=` param, calls backend verify-email
- `src/app/page.tsx` -- root redirect based on auth state
- `src/components/layout/Header.tsx` -- added logout button, user email/address display

### Modified Frontend Files
- `src/app/providers.tsx` -- wrapped with `AuthProvider`
- `src/app/layout.tsx` -- replaced inline sidebar/header with `LayoutShell`

### Token Storage
- Changed from single `bitton_token` to `bitton_access_token` + `bitton_refresh_token`

### Documentation Updated
- `docs/00_SYSTEM_OVERVIEW.md` -- updated auth description and user entry points
- `docs/01_AUTH_AND_REGISTRATION.md` -- complete rewrite reflecting new flows
- `docs/03_BACKEND_API.md` -- added new endpoints, updated verify behavior

## Validation

- `cd backend && npm run build` -- clean (0 errors)
- `cd frontend && npx tsc --noEmit` -- clean (0 errors)
- `next build` -- OneDrive file lock on `.next/trace` prevents clean build; all TypeScript compiles successfully

---

## Previous: 2026-03-02 (Phase 12)

### Backend Auth System (Initial)
- Added email registration, verification, sponsor confirmation, wallet auth
- Added JWT middleware, email service, sponsor routes
- Added bcrypt, jsonwebtoken, zod, express-rate-limit, nodemailer
- Added 29 unit tests

### Documentation Reset
- Consolidated 11 docs into 8 focused documents
- Added Mermaid diagrams
