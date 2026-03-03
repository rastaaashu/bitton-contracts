# BitTON.AI — TON → Base Migration

## Overview

Migrate user balances from the legacy TON-based system to BTN on Base L2. The process is admin-initiated, user-verified, and executed on-chain via `CustodialDistribution.batchMigrate()`.

## Pipeline

```
1. SNAPSHOT    Admin imports TON balance data
2. LINK        Users link TON wallet to EVM wallet
3. BUILD       Admin matches links with snapshots → creates claims
4. DISPATCH    Admin batches claims into operator jobs
5. EXECUTE     Operator runner calls batchMigrate on-chain
6. VERIFY      Users check status via API
```

## Steps

### 1. Import Snapshot

`POST /admin/ton/import-snapshot` (admin API key required)

```json
{
  "rows": [
    { "tonAddress": "EQ...", "balanceTon": "1000", "balanceBtn": "1000" }
  ],
  "snapshotAt": "2026-01-15T00:00:00Z",
  "batchId": "snapshot-v1"
}
```

Duplicates are skipped (by `tonAddress`).

### 2. Link Wallets

`POST /migration/link-wallet`

```json
{
  "tonAddress": "EQ...",
  "evmAddress": "0x...",
  "signature": "..."
}
```

Creates a `WalletLink` record. TON signature verification is deferred (requires TON SDK integration before mainnet).

### 3. Build Claims

`POST /admin/migration/build`

Matches verified wallet links with snapshot data. Skips already-migrated addresses (checked on-chain).

### 4. Dispatch Batches

`POST /admin/jobs/dispatch`

Creates `BATCH_MIGRATE` operator jobs in batches of 200 addresses.

### 5. Execution

The operator runner picks up jobs and calls `CustodialDistribution.batchMigrate(recipients[], amounts[])`.

- Retries up to 3 times on failure
- Updates claim status: QUEUED → CONFIRMED or FAILED
- Logs tx hash in audit log

### 6. Status Check

`GET /migration/status/:evmAddress`

Returns on-chain migration status and DB claim details.

## CustodialDistribution Contract

- Holds the 21M BTN supply (minus already distributed)
- `batchMigrate()` — skips already-migrated addresses
- `distribute()` — single user distribution
- `finalize()` — permanently locks down the contract
- Post-finalization: no more distributions, roles renounced

## Assumptions

- TON signature verification deferred to production (A7)
- Migration skips duplicates instead of reverting (A3)
- Snapshot data imported as-is; conversion ratios pre-calculated off-chain
