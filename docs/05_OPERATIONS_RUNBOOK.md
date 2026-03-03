# BitTON.AI — Operations Runbook

## Local Development

### Prerequisites
- Node.js 18+
- Docker (for Postgres)

### Smart Contracts
```bash
cd bitton-contracts
npm install
npx hardhat compile       # Compile all contracts
npx hardhat test          # Run 618 tests
npx hardhat coverage      # Generate coverage report
```

### Backend
```bash
cd backend
docker compose up -d      # Start Postgres
npm install
npx prisma generate       # Generate Prisma client
npx prisma db push        # Push schema to DB
npm run dev               # Start dev server on :3001
npm test                  # Run 29 auth tests
```

## Testnet Deployment (Base Sepolia)

### Deploy Contracts
```bash
# Set env vars in .env
npx hardhat run scripts/deploy-all.js --network base_sepolia
# Output: deployment-addresses.json

# Verify on Basescan
npx hardhat run scripts/verify-all.js --network base_sepolia
```

### Deploy Mocks (testnet only)
```bash
npx hardhat run scripts/deploy-mocks.js --network base_sepolia
```

### Run Smoke Test
```bash
npx hardhat run scripts/smoke-test.js --network base_sepolia
# Tests: balance, vault activation, staking, settlement, vesting, withdrawal, referrer, state
```

### CustodialDistribution
```bash
# Deploy
npx hardhat run scripts/deploy-custodial.js --network base_sepolia

# Run E2E test
npx hardhat run scripts/testnet-e2e-runbook.js --network base_sepolia
```

## Mainnet Deployment

### Pre-Deploy Checklist
- [ ] Security audit completed
- [ ] Multisig deployed (Gnosis Safe, 2-of-3 or 3-of-5)
- [ ] TimelockController deployed (24-48h delay)
- [ ] Real Chainlink oracle address configured
- [ ] Real USDT address on Base configured
- [ ] Gas settings in hardhat.config.js (base_mainnet network)

### Deploy Sequence
1. Deploy BTNToken (or use existing)
2. Deploy CustodialDistribution
3. Deploy 6 UUPS proxies via `deploy-all.js`
4. Grant OPERATOR_ROLE (7 grants)
5. Wire cross-contract addresses
6. Fund RewardEngine with BTN
7. Transfer admin roles to multisig
8. Deploy TimelockController, transfer upgrade authority

### Genesis Lockdown
```bash
npx hardhat run scripts/genesis-to-custodial-runbook.js --network base_mainnet
# Phase 1: Transfer BTN to Custodial
# Phase 2: Renounce minter (if applicable)
# Phase 3: Finalize Custodial (irreversible!)
```

## Backend Deployment

```bash
# 1. Set up PostgreSQL (RDS/Cloud SQL)
# 2. Configure .env with production values
cd backend
npx prisma migrate deploy
npm run build
npm start  # or use PM2/Docker
```

### Key Environment Variables
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `RPC_URL` | Base RPC endpoint |
| `RELAYER_PRIVATE_KEY` | Hot wallet for on-chain txs |
| `AUTH_SECRET` | JWT signing secret |
| `ADMIN_API_KEY` | Admin endpoint auth key |
| `SMTP_HOST/PORT/USER/PASS` | Email sending |

## Monitoring

- Health: `GET /health` — checks DB, RPC, relayer balance
- Relayer ETH: alert when < 0.1 ETH
- Custodial balance: monitor for unexpected drawdown
- Job queue: alert on FAILED jobs accumulating

## Emergency Procedures

### Pause Contracts
All UUPS contracts have `pause()` via EMERGENCY_ROLE. CustodialDistribution has separate pause.

### Key Compromise
1. Pause all contracts
2. Rotate relayer key
3. Revoke compromised role on all contracts
4. Assess damage via audit log + events

### CustodialDistribution Emergency
Post-finalization pause is **permanent** (admin roles renounced). Only use as absolute last resort.
