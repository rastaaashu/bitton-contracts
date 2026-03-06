# Auth Test Matrix — BitTON.AI

## Unit Tests (`auth.test.ts`) — 29 tests

| Category | Test | Status |
|----------|------|--------|
| Validation | registerEmailSchema accepts valid input | PASS |
| Validation | registerEmailSchema with optional sponsor | PASS |
| Validation | registerEmailSchema rejects invalid email | PASS |
| Validation | registerEmailSchema rejects short password | PASS |
| Validation | verifyEmailSchema accepts valid token | PASS |
| Validation | verifyEmailSchema rejects empty token | PASS |
| Validation | loginEmailSchema accepts valid credentials | PASS |
| Validation | loginEmailSchema rejects missing password | PASS |
| Validation | challengeSchema accepts valid EVM address | PASS |
| Validation | challengeSchema rejects invalid address | PASS |
| Validation | challengeSchema rejects short address | PASS |
| Validation | walletVerifySchema accepts valid params | PASS |
| Validation | walletVerifySchema rejects missing signature | PASS |
| Validation | linkEmailSchema accepts valid input | PASS |
| Validation | createSponsorCodeSchema accepts valid code | PASS |
| Validation | createSponsorCodeSchema rejects special chars | PASS |
| Validation | createSponsorCodeSchema rejects too short | PASS |
| Validation | createSponsorCodeSchema defaults maxUses to 0 | PASS |
| JWT | signAccessToken produces valid JWT | PASS |
| JWT | signRefreshToken produces valid JWT | PASS |
| JWT | access token has expiry | PASS |
| JWT | wrong secret throws | PASS |
| Password | hashes and verifies password | PASS |
| Password | rejects wrong password | PASS |
| Status Flow | email without sponsor → CONFIRMED | PASS |
| Status Flow | email with sponsor → PENDING_SPONSOR → CONFIRMED | PASS |
| Status Flow | wallet immediately CONFIRMED | PASS |
| Token Gen | generates unique tokens | PASS |
| Token Gen | token expiry is 24h in the future | PASS |

## Integration Tests (`auth-integration.test.ts`) — 23 tests

| Category | Test | Status |
|----------|------|--------|
| Wallet Reg | Register new user via wallet | PASS |
| Wallet Reg | Reject duplicate wallet | PASS |
| Wallet Reg | Reject invalid signature | PASS |
| Wallet Reg | Reject invalid sponsor code | PASS |
| Wallet Reg | Auto-create sponsor code for new user | PASS |
| Wallet Reg | Accept wallet address as sponsor reference | PASS |
| Wallet Login | Challenge → sign → verify login | PASS |
| Wallet Login | Reject wrong message (not matching challenge) | PASS |
| Wallet Login | Reject unregistered wallet | PASS |
| Token | Refresh with rotation (old revoked) | PASS |
| Token | Logout revokes refresh token | PASS |
| Sponsor | Validate existing sponsor code | PASS |
| Sponsor | Validate wallet address as sponsor | PASS |
| Sponsor | Reject non-existent code | PASS |
| Sponsor | Reject non-existent wallet | PASS |
| Email Reg | Init session and get sessionId | PASS |
| Email Reg | Verify OTP from database | PASS |
| Email Reg | Complete with wallet signature | PASS |
| Email Reg | Reject duplicate email | PASS |
| Persistence | Users saved in database | PASS |
| Persistence | Sponsor relationships persisted | PASS |
| Persistence | Audit logs for auth events | PASS |
| Persistence | lastLoginAt tracked | PASS |

## How to Run

```bash
# Unit tests only (no server needed)
cd backend && npm test

# Integration tests (requires running server)
cd backend
NODE_ENV=test npx ts-node src/index.ts &
sleep 5
NODE_ENV=test npx jest src/__tests__/auth-integration.test.ts --forceExit
```
