# BitTON.AI -- Auth & Registration

## Single Entry Path: Wallet + Email Registration

All users must register via referral link and connect a wallet. There is no wallet-only or email-only path.

### Registration Flow (`/register?ref=SPONSOR_CODE`)

1. **User arrives** via referral link with `?ref=` query parameter (required)
2. **Fills form**: email + password + confirm password
3. **Connects wallet** via RainbowKit (mandatory)
4. **Signs registration message** via MetaMask/wallet
5. **Backend verifies**: signature valid, wallet unique, email unique, sponsor code valid
6. **User created** with status `PENDING_EMAIL`, verification email sent
7. **User clicks email link** -> `/verify-email?token=XXX` -> status becomes `CONFIRMED`

### Login Flow (`/login`)

1. **Connect wallet** via RainbowKit
2. **Click "Sign in"** -> backend issues challenge (nonce + timestamp)
3. **User signs challenge** -> backend verifies signature
4. **Backend checks**: wallet has registered account, status is `CONFIRMED`
5. **Returns JWT** access + refresh tokens -> stored in localStorage
6. **Redirect** to `/dashboard`

### Registration API -- `POST /auth/register-wallet`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepass123",
  "sponsorCode": "ABC123",
  "address": "0x1234...abcd",
  "signature": "0x...",
  "message": "Sign this message to register with BitTON.AI\n\nEmail: user@example.com\nAddress: 0x1234\nTimestamp: 2026-03-05T..."
}
```

**Response (201):**
```json
{
  "success": true,
  "userId": "uuid",
  "status": "PENDING_EMAIL",
  "message": "Verification email sent. Please check your inbox."
}
```

**Errors:** 400 (invalid input/sponsor code), 401 (bad signature), 409 (email/wallet exists)

### Login API -- Wallet Challenge + Verify

1. `POST /auth/challenge` -> `{ address }` -> returns `{ message, nonce }`
2. `POST /auth/verify` -> `{ address, signature, message }` -> returns JWT tokens

**Important change**: `/auth/verify` no longer auto-creates users. If no registered account exists for the wallet, it returns 404. If account status is not `CONFIRMED`, it returns 403.

### Token Refresh -- `POST /auth/refresh`

**Request:**
```json
{ "refreshToken": "eyJ..." }
```

**Response (200):**
```json
{
  "accessToken": "eyJ...",
  "user": { "id": "uuid", "email": "...", "status": "CONFIRMED", "evmAddress": "0x..." }
}
```

### Logout -- `POST /auth/logout`

**Request:**
```json
{ "refreshToken": "eyJ..." }
```

Revokes the refresh token in the database.

## Status Transitions

```
register-wallet (email+wallet+sponsor)
        |
   PENDING_EMAIL --[verify email]--> PENDING_SPONSOR --[sponsor confirm]--> CONFIRMED
                                          |
                                    (no sponsor)
                                          |
   PENDING_EMAIL --[verify email]--> CONFIRMED
```

## Route Protection (Frontend)

- **Public pages** (no sidebar/header): `/login`, `/register`, `/verify-email`
- **Protected pages** (sidebar+header, requires JWT + connected wallet): everything else
- Unauthenticated users are redirected to `/login`
- Root `/` redirects to `/dashboard` if authed, `/login` if not

## Token Storage (Frontend)

| Key | Purpose |
|-----|---------|
| `bitton_access_token` | JWT access token (15min expiry) |
| `bitton_refresh_token` | JWT refresh token (7d expiry) |

On app mount, the `AuthProvider` attempts to refresh the access token using the stored refresh token. If it fails, the user is logged out.

## Sponsor Codes

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /sponsor/code/create` | JWT | Create a code (3-32 chars, alphanumeric + dash/underscore) |
| `GET /sponsor/code/:code` | None | Check code validity and remaining uses |

Sponsor codes have optional `maxUses` (0 = unlimited). When a user registers with a sponsor code, the code's `usedCount` increments.

## Security

- **Passwords**: bcrypt with 12 salt rounds
- **Wallet auth**: ECDSA signature verification via ethers.js
- **JWT**: HS256, access token 15min, refresh token 7d
- **Rate limiting**: 20 req/15min on register/challenge, 10 req/15min on login
- **Validation**: Zod schemas on all inputs
- **Sessions**: Stored in DB with IP + user-agent, revocable
- **Challenge nonces**: In-memory Map with 5-min expiry (use Redis in production)

## Data Model

```
User
|-- id (UUID)
|-- email (unique, nullable)
|-- passwordHash
|-- status (PENDING_EMAIL | PENDING_SPONSOR | CONFIRMED)
|-- evmAddress (unique, nullable)
|-- tonAddress (unique, nullable)
|-- sponsorId -> User
|-- emailVerifiedAt
|-- relations: walletLinks, loginSessions, sponsorCodes, emailVerificationTokens

EmailVerificationToken
|-- token (unique, indexed)
|-- userId -> User
|-- expiresAt (24h)
|-- usedAt

SponsorCode
|-- code (unique)
|-- userId -> User (sponsor)
|-- maxUses (0 = unlimited)
|-- usedCount
|-- active

LoginSession
|-- refreshToken (unique, indexed)
|-- userId -> User
|-- userAgent, ipAddress
|-- expiresAt
|-- revokedAt
```
