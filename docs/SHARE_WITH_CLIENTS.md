# BitTON.AI — Share Package (Base Sepolia Testnet)

**Network:** Base Sepolia | **Chain ID:** 84532 | **Date:** 2026-03-02

---

## Deployed Contract Addresses

| # | Contract | Address | Type | Basescan |
|---|----------|---------|------|----------|
| 1 | **BTN Token** | `0x5b964baafEDf002e5364F37848DCa1908D3e4e9f` | ERC-20 (6 decimals, 21M cap) | [Address](https://sepolia.basescan.org/address/0x5b964baafEDf002e5364F37848DCa1908D3e4e9f) \| [Code](https://sepolia.basescan.org/address/0x5b964baafEDf002e5364F37848DCa1908D3e4e9f#code) |
| 2 | **CustodialDistribution** | `0x71dB030B792E9D4CfdCC7e452e0Ff55CdB5A4D99` | Non-upgradeable | [Address](https://sepolia.basescan.org/address/0x71dB030B792E9D4CfdCC7e452e0Ff55CdB5A4D99) \| [Code](https://sepolia.basescan.org/address/0x71dB030B792E9D4CfdCC7e452e0Ff55CdB5A4D99#code) |
| 3 | **VaultManager** | `0xA2b5ffe829441768E8BB8Be49f8ADee0041Fa1b0` | UUPS Proxy | [Address](https://sepolia.basescan.org/address/0xA2b5ffe829441768E8BB8Be49f8ADee0041Fa1b0) \| [Code](https://sepolia.basescan.org/address/0xA2b5ffe829441768E8BB8Be49f8ADee0041Fa1b0#code) |
| 4 | **StakingVault** | `0x50d1516D6d5A4930623BCb7e1Ed28e9fAeA1e82F` | UUPS Proxy | [Address](https://sepolia.basescan.org/address/0x50d1516D6d5A4930623BCb7e1Ed28e9fAeA1e82F) \| [Code](https://sepolia.basescan.org/address/0x50d1516D6d5A4930623BCb7e1Ed28e9fAeA1e82F#code) |
| 5 | **RewardEngine** | `0xa86F6abB543b3fa6a2E2cC001870cF60a04c7f31` | UUPS Proxy | [Address](https://sepolia.basescan.org/address/0xa86F6abB543b3fa6a2E2cC001870cF60a04c7f31) \| [Code](https://sepolia.basescan.org/address/0xa86F6abB543b3fa6a2E2cC001870cF60a04c7f31#code) |
| 6 | **VestingPool** | `0xa3DC3351670E253d22B783109935fe0B9a11b830` | UUPS Proxy | [Address](https://sepolia.basescan.org/address/0xa3DC3351670E253d22B783109935fe0B9a11b830) \| [Code](https://sepolia.basescan.org/address/0xa3DC3351670E253d22B783109935fe0B9a11b830#code) |
| 7 | **WithdrawalWallet** | `0xA06238c206C2757AD3f1572464bf720161519eC5` | UUPS Proxy | [Address](https://sepolia.basescan.org/address/0xA06238c206C2757AD3f1572464bf720161519eC5) \| [Code](https://sepolia.basescan.org/address/0xA06238c206C2757AD3f1572464bf720161519eC5#code) |
| 8 | **BonusEngine** | `0xFD57598058EC849980F87F0f44bb019A73a0EfC7` | UUPS Proxy | [Address](https://sepolia.basescan.org/address/0xFD57598058EC849980F87F0f44bb019A73a0EfC7) \| [Code](https://sepolia.basescan.org/address/0xFD57598058EC849980F87F0f44bb019A73a0EfC7#code) |

### Mock / Test Contracts

| Contract | Address | Purpose | Basescan |
|----------|---------|---------|----------|
| MockUSDT | `0x69Bc9E30366888385f68cBB566EEb655CD5A34CC` | Simulates USDT for vault fee payments | [Address](https://sepolia.basescan.org/address/0x69Bc9E30366888385f68cBB566EEb655CD5A34CC) |
| MockAggregator | `0xf1DC093E1B3fD72A1C7f1B58bd3cE8A4832BEe52` | Simulates Chainlink BTN/USD price feed | [Address](https://sepolia.basescan.org/address/0xf1DC093E1B3fD72A1C7f1B58bd3cE8A4832BEe52) |

### Admin / Infrastructure

| Role | Address |
|------|---------|
| Deployer / Admin | `0x1DaE2C7aeC8850f1742fE96045c23d1AaE3FCf2A` |
| Treasury | `0x1DaE2C7aeC8850f1742fE96045c23d1AaE3FCf2A` |

---

## What Each Contract Does

| Contract | Description |
|----------|-------------|
| **BTN Token** | ERC-20 token with 6 decimals, 21M max supply, owner-mintable (can be locked). |
| **CustodialDistribution** | Admin-controlled off-chain-to-on-chain bridge: batch migration of TON balances, airdrops, and custodial token distribution with per-user caps. |
| **VaultManager** | Manages vault activation tiers (T1/T2/T3) with USDT or BTN fee payment via Chainlink oracle price conversion. |
| **StakingVault** | Handles Short (30d) and Long (180d) staking programs with tier-based multipliers and early-exit penalty. |
| **RewardEngine** | Calculates and settles weekly staking rewards, splitting 10% to WithdrawalWallet and 90% to VestingPool. |
| **VestingPool** | Holds locked reward tokens and releases them at 0.5% per day to WithdrawalWallet. |
| **WithdrawalWallet** | User-facing ledger of immediately withdrawable BTN; users call `withdraw()` to claim. |
| **BonusEngine** | Processes 5% direct referral bonuses and level-based matching bonuses (up to 10 levels deep, tier-gated). |

---

## Verification Status

All contracts are **verified** on Base Sepolia Basescan. Click the "Code" links above to view source code on-chain.

### Verification Commands Used

```bash
# UUPS proxy implementations (6 contracts)
npx hardhat run scripts/verify-all.js --network base_sepolia

# CustodialDistribution (non-upgradeable, with constructor args)
npx hardhat verify --network base_sepolia \
  0x71dB030B792E9D4CfdCC7e452e0Ff55CdB5A4D99 \
  0x5b964baafEDf002e5364F37848DCa1908D3e4e9f \
  0x1DaE2C7aeC8850f1742fE96045c23d1AaE3FCf2A

# BTN Token (verified during initial deployment)
npx hardhat verify --network base_sepolia \
  0x5b964baafEDf002e5364F37848DCa1908D3e4e9f
```

---

## ABIs

Pre-extracted ABI JSON files are in the **`abi/`** folder at the repo root:

```
abi/
  BTNToken.json
  CustodialDistribution.json
  VaultManager.json
  StakingVault.json
  RewardEngine.json
  VestingPool.json
  WithdrawalWallet.json
  BonusEngine.json
```

Each file contains `{ "contractName": "...", "abi": [...] }`.

Full Hardhat artifacts (including bytecode) are in `artifacts/contracts/`.

---

## Architecture Diagrams

Pre-rendered PNG diagrams are in **`docs/images/`**:

| File | Diagram |
|------|---------|
| `01_email_registration.png` | User registration flow (email + sponsor) |
| `02_wallet_auth.png` | Wallet authentication flow (MetaMask) |
| `03_staking_lifecycle.png` | Staking lifecycle (stake, settle, vest, withdraw) |
| `04_migration_pipeline.png` | TON-to-Base migration pipeline |
| `05_contract_architecture.png` | Smart contract architecture overview |
| `06_user_status.png` | User status state machine |

Mermaid source: `docs/DIAGRAMS.md`

---

## Documentation Index

| Doc | Path | Description |
|-----|------|-------------|
| System Overview | `docs/00_SYSTEM_OVERVIEW.md` | High-level architecture and component map |
| Auth & Registration | `docs/01_AUTH_AND_REGISTRATION.md` | Email + wallet authentication flows |
| Migration (TON to Base) | `docs/02_MIGRATION_TON_TO_BASE.md` | Off-chain to on-chain migration design |
| Backend API | `docs/03_BACKEND_API.md` | REST API endpoints and schemas |
| Contracts Overview | `docs/04_CONTRACTS_OVERVIEW.md` | Smart contract details and interactions |
| Operations Runbook | `docs/05_OPERATIONS_RUNBOOK.md` | Deployment, monitoring, and admin procedures |
| Mainnet Readiness | `docs/06_MAINNET_READINESS.md` | Pre-mainnet checklist and audit prep |
| Deployment Summary | `docs/DEPLOYMENT_SUMMARY_TESTNET.md` | Full testnet deployment log with tx hashes |
| Diagrams (source) | `docs/DIAGRAMS.md` | Mermaid diagram source code |
| Full Spec | `SPEC-BitTON-AI-COMPLETE.md` | Complete technical specification |
| Frontend Spec | `FRONTEND-SPEC-BitTON-AI-v1.md` | Frontend integration specification |

---

## Test Suite

564 tests passing, 0 failing. Run with:

```bash
npx hardhat test
```

---

## Quick Reference (Copy/Paste)

```
Network:                Base Sepolia (chainId 84532)
RPC:                    https://sepolia.rpc.base.org

BTN Token:              0x5b964baafEDf002e5364F37848DCa1908D3e4e9f
CustodialDistribution:  0x71dB030B792E9D4CfdCC7e452e0Ff55CdB5A4D99
VaultManager:           0xA2b5ffe829441768E8BB8Be49f8ADee0041Fa1b0
StakingVault:           0x50d1516D6d5A4930623BCb7e1Ed28e9fAeA1e82F
RewardEngine:           0xa86F6abB543b3fa6a2E2cC001870cF60a04c7f31
VestingPool:            0xa3DC3351670E253d22B783109935fe0B9a11b830
WithdrawalWallet:       0xA06238c206C2757AD3f1572464bf720161519eC5
BonusEngine:            0xFD57598058EC849980F87F0f44bb019A73a0EfC7
MockUSDT:               0x69Bc9E30366888385f68cBB566EEb655CD5A34CC
MockAggregator:         0xf1DC093E1B3fD72A1C7f1B58bd3cE8A4832BEe52
Admin/Treasury:         0x1DaE2C7aeC8850f1742fE96045c23d1AaE3FCf2A
```
