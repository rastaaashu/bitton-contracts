# BitTON.AI — Mainnet Readiness

**Last Updated:** 2026-03-02

## Status Summary

| Category | Status | Done | Remaining |
|----------|--------|------|-----------|
| Testing | GREEN | 5/5 | 0 |
| Contracts | YELLOW | 7/8 | 1 (audit) |
| Backend | YELLOW | 8/11 | 3 (deploy, TON verify, monitoring) |
| Access Control | RED | 0/3 | 3 |
| Frontend | RED | 0/1 | 1 |

**Overall: YELLOW** — Contracts and backend functional. Audit, multisig, and frontend are blockers.

## GREEN — Done

- 618 tests passing, 0 failures
- 56 security/attack tests, all attacks rejected
- Coverage > 95% on all new contracts
- Scale simulation (60k/600k/6M users)
- Deployed + verified on Base Sepolia
- E2E smoke test passing on testnet
- Full auth system (email + wallet + sponsor)
- Backend compiles and builds clean
- 29 backend unit tests passing

## YELLOW — In Progress

### Security Audit (CRITICAL)
- Engage auditor (Trail of Bits, OpenZeppelin, Cyfrin)
- Scope: 10 contracts + CustodialDistribution
- Timeline: 2-4 weeks

### Mainnet Gas Settings
- Add `base_mainnet` network to hardhat.config.js
- Configure EIP-1559 gas parameters

### TON Signature Verification
- Integrate TON SDK in `/migration/link-wallet`
- Required before migration goes live

## RED — Not Started

### Multisig (CRITICAL)
- Deploy Gnosis Safe on Base (2-of-3 or 3-of-5)
- Transfer DEFAULT_ADMIN_ROLE on all contracts
- Transfer BTN Token ownership

### Timelock (CRITICAL)
- Deploy TimelockController (24-48h delay)
- Set as UUPS upgrade authority

### Relayer Key Management
- Use AWS KMS or HashiCorp Vault
- Never export private key
- Set up key rotation

### Backend Production Deployment
- PostgreSQL (RDS/Cloud SQL)
- Environment configuration
- Rate limiting tuned for production load

### Frontend
- Build based on auth + contracts specs
- Two login paths (email + wallet)
- Staking UI, vault activation, withdrawal

### Monitoring
- Health endpoint monitoring
- Relayer ETH balance alerts
- Contract event indexing
- Custodial balance monitoring

### Incident Response Plan
- Emergency pause playbook
- Key compromise procedure
- RPC failover
