# BitTON.AI — Backend API Reference

 (dev) | `https://api.bitton.ai` (prod)

## Auth Endpoints

### POST /auth/register-email

Register a new user with email.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepass123",
  "sponsorCode": "ABC123"  // optional
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
  "status": "PENDING_SPONSOR",
  "message": "Email verified. Waiting for sponsor confirmation."
}
```

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
    "evmAddress": null
  }
}
```

**Errors:** 401 (wrong credentials), 403 (email not verified)

---

### POST /auth/challenge

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
    "email": null,
    "status": "CONFIRMED",
    "evmAddress": "0x1234...abcd"
  }
}
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

## Health

### GET /health

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2026-03-02T...",
  "chain": { "chainId": 84532, "blockNumber": 12345 },
  "relayer": { "address": "0x...", "ethBalance": 0.5 },
  "db": "connected"
}
```

## Authentication

- **JWT**: Pass `Authorization: Bearer <accessToken>` header
- **Admin**: Pass `x-api-key: <key>` header
- **Rate limits**: Auth endpoints: 20 req/15min; Login: 10 req/15min
