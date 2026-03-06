# Backend Auth Setup Guide

## Overview

The authentication system supports 3 registration and 3 login methods. All methods require an EVM wallet signature as the final step.

## Quick Start

```bash
cd backend
npm install
cp .env.example .env   # edit with your values
npx prisma db push     # create/update database tables
npm run dev             # start on port 3001
```

## Environment Variables Required

### Minimum (wallet-only auth works)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | SQLite database path | `file:./dev.db` |
| `AUTH_SECRET` | JWT signing secret (use a strong random string) | `openssl rand -hex 32` |
| `RPC_URL` | Base Sepolia RPC endpoint | `https://sepolia.base.org` |
| `RELAYER_PRIVATE_KEY` | Operator wallet private key | `0x...` |
| `BTN_TOKEN_ADDRESS` | Deployed BTN token address | `0x...` |
| `CUSTODIAL_ADDRESS` | Deployed custodial contract address | `0x...` |

### For Email OTP Auth

| Variable | Description | Example |
|----------|-------------|---------|
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` (TLS) or `465` (SSL) |
| `SMTP_USER` | SMTP username/email | `noreply@bitton.ai` |
| `SMTP_PASS` | SMTP password or app password | `your-app-password` |
| `SMTP_FROM` | "From" address in emails | `noreply@bitton.ai` |

**Recommended SMTP providers:**
- **Gmail**: Use an App Password (enable 2FA first). Set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`
- **SendGrid**: Use API key as password. Set `SMTP_HOST=smtp.sendgrid.net`, `SMTP_PORT=587`
- **Mailgun**: Use SMTP credentials from Mailgun dashboard
- **AWS SES**: Use SMTP credentials from SES console

**Dev mode:** If `SMTP_HOST` is empty, OTP codes are logged to the console instead of being sent. Look for `[DEV EMAIL]` log lines.

### For Telegram Auth

| Variable | Description | How to get it |
|----------|-------------|---------------|
| `TELEGRAM_BOT_TOKEN` | Bot API token | Create a bot via [@BotFather](https://t.me/BotFather) on Telegram |
| `TELEGRAM_BOT_USERNAME` | Bot username (without @) | Set during bot creation via BotFather |

**How to create a Telegram Bot:**
1. Open Telegram, search for `@BotFather`
2. Send `/newbot`
3. Choose a name (e.g., "BitTON Auth")
4. Choose a username (e.g., `bitton_auth_bot`)
5. BotFather gives you a token like `123456:ABC-DEF...`
6. Send `/setdomain` to BotFather, select your bot, enter your frontend domain (e.g., `app.bitton.ai`)
7. Set `TELEGRAM_BOT_TOKEN=123456:ABC-DEF...` and `TELEGRAM_BOT_USERNAME=bitton_auth_bot` in `.env`

**Important:** The domain in BotFather must match where your frontend is hosted. For local development, you can use `localhost` but the Telegram widget may not work in all browsers on localhost.

## API Endpoints

### Registration

#### 1. Register via EVM Wallet
```
POST /auth/register/wallet
Body: { address, signature, message, sponsorCode }
Response: { accessToken, refreshToken, user }
```
Single-step: connect wallet, sign message, provide sponsor code.

#### 2. Register via Email (3 steps)
```
Step 1: POST /auth/register/email/init
Body: { email }
Response: { sessionId, message }

Step 2: POST /auth/verify-otp
Body: { sessionId, otp }
Response: { sessionId, verified, message }

Step 3: POST /auth/register/email/complete
Body: { sessionId, sponsorCode, address, signature, message }
Response: { accessToken, refreshToken, user }
```

#### 3. Register via Telegram (2 steps)
```
Step 1: POST /auth/register/telegram/init
Body: { id, first_name, username, auth_date, hash, ... }  (Telegram widget data)
Response: { sessionId, telegramUser, message }

Step 2: POST /auth/register/telegram/complete
Body: { sessionId, sponsorCode, address, signature, message }
Response: { accessToken, refreshToken, user }
```

### Login

#### 1. Login via EVM Wallet (2 steps)
```
Step 1: POST /auth/login/wallet/challenge
Body: { address }
Response: { message, nonce }

Step 2: POST /auth/login/wallet/verify
Body: { address, signature, message }
Response: { accessToken, refreshToken, user }
```

#### 2. Login via Email (3 steps)
```
Step 1: POST /auth/login/email/init
Body: { email }
Response: { sessionId, message }

Step 2: POST /auth/verify-otp
Body: { sessionId, otp }
Response: { sessionId, verified, message }

Step 3: POST /auth/login/email/complete
Body: { sessionId, address, signature, message }
Response: { accessToken, refreshToken, user }
```

#### 3. Login via Telegram (2 steps)
```
Step 1: POST /auth/login/telegram/init
Body: { id, first_name, username, auth_date, hash, ... }
Response: { sessionId, message }

Step 2: POST /auth/login/telegram/complete
Body: { sessionId, address, signature, message }
Response: { accessToken, refreshToken, user }
```

### Shared Endpoints
```
POST /auth/verify-otp         - Verify OTP code (shared for email register + login)
POST /auth/resend-otp          - Resend OTP code
POST /auth/refresh             - Refresh access token
POST /auth/logout              - Revoke refresh token
GET  /auth/telegram/config     - Get Telegram bot config for frontend widget
```

## Database Schema Changes

New tables added:
- `pending_sessions` - Tracks multi-step registration/login flows (expires after 30 min)
- `otp_codes` - Stores OTP codes (expires after 10 min, max 5 attempts)

User table changes:
- Added `telegram_id` (unique, optional)
- Added `auth_method` (WALLET | EMAIL | TELEGRAM)

Run `npx prisma db push` to apply changes.

## Uniqueness Rules

1. **Email** - Must be unique across all users
2. **EVM Wallet Address** - Must be unique across all users
3. **Telegram ID** - Must be unique across all users
4. A user cannot use the same wallet/email/telegram across different accounts

## Security Notes

- OTP codes expire after 10 minutes
- Max 5 OTP verification attempts before lockout
- Pending sessions expire after 30 minutes
- Rate limiting: 5 OTP requests per 15 min, 20 auth requests per 15 min
- Wallet challenges expire after 5 minutes
- In-memory nonce store (use Redis for production multi-instance deployments)
- Passwords are NOT used in the new flow (legacy support only)
