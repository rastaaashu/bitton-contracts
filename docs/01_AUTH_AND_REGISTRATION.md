# BitTON.AI — Auth & Registration

## Two Entry Paths

### Path A: Email Registration

1. **Register** — `POST /auth/register-email`
   - Input: `email`, `password`, optional `sponsorCode`
   - User created with status `PENDING_EMAIL`
   - Verification email sent

2. **Verify Email** — `POST /auth/verify-email`
   - Input: `token` (from email link)
   - If no sponsor: status → `CONFIRMED`
   - If sponsor: status → `PENDING_SPONSOR`, sponsor notified via email

3. **Sponsor Confirms** — `POST /auth/sponsor/confirm` (JWT required)
   - Sponsor approves the referral
   - Status → `CONFIRMED`

4. **Login** — `POST /auth/login-email`
   - Returns `accessToken` + `refreshToken`
   - Requires verified email

5. **Link Wallet** — `POST /auth/link-wallet` (JWT required)
   - User signs message with EVM wallet
   - Wallet attached to existing account

### Path B: Wallet Authentication

1. **Challenge** — `POST /auth/challenge`
   - Input: `address` (EVM)
   - Returns sign message with nonce

2. **Verify** — `POST /auth/verify`
   - Input: `address`, `signature`, `message`
   - User created (if new) with status `CONFIRMED`
   - Returns `accessToken` + `refreshToken`

3. **Link Email** — `POST /auth/link-email` (JWT required)
   - Attach email + password to wallet-only account
   - Verification email sent

## Status Transitions

```
PENDING_EMAIL ──[verify email]──▶ PENDING_SPONSOR ──[sponsor confirm]──▶ CONFIRMED
                                          │
                                (no sponsor)
                                          │
PENDING_EMAIL ──[verify email]──▶ CONFIRMED

Wallet-only ──────────────────▶ CONFIRMED (immediate)
```

## Sponsor Codes

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /sponsor/code/create` | JWT | Create a code (3-32 chars, alphanumeric + dash/underscore) |
| `GET /sponsor/code/:code` | None | Check code validity and remaining uses |

Sponsor codes have optional `maxUses` (0 = unlimited). When a user registers with a sponsor code, the code's `usedCount` increments.

## Security

- **Passwords**: bcrypt with 12 salt rounds
- **JWT**: HS256, access token expires in 15 minutes, refresh token in 7 days
- **Rate limiting**: 20 req/15min on register/challenge, 10 req/15min on login
- **Validation**: Zod schemas on all inputs
- **Sessions**: Stored in DB with IP + user-agent, revocable

## Data Model

```
User
├── id (UUID)
├── email (unique, nullable)
├── passwordHash
├── status (PENDING_EMAIL | PENDING_SPONSOR | CONFIRMED)
├── evmAddress (unique, nullable)
├── tonAddress (unique, nullable)
├── sponsorId → User
├── emailVerifiedAt
└── relations: walletLinks, loginSessions, sponsorCodes, emailVerificationTokens

EmailVerificationToken
├── token (unique, indexed)
├── userId → User
├── expiresAt (24h)
└── usedAt

SponsorCode
├── code (unique)
├── userId → User (sponsor)
├── maxUses (0 = unlimited)
├── usedCount
└── active

LoginSession
├── refreshToken (unique, indexed)
├── userId → User
├── userAgent, ipAddress
├── expiresAt
└── revokedAt
```
