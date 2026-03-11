# BitTON.AI — Environment Configuration Reference
**For: DevOps Team**
**Date: 2026-03-11**
**Classification: CONFIDENTIAL — Contains secrets and private keys**

---

## Overview

The BitTON.AI platform has 3 components that each need their own environment configuration:

| Component | File | Hosting | Location |
|-----------|------|---------|----------|
| Backend API | `backend/.env` | Render | `backend/` directory |
| Frontend | `frontend/.env.local` | Vercel | `frontend/` directory |
| Smart Contracts (Hardhat) | `.env` | Local / CI | Root directory |

---

## 1. Backend API — `backend/.env`

This is the main configuration. Deploy on Render (or any Node.js host).

```bash
# ═══════════════════════════════════════════════════════════
# BitTON.AI Backend — Environment Variables
# ═══════════════════════════════════════════════════════════

# ─── Server ───────────────────────────────────────────────
NODE_ENV=production
PORT=3001

# ─── Database (Neon PostgreSQL) ───────────────────────────
# Connection string with SSL. Get from Neon dashboard.
# Format: postgresql://user:password@host/dbname?sslmode=require
DATABASE_URL="postgresql://neondb_owner:npg_dTaVveA7MNQ9@ep-solitary-pond-ai53mrwc-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# ─── Blockchain (Base Sepolia Testnet) ────────────────────
RPC_URL=https://sepolia.base.org
CHAIN_ID=84532
# Relayer wallet private key — this wallet signs on-chain transactions
# (migration, distribution, settlement). Must have ETH for gas.
# CURRENT KEY IS A PLACEHOLDER — replace with funded wallet for production
RELAYER_PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000001

# ─── Contract Addresses (Base Sepolia — already deployed) ─
BTN_TOKEN_ADDRESS=0x5b964baafEDf002e5364F37848DCa1908D3e4e9f
USDT_TOKEN_ADDRESS=0x69Bc9E30366888385f68cBB566EEb655CD5A34CC
CUSTODIAL_ADDRESS=0x71dB030B792E9D4CfdCC7e452e0Ff55CdB5A4D99
VAULT_MANAGER_ADDRESS=0xA2b5ffe829441768E8BB8Be49f8ADee0041Fa1b0
STAKING_VAULT_ADDRESS=0x50d1516D6d5A4930623BCb7e1Ed28e9fAeA1e82F
REWARD_ENGINE_ADDRESS=0xa86F6abB543b3fa6a2E2cC001870cF60a04c7f31
VESTING_POOL_ADDRESS=0xa3DC3351670E253d22B783109935fe0B9a11b830
WITHDRAWAL_WALLET_ADDRESS=0xA06238c206C2757AD3f1572464bf720161519eC5
BONUS_ENGINE_ADDRESS=0xFD57598058EC849980F87F0f44bb019A73a0EfC7

# ─── Authentication ───────────────────────────────────────
# JWT signing secret — MUST be 64+ chars, random, unique per environment
# Generate with: openssl rand -base64 64
AUTH_SECRET=F41xkFrN318PPj16zSPPic08warh5gk0qHVnWtqXGr1XPMNxPVauoxlsAcfF5jIU
# Token expiry
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
# Admin API key for /admin/* endpoints
# Used as X-API-Key header
ADMIN_API_KEY=bitton-admin-2024-secure

# ─── Email (choose ONE method) ────────────────────────────
# Option A: HTTP API (recommended for Render — SMTP ports blocked)
EMAIL_API_KEY=
EMAIL_API_PROVIDER=resend
# Supported providers: "resend" (re_xxx key) or "sendgrid" (sg_xxx key)

# Option B: SMTP (if your host allows port 587/465)
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=apikey
# SMTP_PASS=your-smtp-password

# Sender address for all outbound emails
SMTP_FROM=noreply@bitton.ai

# ─── Telegram Bot ─────────────────────────────────────────
# Get from @BotFather on Telegram
TELEGRAM_BOT_TOKEN=8468894519:AAEC5umtGjpL9z6dIcAzZGpC2wRsRqhI_y4
TELEGRAM_BOT_USERNAME=bitton_auth_bot

# ─── Application ──────────────────────────────────────────
# Frontend URL — used for CORS whitelist and Telegram widget domain
APP_URL=https://bitton-contracts.vercel.app
```

---

## 2. Frontend — `frontend/.env.local`

Deploy on Vercel. All vars must be prefixed with `NEXT_PUBLIC_` to be accessible in browser.

```bash
# ═══════════════════════════════════════════════════════════
# BitTON.AI Frontend — Environment Variables
# ═══════════════════════════════════════════════════════════

# WalletConnect Project ID — get from https://cloud.walletconnect.com
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=2155b61f6636859efa6bcad974128e06

# Target blockchain network
NEXT_PUBLIC_CHAIN=base-sepolia

# Backend API URL — must match where backend is deployed
NEXT_PUBLIC_API_URL=https://bitton-backend.onrender.com
```

---

## 3. Smart Contracts (Hardhat) — `.env` (root)

Used for deploying and verifying contracts. Only needed on developer/CI machines.

