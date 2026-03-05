# BitTON.AI -- Backend API Reference

Base URL: `http://localhost:3001` (dev) | `https://api.bitton.ai` (prod)

## Auth Endpoints

### POST /auth/register-wallet

Register a new user with email + wallet signature + sponsor code (all required).

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepass123",
  "sponsorCode": "ABC123",
  "address": "0x1234...abcd",
  "signature": "0x...",
  "message": "Sign this message to register with BitTON.AI\n\nEmail: user@example.com\nAddress: 0x1234\nTimestamp: ..."
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

**Errors:** 400 (invalid input, bad sponsor code), 401 (bad signature), 409 (email/wallet exists)

---

### POST /auth/register-email

Register with email only (legacy, sponsor optional).

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepass123",
  "sponsorCode": "ABC123"
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

**Errors:** 400 (invalid input), 409 (email exists)

---

### POST /auth/verify-email

**Request:**
```json
{ "token": "hex-token-from-email" }
```

**Response (200):**
```json
{
  "success": true,
  "status": "CONFIRMED",
  "message": "Email verified. Account is active."
}
```

---

### POST /auth/challenge

Get a challenge message for wallet signature authentication.

**Request:**
```json
{ "address": "0x1234...abcd" }
```

**Response (200):**
```json
{
  "message": "Sign this message to authenticate with BitTON.AI\n\nNonce: ...",
  "nonce": "hex-nonce"
}
```

---

### POST /auth/verify

Verify wallet signature and issue JWT. **Requires existing registered account.**

**Request:**
```json
{
  "address": "0x1234...abcd",
  "signature": "0xdeadbeef...",
  "message": "Sign this message..."
}
```

**Response (200):**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "status": "CONFIRMED",
    "evmAddress": "0x1234...abcd"
  }
}
```

**Errors:** 401 (bad signature/expired challenge), 403 (account not confirmed), 404 (no account for wallet)

---

### POST /auth/login-email

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepass123"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "status": "CONFIRMED",
    "evmAddress": "0x..."
  }
}
```

**Errors:** 401 (wrong credentials), 403 (email not verified)

---

### POST /auth/refresh

Issue a new access token from a valid refresh token.

**Request:**
```json
{ "refreshToken": "eyJ..." }
```

**Response (200):**
```json
{
  "accessToken": "eyJ...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "status": "CONFIRMED",
    "evmAddress": "0x..."
  }
}
```

**Errors:** 401 (invalid/expired/revoked refresh token)

---

### POST /auth/logout

Revoke a refresh token.

**Request:**
```json
{ "refreshToken": "eyJ..." }
```

**Response (200):**
```json
{ "success": true }
```

---

### POST /auth/sponsor/confirm (JWT required)

**Request:**
```json
{ "userId": "uuid-of-pending-user" }
```

**Response (200):**
```json
{ "success": true, "status": "CONFIRMED" }
```

**Errors:** 403 (not the sponsor), 400 (wrong status)

---

### POST /auth/link-email (JWT required)

**Request:**
```json
{
  "email": "new@example.com",
  "password": "securepass123"
}
```

**Response (200):**
```json
{ "success": true, "message": "Verification email sent to linked address" }
```

---

### POST /auth/link-wallet (JWT required)

**Request:**
```json
{
  "address": "0x1234...abcd",
  "signature": "0x...",
  "message": "Sign this message..."
}
```

**Response (200):**
```json
{ "success": true, "evmAddress": "0x1234...abcd" }
```

---

## Sponsor Endpoints

### POST /sponsor/code/create (JWT required)

**Request:**
```json
{ "code": "MY-CODE", "maxUses": 10 }
```

**Response (201):**
```json
{ "success": true, "code": "MY-CODE", "maxUses": 10 }
```

### GET /sponsor/code/:code

**Response (200):**
```json
{
  "code": "MY-CODE",
  "active": true,
  "maxUses": 10,
  "usedCount": 3,
  "available": true,
  "sponsorId": "uuid"
}
```

---

## Migration Endpoints

### GET /migration/status/:evmAddress

**Response (200):**
```json
{
  "evmAddress": "0x...",
  "onChainMigrated": false,
  "claim": { "status": "PENDING", "amount": "1000", "txHash": null },
  "userExists": true
}
```

### POST /migration/link-wallet

**Request:**
```json
{
  "tonAddress": "EQ...",
  "evmAddress": "0x...",
  "signature": "base64-sig"
}
```

---

## Admin Endpoints (x-api-key required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/status` | System overview |
| POST | `/admin/ton/import-snapshot` | Import TON snapshot |
| POST | `/admin/migration/build` | Build migration claims |
| POST | `/admin/jobs/dispatch` | Dispatch migration batches |
| POST | `/admin/jobs/distribute` | Create distribute job |
| GET | `/admin/jobs?page=1&limit=20&status=PENDING` | List jobs |
| GET | `/admin/audit?limit=50` | Audit log |

---

## Dashboard Endpoints

### GET /api/dashboard/:address

Returns user dashboard data including contract state.

### GET /api/dashboard/:address/history

Returns transaction history for a user.

---

## Health

### GET /health

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2026-03-05T...",
  "chain": { "chainId": 84532, "blockNumber": 12345 },
  "relayer": { "address": "0x...", "ethBalance": 0.5 },
  "db": "connected"
}
```

## Authentication

- **JWT**: Pass `Authorization: Bearer <accessToken>` header
- **Admin**: Pass `x-api-key: <key>` header
- **Rate limits**: Auth endpoints: 20 req/15min; Login: 10 req/15min
