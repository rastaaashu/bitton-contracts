# Frontend Auth Setup Guide

## Overview

The frontend provides 3 registration methods and 3 login methods, matching the backend API. All methods end with EVM wallet connection + signature.

## Quick Start

```bash
cd frontend
npm install
cp .env.local.example .env.local   # edit with your values
npm run dev                         # start on port 3000
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect Cloud project ID | Yes |
| `NEXT_PUBLIC_CHAIN` | Chain identifier | Yes (`base-sepolia`) |
| `NEXT_PUBLIC_API_URL` | Backend API URL | Yes (`http://localhost:3001`) |

### How to get WalletConnect Project ID
1. Go to [cloud.walletconnect.com](https://cloud.walletconnect.com)
2. Create a new project
3. Copy the Project ID
4. Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id`

## Pages

### `/register?ref=SPONSOR_CODE`
Registration page with 3 tabs:
- **EVM Wallet**: Connect wallet -> Sign message -> Done
- **Email**: Enter email -> Verify OTP -> Connect wallet -> Sign -> Done
- **Telegram**: Telegram widget -> Connect wallet -> Sign -> Done

A `?ref=` query parameter (sponsor code) is **required** for registration. Without it, users see a "Referral Required" message.

### `/login`
Login page with 3 tabs:
- **EVM Wallet**: Connect wallet -> Sign challenge -> Done
- **Email**: Enter email -> Verify OTP -> Connect wallet -> Sign -> Done
- **Telegram**: Telegram widget -> Connect wallet -> Sign -> Done

## Auth Flow Details

### Token Storage
- Access token stored in `localStorage` as `bitton_access_token`
- Refresh token stored in `localStorage` as `bitton_refresh_token`
- On page load, the app attempts to refresh the session using the stored refresh token

### AuthContext
The `AuthProvider` component wraps the app and provides:
- `user` - Current user object (id, email, status, evmAddress, telegramId, authMethod)
- `accessToken` - Current JWT access token
- `isAuthenticated` - Boolean
- `isLoading` - True while checking stored session on mount
- `login(accessToken, refreshToken, user)` - Store tokens and set user
- `logout()` - Clear tokens and revoke refresh token
- `refreshAccessToken()` - Get new access token from refresh token

### Protected Routes
Use the `ProtectedRoute` component to wrap pages that require authentication. It redirects unauthenticated users to `/login`.

## Telegram Widget Setup

The Telegram Login Widget is automatically loaded from `telegram.org` when:
1. The backend has `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` configured
2. The frontend fetches `/auth/telegram/config` and gets `configured: true`

If Telegram is not configured, the Telegram tab shows a "not yet configured" message.

### Requirements for Telegram Widget to work:
1. A Telegram Bot created via @BotFather (see backend guide)
2. The domain must be set in BotFather using `/setdomain`
3. The frontend must be served over HTTPS in production (Telegram requires it)
4. For local development, the widget may work on `http://localhost` in some browsers

## Wallet Integration

Uses [RainbowKit](https://www.rainbowkit.com/) + [wagmi](https://wagmi.sh/) for wallet connection:
- MetaMask, WalletConnect, Coinbase Wallet, and other connectors
- Chain: Base Sepolia (testnet)
- Message signing via `useSignMessage` hook from wagmi

## What Needs to Be Done for Production

1. **WalletConnect Project ID** - Get one from cloud.walletconnect.com
2. **Backend API URL** - Point to your deployed backend
3. **HTTPS** - Required for Telegram widget and security
4. **Telegram Bot** - Create via BotFather, set domain
5. **SMTP** - Configure email provider for OTP delivery