```bash
# ═══════════════════════════════════════════════════════════
# BitTON.AI Hardhat — Environment Variables
# ═══════════════════════════════════════════════════════════

# Deployer wallet private key (with 0x prefix)
PRIVATE_KEY=74802e9f7b276ac46a0a1fa6129317eb70e80a4c2d1fa91e82b7adc85d15a1c7

# Base Sepolia network
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_SEPOLIA_PRIVATE_KEY=0x74802e9f7b276ac46a0a1fa6129317eb70e80a4c2d1fa91e82b7adc85d15a1c7

# Basescan API key — for contract verification
BASESCAN_API_KEY=WMC791K6SY5RJSQAMPCDSP2KC5VKA2G5GB

# ─── Contract Addresses (Base Sepolia — already deployed) ─
BTN_TOKEN_ADDRESS=0x5b964baafEDf002e5364F37848DCa1908D3e4e9f
USDT_TOKEN_ADDRESS=0x69Bc9E30366888385f68cBB566EEb655CD5A34CC
ORACLE_ADDRESS=0xf1DC093E1B3fD72A1C7f1B58bd3cE8A4832BEe52
TREASURY_ADDRESS=0x1DaE2C7aeC8850f1742fE96045c23d1AaE3FCf2A

# Initial reward pool funding amount (in BTN, no decimals)
REWARD_FUND_AMOUNT=10000
```

---

## 4. Render Dashboard Settings

If deploying backend via Render dashboard (not render.yaml), set these env vars manually:

| Key | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | Required |
| `DATABASE_URL` | `postgresql://neondb_owner:npg_dTaVveA7MNQ9@ep-solitary-pond-ai53mrwc-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require` | Neon connection string |
| `RPC_URL` | `https://sepolia.base.org` | Base Sepolia RPC |
| `CHAIN_ID` | `84532` | Base Sepolia chain ID |
| `RELAYER_PRIVATE_KEY` | `0x000...001` | **Replace with funded wallet** |
| `BTN_TOKEN_ADDRESS` | `0x5b964baafEDf002e5364F37848DCa1908D3e4e9f` | BTN ERC20 |
| `USDT_TOKEN_ADDRESS` | `0x69Bc9E30366888385f68cBB566EEb655CD5A34CC` | USDT mock |
| `CUSTODIAL_ADDRESS` | `0x71dB030B792E9D4CfdCC7e452e0Ff55CdB5A4D99` | Distribution contract |
| `VAULT_MANAGER_ADDRESS` | `0xA2b5ffe829441768E8BB8Be49f8ADee0041Fa1b0` | Vault tiers |
| `STAKING_VAULT_ADDRESS` | `0x50d1516D6d5A4930623BCb7e1Ed28e9fAeA1e82F` | Staking |
| `REWARD_ENGINE_ADDRESS` | `0xa86F6abB543b3fa6a2E2cC001870cF60a04c7f31` | Rewards |
| `VESTING_POOL_ADDRESS` | `0xa3DC3351670E253d22B783109935fe0B9a11b830` | Vesting |
| `WITHDRAWAL_WALLET_ADDRESS` | `0xA06238c206C2757AD3f1572464bf720161519eC5` | Withdrawals |
| `BONUS_ENGINE_ADDRESS` | `0xFD57598058EC849980F87F0f44bb019A73a0EfC7` | Bonuses |
| `AUTH_SECRET` | `F41xkFrN318P...` | **64+ char random string** |
| `JWT_ACCESS_EXPIRY` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRY` | `7d` | Refresh token lifetime |
| `ADMIN_API_KEY` | `bitton-admin-2024-secure` | For /admin/* endpoints |
| `EMAIL_API_KEY` | *(set when available)* | Resend or SendGrid key |
| `EMAIL_API_PROVIDER` | `resend` | `resend` or `sendgrid` |
| `SMTP_FROM` | `noreply@bitton.ai` | Sender email |
| `TELEGRAM_BOT_TOKEN` | `8468894519:AAEC5umtGjpL9z6dIcAzZGpC2wRsRqhI_y4` | From @BotFather |
| `TELEGRAM_BOT_USERNAME` | `bitton_auth_bot` | Bot username |
| `APP_URL` | `https://bitton-contracts.vercel.app` | Frontend URL for CORS |

---

## 5. Vercel Dashboard Settings

Set in Vercel project → Settings → Environment Variables:

| Key | Value | Notes |
|-----|-------|-------|
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | `2155b61f6636859efa6bcad974128e06` | WalletConnect cloud |
| `NEXT_PUBLIC_CHAIN` | `base-sepolia` | Network |
| `NEXT_PUBLIC_API_URL` | `https://bitton-backend.onrender.com` | Backend URL |

---

## 6. All Contract Addresses (Quick Reference)

