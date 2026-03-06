# Auth Architecture — BitTON.AI

## Overview

Multi-method auth system supporting EVM wallet, email (OTP), and Telegram registration/login. All state persisted in PostgreSQL via Prisma ORM.

## Database Models

```
User                    — canonical user record
├── email (unique)
├── evmAddress (unique)
├── telegramId (unique)
├── status: CONFIRMED
├── authMethod: WALLET | EMAIL | TELEGRAM
├── sponsorId → User
├── lastLoginAt
├── SponsorCode[]       — referral codes owned by this user
├── LoginSession[]      — JWT refresh tokens
└── sponsored: User[]   — users referred by this user

PendingSession          — multi-step auth flow state (email/telegram)
├── type: REGISTER_EMAIL | LOGIN_EMAIL | REGISTER_TELEGRAM | LOGIN_TELEGRAM
├── email / telegramId
├── verified: boolean
├── expiresAt (30 min)
└── OtpCode[]

OtpCode                 — 6-digit verification codes
├── code
├── attempts (max 5)
├── expiresAt (10 min)
└── usedAt

WalletChallenge         — login nonce for wallet sign-in
├── address (unique)
├── nonce, message
└── expiresAt (5 min)

SponsorCode             — referral codes
├── code (unique)
├── maxUses (0 = unlimited)
└── usedCount

LoginSession            — refresh token storage
├── refreshToken (unique)
├── expiresAt (7 days)
└── revokedAt

AuditLog                — all auth events logged
```

## Registration Flows

### A) Wallet Registration
```
POST /auth/register/wallet
  { address, signature, message, sponsorCode }
  → verify signature → check duplicates → validate sponsor → create user (CONFIRMED)
  → auto-create sponsor code → issue tokens
```

### B) Email Registration
```
1. POST /auth/register/email/init     { email }           → create PendingSession + OTP → send email
2. POST /auth/verify-otp              { sessionId, otp }  → verify OTP → mark session verified
3. POST /auth/register/email/complete { sessionId, sponsorCode, address, signature, message }
   → verify session → verify signature → check duplicates → validate sponsor → create user → issue tokens
```

### C) Telegram Registration
```
1. POST /auth/register/telegram/init     { id, first_name, hash, auth_date, ... }
   → verify HMAC → check duplicates → create PendingSession (verified=true)
2. POST /auth/register/telegram/complete { sessionId, sponsorCode, address, signature, message }
   → verify session → verify signature → check duplicates → validate sponsor → create user → issue tokens
```

## Login Flows

### A) Wallet Login
```
1. POST /auth/login/wallet/challenge { address }           → create WalletChallenge with nonce
2. POST /auth/login/wallet/verify    { address, signature, message }
   → verify message matches challenge → verify signature → find user → issue tokens
```

### B) Email Login
```
1. POST /auth/login/email/init     { email }              → create PendingSession + OTP → send email
2. POST /auth/verify-otp           { sessionId, otp }     → verify OTP
3. POST /auth/login/email/complete { sessionId, address, signature, message }
   → verify session → verify wallet matches user → issue tokens
```

### C) Telegram Login
```
1. POST /auth/login/telegram/init     { id, hash, ... }   → verify HMAC → find user → create session
2. POST /auth/login/telegram/complete { sessionId, address, signature, message }
   → verify session → verify wallet matches user → issue tokens
```

## Token Strategy

- **Access token**: JWT, 15 min expiry, sent as `Authorization: Bearer <token>`
- **Refresh token**: JWT, 7 day expiry, stored in `LoginSession` table
- **Rotation**: On `/auth/refresh`, old refresh token is revoked, new one issued
- **Logout**: `/auth/logout` revokes the refresh token
- **Frontend storage**: `localStorage` (keys: `bitton_access_token`, `bitton_refresh_token`)

## Uniqueness Rules

| Field | Constraint |
|-------|-----------|
| email | Unique per User |
| evmAddress | Unique per User |
| telegramId | Unique per User |

Race conditions handled via Prisma P2002 (unique constraint violation) → 409 Conflict.

## Sponsor / Referral

- Referral link: `/register?ref=CODE_OR_WALLET_ADDRESS`
- Accepts both sponsor code strings and EVM wallet addresses
- Validated via `GET /sponsor/validate/:codeOrAddress`
- Sponsor relationship stored as `User.sponsorId`
- Auto-creates a sponsor code for every new user on registration
- Bootstrap sponsor created via seed script: `BITTON-ALPHA`
