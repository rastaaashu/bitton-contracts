# Phase 4 - API & Contract Mapping

## Backend API Endpoints

### Existing (Already Working)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /auth/register-email | Register with email + password + sponsor code |
| POST | /auth/verify-email | Verify email token |
| POST | /auth/login-email | Login with email/password → JWT |
| POST | /auth/challenge | Get wallet sign message |
| POST | /auth/verify | Verify wallet signature → JWT |
| POST | /auth/link-email | Link email to wallet account |
| POST | /auth/link-wallet | Link wallet to email account |
| POST | /auth/sponsor/confirm | Confirm sponsored user |
| POST | /sponsor/code/create | Create sponsor code |
| GET | /sponsor/code/:code | Get sponsor code info |
| GET | /health | Health check |

### New (Added for Frontend)
| Method | Endpoint | Purpose | Data Source |
|--------|----------|---------|-------------|
| GET | /api/dashboard/:address | Aggregated dashboard data | On-chain reads (btnToken, stakingVault, vestingPool, withdrawalWallet, vaultManager) |
| GET | /api/stakes/:address | User's stake positions + pending rewards | stakingVault.getStakes + rewardEngine.calculateReward |
| GET | /api/bonuses/:address | Direct + matching bonus history | BonusEngine events (DirectBonusProcessed, MatchingBonusProcessed) |
| GET | /api/referrals/:address | Referrer + downline info | bonusEngine.getReferrer, getDownline, getDownlineCount |
| GET | /api/history/:address | Full transaction history | All contract events for user |

### Admin Only
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /admin/ton/import-snapshot | Import TON snapshot |
| POST | /admin/migration/build | Build migration claims |
| POST | /admin/jobs/dispatch | Dispatch jobs |
| POST | /admin/jobs/distribute | Create distribution job |
| GET | /admin/jobs | List operator jobs |
| GET | /admin/status | System status |
| GET | /admin/audit | Audit logs |

## Smart Contract → API Response Mapping

### GET /api/dashboard/:address
```json
{
  "btnBalance": "1000000000",
  "usdtBalance": "500000000",
  "totalStaked": "5000000000",
  "vestedBalance": "200000000",
  "pendingRelease": "10000000",
  "withdrawableBalance": "50000000",
  "vaultActive": true,
  "vaultTier": 2,
  "pendingRewards": "30000000",
  "stakeCount": 3
}
```

### GET /api/stakes/:address
```json
{
  "stakes": [
    {
      "index": 0,
      "amount": "2000000000",
      "startTime": 1709312400,
      "programType": 0,
      "lastRewardTime": 1709312400,
      "active": true,
      "pendingReward": "10000000",
      "lockEnd": 1711904400,
      "isLocked": true,
      "daysRemaining": 15
    }
  ],
  "totalStaked": "5000000000"
}
```

### GET /api/bonuses/:address
```json
{
  "directBonuses": [
    {
      "staker": "0x...",
      "stakeAmount": "1000000000",
      "bonusAmount": "50000000",
      "timestamp": 1709312400,
      "txHash": "0x..."
    }
  ],
  "matchingBonuses": [
    {
      "downlineUser": "0x...",
      "bonusAmount": "5000000",
      "level": 1,
      "timestamp": 1709312400,
      "txHash": "0x..."
    }
  ]
}
```

### GET /api/referrals/:address
```json
{
  "referrer": "0x...",
  "downline": ["0x...", "0x..."],
  "downlineCount": 2,
  "isQualified": true,
  "vaultTier": 2,
  "matchingDepth": 5,
  "totalPersonalStake": "5000000000"
}
```

### GET /api/history/:address
```json
{
  "events": [
    {
      "type": "Staked",
      "amount": "1000000000",
      "timestamp": 1709312400,
      "txHash": "0x...",
      "blockNumber": 12345678,
      "details": "Short Staking"
    },
    {
      "type": "RewardSplit",
      "amount": "50000000",
      "timestamp": 1709917200,
      "txHash": "0x...",
      "blockNumber": 12345700,
      "details": "10% → 5000000, 90% → 45000000"
    }
  ]
}
```