| Contract | Address | Explorer |
|----------|---------|----------|
| BTN Token | `0x5b964baafEDf002e5364F37848DCa1908D3e4e9f` | [BaseScan](https://sepolia.basescan.org/address/0x5b964baafEDf002e5364F37848DCa1908D3e4e9f) |
| USDT Token | `0x69Bc9E30366888385f68cBB566EEb655CD5A34CC` | [BaseScan](https://sepolia.basescan.org/address/0x69Bc9E30366888385f68cBB566EEb655CD5A34CC) |
| VaultManager | `0xA2b5ffe829441768E8BB8Be49f8ADee0041Fa1b0` | [BaseScan](https://sepolia.basescan.org/address/0xA2b5ffe829441768E8BB8Be49f8ADee0041Fa1b0) |
| StakingVault | `0x50d1516D6d5A4930623BCb7e1Ed28e9fAeA1e82F` | [BaseScan](https://sepolia.basescan.org/address/0x50d1516D6d5A4930623BCb7e1Ed28e9fAeA1e82F) |
| RewardEngine | `0xa86F6abB543b3fa6a2E2cC001870cF60a04c7f31` | [BaseScan](https://sepolia.basescan.org/address/0xa86F6abB543b3fa6a2E2cC001870cF60a04c7f31) |
| VestingPool | `0xa3DC3351670E253d22B783109935fe0B9a11b830` | [BaseScan](https://sepolia.basescan.org/address/0xa3DC3351670E253d22B783109935fe0B9a11b830) |
| WithdrawalWallet | `0xA06238c206C2757AD3f1572464bf720161519eC5` | [BaseScan](https://sepolia.basescan.org/address/0xA06238c206C2757AD3f1572464bf720161519eC5) |
| BonusEngine | `0xFD57598058EC849980F87F0f44bb019A73a0EfC7` | [BaseScan](https://sepolia.basescan.org/address/0xFD57598058EC849980F87F0f44bb019A73a0EfC7) |
| Oracle | `0xf1DC093E1B3fD72A1C7f1B58bd3cE8A4832BEe52` | [BaseScan](https://sepolia.basescan.org/address/0xf1DC093E1B3fD72A1C7f1B58bd3cE8A4832BEe52) |
| Treasury | `0x1DaE2C7aeC8850f1742fE96045c23d1AaE3FCf2A` | [BaseScan](https://sepolia.basescan.org/address/0x1DaE2C7aeC8850f1742fE96045c23d1AaE3FCf2A) |
| CustodialDistribution | `0x71dB030B792E9D4CfdCC7e452e0Ff55CdB5A4D99` | [BaseScan](https://sepolia.basescan.org/address/0x71dB030B792E9D4CfdCC7e452e0Ff55CdB5A4D99) |

---

## 7. Key Wallet Addresses

| Role | Address | Notes |
|------|---------|-------|
| Admin / Treasury | `0x1DaE2C7aeC8850f1742fE96045c23d1AaE3FCf2A` | Contract owner, fee collector |
| Relayer | Derived from `RELAYER_PRIVATE_KEY` | Signs operator transactions (migration, distribution) |
| Deployer | Derived from `PRIVATE_KEY` | Used for Hardhat deployments |

---

## 8. Build & Start Commands

### Backend (Render)
```bash
# Build command
npm install && npx prisma generate && npx prisma db push --skip-generate && npm run build

# Start command
npm run start

# Health check path
/health
```

### Frontend (Vercel)
```bash
# Build command
npm install && npm run build

# Output directory
.next
```

### Smart Contracts (Local/CI)
```bash
# Install
npm install

# Compile
npx hardhat compile

# Test
npx hardhat test

# Deploy
npx hardhat run scripts/deploy-all.js --network base_sepolia

# Verify
npx hardhat run scripts/verify-all.js --network base_sepolia
```

---

## 9. Production Checklist (Before Mainnet)

| # | Item | Status | Action |
|---|------|--------|--------|
| 1 | Replace `RELAYER_PRIVATE_KEY` with funded wallet | Pending | Generate new key, fund with ETH |
| 2 | Rotate `AUTH_SECRET` to new random value | Pending | `openssl rand -base64 64` |
| 3 | Rotate `ADMIN_API_KEY` to strong random value | Pending | Generate secure key |
| 4 | Set up email provider (Resend/SendGrid) | Pending | Get API key, set `EMAIL_API_KEY` |
| 5 | Upgrade Render to paid tier (prevent sleep) | Pending | Upgrade plan |
| 6 | Set up monitoring/alerting | Pending | Health check pings |
| 7 | Replace mock oracle with real Chainlink feed | Pending | Deploy on mainnet |
| 8 | Redeploy contracts on Base mainnet | Pending | New addresses needed |
| 9 | Update all contract addresses in env | Pending | After mainnet deploy |
| 10 | Set `NEXT_PUBLIC_CHAIN=base` for mainnet | Pending | Frontend env update |
| 11 | Update `RPC_URL` to mainnet RPC | Pending | `https://mainnet.base.org` or Alchemy |
| 12 | Update `CHAIN_ID` to `8453` (Base mainnet) | Pending | Backend env update |
| 13 | Set custom domain for frontend | Pending | Configure in Vercel |
| 14 | Set custom domain for backend API | Pending | Configure in Render |
| 15 | Update `APP_URL` to match new domain | Pending | CORS + Telegram widget |
