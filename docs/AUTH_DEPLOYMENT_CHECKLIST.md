# Auth Deployment Checklist — BitTON.AI

## Environment Variables (Required)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (Neon) |
| `AUTH_SECRET` | Yes (prod) | JWT signing secret (min 32 chars) |
| `RPC_URL` | Yes | Base Sepolia RPC endpoint |
| `CHAIN_ID` | Yes | 84532 (Base Sepolia) |
| `RELAYER_PRIVATE_KEY` | Yes | Relayer wallet private key |
| `BTN_TOKEN_ADDRESS` | Yes | BTN token contract address |
| `CUSTODIAL_ADDRESS` | Yes | Custodial distribution contract |
| `APP_URL` | Yes | Frontend URL (for CORS) |
| `EMAIL_API_KEY` | Recommended | Resend API key for OTP emails |
| `EMAIL_API_PROVIDER` | Optional | `resend` (default) or `sendgrid` |
| `TELEGRAM_BOT_TOKEN` | Optional | Telegram bot token for Telegram auth |
| `TELEGRAM_BOT_USERNAME` | Optional | Telegram bot username |
| `ADMIN_API_KEY` | Yes | API key for admin endpoints |

## Pre-Deployment Steps

1. **Database setup**
   ```bash
   cd backend
   npx prisma db push        # Apply schema to production DB
   npx ts-node prisma/seed.ts # Create bootstrap user + sponsor code
   ```

2. **Build**
   ```bash
   cd backend && npm run build
   cd frontend && npm run build
   ```

3. **Verify env vars** — Backend validates required vars on startup and fails fast if missing.

4. **CORS** — Ensure `APP_URL` matches the deployed frontend URL exactly.

5. **Resend domain** — For production email, verify your domain in Resend dashboard. Until then, emails only send to the Resend account email (using onboarding@resend.dev).

## Backend Deployment (Render)

1. Set all env vars in Render dashboard
2. Build command: `npm install && npx prisma generate && npm run build`
3. Start command: `npm start`
4. Health check path: `/health`
5. Update `USDT_TOKEN_ADDRESS` to `0x69Bc9E30366888385f68cBB566EEb655CD5A34CC`

## Frontend Deployment (Vercel)

1. Set `NEXT_PUBLIC_API_URL` to the Render backend URL
2. Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (get from cloud.walletconnect.com)
3. Set `NEXT_PUBLIC_CHAIN` to `base-sepolia`
4. Root directory: `frontend`
5. Build command: `npm run build`

## Post-Deployment Verification

1. `GET /health` → should return `{"status":"ok",...}`
2. Open frontend → register page should load
3. Test wallet registration with `BITTON-ALPHA` sponsor code
4. Test wallet login (challenge → sign → verify)
5. Check `/admin/users` endpoint (with `x-api-key` header)

## Known Limitations

- **Render free tier**: Backend sleeps after 15 min inactivity. First request after sleep takes ~30s. Consider upgrading to paid plan.
- **Email**: Until Resend domain is verified, OTPs only work for the Resend account owner's email.
- **Telegram**: Requires bot domain configuration via @BotFather (`/setdomain`).
- **Oracle**: MockAggregator needs `setPrice()` called hourly to avoid staleness. Use `scripts/update-oracle.js`.
