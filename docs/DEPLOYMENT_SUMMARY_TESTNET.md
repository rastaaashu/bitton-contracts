# BitTON.AI — Testnet Deployment Summary

**Network:** Base Sepolia (chainId: 84532)
**Date:** 2026-03-02
**Deployer:** `0x1DaE2C7aeC8850f1742fE96045c23d1AaE3FCf2A`

---

## Deployed Contracts

| Contract | Address | Type | Basescan |
|----------|---------|------|----------|
| BTN Token | `0x5b964baafEDf002e5364F37848DCa1908D3e4e9f` | Non-upgradeable | [View](https://sepolia.basescan.org/address/0x5b964baafEDf002e5364F37848DCa1908D3e4e9f#code) |
| CustodialDistribution | `0x71dB030B792E9D4CfdCC7e452e0Ff55CdB5A4D99` | Non-upgradeable | [View](https://sepolia.basescan.org/address/0x71dB030B792E9D4CfdCC7e452e0Ff55CdB5A4D99#code) |
| VaultManager | `0xA2b5ffe829441768E8BB8Be49f8ADee0041Fa1b0` | UUPS Proxy | [View](https://sepolia.basescan.org/address/0xA2b5ffe829441768E8BB8Be49f8ADee0041Fa1b0) |
| StakingVault | `0x50d1516D6d5A4930623BCb7e1Ed28e9fAeA1e82F` | UUPS Proxy | [View](https://sepolia.basescan.org/address/0x50d1516D6d5A4930623BCb7e1Ed28e9fAeA1e82F) |
| RewardEngine | `0xa86F6abB543b3fa6a2E2cC001870cF60a04c7f31` | UUPS Proxy | [View](https://sepolia.basescan.org/address/0xa86F6abB543b3fa6a2E2cC001870cF60a04c7f31) |
| VestingPool | `0xa3DC3351670E253d22B783109935fe0B9a11b830` | UUPS Proxy | [View](https://sepolia.basescan.org/address/0xa3DC3351670E253d22B783109935fe0B9a11b830) |
| WithdrawalWallet | `0xA06238c206C2757AD3f1572464bf720161519eC5` | UUPS Proxy | [View](https://sepolia.basescan.org/address/0xA06238c206C2757AD3f1572464bf720161519eC5) |
| BonusEngine | `0xFD57598058EC849980F87F0f44bb019A73a0EfC7` | UUPS Proxy | [View](https://sepolia.basescan.org/address/0xFD57598058EC849980F87F0f44bb019A73a0EfC7) |
| MockUSDT | `0x69Bc9E30366888385f68cBB566EEb655CD5A34CC` | Non-upgradeable | [View](https://sepolia.basescan.org/address/0x69Bc9E30366888385f68cBB566EEb655CD5A34CC) |
| MockAggregator | `0xf1DC093E1B3fD72A1C7f1B58bd3cE8A4832BEe52` | Non-upgradeable | [View](https://sepolia.basescan.org/address/0xf1DC093E1B3fD72A1C7f1B58bd3cE8A4832BEe52) |

---

## Genesis State

- **Total Supply:** 21,000,000.000000 BTN (minted in constructor)
- **Minting Active:** true (can be disabled via `setMintingActive(false)`)
- **Owner:** `0x1DaE2C7aeC8850f1742fE96045c23d1AaE3FCf2A`
- **Deployer Balance:** ~20,889,000 BTN (after transfers below)
- **RewardEngine Balance:** ~9,999.985649 BTN (funded during initial deployment)

---

## CustodialDistribution E2E Verification (2026-03-02)

All operations tested successfully on Base Sepolia.

### Transaction Log

| Step | Tx Hash | Detail |
|------|---------|--------|
| Transfer to Custodial | [`0x75a20777...`](https://sepolia.basescan.org/tx/0x75a20777c164ca2739846d8ce4bcb5e53d1bc9e083803392fc90b5fe71d032c5) | 100,000 BTN |
| Batch Migrate (3 users) | [`0x4f534c36...`](https://sepolia.basescan.org/tx/0x4f534c363a3cfab56b982d694ac728d1faf41db57554abea05d100026341fde2) | 350 BTN total |
| Distribute | [`0x2dca52a4...`](https://sepolia.basescan.org/tx/0x2dca52a40077a379f534c0fedb49fbbf07d2f21e9f525461c2cabee62233beec) | 25 BTN |
| Approve (for return) | [`0x03835f0b...`](https://sepolia.basescan.org/tx/0x03835f0bbbadd0a9f3f7dd8c236f5957de1db8e767b7e699eee852dd7e4a2269) | 10 BTN |
| Return Tokens | [`0x23518a6c...`](https://sepolia.basescan.org/tx/0x23518a6ceace7b6e4c8da775168f7a117ec369dacc2632dd192381b7a7c70279) | 10 BTN |

### Post-E2E State

| Metric | Value |
|--------|-------|
| Custodial Balance | 199,635 BTN |
| Total Distributed | 375 BTN |
| Total Returned | 10 BTN |
| Total Migrated | 350 BTN |
| Migration Enabled | true |
| Finalized | false |

### Prior Deployment Transactions

The initial system deployment (6 UUPS proxies + wiring) was done in a prior session. All 6 implementation contracts are verified on Basescan. The smoke test (vault activation → staking → settlement → vesting → withdrawal → referral) was executed successfully.

---

## Commands Used

```bash
# Compile
npx hardhat compile

# Deploy all UUPS proxies (prior session)
npx hardhat run scripts/deploy-all.js --network base_sepolia

# Deploy CustodialDistribution
npx hardhat run scripts/deploy-custodial.js --network base_sepolia

# Verify on Basescan
npx hardhat verify --network base_sepolia 0x71dB030B792E9D4CfdCC7e452e0Ff55CdB5A4D99 0x5b964baafEDf002e5364F37848DCa1908D3e4e9f 0x1DaE2C7aeC8850f1742fE96045c23d1AaE3FCf2A

# E2E runbook
npx hardhat run scripts/testnet-e2e-runbook.js --network base_sepolia

# Smoke test (prior session)
npx hardhat run scripts/smoke-test.js --network base_sepolia

# Full test suite (564 passing, 0 failing)
npx hardhat test
```

---

## Notes

1. **Genesis NOT locked down** on testnet — minting still active, ownership not renounced. This is intentional for continued testing.
2. **CustodialDistribution NOT finalized** — admin can still grant roles, set caps, and manage migration. Finalization is irreversible and reserved for mainnet.
3. **MockUSDT and MockAggregator** are test-only contracts with hardcoded values. Replace with real Chainlink feeds and USDT on mainnet.
4. The first transfer to Custodial (from a prior script run) added 100,000 BTN. The E2E runbook added another 100,000 BTN for a total of 200,000 BTN.
