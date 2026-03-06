# BitTON.AI Backend

Node.js + TypeScript + Express + PostgreSQL + Prisma + ethers.js

## Quick Start

```bash
# 1. Start Postgres
docker compose up -d

# 2. Install deps
npm install

# 3. Generate Prisma client
npx prisma generate

# 4. Push schema to DB
npx prisma db push

# 5. Copy env file
cp ../.env.example .env
# Edit .env with your values

# 6. Run dev server
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (ts-node) |
| `npm run build` | Compile TypeScript to dist/ |
| `npm start` | Run compiled dist/index.js |
| `npm test` | Run Jest test suite |
| `npx prisma studio` | Open Prisma DB browser |

## Auth Flows

### Email Registration
1. `POST /auth/register-email` — email + password + optional sponsorCode
2. `POST /auth/verify-email` — token from email
3. `POST /auth/sponsor/confirm` — sponsor confirms referral (JWT required)
4. `POST /auth/login-email` — returns JWT access + refresh tokens

### Wallet Authentication
1. `POST /auth/challenge` — get sign message for an EVM address
2. `POST /auth/verify` — submit signature → returns JWT tokens

### Account Linking
- `POST /auth/link-email` — attach email to wallet-only account (JWT required)
- `POST /auth/link-wallet` — attach wallet to email-only account (JWT required)

### Sponsor Codes
- `POST /sponsor/code/create` — create a sponsor code (JWT required)
- `GET /sponsor/code/:code` — check code validity (public)

## User Status Flow

```
Email (no sponsor):   PENDING_EMAIL → verify email → CONFIRMED
Email (with sponsor): PENDING_EMAIL → verify email → PENDING_SPONSOR → sponsor confirms → CONFIRMED
Wallet-only:          → CONFIRMED (immediate)
```

## API Endpoints

### Public

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (DB, RPC, relayer status) |
| POST | `/auth/register-email` | Register with email + password |
| POST | `/auth/verify-email` | Verify email token |
| POST | `/auth/login-email` | Login with email + password |
| POST | `/auth/challenge` | Request wallet sign-in challenge |
| POST | `/auth/verify` | Verify wallet signature |
| GET | `/sponsor/code/:code` | Check sponsor code validity |
| GET | `/migration/status/:evmAddress` | Check migration status |
| POST | `/migration/link-wallet` | Link TON wallet to EVM wallet |

### Authenticated (requires Bearer JWT)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/sponsor/confirm` | Confirm a referral |
| POST | `/auth/link-email` | Link email to wallet account |
| POST | `/auth/link-wallet` | Link wallet to email account |
| POST | `/sponsor/code/create` | Create a sponsor code |

### Admin (requires `x-api-key` header)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/status` | System overview (on-chain + DB stats) |
| POST | `/admin/ton/import-snapshot` | Import TON balance snapshot |
| POST | `/admin/migration/build` | Build claims from linked wallets |
| POST | `/admin/jobs/dispatch` | Dispatch pending migration batches |
| POST | `/admin/jobs/distribute` | Create a distribute job |
| GET | `/admin/jobs` | List operator jobs (paginated) |
| GET | `/admin/audit` | View audit log |

## Architecture

```
backend/
├── prisma/
│   └── schema.prisma           # DB schema
├── src/
│   ├── config/
│   │   ├── env.ts              # Environment variable loading
│   │   └── contracts.ts        # ethers.js contract instances
│   ├── routes/
│   │   ├── health.ts           # Health check
│   │   ├── auth.ts             # Email + wallet authentication
│   │   ├── sponsor.ts          # Sponsor code management
│   │   ├── admin.ts            # Admin endpoints
│   │   └── migration.ts        # Migration status + wallet linking
│   ├── services/
│   │   ├── chain.service.ts    # On-chain operations
│   │   ├── email.service.ts    # Email sending (SMTP / dev console)
│   │   └── migration.service.ts # TON→Base migration pipeline
│   ├── jobs/
│   │   └── operator.runner.ts  # Background job runner
│   ├── middleware/
│   │   ├── adminAuth.ts        # API key auth
│   │   └── jwtAuth.ts          # JWT verification middleware
│   ├── utils/
│   │   ├── logger.ts           # Winston logger
│   │   ├── prisma.ts           # Prisma client singleton
│   │   └── validation.ts       # Zod schemas
│   ├── __tests__/
│   │   ├── setup.ts            # Test environment setup
│   │   └── auth.test.ts        # Auth unit tests (29 tests)
│   └── index.ts                # Express app entry point
├── docker-compose.yml          # Postgres for local dev
├── jest.config.js              # Jest configuration
└── package.json
```

## Operator Job Runner

Background job runner polls for pending jobs and executes on-chain:
- Automatic retry (up to 3 attempts)
- Idempotency keys prevent duplicates
- Status tracking: PENDING → PROCESSING → CONFIRMED / FAILED
- Audit logging for all operations

## Environment Variables

See `.env.example` in the project root for all required variables.
